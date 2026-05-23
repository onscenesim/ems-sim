'use strict';

const { assembleSeedBlock, buildDebriefContext } = require('./assembler');
const { logEvent, closeScenario } = require('./logger');
const { detectAllAndRoll } = require('./dice');
const { sendTurn, sendDebrief } = require('./api');
const { logRun, updateRunDebrief } = require('../server/adminLogger');

// Phrases that close the scenario and trigger debrief offer
const DEBRIEF_TRIGGERS = [
  'transfer of care',
  'patient is in ed hands',
  'patient is at the ed',
  'we are clear from',
  "we're clear from",
  'pronounce the patient',
  'call it here',
  'time of death',
  'terminate resuscitation',
  'end scenario',
  'stop the scenario',
];

function isDebriefTrigger(text) {
  const lower = text.toLowerCase();
  return DEBRIEF_TRIGGERS.some(t => lower.includes(t));
}

// Numeric fields in the VITALS tag (everything else is treated as a string token)
const VITALS_NUMERIC = new Set(['HR', 'SpO2', 'ETCO2', 'RR', 'GCS', 'Pain', 'Glucose']);

/**
 * Convert "T+M:SS" → float minutes (e.g. "T+4:30" → 4.5). Returns null if malformed.
 */
function timestampToMinutes(t) {
  const m = String(t).match(/^T\+(\d+):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
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

    // Optional "@T+M:SS" timestamp suffix on episodic vitals (BP, Temp, Glucose)
    let timestamp = null;
    const atIdx = rawValue.indexOf('@T+');
    if (atIdx >= 0) {
      timestamp = rawValue.slice(atIdx + 1);
      rawValue = rawValue.slice(0, atIdx);
    }

    let parsedValue = rawValue;
    if (VITALS_NUMERIC.has(key)) {
      const n = Number(rawValue);
      parsedValue = Number.isFinite(n) ? n : rawValue;
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
 * Parse [LOADING] and [EN_ROUTE] event tags from the reply.
 * Returns { cleanedReply, loading, enRoute }.
 */
function parseEventTags(reply) {
  let loading = false;
  let enRoute = false;
  let cleaned = reply;
  if (/\[LOADING\]/i.test(cleaned)) {
    loading = true;
    cleaned = cleaned.replace(/\s*\[LOADING\]\s*/gi, ' ');
  }
  if (/\[EN_ROUTE\]/i.test(cleaned)) {
    enRoute = true;
    cleaned = cleaned.replace(/\s*\[EN_ROUTE\]\s*/gi, ' ');
  }
  return { cleanedReply: cleaned.trim(), loading, enRoute };
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
  return {
    cleanedReply,
    crewStatus: {
      partner: partnerMatch ? partnerMatch[1].toLowerCase() : null,
      captain: captainMatch ? captainMatch[1].toLowerCase() : null,
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
    pediatric: seed.age_group === 'pediatric',
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
    this.backupStatus = null; // { status, eta } from [BACKUP:] tag
    this.crewStatus = null;   // { partner, captain } from [CREW_STATUS:] tag
  }

  /**
   * Send a user message and get Claude's response.
   * Auto-detects procedures and logs dice rolls.
   * Returns { reply, roll, closed }
   */
  async send(userText, reportMode = false) {
    if (this.closed) {
      return { reply: '[Scenario is closed. Start a new scenario.]', rolls: [], closed: true };
    }

    // Detect and roll ALL procedures mentioned in the user's message.
    // Skip entirely when the player is giving a radio report or handoff.
    const rolls = reportMode ? [] : detectAllAndRoll(userText, this.contextFlags, this.seed.difficulty);

    for (const roll of rolls) {
      if (!roll.no_roll) {
        logEvent(this.seed, {
          event_type: 'procedure',
          procedure_id: roll.procedure_id,
          patient: roll.patient || 'primary',
          dice_roll: roll.roll,
          dc_value: Array.isArray(roll.dc) ? roll.dc[0] : roll.dc,
          outcome: roll.outcome,
        }, this.sceneMinute);
      } else {
        logEvent(this.seed, {
          event_type: 'procedure',
          procedure_id: roll.procedure_id,
          patient: roll.patient || 'primary',
          outcome: 'NO_ROLL',
        }, this.sceneMinute);
      }
    }

    // Inject all real roll results into the user message so Claude knows every outcome.
    // Claude must NOT generate its own [ROLL:] notation — only narrate consequences.
    let messageText = userText;
    // In report mode, tell Claude this is a report/handoff turn — no procedure rolls.
    if (reportMode) {
      messageText += '\n\n[REPORT MODE: The player is giving a radio report or patient handoff. '
        + 'No procedure rolls occurred this turn. Procedures mentioned are past events already completed. '
        + 'Respond as the receiving party (hospital, medical control, or incoming crew). '
        + 'Acknowledge the report, ask any clinically appropriate follow-up questions, '
        + 'and confirm estimated time of arrival or transfer acceptance as appropriate.]';
    }
    // Fast-path for NIBP cycle — keep Claude's reply brief to avoid jarring wall-of-text
    const isNibpCycle = userText.trim() === 'Cycle NIBP';
    if (isNibpCycle) {
      messageText += '\n\n[SYSTEM NOTE: NIBP cycle only. Respond in ONE short sentence acknowledging the cuff is cycling and give the new reading when it completes. No extra exam findings, no additional narration, no partner dialogue. Just the BP result. Then update only the BP timestamp in the VITALS tag; all other vitals fields remain unchanged from the previous turn.]';
    }
    const rollLines = rolls.filter(r => !r.no_roll).map(r => {
      if (r.multi_roll) {
        const parts = r.rolls.map(x => `d20=${x.roll} vs DC ${x.dc} — ${x.outcome}`);
        return `[SYSTEM ROLL: ${r.procedure_id} — ${parts.join(' | ')}]`;
      }
      return `[SYSTEM ROLL: ${r.procedure_id} — d20=${r.roll} vs DC ${r.dc} — ${r.outcome}]`;
    });
    if (rollLines.length > 0) {
      messageText += '\n\n' + rollLines.join('\n');
    }

    this.messages.push({ role: 'user', content: messageText });

    const rawReply = await sendTurn(this.systemPrompt, this.messages);

    // Keep the raw reply (with [VITALS:] tag) in Claude's message history so it
    // remembers what it last reported. Strip the tag from the user-facing copy.
    this.messages.push({ role: 'assistant', content: rawReply });

    const { cleanedReply: vitalsClean, vitals } = parseVitalsTag(rawReply);
    if (vitals) this.lastVitals = vitals;
    const { cleanedReply: backupClean, backup } = parseBackupTag(vitalsClean);
    const { cleanedReply: crewClean, crewStatus } = parseCrewStatusTag(backupClean);
    const { cleanedReply: reply, loading, enRoute } = parseEventTags(crewClean);
    if (backup) this.backupStatus = backup;
    if (crewStatus) this.crewStatus = crewStatus;

    // Advance scene clock — crude estimate, Claude tracks it precisely internally
    this.sceneMinute += 2;

    logEvent(this.seed, {
      event_type: 'narrative',
      detail: reply.substring(0, 120),
    }, this.sceneMinute);

    this.turns.push({ user: userText, assistant: reply, rolls });

    // Only close on explicit user signal — never on Claude's narration
    if (isDebriefTrigger(userText)) {
      closeScenario(this.seed, this.sceneMinute);
      this.closed = true;
      logRun(this.sessionId, this.seed, this.messages);
      return { reply, rolls, vitals: this.lastVitals, backup: this.backupStatus, crewStatus: this.crewStatus, closed: true };
    }

    return { reply, rolls, vitals: this.lastVitals, loading, enRoute, backup: this.backupStatus, crewStatus: this.crewStatus, closed: false };
  }

  /**
   * Request the full debrief. Call after session is closed.
   */
  async debrief() {
    const context = buildDebriefContext(this.seed, this.seed.events, this.messages);
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
      seed:        this.seed,
      messages:    this.messages,
      debriefText: this.debriefText || null,
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

module.exports = { Session };
