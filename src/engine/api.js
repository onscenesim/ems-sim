'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

// Hard upstream timeout for any Claude call. Without this, a stuck request
// could hang the user's turn indefinitely with no recovery path. 90s is well
// above normal latency but short enough that the client's STOP button stays
// useful as the primary cancel mechanism.
const REQUEST_TIMEOUT_MS = 90_000;

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
  }, { timeout: REQUEST_TIMEOUT_MS });

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
- If the provider made a potentially fatal error, name it as such.
- DEBRIEF FLAGS: If the log contains a BGL_NOT_CHECKED flag, explicitly address it in WHAT MISSED THE MARK — call it out by name, explain why glucose is always on the differential in AMS and tox presentations, and note the consequence of missing hypoglycemia as a reversible cause.
- FLUMAZENIL: If the user attempted to order flumazenil, note clearly in debrief that flumazenil is not an EMS medication in any system — it is not in the drug box. Do not treat this as a creative or advanced intervention. It is an error reflecting unfamiliarity with EMS formularies.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system,
    messages: [
      {
        role: 'user',
        content: debriefContext,
      },
    ],
  }, { timeout: REQUEST_TIMEOUT_MS });

  return response.content[0].text;
}

module.exports = { sendTurn, sendDebrief };
