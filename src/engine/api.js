'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

/**
 * Send a turn in an active scenario.
 *
 * @param {string}   systemPrompt   The assembled seed block (cached)
 * @param {Array}    messages       Full conversation history [{ role, content }]
 * @returns {string} Claude's response text
 */
async function sendTurn(systemPrompt, messages) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages,
  });

  return response.content[0].text;
}

/**
 * Send the debrief request after scenario close.
 * Uses a fresh context — no conversation history, just the scenario log.
 *
 * @param {string} debriefContext   Output of buildDebriefContext()
 * @param {string} providerLevel   'ALS' | 'BLS'
 * @returns {string} Debrief text
 */
async function sendDebrief(debriefContext, providerLevel) {
  const system = `You are a seasoned EMS medical director conducting a post-scenario debrief.

Your job is to review the scenario log and give an honest, specific, educational critique.

Structure your debrief:
1. WHAT HAPPENED — one paragraph summary of the clinical picture
2. WHAT WENT WELL — specific actions the provider got right, with clinical reasoning
3. WHAT MISSED THE MARK — specific errors or omissions, with consequences explained
4. THE CRITICAL DECISION — identify the single most important decision point in the scenario
5. TAKEAWAY — one sentence the provider should remember

Rules:
- Be direct. This is not a participation trophy. Errors have clinical consequences — name them.
- Be specific. Reference actual procedures, timing, and findings from the log.
- Calibrate to provider level: ${providerLevel}. Hold ALS to ALS standards.
- If the provider performed well, say so clearly. Do not invent criticism.
- If the provider made a potentially fatal error, name it as such.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    messages: [
      {
        role: 'user',
        content: debriefContext,
      },
    ],
  });

  return response.content[0].text;
}

module.exports = { sendTurn, sendDebrief };
