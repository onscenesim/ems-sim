'use strict';

const { assembleSeedBlock, buildDebriefContext } = require('./assembler');
const { logEvent, closeScenario } = require('./logger');
const { detectAndRoll } = require('./dice');
const { sendTurn, sendDebrief } = require('./api');

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
  constructor(seed) {
    this.seed = seed;
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
      return { reply: '[Scenario is closed. Start a new scenario.]', roll: null, closed: true };
    }

    // Detect and roll any procedure in the user's message
    const roll = detectAndRoll(userText, this.contextFlags, this.seed.difficulty);
    if (roll && !roll.no_roll) {
      logEvent(this.seed, {
        event_type: 'procedure',
        procedure_id: roll.procedure_id,
        dice_roll: roll.roll,
        dc_value: Array.isArray(roll.dc) ? roll.dc[0] : roll.dc,
        outcome: roll.outcome,
      }, this.sceneMinute);
    } else if (roll && roll.no_roll) {
      logEvent(this.seed, {
        event_type: 'procedure',
        procedure_id: roll.procedure_id,
        outcome: 'NO_ROLL',
      }, this.sceneMinute);
    }

    // Inject roll result into user message so Claude knows the outcome
    let messageText = userText;
    if (roll && !roll.no_roll) {
      if (roll.multi_roll) {
        const parts = roll.rolls.map((r, i) => `d20=${r.roll} vs DC ${r.dc} — ${r.outcome}`);
        messageText += `\n\n[SYSTEM ROLL: ${roll.procedure_id} — ${parts.join(' | ')}]`;
      } else {
        messageText += `\n\n[SYSTEM ROLL: ${roll.procedure_id} — d20=${roll.roll} vs DC ${roll.dc} — ${roll.outcome}]`;
      }
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
      return { reply, roll, closed: true };
    }

    return { reply, roll, closed: false };
  }

  /**
   * Request the full debrief. Call after session is closed.
   */
  async debrief() {
    const context = buildDebriefContext(this.seed, this.seed.events);
    return sendDebrief(context, this.seed.provider_level);
  }

  /**
   * Force-close without debrief (e.g., user quits mid-scenario).
   */
  close() {
    if (!this.closed) {
      closeScenario(this.seed, this.sceneMinute);
      this.closed = true;
    }
  }
}

module.exports = { Session };
