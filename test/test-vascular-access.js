'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

let narrate;
require.cache[require.resolve('../src/engine/api')] = { exports: {
  sendTurn: async (_prompt, messages) => narrate(messages.at(-1).content),
  sendDebrief: async () => '',
} };
require.cache[require.resolve('../src/server/adminLogger')] = { exports: {
  logRun() {}, updateRunDebrief() {},
} };
const { Session } = require('../src/engine/session');
const { rollScenario } = require('../src/engine/roller');

test('negative findings and invented failures cannot change engine-controlled line status', () => {
  for (const status of ['patent', 'marginal']) {
    for (const reply of [
      'The line flushes smoothly with saline without infiltration.',
      'The IV is patent, with no infiltration or extravasation.',
      'The catheter flushes without resistance or further subcutaneous spread.',
      'The previously blown IV remains unusable; the new line flushes easily.',
      'The IV has infiltrated and blown.',
    ]) {
      const session = { access: [{ kind: 'IV', status }, { kind: 'IO', status: 'patent' }] };
      Session.prototype._updateAccess.call(session, [], reply);
      assert.deepEqual(session.access, [{ kind: 'IV', status }, { kind: 'IO', status: 'patent' }], reply);
    }
  }
});

test('placement outcomes add independent lines without damaging or reviving existing access', () => {
  const session = { access: [{ kind: 'IV', status: 'blown' }, { kind: 'IV', status: 'patent' }] };
  for (const [kind, procedure_id] of [['IV', 'peripheral_iv'], ['IO', 'io_access']]) {
    for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
      const before = structuredClone(session.access);
      Session.prototype._updateAccess.call(session, [{ procedure_id, outcome }], 'The line has infiltrated.');
      const added = outcome === 'SUCCESS' ? 'patent' : outcome === 'MARGINAL' ? 'marginal'
        : kind === 'IV' && outcome === 'COMPLICATION' ? 'blown' : null;
      assert.deepEqual(session.access, [...before, ...(added ? [{ kind, status: added }] : [])], `${kind} ${outcome}`);
    }
  }
  const before = structuredClone(session.access);
  Session.prototype._updateAccess.call(session, [{ procedure_id: 'medication_push', outcome: 'COMPLICATION' }], 'The IV is blown.');
  assert.deepEqual(session.access, before, 'a medication outcome cannot blow a working line');
});

test('reported placement narration preserves access through the next medication turn and log', async () => {
  for (const [die, status] of [[6, 'marginal'], [20, 'patent']]) {
    const session = new Session(rollScenario({ provider_level: 'ALS', difficulty: 'NORMAL' }));
    // Fix the IV DC at 8, matching the supplied report, independently of the seed.
    session.contextFlags = {};
    const originalRandom = Math.random;
    let phase = 'placement';
    narrate = message => {
      if (phase === 'placement') {
        assert.match(message, /SYSTEM ROLL: peripheral_iv/);
        return 'A 20-gauge catheter advances into the lumen. Flashback is slow and dark, and while the line flushes smoothly with saline without infiltration, aspirating blood return proves sluggish against the fragile vein wall. The lock is taped securely in place. [TIME: 5:30]';
      }
      assert.match(message, new RegExp(`IV #1: ${status.toUpperCase()}`));
      assert.doesNotMatch(message, /BLOWN/);
      return 'Fentanyl 50 mcg is administered through the left forearm IV. [TIME: 7:30]';
    };
    Math.random = () => (die - 0.5) / 20;
    try {
      const placed = await session.send('Obtain IV access. Obtain vital signs.');
      assert.equal(placed.rolls.find(r => r.procedure_id === 'peripheral_iv').outcome,
        status === 'marginal' ? 'MARGINAL' : 'SUCCESS');
      assert.deepEqual(session.access, [{ kind: 'IV', status }]);
      phase = 'medication';
      Math.random = () => 0.675; // d20=14: successful medication push
      const given = await session.send('Give fentanyl 50mcg IVP.');
      assert.equal(given.rolls.find(r => r.procedure_id === 'medication_push').outcome, 'SUCCESS');
      assert.match(given.reply, /administered through the left forearm IV/);
      assert.equal(session.turns.at(-1).rolls[0].procedure_id, 'medication_push');
      assert.ok(session.seed.events.some(e => e.procedure_id === 'medication_push' && e.outcome === 'SUCCESS'));
      assert.deepEqual(session.access, [{ kind: 'IV', status }]);
    } finally {
      Math.random = originalRandom;
    }
  }
});
