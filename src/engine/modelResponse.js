'use strict';
const { operationError } = require('./operations');

function extractText(response) {
  const candidate = response?.candidates?.[0];
  const blockReason = response?.promptFeedback?.blockReason;
  const finishReason = candidate?.finishReason;
  const filtered = (blockReason && blockReason !== 'BLOCK_REASON_UNSPECIFIED') ||
    ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT'].includes(finishReason);
  if (filtered || !response?.text?.trim()) {
    console.warn('[Gemini response unavailable]', { blockReason, finishReason });
    throw operationError(filtered ? 'model_content_filtered' : 'model_empty_response',
      filtered
        ? 'Gemini blocked this response with a content filter. Please rephrase your turn using clear clinical language and send it again. No changes were saved.'
        : 'Gemini returned no text; the response may have been filtered. Please rephrase your turn using clear clinical language and send it again. No changes were saved.', 422);
  }
  if (finishReason && finishReason !== 'STOP') {
    console.warn(`[API Warning] Generation stopped early. finishReason: ${finishReason}`);
  }
  return response.text;
}
module.exports = { extractText };
