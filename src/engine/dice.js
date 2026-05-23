'use strict';

const { INTERVENTIONS } = require('../data/interventions');
const { HARD_MODE_DC_PENALTY } = require('../data/config');

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
  'cyanokit', // hydroxocobalamin
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
// Administration verbs — required before a SINGLE-WORD medication synonym
// fires a roll. Multi-word synonyms ("give epi", "push the epi") already
// contain the verb, so they bypass this check.
// ---------------------------------------------------------------------------
// Past-tense forms (gave, pushed, administered …) are intentionally excluded —
// they indicate reporting ('we gave epi') rather than ordering ('give epi').
const ADMIN_VERB_RE = /\b(give|giving|push(ing)?|administer(ing)?|inject(ing)?|insert(ing)?|hang(ing)?|start(ing)?\s+the\s+\w+|dose|dosing|spray(ing)?|running?\s+the|hang(ing)?\s+the|attempt(ing)?|tr(?:y|ying)|plac(?:e|ing)|obtain(ing)?|establish(ing)?|get(ting)?|do(?:ing)?|perform(ing)?|set(ting)?\s+up|go(?:ing)?\s+for\s+(?:a|an|the)|I(?:'m| am)\s+going\s+to\s+give|I(?:'m| am)\s+giving)\b/i;

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
const NEGATION_RE = /\b(no|not|don'?t|doesn'?t|isn'?t|won'?t|wouldn'?t|without|lack(?:s|ing|ed)?|denies?|denied|skip(?:ped|ping)?|cancel(?:led|ling)?|hold(?:ing)?|avoid(?:ed|ing)?|stage(?:d|s|ing)?|prep(?:ped|ping)?|staging|standby|stand-by)\b/i;

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
    case 'rsi':
      return difficult_airway ? dcs[dcs.length - 1] : dcs[0];
    case 'cardioversion':
    case 'defibrillation':
    case 'pacing':
      return dcs; // two rolls — equipment + clinical response
    case 'needle_decompression':
      return obese ? 13 : dcs[0];
    case 'cricothyrotomy':
      return difficult_airway ? 17 : dcs[0];
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

/**
 * Outcomes: nat-1 = COMPLICATION | ≥DC = SUCCESS | ≥DC-3 = MARGINAL | else FAILURE
 */
function calcOutcome(roll, dc) {
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

  const penalty = difficulty === 'HARD' ? HARD_MODE_DC_PENALTY : 0;

  // Multi-DC procedures (cardioversion, defibrillation, pacing)
  if (Array.isArray(dc)) {
    const rolls = dc.map(d => {
      const adj = d + penalty;
      const r = rollD20();
      return { dc: adj, base_dc: d, roll: r, outcome: calcOutcome(r, adj) };
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
    };
  }

  const adjustedDC = dc + penalty;
  const roll = rollD20();
  const outcome = calcOutcome(roll, adjustedDC);

  return {
    procedure_id: proc.id,
    patient: proc.patient || 'primary',
    dc: adjustedDC,
    base_dc: dc,
    penalty_applied: penalty,
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
  let remaining = userText.toLowerCase();
  const found = [];
  const usedProcIds = new Set();

  // Safety cap — no message should have more than 10 distinct procedures
  for (let i = 0; i < 10; i++) {
    let bestMatch = null;
    let bestMatchIndex = -1;

    for (const { key, pattern, proc, specific } of DETECT_PATTERNS) {
      if (usedProcIds.has(proc.id)) continue;
      const exec = pattern.exec(remaining);
      if (!exec) continue;
      // Use precomputed 'specific' flag so uppercase acronyms (BGL, SpO2, IV)
      // don't require an admin verb.
      if (!specific && !ADMIN_VERB_RE.test(remaining)) continue;
      bestMatch = { key, pattern, proc, matchLen: exec[0].length };
      bestMatchIndex = exec.index;
      break; // sorted longest-first, so first match is most specific
    }

    if (!bestMatch) break;

    // Per-match negation guard: scoped to the keyword's sentence + last 3 words,
    // so an order on a different sentence isn't accidentally suppressed.
    // ("Morphine 4mg. No intubation needed yet." → morphine fires, intubation does not.)
    const negated = isNegated(remaining, bestMatchIndex);

    // Post-match staging guard: e.g. "LUCAS backboard" should not roll.
    const stagingPost = hasStagingPostContext(remaining, bestMatchIndex + bestMatch.matchLen);

    // Always consume the matched span so we don't loop on the same hit.
    remaining = remaining.replace(bestMatch.pattern, ' ');

    if (!negated && !stagingPost && !isPastContext(remaining, bestMatchIndex)) {
      found.push({ proc: bestMatch.proc, matchedKey: bestMatch.key });
      usedProcIds.add(bestMatch.proc.id);
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

function getProcedure(id) {
  return INTERVENTIONS.find(p => p.id === id) || null;
}

module.exports = { detectProcedure, detectAllProcedures, rollProcedure, detectAndRoll, detectAllAndRoll, getProcedure, calcOutcome, rollD20 };
