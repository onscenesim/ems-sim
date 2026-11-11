'use strict';
const { operationError } = require('./operations');
const { writeRunConsole } = require('../server/runConsole');

const BLOCK_REASONS = new Set(['BLOCK_REASON_UNSPECIFIED', 'SAFETY', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY']);
const FINISH_REASONS = new Set(['STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'LANGUAGE', 'OTHER', 'BLOCKLIST',
  'PROHIBITED_CONTENT', 'SPII', 'MALFORMED_FUNCTION_CALL', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT',
  'UNEXPECTED_TOOL_CALL', 'NO_IMAGE', 'IMAGE_RECITATION', 'IMAGE_OTHER']);

function extractText(response) {
  const candidate = response?.candidates?.[0];
  const blockReason = response?.promptFeedback?.blockReason;
  const finishReason = candidate?.finishReason;
  const reasons = {
    block_reason: blockReason ? (BLOCK_REASONS.has(blockReason) ? blockReason : 'UNKNOWN') : null,
    finish_reason: finishReason ? (FINISH_REASONS.has(finishReason) ? finishReason : 'UNKNOWN') : null,
  };
  const filtered = (blockReason && blockReason !== 'BLOCK_REASON_UNSPECIFIED') ||
    ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT'].includes(finishReason);
  if (filtered || !response?.text?.trim()) {
    if (!writeRunConsole('MODEL_RESPONSE_UNAVAILABLE', reasons, 'warn')) {
      console.warn('[Gemini response unavailable]', { blockReason, finishReason });
    }
    throw operationError(filtered ? 'model_content_filtered' : 'model_empty_response',
      filtered
        ? 'Gemini blocked this response with a content filter. Please rephrase your turn using clear clinical language and send it again. No changes were saved.'
        : 'Gemini returned no text; the response may have been filtered. Please rephrase your turn using clear clinical language and send it again. No changes were saved.', 422);
  }
  if (finishReason && finishReason !== 'STOP') {
    if (!writeRunConsole('MODEL_RESPONSE_STOPPED_EARLY', reasons, 'warn')) {
      console.warn(`[API Warning] Generation stopped early. finishReason: ${finishReason}`);
    }
  }
  return response.text;
}
module.exports = { extractText };
