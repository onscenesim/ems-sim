'use strict';
const { SCENARIO_POOLS } = require('../data/scenarios');
const { SEASONS } = require('./compatibility');
const { COMORBIDITIES } = require('../data/comorbidities');
const { WEATHER } = require('../data/modifiers');

const REVIEW_NOTICE = 'Turn in this call to your instructor for review.';
const scenarioFields = {
  presentation: 'text', surface_presentation: 'text', hint: 'text', reversible_cause_hint: 'text',
  true_diagnosis: 'text', reveal_trigger: 'text', special_flags: 'text', rhythm: 'text',
  obvious_death_signs: 'text', age_override: 'list', sex_override: ['female', 'male'],
  difficulty: ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD'],
  'compatibility.regions': 'list', 'compatibility.seasons': 'list', 'compatibility.weather': 'list',
};
const seedFields = {
  random_seed: 'text', season: SEASONS, patient_name: 'text', patient_age: 'number',
  sex: ['female', 'male'], trajectory: ['stable', 'slowly_deteriorating', 'rapidly_deteriorating'],
  decompensation_clock: 'number', weather_id: ['clear', ...WEATHER.map(w => w.id)],
  time_of_day: 'text', caller_behavior: 'text', comorbidity_bundle: ['otherwise_healthy', ...COMORBIDITIES.map(c => c.id)],
  complication_type: ['none', 'equipment_failure', 'unreliable_bystander', 'clinical_curveball', 'all'], special_circumstance: 'text', backup_present_on_arrival: 'boolean',
};
function catalog() {
  return Object.entries(SCENARIO_POOLS).flatMap(([category, entries]) => entries.map(entry => ({ category, ...structuredClone(entry) })));
}
function validateFields(input = {}, fields) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid instructor settings.');
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    const type = fields[key];
    if (!Object.hasOwn(fields, key)) throw new Error(`Unknown instructor setting: ${key}`);
    const valid = value === null || (Array.isArray(type) ? type.includes(value)
      : type === 'text' ? typeof value === 'string' && value.length <= 8000
      : type === 'list' ? Array.isArray(value) && value.length <= 30 && value.every(v => typeof v === 'string' && v.length > 0 && v.length <= 200)
      : type === 'boolean' ? typeof value === 'boolean'
      : typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= (key === 'patient_age' ? 120 : 1440));
    if (!valid) throw new Error(`Invalid instructor setting: ${key}`);
    result[key] = structuredClone(value);
  }
  if (Object.hasOwn(result, 'random_seed') && (typeof result.random_seed !== 'string' || !result.random_seed.trim() || result.random_seed.length > 128)) throw new Error('Random seed must contain 1–128 characters.');
  return result;
}
function prepareInstructor(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose an instructor scenario.');
  const entry = catalog().find(e => e.case_id === input.case_id);
  if (!entry) throw new Error('Choose an instructor scenario from the catalog.');
  if (input.hide_debrief !== undefined && typeof input.hide_debrief !== 'boolean') throw new Error('Invalid review setting.');
  const overrides = validateFields(input.scenario, scenarioFields);
  const seed = validateFields(input.seed, seedFields);
  for (const key of Object.keys(seed)) {
    if (seed[key] === null && key !== 'decompensation_clock') throw new Error(`Invalid instructor setting: ${key}`);
  }
  for (const key of Object.keys(overrides).filter(key => key.startsWith('compatibility.'))) {
    entry.compatibility ||= {};
    entry.compatibility[key.split('.')[1]] = overrides[key];
    delete overrides[key];
  }
  return { entry: { ...entry, ...overrides }, seed, hide_debrief: input.hide_debrief === true };
}
function applyInstructor(seed, instructor) {
  Object.assign(seed, instructor.seed);
  if (Object.hasOwn(instructor.seed, 'patient_age')) seed.patient_age_display = `${seed.patient_age} years old`;
  if (Object.hasOwn(instructor.seed, 'complication_type')) seed.complication_roll = seed.complication_type === 'none' ? null : 1;
  if (Object.hasOwn(instructor.seed, 'weather_id')) seed.weather = WEATHER.find(w => w.id === seed.weather_id)?.text || null;
  seed.instructor_mode = true;
  seed.hide_debrief = instructor.hide_debrief;
  seed.instructor_scenario = structuredClone(instructor.entry);
  return seed;
}
function reviewText(run) {
  return run.seed?.hide_debrief ? REVIEW_NOTICE : run.debriefText || null;
}
module.exports = { catalog, scenarioFields, seedFields, prepareInstructor, applyInstructor, reviewText, REVIEW_NOTICE };
