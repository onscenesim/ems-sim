'use strict';

const { INTERVENTIONS } = require('../data/interventions');
const { HARD_MODE_DC_PENALTY, BLACK_CLOUD_DC_PENALTY } = require('../data/config');

// ---------------------------------------------------------------------------
// Build detection index at startup.
// Each entry: { key, pattern, proc }
// Sorted longest-first so the first match is always the most specific.
//
// Pattern uses lookbehind/lookahead instead of includes() to prevent "io"
// matching inside "sedation", "medication", "region", etc.
// ---------------------------------------------------------------------------
const SYNONYM_MAP = new Map();   // key → proc  (kept for rollProcedure lookups)
const DETECT_PATTERNS = [];      // [{ key, pattern, proc }]

// Must be declared before the registration loop so isSpecificSynonym()
// can safely reference SPECIFIC_EQUIPMENT during module initialization.
const SPECIFIC_EQUIPMENT = new Set([         // known brand/equipment names exempt from verb check
  // Procedure verbs — the word itself IS the order, no auxiliary verb needed.
  // Word-boundary regex means these only fire on the exact infinitive
  // ("intubate" yes, "intubated"/"intubating" no — protects against
  // descriptive past-tense narration accidentally rolling).
  'intubate', 'defibrillate', 'cardiovert', 'decompress', 'ventilate',
  // Equipment & devices
  'yankauer', 'lucas', 'autopulse', 'ezio', 'fast1', 'king', 'igel',
  'lma', 'bvm', 'aed', 'narcan', 'epipen', 'zofran',
  'pacing', 'pacer',
  // Drug abbreviations — specific enough to fire without an admin verb
  'io',       // bare IO order — firefighter shorthand
  'epi',      // bare epi order — firefighter shorthand
  'txa',      // tranexamic acid
  'sux',      // succinylcholine
  'succs',    // succinylcholine (alternate)
  'roc',      // rocuronium
  'vec',      // vecuronium
  'amio',     // amiodarone
  'lido',     // lidocaine
  'bicarb',   // sodium bicarbonate
  'duoneb',   // albuterol + ipratropium
  'versed',   // midazolam
  'ativan',   // lorazepam
  'adenocard',// adenosine
  'lasix',    // furosemide
  'pitocin',  // oxytocin
  'cyanokit',  // hydroxocobalamin
  'albuterol',  // nebulizer -- specific enough to fire without verb
  'calcium',    // calcium chloride/gluconate -- bare order should fire
]);

for (const proc of INTERVENTIONS) {
  const register = (raw) => {
    const key = raw.toLowerCase().trim();
    if (SYNONYM_MAP.has(key)) return;
    SYNONYM_MAP.set(key, proc);
    // Strip articles BEFORE pattern construction so they become optional in
    // every position, even when the original synonym contains one. This makes
    // "place an IV" match "place IV" / "place an IV" / "place the IV" equally.
    const stripped = key.replace(/\s+(an?|the|another|second|additional)\s+/g, ' ').replace(/\s+/g, ' ').trim();
    const escaped = stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Each whitespace gap can optionally swallow an article
    const flexible = escaped.replace(/\\? /g, '\\s+(?:an?\\s+|the\\s+|another\\s+|second\\s+|additional\\s+)?');
    // Word-boundary via lookbehind/lookahead — handles hyphens and acronyms
    const pattern = new RegExp(`(?<![a-z0-9])${flexible}(?![a-z0-9])`, 'i');
    // Precompute specificity using the ORIGINAL raw string so uppercase acronyms
    // (BGL, SpO2, IV, EtCO2, AED, etc.) are treated as specific and don't
    // require an admin verb. After toLowerCase() they look like plain words.
    const specific = isSpecificSynonym(raw.trim());
    DETECT_PATTERNS.push({ key, pattern, proc, specific });
  };
  register(proc.id);
  for (const syn of proc.synonyms) register(syn);
}
DETECT_PATTERNS.sort((a, b) => b.key.length - a.key.length);

// ---------------------------------------------------------------------------
// Fuzzy normalization — corrects misspellings before pattern matching.
// Only single-word synonyms with length ≥ 5 are indexed.
// Threshold: len 5-6 → edit distance 1, len 7+ → edit distance 2.
// Short words (< 5 chars) are left exact-only to prevent false positives.
// ---------------------------------------------------------------------------

function editDistance(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let corner = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = prev[j];
      prev[j] = a[i-1] === b[j-1] ? corner : 1 + Math.min(corner, prev[j], prev[j-1]);
      corner = saved;
    }
  }
  return prev[b.length];
}

// Some single-word synonyms are too collision-prone to ever be a FUZZY TARGET:
// the edit-distance corrector will "fix" an unrelated valid word into them and
// roll the wrong — sometimes dangerous — intervention. Two classes:
//   • plain English words that are themselves common in orders/narration
//     ("strain" ← "restrain")
//   • minimal-pair drug names one edit from an everyday verb
//     ("activase" ← "activate"/"activated" — Activase is tPA; this both killed
//      cath-lab activation and made "activated charcoal" roll a thrombolytic)
// These still match when typed EXACTLY (they stay in DETECT_PATTERNS) — they are
// only barred from absorbing fuzzy corrections.
const FUZZY_TARGET_BLOCKLIST = new Set(['strain', 'activase']);

// Index: single-word synonyms ≥ 5 chars, keyed by first two chars for quick pruning
const FUZZY_INDEX = new Map();  // twoChar → [{ word, proc }]
for (const { key, proc } of DETECT_PATTERNS) {
  if (key.includes(' ') || key.length < 5) continue;
  if (FUZZY_TARGET_BLOCKLIST.has(key)) continue;
  const bucket = key.slice(0, 2);
  if (!FUZZY_INDEX.has(bucket)) FUZZY_INDEX.set(bucket, []);
  FUZZY_INDEX.get(bucket).push({ word: key, proc });
}

// Valid words that must NEVER be treated as a misspelling (defense in depth on
// the INPUT side, complementing the target blocklist above). Even if a future
// synonym lands within edit distance of these, they pass through untouched.
const FUZZY_INPUT_BLOCKLIST = new Set([
  'activate', 'activated', 'activates', 'activating', 'activation',
  'restrain', 'restrained', 'restrains', 'restraining',
]);

// Cap fuzzy correction at a SINGLE edit, regardless of length. Real-world drug
// misspellings are overwhelmingly one error ("epinephrin", "amioderone",
// "midazlam" — all edit distance 1). Allowing distance 2 on long words turned
// ordinary English into unrelated drugs by deleting/altering a couple letters
// ("breathing" -> "brethine"/terbutaline, "restrain" -> "strain"), phantom-
// logging meds into the debrief. One-edit correction keeps the genuine typo
// fixes while removing that whole class of two-edit false positives.
function fuzzyThreshold(len) {
  return len < 5 ? 0 : 1;
}

/**
 * Replace individual misspelled tokens in `text` with their closest known
 * synonym. Only substitutes if the best match is within threshold AND the
 * word doesn't already match exactly.
 */
function normalizeForDetection(text) {
  return text.replace(/\b[a-zA-Z]{5,}\b/g, token => {
    const lower = token.toLowerCase();
    // Already an exact match — nothing to fix
    if (SYNONYM_MAP.has(lower)) return token;
    // Valid word that collides with a synonym under edit distance — never rewrite
    if (FUZZY_INPUT_BLOCKLIST.has(lower)) return token;
    const threshold = fuzzyThreshold(lower.length);
    if (threshold === 0) return token;
    // Check nearby buckets (first-two-char ± one char apart handles one-char prefix errors)
    let bestWord = null, bestDist = threshold + 1;
    const prefix = lower.slice(0, 2);
    // Scan candidates whose prefix is within 1 char of ours (covers swapped/dropped first char)
    for (const [bucket, entries] of FUZZY_INDEX) {
      if (Math.abs(bucket.charCodeAt(0) - prefix.charCodeAt(0)) > 2) continue;
      for (const { word } of entries) {
        if (Math.abs(word.length - lower.length) > threshold) continue;
        const d = editDistance(lower, word, threshold);
        if (d > 0 && d < bestDist) { bestWord = word; bestDist = d; }
      }
    }
    return bestWord || token;
  });
}


// ---------------------------------------------------------------------------
// Administration verbs — required before a SINGLE-WORD medication synonym
// fires a roll. Multi-word synonyms ("give epi", "push the epi") already
// contain the verb, so they bypass this check.
// ---------------------------------------------------------------------------
// Past-tense forms (gave, pushed, administered …) are intentionally excluded —
// they indicate reporting ('we gave epi') rather than ordering ('give epi').
const ADMIN_VERB_RE = /\b(give|giving|push(ing)?|administer(ing)?|inject(ing)?|insert(ing)?|hang(ing)?|start(ing)?(?:\s+the\s+\w+)?|dose|dosing|spray(ing)?|running?\s+the|hang(ing)?\s+the|attempt(ing)?|tr(?:y|ying)|plac(?:e|ing)|obtain(ing)?|establish(ing)?|get(ting)?|do(?:ing)?|perform(ing)?|set(ting)?\s+up|go(?:ing)?\s+for\s+(?:(?:a|an|the)\s+)?|I(?:'m| am)\s+going\s+to\s+give|I(?:'m| am)\s+giving|followed\s+by|in\s+addition\s+to|as\s+well\s+as|and\s+then|then\s+give|also\s+give|also\s+push|also\s+administer|along\s+with|begin(ning)?|titrat(e|ing)|connect(ing)?|run(ning)?|infus(e|ing)|drip(ping)?|bolus(ing)?)\b/i;

/**
 * Detect a procedure from user text.
 * Uses word-boundary patterns; single-word medication synonyms require
 * an explicit administration verb.
 */
// Single-word synonyms that are plain English words can produce false
// positives when a user explains or discusses a concept rather than
// performing it ("they'll suction the air out") → should not roll).
// Equipment names, acronyms, and multi-word phrases are specific enough
// to fire without a verb check.
// (PLAIN_WORD_RE and SPECIFIC_EQUIPMENT declared above the registration loop.)

function isSpecificSynonym(key) {
  if (key.includes(' '))   return true;   // multi-word → specific
  if (!/^[a-z]/.test(key)) return true;   // starts uppercase / acronym → specific
  if (/[0-9\-]/.test(key)) return true;   // contains digits or hyphens → equipment
  if (SPECIFIC_EQUIPMENT.has(key.toLowerCase())) return true;
  return false;
}

// Negation tokens that, when they immediately precede a procedure keyword,
// indicate the user is talking about NOT doing it — suppress the roll.
// `stop/halt/cease/pause/quit` suppress an order to CEASE an in-progress
// intervention ("stop CPR while I get a line") — without them, "stop CPR" matched
// the bare "cpr" keyword and phantom-rolled a compression attempt. Safe to add:
// the hemorrhage-control synonym is "control the bleeding", so "stop the bleeding"
// does not collide here.
const NEGATION_RE = /\b(no|not|don'?t|doesn'?t|isn'?t|won'?t|wouldn'?t|without|lack(?:s|ing|ed)?|denies?|denied|skip(?:ped|ping)?|cancel(?:led|ling)?|hold(?:ing)?|avoid(?:ed|ing)?|stage(?:d|s|ing)?|prep(?:ped|ping)?|staging|standby|stand-by|remove(?:d|s|ing)?|remov(?:e|ing)|pull(?:ed|ing|s|ing\s+out)?|discontinue(?:d|s|ing)?|d\/c|stop(?:ped|ping)?|halt(?:ed|ing)?|cease(?:d|ing)?|paus(?:e|ed|ing)|quit(?:ting)?)\b/i;

// Route qualifier prepositions: when immediately preceding a device/access synonym,
// the user is specifying an admin route ("push epi through the IO"), not placing new access.
const ROUTE_QUALIFIER_RE = /\b(?:through|via|into|from|out\s+of)\s*(?:the\s+|an?\s+|my\s+)?$/i;

// Contingent / hypothetical phrasing — the action is NOT a committed order this
// turn. Rolling these produced phantom outcomes ("if respiratory depression, give
// narcan" rolled narcan; "IV or IO if needed" rolled both; "consider sedation"
// rolled the sedative) that were then logged into the objective debrief log even
// though the action never happened. Scanned across the match's whole sentence.
const HEDGE_RE = /\b(?:if\s+(?:needed|necessary|required|indicated|warranted|appropriate|tolerated)|as\s+needed|prn|consider(?:ing)?|in\s+case\b|in\s+the\s+event|(?:may|might|would|could)\s+(?:need|want|have)\s+to|anticipat\w+|be\s+(?:ready|prepared)|get\s+ready|stand(?:ing)?\s+by|standby|prepared?\s+to)\b/i;

// Interrogative verbs that turn a following "if" into an embedded QUESTION
// ("ask if she's allergic", "check if there's a pulse") rather than a conditional
// order — these must NOT suppress a later action in the same sentence.
const INTERROG_BEFORE_IF_RE = /\b(?:ask(?:s|ed|ing)?|know|knows|knew|wonder(?:s|ing|ed)?|see|seeing|saw|check(?:s|ed|ing)?|determine|find\s+out|finding\s+out|tell|told|confirm(?:s|ed|ing)?|verif(?:y|ies|ied|ying)|assess(?:es|ed|ing)?|figure\s+out|unsure|not\s+sure|question(?:s|ed|ing)?)\b[^.;!?]*$/i;

// Past-tense / reporting context words that indicate the player is describing
// something already done rather than ordering it now.
const PAST_CONTEXT_RE = /\b(gave|administered|was\s+given|had\s+received|received|already\s+(?:gave|given|pushed|administered|established|placed|started)|after\s+\d[\d.]*\s*(?:mg|ml|mcg|g|mEq)|was\s+(?:doing|performing|in|on)|had\s+(?:been|started)|were\s+(?:doing|performing|on)|had\s+CPR|did\s+CPR|performed\s+CPR|did\s+compressions|were\s+doing\s+compressions)\b/i;

/**
 * Returns true if the procedure match at matchStart is inside a sentence that
 * is clearly reporting past administration rather than ordering it.
 * Used as an extra guard for multi-word synonyms (which bypass ADMIN_VERB_RE).
 */
function isPastContext(text, matchStart) {
  const before = text.slice(0, matchStart);
  let sentStart = 0;
  for (const ch of '.;!?\n') {
    const idx = before.lastIndexOf(ch);
    if (idx + 1 > sentStart) sentStart = idx + 1;
  }
  return PAST_CONTEXT_RE.test(before.slice(sentStart));
}

/**
 * Returns true when the procedure keyword at `matchStart` is preceded by a
 * negation within the same sentence and within ~3 words.
 *
 * Sentence boundaries (.;!?\n) bound the scan, so a negation in a previous
 * sentence does NOT suppress later orders:
 *   "Morphine sulfate IVP 4mg. No intubation needed yet."
 *   → morphine fires; intubation suppressed.
 */
function isNegated(text, matchStart) {
  const before = text.slice(0, matchStart);
  // Find the last sentence boundary in `before`
  let sentenceStart = 0;
  for (const ch of '.;!?\n') {
    const idx = before.lastIndexOf(ch);
    if (idx + 1 > sentenceStart) sentenceStart = idx + 1;
  }
  const sentenceTail = before.slice(sentenceStart).trim();
  if (!sentenceTail) return false;
  // Limit scope to the last 3 words immediately preceding the keyword
  const words = sentenceTail.split(/\s+/).filter(Boolean);
  const windowText = words.slice(-3).join(' ');
  return NEGATION_RE.test(windowText);
}

/**
 * Returns true when the procedure keyword at `matchStart` sits inside a
 * contingent / hypothetical clause rather than a committed order this turn —
 * "if respiratory depression, give narcan", "IV or IO if needed", "consider
 * sedation", "be ready to shock". Rolling these phantom-logged outcomes into the
 * debrief. Two signals, both scoped to the match's own sentence:
 *   1. an explicit hedge anywhere in the sentence (HEDGE_RE), or
 *   2. a leading "if <condition>, <action>" — an `if` earlier in the sentence
 *      that is NOT an embedded question ("ask if …", "check if …").
 */
/** Bounds of the sentence containing index `idx` — [start, end). */
function sentenceBounds(text, idx) {
  const before = text.slice(0, idx);
  let sentStart = 0;
  for (const ch of '.;!?\n') {
    const i = before.lastIndexOf(ch);
    if (i + 1 > sentStart) sentStart = i + 1;
  }
  let sentEnd = text.length;
  for (const ch of '.;!?\n') {
    const i = text.indexOf(ch, idx);
    if (i !== -1 && i < sentEnd) sentEnd = i;
  }
  return [sentStart, sentEnd];
}

function isConditional(text, matchStart) {
  const [sentStart, sentEnd] = sentenceBounds(text, matchStart);
  const sentence = text.slice(sentStart, sentEnd);
  if (HEDGE_RE.test(sentence)) return true;

  // Leading conditional: an `if` before the action, within the same sentence,
  // that isn't the object of an interrogative verb.
  const beforeInSent = text.slice(sentStart, matchStart);
  const ifMatch = /\bif\b/i.exec(beforeInSent);
  if (ifMatch) {
    const beforeIf = beforeInSent.slice(0, ifMatch.index);
    if (!INTERROG_BEFORE_IF_RE.test(beforeIf)) return true;
  }
  return false;
}

/**
 * Returns true when the matched keyword is immediately preceded by a route
 * preposition ("through the IO", "via the IV", "into the line") — meaning the
 * user is specifying an administration route, not placing new access.
 */
function isRouteQualifier(text, matchStart) {
  // Look at up to 30 chars before the match for a route preposition
  const tail = text.slice(Math.max(0, matchStart - 30), matchStart);
  return ROUTE_QUALIFIER_RE.test(tail);
}

// ── Uncertainty classification ───────────────────────────────────────────────
// Real transcripts showed the detector firing on MENTIONS: "preoxygenate her
// for intubation later" intubated the patient immediately; "handoff report
// explaining ... unresponsiveness to narcan" pushed a phantom narcan dose at
// the ED door. These matches aren't safely skippable either — sometimes the
// player really does mean "RSI her". So instead of a silent yes/no, matches in
// ambiguous contexts are flagged UNCERTAIN and surfaced to the player for a
// one-click confirm (✓ perform / ✗ just talking) before the turn runs.

// The sentence is talking ABOUT care rather than ordering it: reports,
// handoffs, explanations, summaries.
const UNCERTAIN_DISCUSS_RE = /\b(?:report|handoff|hand-off|explain\w*|describe|describing|discuss\w*|summariz\w*|debrief|recap|tell (?:them|him|her|the \w+)|talking about|thoughts? (?:on|about)|what (?:do you|about))\b/i;

// The sentence defers the action to a future moment: "for intubation later",
// "once cap gets here we'll...", "planning to", "prep for".
const UNCERTAIN_FUTURE_RE = /\b(?:later|in a (?:bit|minute|moment|few)|after (?:we|the|that|this|cap)|once (?:we|the|cap|he|she|they)|when (?:we|the|cap|he|she|they)|we(?:'|’)?ll\b|we will|going to|gonna|about to|plan(?:ning)?(?: to| on)?|prep(?:are|ping)? for|get(?:ting)? ready for|set(?:ting)? up for|thinking about|consider(?:ing)?|might|may need|eventually|soon|next)\b/i;

// Procedure NOUNS that name the act without performing it ("RSI", "intubation").
// Acronyms bypass the admin-verb gate, so a bare mention in prose rolled the
// full procedure. These only roll confidently when the sentence carries a
// performance verb; otherwise they're uncertain.
const NOUN_MENTION_KEYS = new Set([
  'rsi', 'dsi', 'dai', 'intubation', 'rapid sequence intubation',
  'rapid sequence induction', 'ett', 'endotracheal tube', 'definitive airway',
  'advanced airway', 'definitive airway management', 'oral intubation',
  'orotracheal intubation', 'needle decompression', 'ncd', 'cardioversion',
  'defibrillation', 'cricothyrotomy', 'needle cricothyrotomy',
]);
const PERFORMANCE_VERB_RE = /\b(?:perform|proceed(?:ing)? with|attempt(?:ing)?|do(?:ing)?(?: the| an?)?|start(?:ing)?|begin(?:ning)?|go(?:ing)? (?:ahead|for)|carry out|execut\w+|intubate|tube|drop(?:ping)?|pass(?:ing)?|plac(?:e|ing)|deliver(?:ing)?|shock|cardiovert|defibrillate|decompress|cric|cut|drill|paralyze|induce|sedate and|push(?:ing)?|giv(?:e|ing)|administer(?:ing)?|now\b)\b/i;

/**
 * Classify how confident we are that a matched procedure is a real order this
 * turn. Returns null (confident) or a short reason string (uncertain).
 */
function uncertaintyReason(text, matchStart, matchedKey, proc) {
  if (proc.no_roll) return null;   // routine logged actions — never worth a confirm prompt
  const [s, e] = sentenceBounds(text, matchStart);
  const sentence = text.slice(s, e);
  if (UNCERTAIN_DISCUSS_RE.test(sentence)) return 'sounds like a report/discussion, not an order';
  if (UNCERTAIN_FUTURE_RE.test(sentence)) return 'sounds like a plan for later, not an order for now';
  if (NOUN_MENTION_KEYS.has(matchedKey) && !PERFORMANCE_VERB_RE.test(sentence)) {
    return 'named the procedure without a clear "do it now"';
  }
  return null;
}

/** Stable key identifying one detected entry (per-drug for medication_push). */
function procEntryKey(procId, matchedKey) {
  return procId + '|' + (matchedKey || '');
}

// ── Pre-charge guard ─────────────────────────────────────────────────────────
// "Pre-charging" the defib during compressions is anticipatory CHARGING, not a
// shock order — observed: "Pulse check, pre charging defib" rolled defibrillation
// and the model delivered a shock into asystole. When pre-charge wording precedes
// a shock synonym in the same sentence, the entry is force-suppressed: no roll,
// no confirm prompt, and the model is told to narrate charging only.
const PRECHARGE_RE = /\bpre[\s-]?charg\w*/i;
const SHOCK_PROC_IDS = new Set(['defibrillation', 'cardioversion']);

function isPrecharge(text, matchStart, procId) {
  if (!SHOCK_PROC_IDS.has(procId)) return false;
  // The precharge wording must be DIRECTLY attached to this synonym (at most an
  // article between): "pre charging defib" / "precharging the defib" suppress,
  // but "defib was precharged — shock him now" leaves the shock order live.
  const [sentStart] = sentenceBounds(text, matchStart);
  const tail = text.slice(sentStart, matchStart);
  let last = null;
  const re = new RegExp(PRECHARGE_RE.source, 'gi');
  for (let m; (m = re.exec(tail)) !== null;) last = m;
  if (!last) return false;
  const between = tail.slice(last.index + last[0].length);
  return /^[\s,]*(?:(?:the|a|an|my|our|that)\s+)?$/i.test(between);
}

function detectProcedure(userText) {
  const lower = userText.toLowerCase();

  for (const { key, pattern, proc, specific } of DETECT_PATTERNS) {
    if (!pattern.test(lower)) continue;

    // Guard: single-word plain-English synonyms require an action verb so
    // that explanatory language ("they'll suction the air out") doesn't roll.
    // Use the precomputed 'specific' flag (computed from the original-case raw
    // synonym) so uppercase acronyms like BGL, SpO2, IV pass without a verb.
    if (!specific && !ADMIN_VERB_RE.test(lower)) continue;

    return proc;
  }
  return null;
}

/**
 * Determine which DC to use given context.
 */
function selectDC(proc, contextFlags = {}) {
  if (!proc.dc || proc.no_roll) return null;

  const { difficult_airway, hypotensive, obese, pediatric, junctional } = contextFlags;
  const dcs = proc.dc;

  switch (proc.id) {
    case 'peripheral_iv':
      return (hypotensive || obese || pediatric) ? dcs[1] : dcs[0];
    case 'intubation':
      return difficult_airway ? dcs[dcs.length - 1] : dcs[0];
    case 'cardioversion':
    case 'defibrillation':
    case 'pacing':
      return dcs; // two rolls — equipment + clinical response
    case 'needle_decompression':
      return obese ? 13 : dcs[0];
    case 'cricothyrotomy':
      return difficult_airway ? 13 : dcs[0];
    case 'emergency_delivery':
      return contextFlags.complicated_delivery ? dcs[1] : dcs[0];
    case 'bleeding_control':
      return junctional ? 14 : dcs[0];
    case 'newborn_resuscitation':
      return contextFlags.resuscitative_steps ? dcs[1] : dcs[0];
    case 'cpr':
      // DC 17 in a moving ambulance — provider can't brace, compressions suffer.
      // DC 12 on scene or stationary.
      return contextFlags.moving ? dcs[1] : dcs[0];
    case 'medication_push':
      return dcs[0];
    default:
      return dcs[0];
  }
}

function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

/** Roll twice, return the lower result (disadvantage). */
function rollD20Disadvantage() {
  const r1 = rollD20();
  const r2 = rollD20();
  return { result: Math.min(r1, r2), both: [r1, r2] };
}

/**
 * Outcomes: nat-1 = COMPLICATION | ≥DC = SUCCESS | ≥DC-3 = MARGINAL | else FAILURE
 */
function calcOutcome(roll, dc, difficulty) {
  // EASY: rolls succeed automatically unless the player rolls a natural 1.
  if (difficulty === 'EASY') return roll === 1 ? 'COMPLICATION' : 'SUCCESS';
  if (roll === 1) return 'COMPLICATION';
  if (roll >= dc) return 'SUCCESS';
  if (roll >= dc - 3) return 'MARGINAL';
  return 'FAILURE';
}

/**
 * Roll for a procedure by id or object.
 */
function rollProcedure(procedureOrId, contextFlags = {}, difficulty = 'NORMAL') {
  const proc = typeof procedureOrId === 'string'
    ? (SYNONYM_MAP.get(procedureOrId.toLowerCase()) || INTERVENTIONS.find(p => p.id === procedureOrId))
    : procedureOrId;

  if (!proc) {
    return { procedure_id: typeof procedureOrId === 'string' ? procedureOrId : 'unknown', no_roll: true, outcome: 'SUCCESS', note: 'procedure not found' };
  }

  if (proc.no_roll) {
    return { procedure_id: proc.id, patient: proc.patient || 'primary', no_roll: true, outcome: 'SUCCESS', dc: null, roll: null };
  }

  let dc = selectDC(proc, contextFlags);
  if (!dc) dc = proc.dc[0];

  const penalty = difficulty === 'BLACK_CLOUD' ? BLACK_CLOUD_DC_PENALTY
                : difficulty === 'HARD'        ? HARD_MODE_DC_PENALTY
                : 0;
  // BLACK_CLOUD: every roll is at DISADVANTAGE — roll twice, take the lower.
  const useDis = difficulty === 'BLACK_CLOUD';

  // Multi-DC procedures (cardioversion, defibrillation, pacing)
  if (Array.isArray(dc)) {
    const rolls = dc.map(d => {
      const adj = d + penalty;
      let r, bothRolls;
      if (useDis) { const d2 = rollD20Disadvantage(); r = d2.result; bothRolls = d2.both; }
      else        { r = rollD20(); }
      return { dc: adj, base_dc: d, roll: r, both_rolls: bothRolls || null, outcome: calcOutcome(r, adj, difficulty) };
    });
    const outcomes = rolls.map(r => r.outcome);
    const summary = outcomes.includes('COMPLICATION') ? 'COMPLICATION'
      : outcomes.every(o => o === 'SUCCESS') ? 'SUCCESS'
      : outcomes.every(o => o === 'FAILURE') ? 'FAILURE'
      : 'MARGINAL';
    return {
      procedure_id: proc.id,
      patient: proc.patient || 'primary',
      dc: rolls.map(r => r.dc),
      base_dc: rolls.map(r => r.base_dc),
      penalty_applied: penalty,
      roll: rolls[0].roll,
      rolls,
      outcome: summary,
      no_roll: false,
      multi_roll: true,
      disadvantage: useDis,
    };
  }

  const adjustedDC = dc + penalty;
  let roll, bothRolls;
  if (useDis) { const d2 = rollD20Disadvantage(); roll = d2.result; bothRolls = d2.both; }
  else        { roll = rollD20(); }
  const outcome = calcOutcome(roll, adjustedDC, difficulty);

  return {
    procedure_id: proc.id,
    patient: proc.patient || 'primary',
    dc: adjustedDC,
    base_dc: dc,
    penalty_applied: penalty,
    both_rolls: bothRolls || null,
    disadvantage: useDis,
    roll,
    outcome,
    no_roll: false,
  };
}

// Equipment staging nouns: if one of these immediately follows a matched keyword,
// the player is staging/positioning equipment rather than deploying it.
// e.g. "LUCAS backboard" → the physical backboard component, not a deploy order.
const STAGING_NOUN_RE = /^\s+(?:backboard|board)\b/i;

/**
 * Returns true when the word(s) immediately after the matched keyword are
 * equipment staging nouns — indicating preparation, not deployment.
 * e.g. "LUCAS backboard" should not roll.
 */
function hasStagingPostContext(text, matchEnd) {
  return STAGING_NOUN_RE.test(text.slice(matchEnd));
}

/**
 * Detect a procedure from text and roll if applicable.
 * Returns null if nothing detected.
 */
function detectAndRoll(userText, contextFlags = {}, difficulty = 'NORMAL') {
  const proc = detectProcedure(userText);
  if (!proc) return null;
  return rollProcedure(proc, contextFlags, difficulty);
}


/**
 * Detect ALL distinct procedures in a message and roll each one.
 * Scans greedily (longest synonym first); once a procedure fires its
 * matched text is consumed so shorter overlapping synonyms don't double-fire.
 * A procedure can only roll once per message even if mentioned multiple times.
 * Returns an array (may be empty).
 */
function detectAllProcedures(userText) {
  const normalized = normalizeForDetection(userText);
  let remaining = normalized.toLowerCase();
  const found = [];
  const usedProcIds = new Set();

  // Command-style input: the whole message is a terse list of bare keywords
  // separated by commas / "and" / "or" / "then" — no sentence structure.
  // e.g. "atropine", "defib and epi", "IO, bicarb, intubate"
  // In this mode skip the admin-verb requirement so bare drug/procedure names fire.
  const chunks = remaining.split(/\s*[,;]\s*|\s+(?:and|or|then|also|&)\s+/i).map(c => c.trim()).filter(Boolean);
  const commandStyle = !ADMIN_VERB_RE.test(remaining) &&
                       chunks.length >= 1 && chunks.length <= 8 &&
                       chunks.every(c => c.split(/\s+/).length <= 3);

  // Safety cap — no message should have more than 10 distinct procedures
  for (let i = 0; i < 10; i++) {
    let bestMatch = null;
    let bestMatchIndex = -1;

    for (const { key, pattern, proc, specific } of DETECT_PATTERNS) {
      if (usedProcIds.has(proc.id)) continue;
      const exec = pattern.exec(remaining);
      if (!exec) continue;
      // Use precomputed 'specific' flag so uppercase acronyms (BGL, SpO2, IV)
      // don't require an admin verb. Also bypass verb check in command-style input.
      // The verb must live in the SAME SENTENCE as the match — a message-wide
      // check let "I place a nasal cannula" license "for intubation later" in a
      // different sentence, intubating a patient the provider was only
      // planning to intubate.
      if (!specific && !commandStyle) {
        const [s, e] = sentenceBounds(remaining, exec.index);
        if (!ADMIN_VERB_RE.test(remaining.slice(s, e))) continue;
      }
      bestMatch = { key, pattern, proc, matchLen: exec[0].length };
      bestMatchIndex = exec.index;
      break; // sorted longest-first, so first match is most specific
    }

    if (!bestMatch) break;

    // Per-match negation guard: scoped to the keyword's sentence + last 3 words,
    // so an order on a different sentence isn't accidentally suppressed.
    // ("Morphine 4mg. No intubation needed yet." → morphine fires, intubation does not.)
    const negated = isNegated(remaining, bestMatchIndex);

    // Conditional/hedge guard: "if respiratory depression, give narcan",
    // "IV or IO if needed", "consider sedation" — contingent, not a committed
    // order this turn. Rolling them phantom-logs outcomes the action never had.
    const conditional = isConditional(remaining, bestMatchIndex);

    // Route qualifier guard: "push epi through the IO" → IO synonym is a route,
    // not a new procedure order. Suppress access/device rolls in this context.
    const routeQual = isRouteQualifier(remaining, bestMatchIndex);

    // Post-match staging guard: e.g. "LUCAS backboard" should not roll.
    const stagingPost = hasStagingPostContext(remaining, bestMatchIndex + bestMatch.matchLen);

    // Pre-charge guard: charging the defib in anticipation is not a shock order.
    // Applies to defibrillation/cardioversion only (see PRECHARGE_RE above).
    const precharge = isPrecharge(remaining, bestMatchIndex, bestMatch.proc.id);

    // Ambiguous-context classification (reports, plans, bare procedure nouns).
    // Terse command-style input is always a real order — skip the check there.
    const uncertain = commandStyle ? null
      : uncertaintyReason(remaining, bestMatchIndex, bestMatch.key, bestMatch.proc);
    const [uS, uE] = sentenceBounds(remaining, bestMatchIndex);
    const sentence = remaining.slice(uS, uE).trim();

    // Always consume the matched span so we don't loop on the same hit.
    remaining = remaining.replace(bestMatch.pattern, ' ');

    if (!negated && !conditional && !routeQual && !stagingPost && !isPastContext(remaining, bestMatchIndex)) {
      found.push({
        proc: bestMatch.proc,
        matchedKey: bestMatch.key,
        uncertain: !!uncertain,
        reason: uncertain || null,
        precharge,
        sentence,
        key: procEntryKey(bestMatch.proc.id, bestMatch.key),
      });
      // medication_push can fire multiple times in one message (once per drug).
      // Text consumption already prevents the same drug from re-matching.
      if (bestMatch.proc.id !== 'medication_push') {
        usedProcIds.add(bestMatch.proc.id);
      }
    }
    // If negated, leave proc.id eligible — a NON-negated mention later in the
    // same message should still fire ("no IV yet, give morphine 4mg, then try IV").
  }

  return found;
}

function detectAllAndRoll(userText, contextFlags = {}, difficulty = 'NORMAL') {
  const entries = detectAllProcedures(userText);
  return entries.map(({ proc, matchedKey }) => {
    const result = rollProcedure(proc, contextFlags, difficulty);
    if (proc.id === 'medication_push' && matchedKey) {
      result.matched_drug = matchedKey;
    }
    return result;
  });
}

/**
 * Confirmation-aware detection. Overrides come from the player's ✓/✗ choices:
 *   allow — uncertain entries the player confirmed (roll them)
 *   deny  — entries the player rejected (suppress + tell the model)
 * Unresolved uncertain entries are suppressed too (safe default: a mention is
 * not an order) — the API layer surfaces them for confirmation before the turn
 * ever reaches this point, so unresolved only happens in CLI/tests.
 *
 * Returns { rolls, suppressed } where suppressed is
 * [{ procedure_id, matchedKey, reason }].
 */
function detectWithConfirmation(userText, contextFlags = {}, difficulty = 'NORMAL', overrides = {}) {
  const allow = new Set(overrides.allow || []);
  const deny  = new Set(overrides.deny  || []);
  const rolls = [];
  const suppressed = [];
  for (const entry of detectAllProcedures(userText)) {
    const { proc, matchedKey, uncertain, reason, precharge, key } = entry;
    // Pre-charge is a forced suppression — deterministic, not overridable by a
    // confirm click: the wording itself says "charge, don't shock."
    if (precharge) {
      suppressed.push({ procedure_id: proc.id, matchedKey, precharge: true, reason: 'pre-charging — charging the defibrillator in anticipation, no shock ordered' });
      continue;
    }
    if (deny.has(key)) {
      suppressed.push({ procedure_id: proc.id, matchedKey, reason: 'player said not performed' });
      continue;
    }
    if (uncertain && !allow.has(key)) {
      suppressed.push({ procedure_id: proc.id, matchedKey, reason });
      continue;
    }
    const result = rollProcedure(proc, contextFlags, difficulty);
    if (proc.id === 'medication_push' && matchedKey) result.matched_drug = matchedKey;
    rolls.push(result);
  }
  return { rolls, suppressed };
}

function getProcedure(id) {
  return INTERVENTIONS.find(p => p.id === id) || null;
}

module.exports = { detectProcedure, detectAllProcedures, rollProcedure, detectAndRoll, detectAllAndRoll, detectWithConfirmation, getProcedure, calcOutcome, rollD20, normalizeForDetection, PRECHARGE_RE };
