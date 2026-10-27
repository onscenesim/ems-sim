'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { presentationGroups, selectPresentation } = require('../src/engine/presentation-selection');
const { createRandom } = require('../src/engine/random');
const { SCENARIO_POOLS } = require('../src/data/scenarios');
const { catalog, prepareInstructor } = require('../src/engine/instructor');
const { rollScenario } = require('../src/engine/roller');

test('a family has one parent ticket independent of variant count; its second roll reaches every variant', () => {
  const cases = [
    ...Array.from({ length: 12 }, (_, i) => ({ presentation: `eye-${i}`, selection_group: 'eye' })),
    { presentation: 'standalone-one' }, { presentation: 'standalone-two' },
  ];
  assert.equal(presentationGroups(cases).length, 3);
  for (let i = 0; i < 12; i++) {
    const rolls = [1 / 6, (i + 0.5) / 12];
    assert.equal(selectPresentation(cases, () => rolls.shift()), cases[i]);
    assert.equal(rolls.length, 0);
  }
  const expanded = [...cases.slice(0, 12), ...Array.from({ length: 100 }, () => ({ selection_group: 'eye' })), ...cases.slice(12)];
  for (const pool of [cases, expanded]) {
    let draws = 0;
    assert.equal(selectPresentation(pool, () => { draws++; return 0.5; }).presentation, 'standalone-one');
    assert.equal(draws, 1);
  }
  assert.equal(selectPresentation([], () => { throw new Error('empty draw'); }), null);
});

test('ungrouped categories preserve the existing single-roll selection and random stream', () => {
  const entries = SCENARIO_POOLS.cardiac;
  assert.ok(entries.every(e => !e.selection_group));
  for (const value of [0, 0.25, 0.5, 0.9999]) {
    let calls = 0;
    const result = selectPresentation(entries, () => { calls++; return value; });
    assert.equal(result, entries[Math.floor(value * entries.length)]);
    assert.equal(calls, 1);
  }
});

test('all toxicology variants retain independent catalog identities and instructor selection', () => {
  const entries = catalog().filter(e => e.category === 'toxicology');
  assert.equal(entries.length, 75);
  assert.equal(new Set(entries.map(e => e.case_id)).size, entries.length);
  const groups = presentationGroups(entries);
  assert.equal(groups.length, 37);
  assert.equal(groups.filter(g => g[0].selection_group === 'eye_exposure').length, 1);
  assert.equal(groups.find(g => g[0].selection_group === 'eye_exposure').length, 12);
  assert.equal(groups.find(g => g[0].selection_group === 'solvent_inhalation').length, 2);
  for (const entry of entries) {
    const seed = rollScenario({ instructor: prepareInstructor({ case_id: entry.case_id }), random_seed: 'direct-variant' });
    assert.equal(seed.case_id, entry.case_id);
    assert.equal(seed.presentation, entry.presentation);
  }
});

test('real seeded draws give families equal parent weight and varied sub-rolls', () => {
  const entries = SCENARIO_POOLS.toxicology;
  const random = createRandom('group-distribution');
  const groups = presentationGroups(entries);
  const counts = new Map();
  const eyes = new Set();
  const n = 37000;
  for (let i = 0; i < n; i++) {
    const entry = selectPresentation(entries, random);
    const key = entry.selection_group || entry.case_id;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (entry.selection_group === 'eye_exposure') eyes.add(entry.case_id);
  }
  assert.equal(counts.size, groups.length);
  for (const count of counts.values()) assert.ok(Math.abs(count - n / groups.length) < n / groups.length * 0.15);
  assert.equal(eyes.size, 12);
});

test('eligibility and recent-case exclusions precede both grouped draws, including the history fallback', () => {
  const original = SCENARIO_POOLS.toxicology;
  const eyeCases = original.filter(e => e.selection_group === 'eye_exposure').slice(0, 2);
  const incompatible = { ...eyeCases[0], presentation: 'Incompatible eye case', compatibility: { regions: ['RURAL_REMOTE'] } };
  SCENARIO_POOLS.toxicology = [...eyeCases, incompatible];
  try {
    for (let i = 0; i < 40; i++) {
      const opts = { category: 'toxicology', region_id: 'SUBURBAN', random_seed: `group-history-${i}` };
      assert.equal(rollScenario({ ...opts, history: { presentations: [eyeCases[0].presentation] } }).presentation, eyeCases[1].presentation);
      const fallback = rollScenario({ ...opts, history: { presentations: eyeCases.map(e => e.presentation) } });
      assert.ok(eyeCases.some(e => e.presentation === fallback.presentation));
    }
    // Exhausting history does not restore flat weighting or incompatible cases.
    const singleton = original.find(e => !e.selection_group);
    SCENARIO_POOLS.toxicology = [...original.filter(e => e.selection_group === 'eye_exposure'), singleton, incompatible];
    const history = { presentations: SCENARIO_POOLS.toxicology.map(e => e.presentation) };
    let eyes = 0;
    for (let i = 0; i < 400; i++) {
      const seed = rollScenario({ category: 'toxicology', region_id: 'SUBURBAN', random_seed: `group-fallback-${i}`, history });
      assert.notEqual(seed.presentation, incompatible.presentation);
      if (seed.chemical_exposure?.route === 'ocular') eyes++;
    }
    assert.ok(eyes > 160 && eyes < 240, `Grouped fallback eye draws: ${eyes}/400`);
  } finally { SCENARIO_POOLS.toxicology = original; }
});

test('reusing a random seed reproduces the parent choice, variant and patient setup', () => {
  const opts = { category: 'toxicology', random_seed: 'two-stage-repeatable' };
  const first = rollScenario(opts), next = rollScenario(opts);
  for (const key of ['case_id', 'presentation', 'patient_name', 'patient_age', 'sex', 'trajectory', 'crew_partner']) assert.equal(first[key], next[key]);
});
