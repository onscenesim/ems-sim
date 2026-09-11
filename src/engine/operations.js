'use strict';

function operationError(code, message, status = 409) {
  return Object.assign(new Error(message), { code, status });
}

// One queue per live Session. Entries retain outcomes so a lost HTTP response
// can be retried without adding a second turn. Cancel-before-start tombstones
// also prevent a delayed original request from executing after STOP.
class OperationQueue {
  constructor(saved = []) {
    this.entries = new Map(saved.map(e => [e.id, {
      ...e, promise: Promise.resolve(e.result),
      error: e.status === 'cancelled'
        ? operationError('operation_cancelled', 'Cancelled. No changes were saved.') : null,
    } ]));
    this.tail = Promise.resolve();
  }

  run(id, fingerprint, work) {
    const existing = this.entries.get(id);
    if (existing) {
      if (existing.fingerprint && existing.fingerprint !== fingerprint) {
        return Promise.reject(operationError('operation_conflict', 'This operation ID belongs to a different request.'));
      }
      if (existing.error) return Promise.reject(existing.error);
      return existing.promise;
    }
    const controller = new AbortController();
    const entry = { id, fingerprint, status: 'queued', controller };
    this.entries.set(id, entry);
    entry.promise = this.tail.then(async () => {
      controller.signal.throwIfAborted();
      entry.status = 'running';
      // work must check the signal before committing state.
      const result = await work(controller.signal);
      entry.status = 'completed';
      entry.result = result;
      return result;
    }).catch(error => {
      entry.status = controller.signal.aborted ? 'cancelled' : 'failed';
      entry.error = error;
      throw error;
    }).finally(() => { delete entry.controller; });
    this.tail = entry.promise.catch(() => {});
    return entry.promise;
  }

  async cancel(id) {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { id, status: 'cancelled', error: operationError('operation_cancelled', 'Cancelled. No changes were saved.') };
      this.entries.set(id, entry);
    }
    if (entry.status === 'queued' || entry.status === 'running') {
      entry.controller.abort(operationError('operation_cancelled', 'Cancelled. No changes were saved.'));
      // Wait for rollback before acknowledging cancellation.
      await entry.promise.catch(() => {});
    }
    return { operation_id: id, status: entry.status, result: entry.result || null };
  }

  snapshot() {
    return [...this.entries.values()].filter(e => e.status === 'completed' || e.status === 'cancelled')
      .map(({ id, fingerprint, status, result }) => ({ id, fingerprint, status, result }));
  }
}

const queues = new WeakMap();
function operationsFor(session) {
  if (!queues.has(session)) {
    const queue = new OperationQueue(session.operationResults || []);
    queues.set(session, queue);
  }
  return queues.get(session);
}

module.exports = { OperationQueue, operationsFor, operationError };
