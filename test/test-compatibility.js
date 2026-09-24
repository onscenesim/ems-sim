'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rollScenario } = require('../src/engine/roller');
const { SCENARIO_POOLS } = require('../src/data/scenarios');
const { REGIONS } = require('../src/data/regions');
const { SEASONS, validateCombination, caseCompatible } = require('../src/engine/compatibility');
const avalanche = SCENARIO_POOLS.trauma.find(e => e.presentation.startsWith('Avalanche burial'));
test('avalanche requires a snowy remote setting, including history fallback', () => {
  assert.equal(caseCompatible(avalanche, 'SUBURBAN', 'winter'), false);
  assert.equal(caseCompatible(avalanche, 'RURAL_REMOTE', 'summer'), false);
  assert.equal(validateCombination(avalanche, { region: 'RURAL_REMOTE', season: 'winter', weather_id: 'rain' }), false);
  assert.equal(validateCombination(avalanche, { region: 'RURAL_REMOTE', season: 'spring', weather_id: 'clear' }), true);
  const original = SCENARIO_POOLS.trauma;
  const generic = original.find(e => !e.compatibility);
  SCENARIO_POOLS.trauma = [avalanche, generic];
  try {
    const history = { presentations: [generic.presentation] };
    for (let i = 0; i < 100; i++) assert.equal(rollScenario({ category: 'trauma', region_id: 'SUBURBAN', history }).presentation, generic.presentation);
  } finally { SCENARIO_POOLS.trauma = original; }
});
test('all region/season/category combinations generate compatible scenarios', () => {
  for (const region of REGIONS) for (const season of SEASONS) for (const category of Object.keys(SCENARIO_POOLS)) {
    for (let i = 0; i < 10; i++) {
      const seed = rollScenario({ region_id: region.id, season, category, difficulty: 'HARD' });
      const entry = SCENARIO_POOLS[seed.category].find(e => (e.presentation || e.surface_presentation) === seed.presentation);
      assert.ok(validateCombination(entry, seed), `${seed.presentation}: ${JSON.stringify(seed)}`);
    }
  }
});
