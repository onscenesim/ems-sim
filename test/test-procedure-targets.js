'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectWithConfirmation, detectAllAndRoll, detectAllProcedures } = require('../src/engine/dice');
let sentOrder = '';
require.cache[require.resolve('../src/engine/api')] = { exports: {
  sendDebrief: async () => '',
  sendTurn: async (_prompt, messages) => {
    sentOrder = messages.at(-1).content;
    return 'Left IV placed. Right IV attempt failed. [TIME: 2:00]';
  },
} };
require.cache[require.resolve('../src/server/adminLogger')] = { exports: { logRun() {}, updateRunDebrief() {} } };
const { Session, reconcileRolls } = require('../src/engine/session');
const { rollScenario } = require('../src/engine/roller');
const { logEvent } = require('../src/engine/logger');
const { INTERVENTIONS } = require('../src/data/interventions');
const { SITE_PROCEDURES } = require('../src/engine/procedure-targets');

function withDice(values, work) {
  const original = Math.random;
  let index = 0;
  Math.random = () => ((values[index++ % values.length] - 0.5) / 20);
  try { return work(); } finally { Math.random = original; }
}

test('every site-procedure synonym accepts bilateral modifiers at every word boundary', () => {
  for (const proc of INTERVENTIONS.filter(p => SITE_PROCEDURES.has(p.id))) {
    for (const alias of [proc.id, ...proc.synonyms]) {
      const ordinary = detectWithConfirmation(`Perform ${alias}`).rolls;
      assert.ok(ordinary.some(r => r.procedure_id === proc.id), alias);
      const ordinaryIds = [...new Set(ordinary.map(r => r.procedure_id))].sort();
      const words = alias.split(/\s+/);
      for (const modifier of ['Bilateral', 'Bilat', 'Bilat.']) {
        for (let position = 0; position <= words.length; position++) {
          const modified = [...words];
          modified.splice(position, 0, modifier);
          const text = `Perform ${modified.join(' ')}`;
          const rolls = detectWithConfirmation(text).rolls;
          const siteRolls = rolls.filter(r => r.procedure_id === proc.id);
          assert.equal(siteRolls.length, 2, text);
          assert.equal(new Set(siteRolls.map(r => r.target)).size, 2, text);
          assert.deepEqual([...new Set(rolls.map(r => r.procedure_id))].sort(), ordinaryIds, text);
        }
        // Bare abbreviations/aliases remain usable wherever the normal order is.
        if (detectWithConfirmation(alias).rolls.some(r => r.procedure_id === proc.id)) {
          assert.equal(detectWithConfirmation(`${modifier} ${alias}`).rolls
            .filter(r => r.procedure_id === proc.id).length, 2, `${modifier} ${alias}`);
        }
      }
    }
  }
});

test('modifier placement preserves confirmation keys, single orders and suppression', () => {
  for (const [ordinary, modified, id] of [
    ['TQ', 'Bilateral TQ', 'tourniquet'],
    ['TQ', 'Bilat TQ', 'tourniquet'],
    ['Apply CAT TQ', 'Apply a Bilat. CAT TQ', 'tourniquet'],
    ['Establish access', 'Establish Bilat access', 'peripheral_iv'],
    ['Get a line', 'Get Bilateral a line', 'peripheral_iv'],
    ['IO access', 'IO Bilateral access', 'io_access'],
    ['Perform needle decompression', 'Perform needle Bilat. decompression', 'needle_decompression'],
  ]) {
    const normal = detectAllProcedures(ordinary).find(e => e.proc.id === id);
    const detected = detectAllProcedures(modified);
    assert.equal(detected.length, 1, modified);
    assert.equal(detected[0].key, normal.key, modified);
    assert.equal(detectWithConfirmation(modified, {}, 'NORMAL', { deny: [normal.key] }).rolls.length, 0, modified);
  }
  for (const text of [
    'Do not establish Bilat access', 'Consider Bilateral TQ',
    'If needed, apply Bilat. CAT TQ', 'Push epinephrine through the Bilat. IO access',
  ]) {
    assert.equal(detectWithConfirmation(text).rolls.filter(r => SITE_PROCEDURES.has(r.procedure_id)).length, 0, text);
  }
  assert.equal(detectWithConfirmation('TQ').rolls.length, 1);
  assert.equal(detectWithConfirmation('Establish access').rolls.length, 1);
});

test('bilateral and Bilat access make independent rolls and independent access entries', () => {
  for (const [text, kind, id] of [
    ['Start bilateral IVs', 'IV', 'peripheral_iv'],
    ['Start Bilat IV', 'IV', 'peripheral_iv'],
    ['Place bilateral IOs', 'IO', 'io_access'],
    ['Bilat IO', 'IO', 'io_access'],
    ['Start two large-bore IVs', 'IV', 'peripheral_iv'],
  ]) {
    for (const [dice, expected] of [[[18, 2], 1], [[18, 19], 2], [[2, 2], 0]]) {
      const rolls = withDice(dice, () => detectWithConfirmation(text).rolls);
      assert.deepEqual(rolls.map(r => r.procedure_id), [id, id], text);
      assert.deepEqual(rolls.map(r => r.roll), dice, text);
      const session = { access: [] };
      Session.prototype._updateAccess.call(session, rolls, '');
      assert.equal(session.access.length, expected, text);
      assert.ok(session.access.every(a => a.kind === kind && a.status === 'patent'));
      assert.equal(detectAllAndRoll(text).length, 2, text);
    }
  }
});

test('one failed or complicated side cannot invalidate the successful side', () => {
  const rolls = withDice([18, 1], () => detectWithConfirmation('Start bilateral IVs').rolls);
  const session = { access: [] };
  Session.prototype._updateAccess.call(session, rolls, 'Right IV line is blown.');
  assert.deepEqual(session.access.map(a => [a.target, a.status]), [['left side', 'patent'], ['right side', 'blown']]);
  assert.match(Session.prototype._accessSummary.call(session), /left side.*PATENT.*right side.*BLOWN/);
});

test('tourniquets roll independently for each named or counted limb', () => {
  for (const [text, targets] of [
    ['Apply tourniquets to left leg and right arm', ['left leg', 'right arm']],
    ['Apply bilateral tourniquets to both legs', ['left leg', 'right leg']],
    ['Apply tourniquets to left and right legs', ['left leg', 'right leg']],
    ['Apply TQs to LUE, RUE and LLE', ['left arm', 'right arm', 'left leg']],
    ['Tourniquet all four limbs', ['left arm', 'right arm', 'left leg', 'right leg']],
    ['Apply tourniquets to both upper and lower extremities', ['left arm', 'right arm', 'left leg', 'right leg']],
    ['Apply tourniquets to three limbs', ['limb 1', 'limb 2', 'limb 3']],
  ]) {
    const rolls = withDice([18, 2, 1, 19], () => detectWithConfirmation(text).rolls);
    assert.deepEqual(rolls.map(r => r.target), targets, text);
    assert.ok(rolls.every(r => r.procedure_id === 'tourniquet'), text);
    assert.equal(new Set(rolls.map(r => r.roll)).size, rolls.length, text);
  }
});

test('target scope, deduplication, routes and confirmation keep their existing safeguards', () => {
  for (const text of ['Start bilateral IVs and tourniquet left leg', 'Start bilateral IVs, tourniquet left leg']) {
    const scoped = detectWithConfirmation(text).rolls;
    assert.equal(scoped.filter(r => r.procedure_id === 'tourniquet').length, 1, text);
    assert.deepEqual(scoped.filter(r => r.procedure_id === 'peripheral_iv').map(r => r.target), ['left side', 'right side'], text);
  }
  assert.deepEqual(detectWithConfirmation('Apply tourniquets to both legs but not the right leg').rolls.map(r => r.target), ['left leg']);
  const rolls = detectWithConfirmation('Start bilateral IVs and apply a tourniquet to left leg').rolls;
  assert.equal(rolls.filter(r => r.procedure_id === 'peripheral_iv').length, 2);
  assert.equal(rolls.filter(r => r.procedure_id === 'tourniquet').length, 1);
  assert.equal(detectAllProcedures('Apply tourniquet to left leg. Apply TQ to right arm.').length, 1);
  assert.equal(detectWithConfirmation('Apply tourniquet to left leg. Apply TQ to right arm.').rolls.length, 2);
  assert.equal(detectWithConfirmation('Apply tourniquet to left leg. Apply TQ to left leg.').rolls.length, 1);
  assert.equal(detectWithConfirmation('Push epinephrine through both IOs').rolls.filter(r=>r.procedure_id==='io_access').length, 0);
  for (const text of ['Do not start bilateral IVs', 'Consider bilateral IOs', 'If needed, apply bilateral tourniquets']) {
    assert.equal(detectWithConfirmation(text).rolls.length, 0, text);
  }
  const entry = detectAllProcedures('Start bilateral IVs')[0];
  assert.equal(detectWithConfirmation('Start bilateral IVs', {}, 'NORMAL', { deny: [entry.key] }).rolls.length, 0);
  assert.equal(detectWithConfirmation('Start an IV').rolls.length, 1);
  assert.deepEqual(detectWithConfirmation('We should discuss IV access in the left arm. Place IV in the right arm.').rolls.map(r => r.target), ['right arm']);
  assert.equal(detectWithConfirmation('Perform bilateral needle decompression').rolls.length, 2);
});

test('each target retains normal difficulty rules and event provenance', () => {
  const rolls = withDice([18, 4, 19, 2], () => detectWithConfirmation('Bilat IO', {}, 'BLACK_CLOUD').rolls);
  assert.deepEqual(rolls.map(r => r.both_rolls), [[18, 4], [19, 2]]);
  assert.deepEqual(rolls.map(r => r.roll), [4, 2]);
  const seed = { events: [] };
  for (const r of rolls) logEvent(seed, { ...r, event_type: 'procedure', dice_roll: r.roll }, 2);
  assert.deepEqual(seed.events.map(e => e.target), ['left side', 'right side']);
  const kept = reconcileRolls(rolls, 'Right IO access is contraindicated here. Left IO access attempted.');
  assert.deepEqual(kept.map(r => r.target), ['left side']);
});

test('a real session sends separate outcome directives and persists each target', async () => {
  const session = new Session(rollScenario({ random_seed: 'bilateral-access-regression' }));
  const result = await withDice([18, 2], () => session.send('Start bilateral IVs'));
  assert.deepEqual(result.rolls.map(r => r.outcome), ['SUCCESS', 'FAILURE']);
  assert.deepEqual(session.access, [{ kind: 'IV', status: 'patent', target: 'left side' }]);
  assert.match(sentOrder, /SYSTEM ROLL: peripheral_iv \[left side\].*SUCCESS/);
  assert.match(sentOrder, /SYSTEM ROLL: peripheral_iv \[right side\].*FAILURE/);
  assert.deepEqual(session.seed.events.filter(e => e.event_type === 'procedure').map(e => [e.target, e.outcome]),
    [['left side', 'SUCCESS'], ['right side', 'FAILURE']]);
  assert.equal(session.turns.at(-1).rolls.length, 2);
});
