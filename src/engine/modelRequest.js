'use strict';

const { operationError } = require('./operations');
const REQUEST_TIMEOUT_MS = 90_000;

// The deadline covers the entire request, including retries and backoff. The
// SDK signal aborts its HTTP request; the race also releases the session queue
// if a transport fails to settle after aborting.
async function requestModel(generate, params, { signal, timeoutMs = REQUEST_TIMEOUT_MS, maxAttempts = 3 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(operationError('model_timeout', 'The model timed out. No changes were saved; please retry.', 504)), timeoutMs);
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
  });
  let backoffTimer;
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await Promise.race([
          Promise.resolve().then(() => {
            controller.signal.throwIfAborted();
            return generate({ ...params, config: { ...params.config, abortSignal: controller.signal, httpOptions: { ...params.config?.httpOptions, timeout: timeoutMs } } });
          }),
          aborted,
        ]);
      } catch (error) {
        controller.signal.throwIfAborted();
        const transient = /429|503|quota|too many requests/i.test(String(error));
        if (!transient || attempt === maxAttempts) throw error;
        await Promise.race([new Promise(resolve => { backoffTimer = setTimeout(resolve, attempt * 2000); }), aborted]);
      }
    }
  } finally {
    clearTimeout(timer);
    clearTimeout(backoffTimer);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

module.exports = { requestModel, REQUEST_TIMEOUT_MS };
