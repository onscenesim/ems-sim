'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { buildDebriefPrompt } = require('./prompts/debrief');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-haiku-4-5-20251001';
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
  // Cache the conversation prefix, not just the system prompt. Each turn we drop a
  // rolling cache breakpoint on the final message; the next turn reads the entire
  // prior conversation from cache (0.1x) instead of resending it at full input
  // price (1x). This turns history cost from quadratic into ~linear. We copy the
  // last message rather than mutating the caller's stored history (kept as plain
  // strings for transcript/debrief use).
  const messagesForApi = messages.map((m, i) => {
    if (i !== messages.length - 1) return m;
    const blocks = typeof m.content === 'string'
      ? [{ type: 'text', text: m.content }]
      : m.content.map(b => ({ ...b }));
    const last = blocks[blocks.length - 1];
    blocks[blocks.length - 1] = { ...last, cache_control: { type: 'ephemeral' } };
    return { ...m, content: blocks };
  });

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
    messages: messagesForApi,
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
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: buildDebriefPrompt(providerLevel),
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
