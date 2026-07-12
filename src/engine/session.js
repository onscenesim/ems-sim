'use strict';

const { assembleSeedBlock, buildDebriefContext } = require('./assembler');
const { REGIONS } = require('../data/regions');
const { logEvent, closeScenario } = require('./logger');
const { detectWithConfirmation, getProcedure, PRECHARGE_RE } = require('./dice');
const { sendTurn, sendDebrief } = require('./api');
const { logRun, updateRunDebrief } = require('../server/adminLogger');

// Phrases that close the scenario and trigger debrief offer
const DEBRIEF_TRIGGERS = [
  'transfer of care',
  'transfer care',          // providers routinely drop the "of"
  'transferred care',
  'transferring care',
  'patient is in ed hands',
  'patient is at the ed',
  'we are clear from',
  "we're clear from",
  'pronounce the patient',
  'call it here',
  'time of death',
  'terminate resuscitation',
  'end scenario',
  'end the scenario',
  'end call',               // natural phrasing seen in play — close the call
  'end the call',
  'stop the scenario',
];

// ── Roll reconciliation ─────────────────────────────────────────────────────
// The dice are rolled and injected BEFORE the model narrates, so the model can
// still decline an order it judges wrong/impossible ("not indicated", "no IV
// access", partner refuses). When it does, the rolled outcome never happened —
// but it was being logged into the objective debrief log anyway, mis-grading the
// student for meds that were refused or never given. After the model replies we
// reconcile: if the narration clearly shows a rolled action did NOT occur, that
// roll is dropped from the log, the debrief turn record, and the client payload
// (so its animation/sound also won't fire). Conservative by design — a roll is
// only voided on a clear cue; ambiguous cases are kept.

// Search terms used to find a roll's action in the narration. Drug aliases cover
// the model writing the generic name when the order used a brand/abbreviation.
const DRUG_ALIASES = {
  narcan: ['naloxone'], naloxone: ['narcan'], epi: ['epinephrine'], epinephrine: ['epi'],
  nitro: ['nitroglycer'], amio: ['amiodarone'], amiodarone: ['amio'], bicarb: ['bicarbonate'],
  d50: ['dextrose'], duoneb: ['albuterol', 'ipratropium'], versed: ['midazolam'],
  ativan: ['lorazepam'], zofran: ['ondansetron'], ondansetron: ['zofran'], lasix: ['furosemide'],
};
const PROC_TERMS = {
  emergency_delivery: ['deliver', 'delivery', 'crowning', 'the baby'],
  newborn_resuscitation: ['newborn', 'infant', 'neonate', 'the baby'],
  cpr: ['cpr', 'compression'],
  bvm: ['bag-valve', 'bag valve', 'bvm', 'bagging', 'ventilat'],
  needle_decompression: ['decompress', 'needle'],
  fundal_massage: ['fundal', 'uterine massage'],
};
function rollSearchTerms(r) {
  if (r.procedure_id === 'medication_push' && r.matched_drug) {
    const d = r.matched_drug.toLowerCase();
    return [d, ...(DRUG_ALIASES[d] || [])];
  }
  return PROC_TERMS[r.procedure_id] || r.procedure_id.split('_').filter(w => w.length > 3);
}

// A med-push could not have been delivered this turn (no route, blown line, or an
// explicit "nothing was given"). Voids ALL med-push rolls for the turn.
function medNotGiven(reply) {
  return /\bno (?:medication|medications|meds|drugs?)\b[^.;!?]{0,40}\b(?:administered|given|pushed|on board)\b/i.test(reply)
    || /\bno (?:iv access|line|patent line|patent iv|venous access|vascular access|iv route|route for)\b/i.test(reply)
    || /\b(?:the )?(?:iv|line) (?:is|was|has)\b[^.;!?]{0,20}\b(?:no longer patent|blown|infiltrated|not patent|not in)\b/i.test(reply)
    || /\bcannot be (?:pushed|given|administered)\b/i.test(reply)
    || /\bhave (?:no|neither) (?:patent )?(?:line|route|iv access|venous access)\b/i.test(reply)
    || /\bno (?:viable|available|patent) route\b/i.test(reply);
}

// Per-roll refusal / non-occurrence cue, scoped to a sentence that names the action.
const REFUSAL_RE = /\b(?:not indicated|no (?:\w+ )?indication|is contraindicated|contraindicated (?:here|in|anyway)|refus(?:e|es|ed|ing)|declin(?:e|es|ed|ing)|will not (?:give|push|administer|execute|happen|proceed)|won'?t (?:give|push|administer)|(?:is )?not warranted|inappropriate|premature|not happening|will not proceed|received no|did not receive|never received|there (?:is|are) no|no (?:newborn|baby|infant|delivery|crowning|fetus)|not (?:delivering|in labor|crowning|administered|given))\b/i;

function reconcileRolls(rolls, reply) {
  if (!rolls.length || !reply) return rolls;
  const sentences = reply.split(/(?<=[.;!?])\s+/);
  const noMeds = medNotGiven(reply);
  return rolls.filter(r => {
    if (r.no_roll) return true;                       // routine action, always kept
    const isMed = r.procedure_id === 'medication_push';
    if (isMed && noMeds) return false;                // no route / nothing given
    const terms = rollSearchTerms(r);
    for (const sent of sentences) {
      const sl = sent.toLowerCase();
      if (terms.some(t => sl.includes(t)) && REFUSAL_RE.test(sent)) return false;
    }
    return true;
  });
}

// ── Roll outcome guidance ───────────────────────────────────────────────────
// The interventions data documents each procedure's real failure modes and
// complications (dc_notes), but the model never saw them — on a FAILURE or
// COMPLICATION it had to invent what went wrong, sometimes implausibly (e.g. a
// random adverse event instead of the documented esophageal placement on an
// intubation COMPLICATION). Extract the matching "Failure:"/"Complication:"
// sentence(s) from dc_notes and append them to the injected [SYSTEM ROLL] line
// so the narration lands on the documented failure mode.
const GUIDANCE_LABEL_RE = {
  FAILURE:      /^failure\b/i,
  COMPLICATION: /^complication\b/i,
  MARGINAL:     /^marginal\b/i,
};
// A new labeled clause ends the guidance we're collecting.
const GUIDANCE_STOP_RE = /^(?:failure|complication|marginal|success|dc\s?\d|scope|always|never|document)/i;

function outcomeGuidance(procedureId, outcome) {
  const labelRe = GUIDANCE_LABEL_RE[outcome];
  if (!labelRe) return null;   // SUCCESS or unknown — no guidance needed
  const proc = getProcedure(procedureId);
  const notes = proc && proc.dc_notes;
  if (notes) {
    const sentences = notes.split(/(?<=\.)\s+/);
    const idx = sentences.findIndex(s => labelRe.test(s.trim()));
    if (idx >= 0) {
      let out = sentences[idx].trim();
      for (let i = idx + 1; i < sentences.length && out.length < 180; i++) {
        const s = sentences[i].trim();
        // A same-label sentence continues the guidance (e.g. cardioversion's
        // "Failure of equipment:" + "Failure of response:"); a different label
        // or DC/roll mechanics ends it — that's engine meta, not narration.
        if (labelRe.test(s)) { out += ' ' + s; continue; }
        if (GUIDANCE_STOP_RE.test(s) || /\bDC\b/.test(s)) break;
        out += ' ' + s;
      }
      return out.length > 240 ? out.slice(0, 237) + '...' : out;
    }
  }
  // No documented guidance for this outcome — give MARGINAL a sane default so
  // the model doesn't treat it as either a clean success or a failure.
  if (outcome === 'MARGINAL') {
    return 'Marginal: the attempt barely succeeds — it works, but narrate degraded quality, extra time, or a minor imperfection.';
  }
  return null;
}

function isDebriefTrigger(text) {
  const lower = text.toLowerCase();
  return DEBRIEF_TRIGGERS.some(t => lower.includes(t));
}

// Numeric fields in the VITALS tag (everything else is treated as a string token)
const VITALS_NUMERIC = new Set(['HR', 'SpO2', 'ETCO2', 'RR', 'GCS', 'Pain', 'Glucose']);

// Placeholder tokens the model emits despite the prompt ban ("ETCO2=not_yet",
// "RR=call_manually"). A field only appears when actually measured — drop these
// so junk strings never reach the UI or the debrief log.
const VITALS_PLACEHOLDER_RE = /^(?:-+|\?+|x+|n\/?a|none|nil|pend\w*|unknown\w*|unavail\w*|await\w*|not[_-]?\w*|call[_-]?\w*|manual\w*|no[_-](?:reading|value|data)\w*)$/i;

// Pulse oximetry and NIBP require pulsatile flow. In an unambiguously pulseless
// rhythm the model still sometimes emits numbers ("BP=58/38 SpO2=88" in PEA) —
// strip them so the monitor can never show perfusion that doesn't exist.
// VT is left alone: the token can't distinguish pulseless from perfusing VT.
const PULSELESS_RHYTHM_RE = /^(?:vf|v[\s_-]?fib\w*|ventricular[\s_-]?fib\w*|asystole|flatline|pea|pulseless\w*)$/i;
function stripPulselessPerfusion(vitals) {
  if (!vitals || !vitals.Rhythm) return vitals;
  const raw = vitals.Rhythm;
  const tok = (raw && typeof raw === 'object') ? raw.value : raw;
  if (tok && PULSELESS_RHYTHM_RE.test(String(tok).trim())) {
    delete vitals.SpO2;
    delete vitals.BP;
  }
  return vitals;
}

/**
 * Convert "T+M:SS" → float minutes (e.g. "T+4:30" → 4.5). Returns null if malformed.
 */
function timestampToMinutes(t) {
  const m = String(t).match(/^T[+=](\d+):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}

/**
 * Defensive backstop: the provider (the user) never speaks in the engine's
 * output. Strip any fabricated provider dialogue lines (e.g. `You: "..."` or
 * `Provider: "..."`) the model may emit despite the prompt rules, so they never
 * reach the player. Only removes colon-led dialogue lines — second-person
 * narration like "You reach for the bag" has no colon and is left untouched
 * (that style is handled by the prompt). Applied to the displayed reply only.
 */
function stripProviderSpeech(text) {
  return text
    .split('\n')
    .filter(line => !/^\s*(you|provider|the provider)\s*:/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extract the trailing [VITALS: ...] tag from Claude's reply.
 * Returns { cleanedReply, vitals }. If no tag is found, vitals is null and
 * cleanedReply equals the input.
 *
 * Vitals object shape:
 *   continuous fields:  { HR: 110, SpO2: 94, Rhythm: 'sinus', ... }
 *   episodic w/ ts:     { BP: { value: '92/60', t: 'T+4:20', tMin: 4.33 }, ... }
 */
function parseVitalsTag(reply) {
  // Permissive: match anywhere in the reply, not just at the end. If Claude
  // emits multiple tags, the LAST one wins (it's the most current).
  const re = /\s*\[VITALS:\s*([^\]]+)\]\s*/gi;
  const matches = [...reply.matchAll(re)];
  if (matches.length === 0) return { cleanedReply: reply, vitals: null };

  // Strip ALL occurrences of the tag from the user-facing reply.
  const cleanedReply = reply.replace(re, ' ').replace(/\s+\n/g, '\n').replace(/\s{2,}/g, ' ').trim();
  // Use the last tag's contents as the authoritative vitals snapshot.
  const inner = matches[matches.length - 1][1].trim();
  const vitals = {};

  for (const tok of inner.split(/\s+/)) {
    const eqIdx = tok.indexOf('=');
    if (eqIdx < 1) continue;
    const key = tok.slice(0, eqIdx);
    let rawValue = tok.slice(eqIdx + 1);

    // Optional "@T+M:SS" or "@T=M:SS" timestamp suffix on episodic vitals (BP, Temp, Glucose)
    let timestamp = null;
    const atIdx = rawValue.search(/@T[+=]/);
    if (atIdx >= 0) {
      timestamp = rawValue.slice(atIdx + 1);
      rawValue = rawValue.slice(0, atIdx);
    }

    // Placeholder ("not_yet", "pending") — the field was not measured; omit it.
    if (VITALS_PLACEHOLDER_RE.test(rawValue)) continue;

    let parsedValue = rawValue;
    if (VITALS_NUMERIC.has(key)) {
      const n = Number(rawValue);
      if (!Number.isFinite(n)) continue;   // garbage in a numeric field — omit
      parsedValue = n;
    } else if (key === 'Temp') {
      // Normalize temperature to plain Fahrenheit. The model occasionally emits
      // Celsius ("29.8C", "40.6") despite the prompt — any physiologic temp ≤ 45
      // can only be Celsius, so convert; strip unit suffixes either way.
      const t = parseFloat(rawValue);
      if (!Number.isFinite(t)) continue;
      parsedValue = t <= 45 ? Math.round((t * 9 / 5 + 32) * 10) / 10 : t;
    }

    if (timestamp) {
      vitals[key] = { value: parsedValue, t: timestamp, tMin: timestampToMinutes(timestamp) };
    } else {
      vitals[key] = parsedValue;
    }
  }

  return { cleanedReply, vitals };
}

/**
 * Parse [LOADING] and [EN_ROUTE:nearest|major] event tags from the reply.
 * Returns { cleanedReply, loading, enRoute, transportDest }.
 */
function parseHospitalEtaMin(str) {
  // Extract all numbers from strings like "10-20 minutes" or "360-720 minutes, air medical primary"
  const nums = (str || '').match(/\d+/g);
  if (!nums || !nums.length) return null;
  const vals = nums.map(Number);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Parse [DEMO: source] — demographics obtained
function parseDemoTag(reply) {
  const re = /\s*\[DEMO:\s*([^\]]+)\]\s*/gi;
  let source = null;
  const cleanedReply = reply.replace(re, (_, s) => {
    if (!source) source = s.trim();
    return ' ';
  }).replace(/  +/g, ' ').trim();
  return { cleanedReply, demoSource: source };
}

// Parse [SECOND_PATIENT] — second patient identified
function parseSecondPatientTag(reply) {
  const found = /\[SECOND_PATIENT\]/i.test(reply);
  const cleanedReply = reply.replace(/\s*\[SECOND_PATIENT\]\s*/gi, ' ').replace(/  +/g, ' ').trim();
  return { cleanedReply, secondPatient: found };
}

function parseEventTags(reply) {
  let loading      = false;
  let enRoute      = false;
  let transportDest = null;   // 'nearest' | 'major'
  let cleaned = reply;
  if (/\[LOADING\]/i.test(cleaned)) {
    loading = true;
    cleaned = cleaned.replace(/\s*\[LOADING\]\s*/gi, ' ');
  }
  // Accept [EN_ROUTE], [EN_ROUTE:nearest], [EN_ROUTE: nearest], [EN_ROUTE:major].
  // The model frequently writes a space after the colon ("[EN_ROUTE: nearest]");
  // without tolerating it the tag never matched, so departure never fired and the
  // raw tag leaked into the visible reply. A single trailing [a-z] word is required
  // so a placeholder like "[EN_ROUTE: pending destination]" does NOT fire transport.
  const routeMatch = cleaned.match(/\[EN_ROUTE(?::\s*([a-z]+))?\]/i);
  if (routeMatch) {
    enRoute = true;
    transportDest = routeMatch[1] ? routeMatch[1].toLowerCase() : 'nearest';
  }
  // Strip ANY [EN_ROUTE…] tag from the visible text, including malformed/placeholder
  // forms (e.g. "[EN_ROUTE: pending destination]") that don't fire transport.
  cleaned = cleaned.replace(/\s*\[EN_ROUTE\b[^\]]*\]\s*/gi, ' ');
  return { cleanedReply: cleaned.trim(), loading, enRoute, transportDest };
}

/**
 * Parse [BASE_CONTACT] tag — emitted by California scenarios when the
 * unit calls the base hospital for orders. Triggers hold-music on client.
 */
function parseBaseContactTag(reply) {
  if (!/\[BASE_CONTACT\]/i.test(reply)) return { cleanedReply: reply, baseContact: false };
  const cleanedReply = reply.replace(/\s*\[BASE_CONTACT\]\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim();
  return { cleanedReply, baseContact: true };
}

/**
 * Parse [BACKUP: status ETA=N] tag from the reply.
 * Returns { cleanedReply, backup } where backup is null or { status, eta }.
 * Status values: called, en_route, on_scene, not_called
 */
function parseBackupTag(reply) {
  const re = /\s*\[BACKUP:\s*([^\]]+)\]\s*/gi;
  const matches = [...reply.matchAll(re)];
  if (matches.length === 0) return { cleanedReply: reply, backup: null };
  const cleanedReply = reply.replace(re, ' ').replace(/\s{2,}/g, ' ').trim();
  const inner = matches[matches.length - 1][1].trim();
  const statusMatch = inner.match(/^(\w+)/);
  const etaMatch = inner.match(/ETA=(\d+)/i);
  return {
    cleanedReply,
    backup: {
      status: statusMatch ? statusMatch[1].toLowerCase() : 'unknown',
      eta:    etaMatch    ? parseInt(etaMatch[1], 10)    : null,
    },
  };
}

// Provider phrasings that request additional resources (mirrors the Rule 19
// backup triggers). Used to set backup status deterministically — the model does
// not reliably emit [BACKUP:] when the provider asks, so the UI indicator was
// never updating even though backup was narrated and arrived.
const BACKUP_REQUEST_RE = /\b(?:(?:call(?:ing)?|send|request(?:ing)?|get\s+me|dispatch|need)\s+(?:me\s+|us\s+|for\s+|a\s+|an\s+|another\s+|additional\s+|the\s+|some\s+)*(?:backup|back-?up|second\s+(?:unit|medic|ambulance|crew)|another\s+(?:unit|medic|ambulance|crew)|additional\s+(?:units?|medics?|personnel|resources?)|engine\s*(?:company)?|fire(?:\s+department)?|rescue|mutual\s+aid)|\b(?:engine|ladder|truck|rescue)\s+company\b)/i;

// An unambiguous order to LOAD the patient into the ambulance — movement INTO
// the vehicle, or a classic load idiom. Deliberately narrower than the
// `packaging` procedure (which also covers on-scene packaging like backboarding
// and extrication that are NOT loading). The model sometimes defers a plain load
// order or drops [LOADING] (observed: "move the patient to the ambulance"
// registered as packaging, loading never fired, the destination panel never
// appeared) — this drives loading deterministically so the panel always fires.
const LOAD_REQUEST_RE = /\b(?:(?:load|get|bring|take|put|wheel|roll|move)\s+(?:up\s+)?(?:him|her|them|'?em|the\s+(?:patient|kid|child|boy|girl|man|woman|pt|stretcher|cot))\s+(?:up\s+)?(?:in|into|in\s?to|to|on|onto|aboard)\s+the\s+(?:ambulance|rig|truck|unit|bus|van|medic|wagon|back)|load\s+(?:him|her|them|'?em|the\s+(?:patient|kid|child|boy|girl|man|woman|pt))\s+up|load\s+and\s+go|scoop\s+and\s+(?:run|go)|package\s+and\s+(?:move|load|go))\b/i;

// Interrogative / hypothetical framing — don't force a load on a question
// ("should we load him up?", "are we ready to move to the rig?").
const LOAD_QUESTION_RE = /\b(?:should|shall|can|could|are|is|ready|when|do)\s+(?:we|i|you|he|she|they|it)\b/i;

/**
 * Parse [TIME: M:SS] tag from Claude's reply.
 * Returns { cleanedReply, timeMinutes }. timeMinutes is null if tag absent.
 */
function parseTimeTag(reply) {
  // Strip ALL [TIME:] tags from the visible reply; if the model emits more than
  // one, the LAST is the most current and wins. Tolerates a "T+" prefix
  // ("[TIME: T+6:30]") — a drift the strict regex used to silently drop.
  const re = /\s*\[TIME:\s*(?:T\s*[+=]\s*)?(\d+):(\d{2})\]\s*/gi;
  const matches = [...reply.matchAll(re)];
  if (matches.length === 0) return { cleanedReply: reply, timeMinutes: null };
  const cleanedReply = reply.replace(re, ' ').replace(/\s{2,}/g, ' ').trim();
  const m = matches[matches.length - 1];
  const timeMinutes = parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
  return { cleanedReply, timeMinutes };
}

/**
 * Parse [CREW_STATUS: partner=X captain=Y] tag from the reply.
 * Returns { cleanedReply, crewStatus } where crewStatus is null or { partner, captain }.
 * Partner values: on_scene, driving, in_back
 * Captain values: not_on_scene, en_route, on_scene, driving, in_back
 */
function parseCrewStatusTag(reply) {
  const re = /\s*\[CREW_STATUS:\s*([^\]]+)\]\s*/gi;
  const matches = [...reply.matchAll(re)];
  if (matches.length === 0) return { cleanedReply: reply, crewStatus: null };
  const cleanedReply = reply.replace(re, ' ').replace(/\s{2,}/g, ' ').trim();
  const inner = matches[matches.length - 1][1].trim();
  const partnerMatch = inner.match(/partner=(\w+)/i);
  const captainMatch = inner.match(/captain=(\w+)/i);
  const driverMatch  = inner.match(/driver=(\w+)/i);
  return {
    cleanedReply,
    crewStatus: {
      partner: partnerMatch ? partnerMatch[1].toLowerCase() : null,
      captain: captainMatch ? captainMatch[1].toLowerCase() : null,
      driver:  driverMatch  ? driverMatch[1].toLowerCase()  : null,
    },
  };
}



/**
 * Build context flags from the current seed for context-aware DC selection.
 * Flags are static for the scenario — a future version could update these
 * dynamically as findings are revealed.
 */
function buildContextFlags(seed) {
  const comorbidity = seed.comorbidity_bundle || '';
  return {
    obese: comorbidity.includes('metabolic') || comorbidity.includes('obese'),
    // age_group is the override string (e.g. "pediatric — infant predominantly"),
    // so match the base band, not an exact 'pediatric' — otherwise the pediatric
    // airway DC bump never fired for any qualified pediatric scenario.
    pediatric: String(seed.age_group || '').toLowerCase().startsWith('pediatric'),
    hypotensive: false,      // updated dynamically if needed
    difficult_airway: false, // updated dynamically if needed
    junctional: false,
  };
}

class Session {
  constructor(seed, sessionId = null) {
    this.seed = seed;
    this.sessionId = sessionId;   // set by sessionStore after creation
    this.systemPrompt = assembleSeedBlock(seed);
    this.messages = [];
    this.sceneMinute = 0;
    this.closed = false;
    this.contextFlags = buildContextFlags(seed);
    this.lastVitals = null;       // most-recent parsed [VITALS:] tag, or null if none yet
    this.turns = [];
    this.backupStatus = null;        // { status, eta } from [BACKUP:] tag
    this.demoSource = null;          // who obtained demographics ([DEMO:] tag)
    this.secondPatientFound = false; // second patient confirmed ([SECOND_PATIENT] tag)
    this.backupArrivalMinute = null; // scene minute when backup is expected on scene
    this.crewStatus = null;   // { partner, captain } from [CREW_STATUS:] tag
    this.moving = false;      // true after [EN_ROUTE] fires — raises CPR DC
    this.transportEtaMin = null; // minutes to hospital, set when [EN_ROUTE] fires
    this.transportDest = null;   // 'nearest' | 'major' — which hospital the unit is en route to
    this.departSceneMinute = null; // scene-clock minute when the unit first departed for the hospital — the true "scene time" boundary for the debrief
    // Vascular access ledger — the engine's authoritative record of every line
    // placed this call: [{ kind: 'IV'|'IO', status: 'patent'|'marginal'|'blown' }].
    // Injected into each turn so the model can't push drugs through a dead line,
    // and into the debrief so route confusion can't be pinned on the provider.
    this.access = [];
    this.lastReplyHadTime = true; // whether the previous reply carried a [TIME:] tag — drives a self-healing reminder
    this.hasLoaded = false;    // true after [LOADING] fires — safety net for animation
    this.arrivedAtHospital = false; // true once a transport skip reaches the bay — gates END server-side
  }

  /**
   * Estimate transport time (minutes) for the current region. Used to advance the
   * scene clock realistically when the player time-skips through transport. Falls
   * back to the active transport ETA, then to a sane default.
   */
  _transportEtaEstimate() {
    if (typeof this.transportEtaMin === 'number' && this.transportEtaMin > 0) {
      return Math.round(this.transportEtaMin);
    }
    const reg = REGIONS.find(r => r.id === this.seed.region);
    if (reg) {
      const v = parseHospitalEtaMin(reg.nearest_hospital_min);
      if (v) return Math.round(v);
    }
    return 12;
  }

  /** One-line summary of the access ledger, numbered per kind. */
  _accessSummary() {
    const counts = {};
    return this.access.map(a => {
      counts[a.kind] = (counts[a.kind] || 0) + 1;
      return `${a.kind} #${counts[a.kind]}: ${a.status.toUpperCase()}`;
    }).join(', ');
  }

  /**
   * Update the access ledger from this turn's reconciled rolls (lines placed)
   * and the reply narration (lines the model declared blown/infiltrated).
   */
  _updateAccess(rolls, reply) {
    for (const r of rolls) {
      if (r.no_roll) continue;
      if (r.procedure_id === 'peripheral_iv') {
        if (r.outcome === 'SUCCESS')       this.access.push({ kind: 'IV', status: 'patent' });
        else if (r.outcome === 'MARGINAL') this.access.push({ kind: 'IV', status: 'marginal' });
        else if (r.outcome === 'COMPLICATION') this.access.push({ kind: 'IV', status: 'blown' });
        // FAILURE: no line placed
      } else if (r.procedure_id === 'io_access') {
        if (r.outcome === 'SUCCESS')       this.access.push({ kind: 'IO', status: 'patent' });
        else if (r.outcome === 'MARGINAL') this.access.push({ kind: 'IO', status: 'marginal' });
      }
    }
    // Narrated line failure ("IV's blown", "the catheter has infiltrated")
    if (/\b(?:iv|line|catheter)\b[^.!?]{0,80}\b(?:blown|blew|infiltrat\w*|extravasat\w*|no longer patent|lost)\b|\b(?:blown|infiltrat\w+)\b[^.!?]{0,40}\b(?:iv|line|catheter)\b/i.test(reply)) {
      const last = [...this.access].reverse().find(a => a.kind === 'IV' && a.status !== 'blown');
      if (last) last.status = 'blown';
    }
  }

  /**
   * Send a user message and get Claude's response.
   * Auto-detects procedures and logs dice rolls.
   * `procOverrides` = { allow: [keys], deny: [keys] } from the player's
   * confirm-dice choices on uncertain detections.
   * Returns { reply, rolls, suppressed, closed, ... }
   */
  async send(userText, reportMode = false, skipMode = null, procOverrides = {}) {
    if (this.closed) {
      return { reply: '[Scenario is closed. Start a new scenario.]', rolls: [], closed: true };
    }

    // CLOSE COMMAND — no model turn. The END CALL button (and typed close phrases
    // like "end scenario") end the call directly. If we let the model respond to
    // the close turn it generates its own after-action/"debrief", so the user saw
    // TWO debriefs: the model's, then the official one. Close server-side with a
    // canned sign-off and skip the model call entirely. (Report-mode handoffs are
    // NOT short-circuited here — they still get the ED's acknowledgment and close
    // via the post-reply check below.)
    if (!reportMode && !skipMode && isDebriefTrigger(userText)) {
      closeScenario(this.seed, this.sceneMinute);
      this.closed = true;
      logRun(this.sessionId, this.seed, this.messages);
      const unit = this.seed.unit_name || 'Unit';
      return {
        reply: `${unit} is clear. — End of call —`,
        rolls: [], suppressed: [], vitals: this.lastVitals, loading: false, enRoute: false,
        transportEtaMin: this.transportEtaMin, baseContact: false,
        backup: this.backupStatus, crewStatus: this.crewStatus, demoSource: this.demoSource,
        secondPatient: this.secondPatientFound, arrived: this.arrivedAtHospital, closed: true,
      };
    }

    // Detect and roll ALL procedures mentioned in the user's message.
    // Skip entirely when the player is giving a radio report, handoff, or a time-skip.
    const rollContext = { ...this.contextFlags, moving: this.moving };
    const detection = (reportMode || skipMode)
      ? { rolls: [], suppressed: [] }
      : detectWithConfirmation(userText, rollContext, this.seed.difficulty, procOverrides);
    const rolls = detection.rolls;
    const suppressed = detection.suppressed;
    // NOTE: rolls are logged AFTER the model narrates (see reconcileRolls below),
    // not here — so an order the model declines as wrong/impossible doesn't get
    // logged as if it happened. The full `rolls` set is still injected into the
    // model message right away so Claude sees every outcome to narrate.

    // Inject all real roll results into the user message so Claude knows every outcome.
    // Claude must NOT generate its own [ROLL:] notation — only narrate consequences.
    let messageText = userText;

    // Deterministic LOAD: the provider clearly ordered the patient into the rig and
    // the unit isn't already loaded or moving. The model sometimes defers this or
    // forgets [LOADING], which suppressed the destination panel — force it below.
    const wantsLoad = !reportMode && !skipMode && !this.hasLoaded && !this.moving
      && LOAD_REQUEST_RE.test(userText) && !LOAD_QUESTION_RE.test(userText);
    // In report mode, tell Claude this is a report/handoff turn — no procedure rolls.
    if (reportMode) {
      messageText += '\n\n[REPORT MODE: The player is giving a radio report or patient handoff. '
        + 'No procedure rolls occurred this turn. Procedures mentioned are past events already completed. '
        + 'Respond as the receiving party (hospital, medical control, or incoming crew). '
        + 'Acknowledge the report, ask any clinically appropriate follow-up questions, '
        + 'and confirm estimated time of arrival or transfer acceptance as appropriate.]';
    }
    // Time-skip directive — fast-forward an uneventful transport leg, assuming the
    // provider kept monitoring (not an abandonment of care), and pick up from the
    // patient's current state.
    if (skipMode) {
      // A transport skip deterministically lands at the ED bay — record it server-
      // side so the END/handoff state never depends on whether the model's prose
      // happened to say "we've arrived". This survives resume via the snapshot.
      if (skipMode === 'to_hospital' || skipMode === 'to_arrival') {
        this.arrivedAtHospital = true;
      }
      const etaMin = this._transportEtaEstimate();
      const noTreat = 'IMPORTANT: a time-skip is a fast-forward through an uneventful stretch, NOT an abandonment of care. '
        + 'Assume the provider kept monitoring the patient and continued whatever care was already in progress the entire '
        + 'time; they simply did not issue new minute-to-minute orders during the skipped interval. The patient\'s '
        + 'condition picks up from its CURRENT state and continues to evolve along its established trajectory, including '
        + 'any deterioration already underway.';
      // Crew positions flip when the unit starts moving — the highest-risk moment for a
      // tag/narration mismatch. We know who drives, so we hand the model the exact
      // CREW_STATUS to emit rather than leaving it to discretion. Priority:
      //   1. a runtime non-roster driver already established (backup crew etc.)
      //   2. a seed-designated separate transport driver
      //   3. default two-person unit → the partner drives, provider alone in back
      const anonDriverActive = !!(this.crewStatus && this.crewStatus.driver === 'anonymous');
      const seedSeparateDriver = this.seed.crew_transport_driver
        && this.seed.crew_transport_driver !== this.seed.crew_partner;
      const partnerDrives = !anonDriverActive && !seedSeparateDriver;
      const driverName = anonDriverActive ? 'the assigned driver'
        : (this.seed.crew_transport_driver || this.seed.crew_partner || 'your partner');
      const captainStatus = (this.crewStatus && this.crewStatus.captain) || 'not_on_scene';
      let crewTag = `partner=${partnerDrives ? 'driving' : 'in_back'} captain=${captainStatus}`;
      if (anonDriverActive) crewTag += ' driver=anonymous';
      const crewNote = ' CREW POSITIONS (unit is moving): ' + driverName + ' is driving; the provider '
        + '(you, the player) rides in the back with the patient and is NEVER named in the CREW_STATUS tag. '
        + 'Emit exactly [CREW_STATUS: ' + crewTag + '] and make your narration match it — never describe '
        + driverName + ' driving while tagging the partner in_back, and never mark the partner in_back just '
        + 'because someone is in the back (that someone is the provider).';
      if (skipMode === 'to_ambulance') {
        messageText += '\n\n[SYSTEM NOTE: TIME-SKIP — LOAD THE PATIENT. The provider skips ahead to load the '
          + 'patient into the ambulance now. In 1-2 sentences, narrate the crew packaging and loading the patient. '
          + noTreat + ' Emit [LOADING]. The unit is loaded but NOT yet moving — if no destination has been chosen, '
          + 'the partner asks once which hospital. Do not begin driving and do not arrive anywhere. The unit is parked, '
          + 'so keep [CREW_STATUS: partner=on_scene captain=' + captainStatus + '] — nobody is driving yet.]';
      } else if (skipMode === 'to_hospital') {
        messageText += '\n\n[SYSTEM NOTE: TIME-SKIP — TRANSPORT TO HOSPITAL. The provider skips ahead: transport the '
          + 'patient and ARRIVE at the emergency department bay. If a destination was already chosen use it; otherwise '
          + 'transport to the most clinically appropriate facility and name it in one clause. In 2-3 sentences, summarize '
          + 'the transport and arrival. ' + noTreat + ' Advance the scene clock by roughly ' + etaMin + ' minutes to reflect '
          + 'the full transport. Emit [EN_ROUTE:nearest] or [EN_ROUTE:major] for the destination.' + crewNote
          + ' Arrive at the bay doors; the receiving team meets the unit and is ready to take report. Do NOT deliver '
          + 'the handoff yourself, do NOT transfer care, and do NOT declare the call over — prompt the provider for '
          + 'their report and await it. The scenario continues.]';
      } else if (skipMode === 'to_arrival') {
        messageText += '\n\n[SYSTEM NOTE: TIME-SKIP — COMPLETE TRANSPORT. The unit is already en route. The provider skips '
          + 'the remainder of the drive and ARRIVES at the emergency department bay. In 1-2 sentences, summarize the rest of '
          + 'the transport and arrival. ' + noTreat + ' Advance the scene clock by roughly ' + etaMin + ' minutes to reflect '
          + 'the remaining transport. Do not ask about destination — it is already set.' + crewNote
          + ' Arrive at the bay doors; the receiving team meets the unit and is ready to take report. Do NOT deliver '
          + 'the handoff yourself, do NOT transfer care, and do NOT declare the call over — prompt the provider for '
          + 'their report and await it. The scenario continues.]';
      }
    }
    // Fast-path for NIBP cycle — keep Claude's reply brief to avoid jarring wall-of-text
    const isNibpCycle = userText.trim() === 'Cycle NIBP';
    if (isNibpCycle) {
      messageText += '\n\n[SYSTEM NOTE: NIBP cycle only. Respond in ONE short sentence acknowledging the cuff is cycling and give the new reading when it completes. No extra exam findings, no additional narration, no partner dialogue. Just the BP result. Then update only the BP timestamp in the VITALS tag; all other vitals fields remain unchanged from the previous turn.]';
    }
    // Inject transport lock when the unit is already moving so the model never
    // asks about destination again or invents a phantom driver.
    if (this.moving) {
      messageText += '\n\n[SYSTEM NOTE: EN_ROUTE LOCKED — the unit is already moving. Destination is set. Do NOT ask where to go. Do NOT invent a new crew member to drive. The assigned driver is driving.]';
    }
    // Deterministic load directive — force the model to resolve loading atomically
    // this turn instead of deferring it, so narration and the [LOADING] tag agree.
    if (wantsLoad) {
      const _capStatus = (this.crewStatus && this.crewStatus.captain) || 'not_on_scene';
      messageText += '\n\n[SYSTEM NOTE: LOAD THE PATIENT NOW. The provider ordered the patient loaded into the ambulance. Resolve loading COMPLETELY this turn — narrate the crew packaging and moving the patient into the rig — and emit [LOADING]. Unless the provider ALSO explicitly named a destination to drive to in THIS same message, the unit is loaded but PARKED: do NOT emit [EN_ROUTE], do NOT narrate the rig pulling away or arriving anywhere, and keep the crew on scene ([CREW_STATUS: partner=on_scene captain=' + _capStatus + ']). The two destination options are presented to the provider by the system — the partner does NOT ask which hospital.]';
    }

    const rollLines = rolls.filter(r => !r.no_roll).map(r => {
      const guide = outcomeGuidance(r.procedure_id, r.outcome);
      const guideStr = guide ? ` — narrate: ${guide}` : '';
      if (r.multi_roll) {
        const parts = r.rolls.map(x => `d20=${x.roll} vs DC ${x.dc} — ${x.outcome}`);
        const mLabel = r.matched_drug ? ` (${r.matched_drug})` : '';
        return `[SYSTEM ROLL: ${r.procedure_id}${mLabel} — ${parts.join(' | ')}${guideStr}]`;
      }
      const drugLabel = r.matched_drug ? ` (${r.matched_drug})` : '';
      return `[SYSTEM ROLL: ${r.procedure_id}${drugLabel} — d20=${r.roll} vs DC ${r.dc} — ${r.outcome}${guideStr}]`;
    });
    if (rollLines.length > 0) {
      messageText += '\n\n' + rollLines.join('\n');
    }

    // Mentions the player confirmed are NOT orders (or that context marked as
    // discussion/planning): tell the model explicitly, or it narrates them
    // being performed anyway ("...for intubation later" → an intubation).
    const prechargeSuppressed = suppressed.filter(s => s.precharge);
    const plainSuppressed     = suppressed.filter(s => !s.precharge);
    if (plainSuppressed.length > 0) {
      const names = plainSuppressed.map(s => (s.matchedKey || s.procedure_id).replace(/_/g, ' '));
      const plural = names.length > 1;
      messageText += `\n\n[SYSTEM NOTE: The provider's message MENTIONS ${names.join(', ')} but ${plural ? 'these are' : 'this is'} NOT being performed this turn — it is planning, discussion, or report content. Do NOT narrate ${plural ? 'them' : 'it'} being performed, prepared, or started. No roll occurred.]`;
    }
    // Pre-charging is anticipatory: the defib charges during compressions so a
    // shock can be delivered instantly IF the next pulse/rhythm check warrants
    // it. Narrate the charge — but no shock is delivered this turn. Belt and
    // suspenders: also fires when precharge wording appears in the raw text with
    // no shock roll injected (e.g. "precharge the defibrillator" matches no
    // synonym at all), so the model never invents a shock from the wording.
    const shockRolled = rolls.some(r => ['defibrillation', 'cardioversion'].includes(r.procedure_id));
    if (prechargeSuppressed.length > 0
        || (!reportMode && !skipMode && !shockRolled && PRECHARGE_RE.test(userText))) {
      messageText += '\n\n[SYSTEM NOTE: The provider is PRE-CHARGING the defibrillator — anticipatory charging during compressions. Narrate the monitor charging and holding ready. Do NOT deliver a shock, do NOT narrate a shock, and do NOT decide to shock on the provider\'s behalf. A shock requires a separate explicit order and its own [SYSTEM ROLL]. No roll occurred this turn.]';
    }

    // Self-healing scene clock: if the last reply dropped the mandatory [TIME:]
    // tag, remind the model where the clock stands so it resumes tagging —
    // otherwise the fixed fallback increment quietly corrupts the timeline
    // (observed: an entire arrest logged in synthetic +3 min steps).
    if (!this.lastReplyHadTime) {
      const mins = Math.floor(this.sceneMinute);
      const secs = String(Math.round((this.sceneMinute - mins) * 60)).padStart(2, '0');
      messageText += `\n\n[SYSTEM NOTE: Your previous reply omitted the mandatory [TIME:] tag. The official scene clock currently reads T+${mins}:${secs}. Resume from there, advance it realistically for this turn's actions, and end THIS and every reply with [TIME: M:SS] as the final line.]`;
    }

    // Authoritative vascular access state — the model must not resurrect blown
    // lines or invent routes the patient doesn't have.
    if (this.access.length > 0) {
      messageText += `\n\n[ACCESS STATE (server-tracked, do NOT repeat this tag in your narration): ${this._accessSummary()}. These lines are RELIABLE — do NOT narrate any of them infiltrating, blowing, going marginal, or failing on your own; line status changes ONLY when the engine rolls it. A med pushed through a PATENT line always delivers cleanly. A line marked blown is permanently unusable. For a medication with no named route, use the best patent line (patent before marginal, never blown) and name it in your narration.]`;
    }

    // Deterministic backup: the provider asked for help but the model often omits
    // the [BACKUP:] machine tag, so the UI status never updated. Set en_route here
    // ourselves; a model-emitted [BACKUP:] tag (parsed below) still refines it.
    const _capName = this.seed.crew_captain || 'your captain';
    if (!reportMode && !skipMode && BACKUP_REQUEST_RE.test(userText)
        && (!this.backupStatus || ['not_called', 'called'].includes(this.backupStatus.status))) {
      const _backupEta = 8;
      this.backupStatus = { status: 'en_route', eta: _backupEta };
      this.backupArrivalMinute = this.sceneMinute + _backupEta;
      messageText += '\n\n[SYSTEM NOTE: The provider requested backup. ' + _capName + ' responds personally by name. '
        + 'Narrate dispatch confirming ' + _capName + ' en route with an ETA of about ' + _backupEta + ' minutes, and emit [BACKUP: en_route ETA=' + _backupEta + '].]';
    }

    // Auto-trigger backup arrival when server-tracked ETA has elapsed. Backup is a
    // CONCRETE, NAMED person (the captain) who becomes a directable crew member —
    // not an abstract "on scene" flag with nobody actually there.
    if (
      this.backupStatus &&
      this.backupStatus.status === 'en_route' &&
      this.backupArrivalMinute !== null &&
      this.sceneMinute >= this.backupArrivalMinute
    ) {
      messageText += '\n\n[SYSTEM NOTE: The backup ETA has elapsed — ' + _capName + ' is now ON SCENE, by name. '
        + 'Emit [BACKUP: on_scene ETA=0] this response and set captain=on_scene in the [CREW_STATUS:] tag. Narrate '
        + _capName + ' arriving and physically joining the crew — they are now a real, directable person who can help '
        + 'with the load and, during transport, ride in the back to assist you (captain=in_back). The captain NEVER drives. '
        + 'Do NOT report backup on scene without an actual named person present and available.]';
    }

    this.messages.push({ role: 'user', content: messageText });

    const rawReply = await sendTurn(this.systemPrompt, this.messages);

    // Keep the raw reply (with [VITALS:] tag) in Claude's message history so it
    // remembers what it last reported. Strip the tag from the user-facing copy.
    this.messages.push({ role: 'assistant', content: rawReply });

    const { cleanedReply: vitalsClean, vitals: rawVitals } = parseVitalsTag(rawReply);
    const vitals = rawVitals ? stripPulselessPerfusion(rawVitals) : rawVitals;
    if (vitals) this.lastVitals = vitals;
    const { cleanedReply: backupClean, backup } = parseBackupTag(vitalsClean);
    const { cleanedReply: crewClean, crewStatus } = parseCrewStatusTag(backupClean);
    const { cleanedReply: demoClean, demoSource } = parseDemoTag(crewClean);
    const { cleanedReply: cleanedAfterTags, secondPatient } = parseSecondPatientTag(demoClean);
    const { cleanedReply: timeClean, timeMinutes } = parseTimeTag(cleanedAfterTags);
    // `loading` is reassigned by the safety net below (auto-load when the unit
    // departs without a prior [LOADING]), so this must be `let`, not `const` —
    // declaring it `const` threw "Assignment to constant variable" and 500'd every
    // depart-without-separate-load turn (e.g. skip-to-hospital straight from scene).
    let { cleanedReply: eventClean, loading, enRoute, transportDest } = parseEventTags(timeClean);
    const { cleanedReply: baseClean, baseContact } = parseBaseContactTag(eventClean);
    // [ACCESS STATE ...] / [ACCESS ...] is a server-only ledger tag injected into
    // the model's message; the model sometimes echoes it (or invents its own
    // site-specific version) in prose. Strip any such tag so it never reaches the
    // player as visible text.
    const reply = stripProviderSpeech(baseClean)
      .replace(/\s*\[ACCESS[^\]]*\]\s*/gi, ' ')
      .replace(/[^\S\n]{2,}/g, ' ')
      .replace(/[^\S\n]+\n/g, '\n')
      .trim();

    // Reconcile dice against the narration: drop any roll the model declined or
    // showed didn't happen, so the debrief/log and client only see real events.
    const reconciledRolls = reconcileRolls(rolls, reply);
    this._updateAccess(reconciledRolls, reply);
    for (const roll of reconciledRolls) {
      logEvent(this.seed, roll.no_roll
        ? { event_type: 'procedure', procedure_id: roll.procedure_id, patient: roll.patient || 'primary', outcome: 'NO_ROLL' }
        : { event_type: 'procedure', procedure_id: roll.procedure_id, patient: roll.patient || 'primary', dice_roll: roll.roll, dc_value: Array.isArray(roll.dc) ? roll.dc[0] : roll.dc, outcome: roll.outcome },
        this.sceneMinute);
    }
    if (backup) {
      // Track backup arrival minute when unit first goes en_route
      if (backup.status === 'en_route' && backup.eta !== null && this.backupArrivalMinute === null) {
        this.backupArrivalMinute = this.sceneMinute + backup.eta;
      }
      if (backup.status === 'on_scene' || backup.status === 'cancelled') {
        this.backupArrivalMinute = null;
      }
      this.backupStatus = backup;
    }
    if (crewStatus) this.crewStatus = crewStatus;
    if (demoSource && !this.demoSource) this.demoSource = demoSource;
    if (secondPatient) this.secondPatientFound = true;
    // Skip turns drive the transport phase DETERMINISTICALLY from the skip target.
    // The model often omits [LOADING]/[EN_ROUTE] during a time-skip, which left the
    // load/depart animations un-fired and the arrival inconsistent (arrived=true but
    // moving=false). Force the phase here; the safety net below auto-loads if needed
    // and sets moving/hasLoaded, so the client's load/depart animations always fire.
    if (skipMode === 'to_ambulance') loading = true;
    else if (skipMode === 'to_hospital' || skipMode === 'to_arrival') enRoute = true;
    // Narration fallback: if the model clearly describes the unit departing FOR THE
    // HOSPITAL but forgot the [EN_ROUTE] tag, treat it as en route so the transport
    // phase (and the SKIP button, which only appears once moving) engages. Keys on the
    // model's own prose — more reliable than its tag discipline.
    //
    // CRITICAL: every "en route / under way / heading / on our way / transporting"
    // branch MUST be anchored to a hospital-destination keyword. The scene-response
    // narration on turn 1 of every scenario says the unit is "en route to the scene /
    // residence / call" — an unanchored match there falsely fired load-and-go on the
    // first action of every round. Pure departure-motion phrases (wheels rolling,
    // pulling away/out, beginning the drive) can't appear in that opening, so they
    // stay unanchored. Skipped in report mode.
    const _dest = '(?:the )?(?:hospital|er|ed|emergency department|trauma(?: center)?|facility|receiving(?: facility)?|level [0-9])';
    // Strong signal: OUR rig is heading for a hospital destination. Always trustworthy.
    const _hospitalRe = new RegExp(
      '\\b(?:' +
        '(?:en[ -]?route|under ?way|on (?:the|our) way|heading) (?:to|toward) ' + _dest +
        '|transporting (?:emergent|priority|code|(?:to|her|him|the patient) (?:to )?' + _dest + ')' +
        '|begins? the (?:drive|transport) to ' + _dest +
      ')\\b', 'i');
    // Weak signal: pure departure-motion with no destination named. A bare "pull out"
    // collides with pulling out EQUIPMENT ("you pull out the monitor / stethoscope /
    // shears") — that false-fired load-and-go on a 12-lead turn. So the motion verbs
    // must be anchored to either a VEHICLE SUBJECT (the rig/ambulance/unit/truck...) or
    // a DEPARTURE LOCATIVE ("pulls out of the driveway"). "wheels rolling" is a strong
    // enough departure idiom to stand alone. Even with a vehicle subject this is still
    // only trustworthy for OUR rig, so the other-unit guard below still applies.
    const _motionRe = new RegExp(
      '\\b(?:' +
        // vehicle subject within a few words of a departure verb
        '(?:rig|ambulance|unit|truck|bus|wagon|medic\\s*\\d*)\\b[^.!?]{0,20}\\b' +
          '(?:pulls?\\s+(?:away|out|onto)|pulled\\s+away|rolls?\\s+(?:away|out|onto|forward|toward)|(?:is|are|begins?)\\s+(?:now\\s+)?rolling)' +
        // departure locative — no explicit vehicle needed
        '|pulls?\\s+(?:away\\s+from|out\\s+of)\\s+the\\s+(?:driveway|lot|parking|drive|curb|scene|bay|house|residence|home)' +
        // strong standalone departure idiom
        '|wheels\\s+(?:are\\s+)?(?:now\\s+)?rolling' +
      ')\\b', 'i');
    const _otherUnitRe = /\b(?:engine|fire|police|pd|cruiser|squad car|ladder|chief|sheriff|deputy|backup(?: unit)?|second (?:unit|crew)|the other (?:unit|crew|rig)|first responders?)\b[^.!?]{0,30}\b(?:pulls?|pulled|rolls?|rolling|wheels)\b/i;
    // Once we've arrived at the hospital, the rig can't "depart for the hospital"
    // again — without this guard, end-of-call narration like "the ambulance pulls
    // out of the ED bay, heading back to station" re-fired the departure animation.
    if (!enRoute && !reportMode && !this.arrivedAtHospital) {
      if (_hospitalRe.test(reply)) enRoute = true;
      else if (_motionRe.test(reply) && !_otherUnitRe.test(reply)) enRoute = true;
    }
    // Safety net: if EN_ROUTE fires but LOADING was never emitted (Claude combined both into
    // one turn without tagging loading), auto-inject loading so the animation fires correctly.
    if (enRoute) {
      // Record which hospital the unit committed to so the destination panel can
      // mark the chosen side when it flashes on a load-and-go.
      this.transportDest = transportDest || 'nearest';
      // Compute transport ETA from region data
      const _reg = REGIONS.find(r => r.id === this.seed.region);
      if (_reg) {
        const _etaStr = transportDest === 'major' ? _reg.major_hospital_min : _reg.nearest_hospital_min;
        this.transportEtaMin = parseHospitalEtaMin(_etaStr);
      }
    }
    if (enRoute && !this.hasLoaded) {
      loading = true;
    }
    // Deterministic load fallback: the provider unambiguously ordered the patient
    // into the rig this turn — fire loading even if the model narrated a deferral
    // or dropped [LOADING], so the load animation and destination panel appear.
    if (wantsLoad) loading = true;
    if (loading) this.hasLoaded = true;
    if (enRoute) this.moving = true; // ambulance is rolling — CPR DC increases

    // ORGANIC ARRIVAL: the provider can reach the ED without ever pressing the skip
    // button — by driving in through normal narration. The skip path sets
    // arrivedAtHospital directly (see above); this covers the non-skip path so the
    // client's skip button still flips to END. Trigger on unambiguous "we're physically
    // at the hospital" cues — the ambulance bay / ED entrance, or a bedside transfer of
    // care. Gated on this.moving so nothing on scene (or an en-route ETA mention like
    // "arriving in 18 minutes") can trip it, and only matters until it's set once.
    if (this.moving && !this.arrivedAtHospital && !reportMode) {
      const _arrivalRe = /\b(?:ambulance bay|ed bay|hospital bay|bay doors?|ambulance entrance|ed entrance|hospital entrance|emergency (?:department|room) entrance|we have it from here|we'?ve got (?:it|him|her|them) from here|(?:resus|trauma|ed|the) team takes over|transfer(?:s|red|ring)? (?:of )?care|releas\w+ the stretcher|hand(?:s|ed|ing)? (?:off )?(?:the )?(?:patient|care) (?:off )?to the (?:resus|trauma|ed|hospital|receiving) team)\b/i;
      if (_arrivalRe.test(reply)) this.arrivedAtHospital = true;
    }

    // Advance scene clock.
    // Primary:   [TIME: M:SS] tag — Claude's explicit, authoritative timestamp.
    // Secondary: vitals @T+M:SS timestamps — used only if TIME tag absent.
    // Fallback:  fixed increment per turn.
    this.lastReplyHadTime = timeMinutes !== null;
    if (!reportMode) {
      if (timeMinutes !== null && timeMinutes > this.sceneMinute) {
        // [TIME] tag is the single source of truth
        this.sceneMinute = timeMinutes;
      } else {
        // TIME tag absent or didn't advance — try vitals timestamps
        let maxTMin = null;
        if (vitals) {
          for (const v of Object.values(vitals)) {
            if (v && typeof v.tMin === 'number' && (maxTMin === null || v.tMin > maxTMin)) {
              maxTMin = v.tMin;
            }
          }
        }
        if (maxTMin !== null && maxTMin > this.sceneMinute) {
          this.sceneMinute = maxTMin;
        } else if (this.turns.length > 0) {
          // Last resort: fixed increment. Not on the opening dispatch turn —
          // arrival IS T+0, and charging it +3 shifted every event in the log
          // (the first pulse check of an arrest showed up at T+6).
          this.sceneMinute += 2;
        }
      }
    }

    // Record the on-scene → transport boundary the first time the unit departs
    // (after the clock advance, so it carries this turn's departure timestamp).
    if (enRoute && this.departSceneMinute === null) {
      this.departSceneMinute = this.sceneMinute;
    }

    logEvent(this.seed, {
      event_type: 'narrative',
      detail: reply.substring(0, 120),
    }, this.sceneMinute);

    // Each turn entry doubles as the objective debrief record: the player's raw
    // order (user), the dice outcomes (rolls), the scene-clock, and the vitals
    // snapshot at that moment. The debrief is built from THIS structured log
    // (seed + actions + vitals) rather than re-reading the narrated scene prose.
    this.turns.push({
      user: userText,
      assistant: reply,
      rolls: reconciledRolls,
      sceneMinute: this.sceneMinute,
      vitals: vitals || null,
      skip: !!skipMode,
      report: reportMode === true,
    });

    // Close only on an explicit user signal (transfer of care, end scenario, etc.).
    // Time-skips — including skip-to-hospital — arrive but leave the scenario OPEN so
    // the provider still gets to give their handoff report before the call ends.
    if (isDebriefTrigger(userText)) {
      closeScenario(this.seed, this.sceneMinute);
      this.closed = true;
      logRun(this.sessionId, this.seed, this.messages);
      return { reply, rolls: reconciledRolls, suppressed, vitals: this.lastVitals, loading, enRoute, transportEtaMin: this.transportEtaMin, transportDest: this.transportDest, baseContact, backup: this.backupStatus, crewStatus: this.crewStatus, demoSource: this.demoSource, secondPatient: this.secondPatientFound, arrived: this.arrivedAtHospital, closed: true };
    }

    return { reply, rolls: reconciledRolls, suppressed, vitals: this.lastVitals, loading, enRoute, transportEtaMin: this.transportEtaMin, transportDest: this.transportDest, baseContact, backup: this.backupStatus, crewStatus: this.crewStatus, demoSource: this.demoSource, secondPatient: this.secondPatientFound, arrived: this.arrivedAtHospital, closed: false };
  }

  /**
   * Request the full debrief. Call after session is closed.
   */
  async debrief() {
    const context = buildDebriefContext(this.seed, this.turns, this.departSceneMinute, this._accessSummary());
    const text = await sendDebrief(context, this.seed.provider_level);
    updateRunDebrief(this.sessionId, text);
    this.debriefText = text;   // kept for transcript export
    return text;
  }

  /**
   * Return all data needed to render a downloadable transcript.
   */
  getTranscriptData() {
    return {
      seed:         this.seed,
      // The fully-assembled seed block — literally everything injected into the
      // model's system prompt for this run. Exported verbatim for analysis.
      systemPrompt: this.systemPrompt || null,
      messages:     this.messages,
      debriefText:  this.debriefText || null,
    };
  }

  /**
   * Force-close without debrief (e.g., user quits mid-scenario).
   */
  close() {
    if (!this.closed) {
      closeScenario(this.seed, this.sceneMinute);
      this.closed = true;
      logRun(this.sessionId, this.seed, this.messages);
    }
  }
}

module.exports = { Session, reconcileRolls };
