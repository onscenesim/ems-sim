'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { catalog, prepareInstructor } = require('../src/engine/instructor');
const { rollScenario } = require('../src/engine/roller');
const { assembleSeedBlock, buildDebriefContext } = require('../src/engine/assembler');
const { sceneChallengeContract } = require('../src/engine/prompts/scene-challenges');
const { derivePulseOx } = require('../src/engine/pulse-ox');

const cases = catalog().filter(e => e.scene_challenge);

test('new scenes appear once in their intended pools and retain their identity through generation/replay', () => {
  assert.equal(cases.length, 2);
  for (const entry of cases) {
    assert.equal(entry.category, entry.scene_challenge === 'occult_co_arrest' ? 'toxicology' : 'curveballs');
    const seed = rollScenario({ instructor: prepareInstructor({ case_id: entry.case_id }), random_seed: 'scene-contract' });
    assert.equal(seed.scene_challenge, entry.scene_challenge);
    assert.equal(seed.case_id, entry.case_id);
    assert.equal(seed.hint, entry.hint);
    const restored = JSON.parse(JSON.stringify(seed));
    assert.ok(assembleSeedBlock(restored).includes(sceneChallengeContract(seed)));
    assert.ok(buildDebriefContext(restored, []).includes(sceneChallengeContract(seed)));
  }
});

test('random modifiers never replace the fixed patient truth or exposure history', () => {
  for (const entry of cases) for (const difficulty of ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD']) {
    for (let i = 0; i < 40; i++) {
      const seed = rollScenario({ difficulty, instructor: prepareInstructor({ case_id: entry.case_id }), random_seed: `scene-modifier-${i}` });
      assert.equal(seed.trajectory, entry.trajectory_override);
      assert.equal(seed.decompensation_clock, null);
      assert.equal(seed.comorbidity_bundle, null);
      assert.equal(seed.special_circumstance, null);
      assert.ok(['none', 'equipment_failure'].includes(seed.complication_type));
      assert.doesNotMatch(seed.caller_behavior, /aggressive|hostile|lying family/i);
      if (difficulty === 'HARD' || difficulty === 'BLACK_CLOUD') assert.equal(seed.complication_type, 'equipment_failure');
    }
  }
});

test('toxicology dispatch activates arrest timing, PEA and absent-perfusion monitor behavior', () => {
  const entry = cases.find(e => e.scene_challenge === 'occult_co_arrest');
  for (const provider_level of ['ALS', 'BLS']) {
    const seed = rollScenario({ provider_level, instructor: prepareInstructor({ case_id: entry.case_id }), random_seed: 'co-arrest' });
    assert.equal(seed.dispatch_category, 'toxicology');
    assert.equal(seed.category, 'arrest');
    assert.match(seed.arrest_rhythm, /PEA/);
    const prompt = assembleSeedBlock(seed);
    assert.match(prompt, /PARTNER CLOCK CALLS/);
    assert.doesNotMatch(prompt, /Patient is stable\. No decompensation clock/);
    assert.equal(derivePulseOx({ Rhythm: 'PEA', HR: 36, SpO2: 98, Perfusion: 'absent' }, null, seed).displayedSpO2, null);
    if (provider_level === 'BLS') assert.match(prompt, /BLS ARREST MEDICATIONS/);
  }
});

test('stable police patient never receives arrest or inevitable-death instructions', () => {
  const entry = cases.find(e => e.scene_challenge === 'police_transport_pretext');
  for (const partner_name of ['Marcus Webb', 'Priya Nair', 'Quinn Abernathy']) {
    const seed = rollScenario({ difficulty: 'BLACK_CLOUD', partner_name, instructor: prepareInstructor({ case_id: entry.case_id }), random_seed: 'police-autonomy' });
    const prompt = assembleSeedBlock(seed);
    assert.equal(seed.crew_partner, partner_name);
    assert.equal(seed.arrest_rhythm, null);
    assert.match(prompt, /BLACK CLOUD STABLE SCENE/);
    assert.doesNotMatch(prompt, /INEVITABLE DECLINE|PARTNER CLOCK CALLS/);
  }
});

test('both scenes occur naturally outside instructor mode', () => {
  const found = new Set();
  for (let i = 0; i < 6000 && found.size < 2; i++) {
    const seed = rollScenario({ difficulty: 'HARD', random_seed: `natural-scene-${i}` });
    if (seed.scene_challenge) {
      found.add(seed.scene_challenge);
      assert.equal(seed.instructor_mode, undefined);
      assert.equal(seed.decompensation_clock, null);
    }
  }
  assert.deepEqual(found, new Set(cases.map(e => e.scene_challenge)));
});
