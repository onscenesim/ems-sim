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
  }

  /**
   * Send a user message and get Claude's response.
   * Auto-detects procedures and logs dice rolls.
   * Returns { reply, roll, closed }
   */
  async send(userText) {
    if (this.closed) {
      return { reply: '[Scenario is closed. Start a new scenario.]', rolls: [], closed: true };
    }

    // Detect and roll ALL procedures mentioned in the user's message
    const rolls = detectAllAndRoll(userText, this.contextFlags, this.seed.difficulty);

    for (const roll of rolls) {
      if (!roll.no_roll) {
        logEvent(this.seed, {
          event_type: 'procedure',
          procedure_id: roll.procedure_id,
          dice_roll: roll.roll,
          dc_value: Array.isArray(roll.dc) ? roll.dc[0] : roll.dc,
          outcome: roll.outcome,
        }, this.sceneMinute);
      } else {
        logEvent(this.seed, {
          event_type: 'procedure',
          procedure_id: roll.procedure_id,
          outcome: 'NO_ROLL',
        }, this.sceneMinute);
      }
    }

    // Inject all real roll results into the user message so Claude knows every outcome.
    // Claude must NOT generate its own [ROLL:] notation — only narrate consequences.
    let messageText = userText;
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

    const reply = await sendTurn(this.systemPrompt, this.messages);

    this.messages.push({ role: 'assistant', content: reply });

    // Advance scene clock — crude estimate, Claude tracks it precisely internally
    this.sceneMinute += 2;

    logEvent(this.seed, {
      event_type: 'narrative',
      detail: reply.substring(0, 120),
    }, this.sceneMinute);

    // Only close on explicit user signal — never on Claude's narration
    if (isDebriefTrigger(userText)) {
      closeScenario(this.seed, this.sceneMinute);
      this.closed = true;
      logRun(this.sessionId, this.seed, this.messages);
      return { reply, rolls, closed: true };
    }

    return { reply, rolls, closed: false };
  }

  /**
   * Request the full debrief. Call after session is closed.
   */
  async debrief() {
    const context = buildDebriefContext(this.seed, this.seed.events);
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
