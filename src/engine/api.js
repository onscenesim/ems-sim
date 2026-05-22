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

You have been given the full conversation transcript and the procedure roll log. Use both to evaluate performance accurately and specifically.

Structure your debrief in exactly these five sections — keep each section tight:
1. WHAT HAPPENED — one short paragraph: the clinical picture, how it evolved, how the call ended
2. WHAT WENT WELL — bullet the specific things the provider got right, with brief clinical reasoning; if they handled it cleanly, say so without padding
3. WHAT MISSED THE MARK — bullet only genuine errors or omissions with real clinical consequences; if nothing significant was missed, write "Nothing significant — solid performance" and move on
4. THE CRITICAL DECISION — the single most important decision point in this scenario, and whether the provider handled it correctly
5. TAKEAWAY — one sentence the provider should remember

Rules:
- Base every comment on evidence in the transcript. Do not reference actions or omissions that are not documented there.
- Do not manufacture criticism. If the provider did well, say so. Inventing problems to seem thorough is worse than a short debrief.
- Be specific — name the intervention, name the finding, name the consequence. Generic feedback ("could have been more thorough") is useless.
- Calibrate to provider level: ${providerLevel}. ALS holds to ALS scope; BLS is not expected to perform ALS interventions.
- Total length: aim for 250–400 words across all five sections combined. Do not pad.
- BGL_NOT_CHECKED flag: if present in the log, evaluate whether glucose was actually indicated for this specific patient. A patient with normal mentation and a clear non-glucose diagnosis does not warrant calling out a missing BGL. Only flag it as a miss if the patient had altered mentation, seizure, syncope, weakness, or a toxicological or diabetic presentation.
- FLUMAZENIL: if the provider attempted flumazenil, note it is not in the EMS formulary.
- Do not refer to the "log" or "transcript" explicitly in your output — write as if you observed the call directly.
- HOSPITAL PRE-ARRIVAL NOTIFICATION: Check whether the provider called ahead to the receiving hospital before or during transport. This is an expected skill at all provider levels — STEMI alerts, stroke alerts, trauma activations, and standard radio reports are all forms of this. If the provider transported without ever notifying the receiving facility, flag it in WHAT MISSED THE MARK. If they did call ahead, you may note it briefly in WHAT WENT WELL only if the report quality was notable. Do not flag it if the scenario did not involve transport (e.g., on-scene pronouncement, refusal of care).`;

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
