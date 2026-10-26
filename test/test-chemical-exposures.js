'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CHEMICAL_EXPOSURES } = require('../src/data/scenarios/chemical-exposures');
const { catalog, prepareInstructor } = require('../src/engine/instructor');
const { rollScenario } = require('../src/engine/roller');
const { assembleSeedBlock, buildDebriefContext } = require('../src/engine/assembler');
const { chemicalExposureContract } = require('../src/engine/prompts/chemical-exposures');
const { detectWithConfirmation } = require('../src/engine/dice');

const entries = catalog().filter(e => e.chemical_exposure);

test('each requested exposure has a distinct catalog case, including separate eye and ingestion routes', () => {
  const expected = [
    'bleach_eye', 'ammonia_eye', 'drain_cleaner_eye', 'oven_cleaner_eye', 'battery_acid_eye',
    'cement_lime_eye', 'pool_acid_eye', 'pool_hypochlorite_eye', 'detergent_eye', 'detergent_pod_eye', 'solvent_eye', 'hf_eye',
    'bleach_acid_fumes', 'bleach_ammonia_fumes', 'ammonia_fumes', 'wet_cement_skin',
    'gasoline_aspiration', 'kerosene_child', 'solvent_inhalation', 'solvent_skin', 'methanol_ingestion',
    'lead_worker', 'lead_child', 'mercury_vapor', 'arsenic_ingestion', 'acid_ingestion', 'detergent_pod_ingestion',
  ];
  assert.deepEqual(new Set(entries.map(e => e.chemical_exposure.id)), new Set(expected));
  assert.equal(entries.length, expected.length);
  assert.equal(new Set(entries.map(e => e.case_id)).size, expected.length);
  for (const entry of entries) {
    assert.equal(entry.category, 'toxicology');
    assert.ok(entry.chemical_exposure.sources.length);
    assert.ok(entry.chemical_exposure.sources.every(url => url.startsWith('https://')));
  }
});

test('agent and route survive generation, serialized replay and debrief in both provider levels', () => {
  const before = structuredClone(CHEMICAL_EXPOSURES);
  for (const entry of entries) for (const provider_level of ['BLS', 'ALS']) {
    const seed = rollScenario({ provider_level, instructor: prepareInstructor({ case_id: entry.case_id }), random_seed: 'exposure-contract' });
    assert.deepEqual(seed.chemical_exposure, entry.chemical_exposure);
    assert.equal(seed.hint, entry.hint);
    assert.equal(seed.arrest_rhythm, null);
    const restored = JSON.parse(JSON.stringify(seed));
    assert.ok(assembleSeedBlock(restored).includes(chemicalExposureContract(seed)));
    assert.ok(buildDebriefContext(restored, []).includes(chemicalExposureContract(seed)));
    seed.chemical_exposure.sources.push('test');
  }
  assert.deepEqual(CHEMICAL_EXPOSURES, before);
});

test('localized and chronic cases keep their clinical course across every difficulty', () => {
  for (const entry of entries) for (const difficulty of ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD']) {
    const seed = rollScenario({ difficulty, instructor: prepareInstructor({ case_id: entry.case_id }), random_seed: 'exposure-difficulty' });
    assert.ok(!['clinical_curveball', 'all'].includes(seed.complication_type));
    assert.equal(seed.trajectory, entry.trajectory_override);
    if (['local', 'chronic'].includes(entry.chemical_exposure.course)) {
      assert.equal(seed.decompensation_clock, null);
      const prompt = assembleSeedBlock(seed);
      assert.doesNotMatch(prompt, /INEVITABLE DECLINE/);
      if (difficulty === 'BLACK_CLOUD') assert.match(prompt, /BLACK CLOUD EXPOSURE SCENE/);
    }
    if (entry.chemical_exposure.id === 'lead_child') assert.ok(seed.patient_age < 18);
    if (entry.chemical_exposure.id === 'detergent_pod_ingestion') assert.ok(seed.patient_age >= 1 && seed.patient_age <= 3);
  }
});

test('every new case can be naturally drawn without instructor mode', () => {
  const found = new Set();
  for (let i = 0; i < 4000 && found.size < entries.length; i++) {
    const seed = rollScenario({ category: 'toxicology', random_seed: `chemical-natural-${i}` });
    if (seed.chemical_exposure) {
      found.add(seed.chemical_exposure.id);
      assert.equal(seed.instructor_mode, undefined);
    }
  }
  assert.deepEqual(found, new Set(entries.map(e => e.chemical_exposure.id)));
});

test('natural irrigation language reaches the existing decontamination procedure without turning assessments into treatment', () => {
  for (const text of ['Irrigate the left eye with water', 'Flush the right eye with saline', 'Rinse both eyes with water', 'Start eye irrigation', 'Irrigate the eyes', 'Flush the eye']) {
    const rolls = detectWithConfirmation(text).rolls.filter(r => r.procedure_id === 'decontamination');
    assert.equal(rolls.length, 1, text);
    assert.equal(rolls[0].no_roll, false);
  }
  for (const text of ['Inspect the left eye', 'Check vision in both eyes', 'Do not irrigate the eyes']) {
    assert.equal(detectWithConfirmation(text).rolls.filter(r => r.procedure_id === 'decontamination').length, 0, text);
  }
});
