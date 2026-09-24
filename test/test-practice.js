'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rollScenario } = require('../src/engine/roller');
const { SCENARIO_POOLS } = require('../src/data/scenarios');
function configuration(seed) {
  const { scenario_id, timestamp_start, ...setup } = seed;
  return setup;
}
test('a seed reproduces setup including names, crew, modifiers and weather without sharing run identity', () => {
  const opts = { random_seed: 'repeatable-test', category: 'trauma', region_id: 'RURAL_REMOTE' };
  const first = rollScenario(opts);
  rollScenario({ random_seed: 'another-player' });
  const second = rollScenario(opts);
  assert.deepEqual(configuration(first), configuration(second));
  assert.notEqual(first.scenario_id, second.scenario_id);
  assert.notDeepEqual(configuration(first), configuration(rollScenario({ ...opts, random_seed: 'different' })));
});
test('case IDs uniquely identify all catalog entries', () => {
  const entries = Object.values(SCENARIO_POOLS).flat();
  assert.equal(new Set(entries.map(e => e.case_id)).size, entries.length);
});
