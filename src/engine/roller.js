'use strict';

const { CATEGORY_WEIGHTS, DIFFICULTY_POOL, MODIFIER_FIRE_RATES, CURVEBALL_WEIGHTS, HARD_MODE_DC_PENALTY, HISTORY_WINDOWS, NIGHT_HOURS } = require('../data/config');
const { SCENARIO_POOLS } = require('../data/scenarios/index');
const { CALLER_BEHAVIORS, WEATHER, TIME_OF_DAY, SPECIAL_CIRCUMSTANCES } = require('../data/modifiers');
const { CREW } = require('../data/crew');
const { REGIONS } = require('../data/regions');
const { COMORBIDITIES } = require('../data/comorbidities');
const { AGE_GROUPS } = require('../data/ageGroups');
const { rollPatientName } = require('../data/patientNames');

function weightedRandom(items, weightFn) {
  const total = items.reduce((sum, item) => sum + weightFn(item), 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= weightFn(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function d6() { return Math.floor(Math.random() * 6) + 1; }
function d20() { return Math.floor(Math.random() * 20) + 1; }

function pickCategory(difficulty, history, curveBallWeight) {
  const weights = { ...CATEGORY_WEIGHTS };
  if (curveBallWeight !== undefined) weights.curveballs = curveBallWeight;

  const recentCategories = (history.categories || []).slice(-HISTORY_WINDOWS.category);
  const recentDoa = (history.doa_positions || []);
  const recentArrest = (history.arrest_positions || []);
  const totalScenarios = history.total_count || 0;

  const eligible = Object.entries(weights).filter(([cat]) => {
    if (recentCategories.includes(cat)) return false;
    if (cat === 'doa') {
      const lastDoa = recentDoa[recentDoa.length - 1];
      if (lastDoa !== undefined && (totalScenarios - lastDoa) < HISTORY_WINDOWS.doa_spacing) return false;
    }
    if (cat === 'arrest') {
      const lastArrest = recentArrest[recentArrest.length - 1];
      if (lastArrest !== undefined && (totalScenarios - lastArrest) < HISTORY_WINDOWS.arrest_spacing) return false;
    }
    if (difficulty === 'EASY' && cat === 'curveballs') return false;
    return true;
  });

  if (eligible.length === 0) {
    // Fallback: ignore history to prevent infinite loop
    return pickRandom(Object.keys(weights));
  }

  return weightedRandom(eligible, ([, w]) => w)[0];
}

function pickPresentation(category, difficulty, history) {
  const pool = SCENARIO_POOLS[category];
  if (!pool || pool.length === 0) return null;

  const diffPool = DIFFICULTY_POOL[difficulty];
  const recentPresentations = new Set((history.presentations || []).slice(-HISTORY_WINDOWS.presentation));
  const totalScenarios = history.total_count || 0;
  const lastZoo = (history.zoo_positions || []).slice(-1)[0];

  const eligible = pool.filter(entry => {
    const entryDiff = entry.difficulty || 'NORMAL';
    if (!diffPool[entryDiff]) return false;
    const key = entry.presentation || entry.surface_presentation;
    if (recentPresentations.has(key)) return false;
    if (entry.special_flags && entry.special_flags.includes('hardmode_exclusive') && difficulty !== 'HARD') return false;
    // Space zoo scenarios globally across all categories
    if (entry.special_flags && entry.special_flags.includes('zoo_scenario')) {
      if (lastZoo !== undefined && (totalScenarios - lastZoo) < HISTORY_WINDOWS.zoo_spacing) return false;
    }
    return true;
  });

  if (eligible.length === 0) return pickRandom(pool);
  return pickRandom(eligible);
}

function rollAgeGroup(category, presentationEntry) {
  if (presentationEntry.age_override && presentationEntry.age_override.length > 0) {
    return pickRandom(presentationEntry.age_override);
  }
  const groups = AGE_GROUPS[category] || ['young_adult', 'middle_aged'];
  // Parse the array string if it's a string literal (from spreadsheet format)
  if (typeof groups === 'string') {
    const parsed = JSON.parse(groups.replace(/'/g, '"'));
    return pickRandom(parsed);
  }
  return pickRandom(groups);
}

function rollAgeFromGroup(group) {
  const ranges = {
    pediatric:    [1, 17],
    young_adult:  [18, 39],
    middle_aged:  [40, 64],
    elderly:      [65, 90],
  };
  // age_override entries may be descriptive, e.g. "pediatric — toddler predominantly"
  const normalized = group.split('—')[0].trim().toLowerCase().replace(' ', '_');
  const [min, max] = ranges[normalized] || [25, 55];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollSex(presentationEntry) {
  if (presentationEntry.sex_override === 'female') return 'female';
  if (presentationEntry.sex_override === 'male') return 'male';
  return Math.random() < 0.5 ? 'male' : 'female';
}

function rollTrajectory(difficulty) {
  const r = Math.random();
  if (difficulty === 'EASY') {
    return r < 0.7 ? 'stable' : 'slowly_deteriorating';
  } else if (difficulty === 'NORMAL') {
    if (r < 0.4) return 'stable';
    if (r < 0.75) return 'slowly_deteriorating';
    return 'rapidly_deteriorating';
  } else {
    if (r < 0.15) return 'stable';
    if (r < 0.5) return 'slowly_deteriorating';
    return 'rapidly_deteriorating';
  }
}

function rollDecompensationClock(difficulty, trajectory) {
  if (trajectory === 'stable') return null;
  if (difficulty === 'EASY') return Math.floor(Math.random() * 6) + 15;   // 15-20 min
  if (difficulty === 'NORMAL') return Math.floor(Math.random() * 10) + 8;  // 8-17 min
  return Math.floor(Math.random() * 8) + 4;                                // 4-11 min
}

function rollComplication(difficulty) {
  if (difficulty === 'EASY') return { roll: null, type: 'none' };
  const roll = d6();
  const thresholds = {
    NORMAL: { equipment_failure: [5, 6], unreliable_bystander: [5, 6], clinical_curveball: [6] },
    HARD:   { equipment_failure: [4, 5, 6], unreliable_bystander: [4, 5, 6], clinical_curveball: [5, 6] },
  }[difficulty];

  if (thresholds.clinical_curveball.includes(roll)) return { roll, type: 'clinical_curveball' };
  if (thresholds.equipment_failure.includes(roll)) {
    return { roll, type: Math.random() < 0.5 ? 'equipment_failure' : 'unreliable_bystander' };
  }
  return { roll, type: 'none' };
}

function rollCallerBehavior(category) {
  const eligible = CALLER_BEHAVIORS.filter(cb => {
    if (!cb.requires) return true;
    const req = cb.requires.toLowerCase();
    if (req.includes('cardiac arrest') && category !== 'arrest') return false;
    if (req.includes('not pediatric') && category === 'pediatric') return false;
    if (req.includes('not doa') && category === 'doa') return false;
    return true;
  });
  return pickRandom(eligible).text;
}

function rollTimeOfDay() {
  // Night hours (2200-0500) get 1.5x weight — 8 hours * 1.5 = 12 weighted, 16 remaining = 28 total
  // Time entries are formatted '0000 — description' / '2200 — description'.
  // Parse the first 2 characters for the 2-digit hour (0-23); using 4 chars gives
  // 2200/0100 etc. which never match the hour array — a bug fixed here.
  const nightWeight = 1.5;
  const dayWeight = 1.0;
  return weightedRandom(TIME_OF_DAY, (entry) => {
    const hour = parseInt(entry.text.substring(0, 2), 10);
    return NIGHT_HOURS.includes(hour) ? nightWeight : dayWeight;
  }).text;
}

function rollWeather(difficulty, region) {
  const rates = MODIFIER_FIRE_RATES[difficulty];
  if (Math.random() > rates.weather) return null;
  const regionExcludes = region ? region.toLowerCase() : '';
  const eligible = WEATHER.filter(w => {
    if (!w.requires) return true;
    const exc = w.requires.toLowerCase();
    if (exc.includes('not in southern us') && regionExcludes.includes('tropical')) return false;
    if (exc.includes('not in desert southwest') && regionExcludes.includes('sprawl')) return false;
    return true;
  });
  return eligible.length > 0 ? pickRandom(eligible).text : null;
}

function rollSpecialCircumstance(difficulty, category) {
  const rates = MODIFIER_FIRE_RATES[difficulty];
  if (Math.random() > rates.special_circumstances) return null;
  const eligible = SPECIAL_CIRCUMSTANCES.filter(sc => {
    if (!sc.requires) return true;
    const req = sc.requires.toLowerCase();
    if (req.includes('cardiac arrest') && category !== 'arrest') return false;
    if (req.includes('doa') && category !== 'doa') return false;
    if (req.includes('opioid') && category !== 'toxicology') return false;
    if (req.includes('pediatric') && category !== 'pediatric') return false;
    if (req.includes('arrest') && !['arrest', 'cardiac'].includes(category)) return false;
    return true;
  });
  return eligible.length > 0 ? pickRandom(eligible).text : null;
}

function rollComorbidity(difficulty, category, ageGroup) {
  const rate = MODIFIER_FIRE_RATES[difficulty].comorbidity_gate;
  if (Math.random() > rate) return null;

  const eligible = COMORBIDITIES.filter(b => {
    if (b.id === 'otherwise_healthy') return false;
    if (b.age_groups.length > 0 && !b.age_groups.includes(ageGroup)) return false;
    if (b.rolls_on_categories.length > 0 && !b.rolls_on_categories.includes(category)) {
      if (!b.rolls_on_categories.includes('all')) return false;
    }
    return true;
  });

  if (eligible.length === 0) return null;
  return weightedRandom(eligible, b => b.weight).id;
}

function pickCrew(regionId, history) {
  const region = REGIONS.find(r => r.id === regionId);
  const pool = region ? region.crew_pool : ['partner', 'captain'];

  const recentCrew = new Set((history.crew || []).slice(-HISTORY_WINDOWS.crew));

  // Pick partner
  const partnerRoles = pool.filter(r => r.startsWith('partner'));
  const captainRoles = pool.filter(r => r.startsWith('captain'));

  const partnerPool = CREW.filter(c => partnerRoles.includes(c.role) && !recentCrew.has(c.name));
  const captainPool = CREW.filter(c => captainRoles.includes(c.role) && !recentCrew.has(c.name));

  const partner = partnerPool.length > 0 ? pickRandom(partnerPool) : pickRandom(CREW.filter(c => partnerRoles.includes(c.role)));
  const captain = captainPool.length > 0 ? pickRandom(captainPool) : pickRandom(CREW.filter(c => captainRoles.includes(c.role)));

  return { partner: partner ? partner.name : null, captain: captain ? captain.name : null };
}

/**
 * Roll a complete scenario seed.
 *
 * @param {object} opts
 * @param {string} opts.difficulty   'EASY' | 'NORMAL' | 'HARD'
 * @param {string} opts.provider_level  'ALS' | 'BLS'
 * @param {string} opts.region_id    region ID string
 * @param {string} opts.user_id
 * @param {object} opts.history      { categories[], presentations[], crew[], doa_positions[], arrest_positions[], total_count }
 */
function rollScenario(opts = {}) {
  const { difficulty = 'NORMAL', provider_level = 'ALS', region_id = 'SUBURBAN', unit_name = 'Medic 1', user_id = null, history = {} } = opts;

  const curveballWeight = CURVEBALL_WEIGHTS[difficulty];
  const category = pickCategory(difficulty, history, curveballWeight);
  const presentation = pickPresentation(category, difficulty, history);

  if (!presentation) throw new Error(`No eligible presentation for category: ${category}`);

  const ageGroup = rollAgeGroup(category, presentation);
  const age = rollAgeFromGroup(ageGroup);
  const sex = rollSex(presentation);
  const patientName = rollPatientName(sex);
  const trajectory = category === 'doa' ? 'stable' : rollTrajectory(difficulty);
  const decompensationClock = category === 'doa' ? null : rollDecompensationClock(difficulty, trajectory);
  const complication = rollComplication(difficulty);
  const callerBehavior = rollCallerBehavior(category);
  const timeOfDay = rollTimeOfDay();

  const region = REGIONS.find(r => r.id === region_id);
  const regionLabel = region ? region.id : region_id;
  const weather = rollWeather(difficulty, regionLabel);
  const specialCircumstance = rollSpecialCircumstance(difficulty, category);
  const comorbidityBundle = rollComorbidity(difficulty, category, ageGroup);
  const crew = pickCrew(region_id, history);

  const isCurveball = category === 'curveballs';

  return {
    scenario_id: generateId(),
    user_id,
    timestamp_start: new Date().toISOString(),
    category,
    presentation: presentation.presentation || presentation.surface_presentation,
    true_diagnosis: isCurveball ? presentation.true_diagnosis : null,
    reveal_trigger: isCurveball ? presentation.reveal_trigger : null,
    hint: presentation.hint,
    special_flags: presentation.special_flags || null,
    patient_name: patientName,
    patient_age: age,
    age_group: ageGroup,
    sex,
    comorbidity_bundle: comorbidityBundle,
    trajectory,
    decompensation_clock: decompensationClock,
    complication_roll: complication.roll,
    complication_type: complication.type,
    caller_behavior: callerBehavior,
    time_of_day: timeOfDay,
    weather,
    special_circumstance: specialCircumstance,
    crew_partner: crew.partner,
    crew_captain: crew.captain,
    crew_transport_driver: crew.captain || crew.partner,
    crew_in_back: crew.captain ? [crew.partner] : [],
    region: region_id,
    provider_level,
    difficulty,
    unit_name,
    events: [],
  };
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

module.exports = { rollScenario };
