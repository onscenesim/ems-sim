'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SCENARIO_POOLS } = require('../src/data/scenarios');
const { FREQUENT_CALLERS, ENCOUNTER_CONTRACT } = require('../src/data/scenarios/frequent-callers');
const { catalog, prepareInstructor } = require('../src/engine/instructor');
const { rollScenario } = require('../src/engine/roller');
const { assembleSeedBlock, buildDebriefContext } = require('../src/engine/assembler');
const ECG = require('../public/twelve-lead');

test('all twelve categories each ship two independently selectable cases with the same first impression', () => {
  assert.equal(Object.keys(FREQUENT_CALLERS).length, 12);
  const all = catalog().filter(e => e.frequent_caller);
  assert.equal(all.length, 24);
  assert.equal(new Set(all.map(e => e.case_id)).size, 24);
  for (const [category, entries] of Object.entries(FREQUENT_CALLERS)) {
    const [acute, stable] = entries;
    assert.ok(SCENARIO_POOLS[category].includes(acute));
    assert.ok(SCENARIO_POOLS[category].includes(stable));
    assert.deepEqual(new Set(entries.map(e => e.frequent_caller.variant)), new Set(['acute', 'stable']));
    for (const key of ['pair_id', 'dispatch', 'opening', 'history', 'behavior']) {
      assert.equal(acute.frequent_caller[key], stable.frequent_caller[key], `${category}: ${key}`);
    }
    assert.notEqual(acute.hint, stable.hint);
    assert.doesNotMatch(acute.frequent_caller.dispatch, /potentially sick|stable|acute variant/i);
  }
});

test('stable variants survive every difficulty without random disease, comorbidities or a deterioration clock', () => {
  for (const entries of Object.values(FREQUENT_CALLERS)) {
    for (const difficulty of ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD']) {
      for (let i = 0; i < 30; i++) {
        const seed = rollScenario({ difficulty, instructor: prepareInstructor({ case_id: entries[1].case_id }), random_seed: `stable-${i}` });
        assert.equal(seed.trajectory, 'stable');
        assert.equal(seed.decompensation_clock, null);
        assert.equal(seed.comorbidity_bundle, null);
        assert.ok(!['clinical_curveball', 'all'].includes(seed.complication_type));
        if (difficulty === 'HARD' || difficulty === 'BLACK_CLOUD') assert.notEqual(seed.complication_type, 'none');
      }
    }
  }
});

test('case histories and emotional friction reach gameplay and debrief while catalog data stay unchanged', () => {
  const before = structuredClone(FREQUENT_CALLERS);
  for (const entries of Object.values(FREQUENT_CALLERS)) for (const entry of entries) {
    for (const provider_level of ['ALS', 'BLS']) {
      const seed = rollScenario({ provider_level, instructor: prepareInstructor({ case_id: entry.case_id }), random_seed: 'encounter-prompt' });
      const prompt = assembleSeedBlock(seed);
      assert.ok(prompt.includes(ENCOUNTER_CONTRACT));
      assert.match(prompt, /CALL-SPECIFIC CREW REACTIONS/);
      assert.match(prompt, /High enthusiasm and kindness do not suppress this reaction/);
      for (const key of ['dispatch', 'opening', 'history', 'behavior']) assert.ok(prompt.includes(entry.frequent_caller[key]));
      assert.doesNotMatch(prompt, /Bundle: otherwise_healthy|No significant past medical history/);
      const context = buildDebriefContext(seed, []);
      assert.ok(context.includes(entry.frequent_caller.history));
      assert.match(context, /management|crew skepticism/);
      assert.match(context, /Rudeness does not establish fabrication or incapacity/);
      seed.frequent_caller.history = 'test mutation';
    }
  }
  assert.deepEqual(FREQUENT_CALLERS, before);
});

test('variants are naturally drawn and retain chronic history outside instructor mode', () => {
  for (const category of Object.keys(FREQUENT_CALLERS)) {
    const variants = new Set();
    for (let i = 0; i < 1500 && variants.size < 2; i++) {
      const seed = rollScenario({ category, random_seed: `frequent-natural-${category}-${i}` });
      if (seed.frequent_caller?.pair_id !== `frequent-caller-${category}`) continue;
      variants.add(seed.frequent_caller.variant);
      assert.equal(seed.instructor_mode, undefined);
      assert.ok(assembleSeedBlock(seed).includes(seed.frequent_caller.history));
      if (seed.frequent_caller.variant === 'stable') assert.equal(seed.trajectory, 'stable');
    }
    assert.deepEqual(variants, new Set(['acute', 'stable']), category);
  }
});

test('unconfirmed arrest/death dispatches do not force resuscitation or death rules on living patients', () => {
  for (const entry of [...FREQUENT_CALLERS.arrest, ...FREQUENT_CALLERS.doa]) {
    const seed = rollScenario({ instructor: prepareInstructor({ case_id: entry.case_id }), random_seed: 'dispatch-versus-patient' });
    const actualArrest = entry === FREQUENT_CALLERS.arrest[0];
    assert.equal(seed.category === 'arrest', actualArrest);
    assert.notEqual(seed.category, 'doa');
    assert.equal(!!seed.arrest_rhythm, actualArrest);
    assert.equal(seed.obvious_death_signs, null);
    const prompt = assembleSeedBlock(seed);
    assert.equal(prompt.includes('PARTNER CLOCK CALLS'), actualArrest);
    if (!actualArrest) assert.ok(seed.dispatch_category);
  }
});

test('missed-dialysis electrical findings use the ECG catalog rather than an invented waveform', () => {
  for (const entry of FREQUENT_CALLERS.medical) {
    const seed = rollScenario({ instructor: prepareInstructor({ case_id: entry.case_id }), random_seed: 'dialysis-ecg' });
    assert.ok(Object.hasOwn(ECG.catalog.patterns, seed.ecg_pattern));
    assert.equal(ECG.selectPattern(seed), entry.frequent_caller.variant === 'acute' ? 'hyperk' : 'normal');
  }
});
