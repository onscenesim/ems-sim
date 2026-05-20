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
  'yankauer', 'lucas', 'autopulse', 'ezio', 'fast1', 'king', 'igel',
  'lma', 'bvm', 'aed', 'narcan', 'epipen', 'zofran',
]);

for (const proc of INTERVENTIONS) {
  const register = (raw) => {
    const key = raw.toLowerCase().trim();
    if (SYNONYM_MAP.has(key)) return;
    SYNONYM_MAP.set(key, proc);
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Word-boundary via lookbehind/lookahead — handles hyphens and acronyms
    const pattern = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i');
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
const ADMIN_VERB_RE = /\b(give|gave|giving|push(ed|ing)?|administer(ed|ing)?|inject(ed|ing)?|hang(ing)?|start(ed|ing)?\s+the\s+\w+|dose|dosing|spray(ed|ing)?|running?\s+the|hang(ing)?\s+the|I(?:'m| am)\s+going\s+to\s+give|I(?:'m| am)\s+giving)\b/i;

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
  if (SPECIFIC_EQUIPMENT.has(key)) return true;
  return false;
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
    return { procedure_id: proc.id, no_roll: true, outcome: 'SUCCESS', dc: null, roll: null };
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
    dc: adjustedDC,
    base_dc: dc,
    penalty_applied: penalty,
    roll,
    outcome,
    no_roll: false,
  };
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

    for (const { key, pattern, proc, specific } of DETECT_PATTERNS) {
      if (usedProcIds.has(proc.id)) continue;
      if (!pattern.test(remaining)) continue;
      // Use precomputed 'specific' flag so uppercase acronyms (BGL, SpO2, IV)
      // don't require an admin verb.
      if (!specific && !ADMIN_VERB_RE.test(remaining)) continue;
      bestMatch = { key, pattern, proc };
      break; // sorted longest-first, so first match is most specific
    }

    if (!bestMatch) break;

    found.push(bestMatch.proc);
    usedProcIds.add(bestMatch.proc.id);
    // Consume the matched text so shorter synonyms of the same region don't re-fire
    remaining = remaining.replace(bestMatch.pattern, ' ');
  }

  return found;
}

function detectAllAndRoll(userText, contextFlags = {}, difficulty = 'NORMAL') {
  const procs = detectAllProcedures(userText);
  return procs.map(proc => rollProcedure(proc, contextFlags, difficulty));
}

function getProcedure(id) {
  return INTERVENTIONS.find(p => p.id === id) || null;
}

module.exports = { detectProcedure, detectAllProcedures, rollProcedure, detectAndRoll, detectAllAndRoll, getProcedure, calcOutcome, rollD20 };
