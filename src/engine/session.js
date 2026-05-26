'use strict';

const { assembleSeedBlock, buildDebriefContext } = require('./assembler');
const { REGIONS } = require('../data/regions');
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

function parseEventTags(reply) {
  let loading      = false;
  let enRoute      = false;
  let transportDest = null;   // 'nearest' | 'major'
  let cleaned = reply;
  if (/\[LOADING\]/i.test(cleaned)) {
    loading = true;
    cleaned = cleaned.replace(/\s*\[LOADING\]\s*/gi, ' ');
  }
  // Accept [EN_ROUTE], [EN_ROUTE:nearest], [EN_ROUTE:major]
  const routeMatch = cleaned.match(/\[EN_ROUTE(?::([a-z]+))?\]/i);
  if (routeMatch) {
    enRoute = true;
    transportDest = routeMatch[1] ? routeMatch[1].toLowerCase() : 'nearest';
    cleaned = cleaned.replace(/\s*\[EN_ROUTE(?::[a-z]+)?\]\s*/gi, ' ');
  }
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

/**
 * Parse [TIME: M:SS] tag from Claude's reply.
 * Returns { cleanedReply, timeMinutes }. timeMinutes is null if tag absent.
 */
function parseTimeTag(reply) {
  const re = /\s*\[TIME:\s*(\d+):(\d{2})\]\s*/i;
  const m = reply.match(re);
  if (!m) return { cleanedReply: reply, timeMinutes: null };
  const cleanedReply = reply.replace(re, ' ').replace(/\s{2,}/g, ' ').trim();
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
    this.backupStatus = null;        // { status, eta } from [BACKUP:] tag
    this.backupArrivalMinute = null; // scene minute when backup is expected on scene
    this.crewStatus = null;   // { partner, captain } from [CREW_STATUS:] tag
    this.moving = false;      // true after [EN_ROUTE] fires — raises CPR DC
    this.transportEtaMin = null; // minutes to hospital, set when [EN_ROUTE] fires
    this.hasLoaded = false;    // true after [LOADING] fires — safety net for animation
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
    const rollContext = { ...this.contextFlags, moving: this.moving };
    const rolls = reportMode ? [] : detectAllAndRoll(userText, rollContext, this.seed.difficulty);

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
        const mLabel = r.matched_drug ? ` (${r.matched_drug})` : '';
        return `[SYSTEM ROLL: ${r.procedure_id}${mLabel} — ${parts.join(' | ')}]`;
      }
      const drugLabel = r.matched_drug ? ` (${r.matched_drug})` : '';
      return `[SYSTEM ROLL: ${r.procedure_id}${drugLabel} — d20=${r.roll} vs DC ${r.dc} — ${r.outcome}]`;
    });
    if (rollLines.length > 0) {
      messageText += '\n\n' + rollLines.join('\n');
    }

    // Auto-trigger backup arrival when server-tracked ETA has elapsed
    if (
      this.backupStatus &&
      this.backupStatus.status === 'en_route' &&
      this.backupArrivalMinute !== null &&
      this.sceneMinute >= this.backupArrivalMinute
    ) {
      messageText += '\n\n[SYSTEM NOTE: The backup unit\'s ETA has elapsed — they are on scene. '
        + 'You MUST emit [BACKUP: on_scene ETA=0] in this response and announce the arrival '
        + 'through dispatch, describing who arrived and what resources they brought.]';
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
    const { cleanedReply: timeClean, timeMinutes } = parseTimeTag(crewClean);
    const { cleanedReply: eventClean, loading, enRoute, transportDest } = parseEventTags(timeClean);
    const { cleanedReply: reply, baseContact } = parseBaseContactTag(eventClean);
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
    // Safety net: if EN_ROUTE fires but LOADING was never emitted (Claude combined both into
    // one turn without tagging loading), auto-inject loading so the animation fires correctly.
    if (enRoute) {
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
    if (loading) this.hasLoaded = true;
    if (enRoute) this.moving = true; // ambulance is rolling — CPR DC increases

    // Advance scene clock.
    // Primary:   [TIME: M:SS] tag — Claude's explicit, authoritative timestamp.
    // Secondary: vitals @T+M:SS timestamps — used only if TIME tag absent.
    // Fallback:  fixed increment per turn.
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
        } else {
          // Last resort: fixed increment
          const fallback = this.seed.category === 'arrest' ? 3 : 2;
          this.sceneMinute += fallback;
        }
      }
    }

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
      return { reply, rolls, vitals: this.lastVitals, loading, enRoute, transportEtaMin: this.transportEtaMin, baseContact, backup: this.backupStatus, crewStatus: this.crewStatus, closed: true };
    }

    return { reply, rolls, vitals: this.lastVitals, loading, enRoute, transportEtaMin: this.transportEtaMin, baseContact, backup: this.backupStatus, crewStatus: this.crewStatus, closed: false };
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
