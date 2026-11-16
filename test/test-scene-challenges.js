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
    assert.match(prompt, /CPR CYCLES: Rhythm and pulse checks/);
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
    assert.doesNotMatch(prompt, /INEVITABLE DECLINE|CPR CYCLES: Rhythm and pulse checks/);
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

test('safeguarding cases keep their clinical course and disclosure rules across difficulty and replay', () => {
  const entries = catalog().filter(e => e.safeguarding);
  assert.deepEqual(entries.filter(e => !e.selection_group).map(e => e.category).sort(), ['behavioral', 'pediatric', 'trauma']);
  assert.equal(new Set(entries.map(e => e.case_id)).size, entries.length);

  for (const entry of entries) {
    const instructor = prepareInstructor({ case_id: entry.case_id });
    for (const difficulty of ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD']) {
      for (let i = 0; i < 12; i++) {
        const seed = rollScenario({ difficulty, instructor, random_seed: `safeguarding-${i}` });
        assert.equal(seed.trajectory, entry.trajectory_override);
        assert.equal(seed.decompensation_clock === null, entry.trajectory_override === 'stable');
        assert.equal(seed.comorbidity_bundle, null);
        assert.equal(seed.special_circumstance, null);
        assert.equal(seed.catastrophe, undefined);
        assert.ok(['none', 'equipment_failure'].includes(seed.complication_type));
        if (entry.category === 'pediatric') assert.match(seed.patient_age_display, /^\d+ months? old \(infant\)$/);
      }
    }

    const seed = rollScenario({ difficulty: 'BLACK_CLOUD', instructor, random_seed: 'safeguarding-replay' });
    const replay = JSON.parse(JSON.stringify(seed));
    assert.deepEqual(replay.safeguarding, entry.safeguarding);
    const prompt = assembleSeedBlock(replay);
    assert.ok(prompt.includes(`Dispatch information: ${entry.safeguarding.dispatch}`));
    assert.ok(prompt.includes(`First impression on arrival: ${entry.safeguarding.opening}`));
    assert.match(prompt, /actually out of earshot/);
    assert.doesNotMatch(prompt, /Dispatch pool:/);
    assert.doesNotMatch(prompt, /INEVITABLE DECLINE/);
    const debrief = buildDebriefContext(replay, []);
    assert.ok(debrief.includes(entry.hint));
    assert.match(debrief, /Do not assume the player obtained an undisclosed detail/);
  }
});

test('natural rolls reach every social case variant with its clinical category and eligible demographics', () => {
  const entries = catalog().filter(e => ['sex_trafficking', 'college_hazing', 'factitious_disorder'].includes(e.selection_group));
  assert.deepEqual(entries.filter(e => e.selection_group === 'sex_trafficking').map(e => e.category_override).sort(),
    ['medical', 'neuro', 'toxicology', 'trauma']);
  assert.equal(entries.filter(e => e.selection_group === 'college_hazing').length, 2);
  assert.equal(entries.filter(e => e.selection_group === 'factitious_disorder').length, 2);

  const byId = new Map(entries.map(e => [e.case_id, e]));
  const demographics = new Map(entries.map(e => [e.case_id, new Set()]));
  for (const category of ['behavioral', 'toxicology']) {
    for (let i = 0; i < 3000; i++) {
      const seed = rollScenario({ category, random_seed: `social-situations-${category}-${i}` });
      const entry = byId.get(seed.case_id);
      if (!entry) continue;
      assert.equal(seed.instructor_mode, undefined);
      assert.equal(seed.category, entry.category_override || category);
      assert.equal(seed.dispatch_category, entry.category_override ? category : undefined);
      if (entry.selection_group === 'sex_trafficking') assert.ok(seed.patient_age >= 13 && seed.patient_age <= 64);
      else assert.ok(seed.patient_age >= 18 && seed.patient_age <= (entry.selection_group === 'college_hazing' ? 39 : 64));
      if (entry.sex_override) assert.equal(seed.sex, entry.sex_override);
      demographics.get(seed.case_id).add(seed.sex);
      demographics.get(seed.case_id).add(seed.age_group);
    }
  }

  for (const entry of entries) {
    assert.deepEqual(demographics.get(entry.case_id), new Set([
      ...(entry.sex_override ? [entry.sex_override] : ['female', 'male']), ...entry.age_override,
    ]));
  }
});
