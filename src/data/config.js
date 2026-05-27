'use strict';

const CATEGORY_WEIGHTS = {
  medical: 18,
  trauma: 15,
  cardiac: 12,
  respiratory: 10,
  behavioral: 8,
  neuro: 7,
  toxicology: 7,
  arrest: 6,
  curveballs: 6,
  pediatric: 5,
  doa: 4,
  ob: 2,
};

const DIFFICULTY_POOL = {
  EASY:   { EASY: true,  NORMAL: false, HARD: false },
  NORMAL: { EASY: true,  NORMAL: true,  HARD: false },
  HARD:        { EASY: true,  NORMAL: true,  HARD: true  },
  BLACK_CLOUD:  { EASY: true,  NORMAL: true,  HARD: true  },
};

const MODIFIER_FIRE_RATES = {
  EASY: {
    caller_behavior: 1.0, time_of_day: 1.0, weather: 0,    special_circumstances: 0,    comorbidity_gate: 0.50,
  },
  NORMAL: {
    caller_behavior: 1.0, time_of_day: 1.0, weather: 1/3,  special_circumstances: 1/6,  comorbidity_gate: 0.70,
  },
  HARD: {
    caller_behavior: 1.0, time_of_day: 1.0, weather: 0.50, special_circumstances: 1/3,  comorbidity_gate: 0.85,
  },
  BLACK_CLOUD: {
    caller_behavior: 1.0, time_of_day: 1.0, weather: 1.0,  special_circumstances: 0.5,  comorbidity_gate: 1.0,
  },
};

const COMPLICATION_THRESHOLDS = {
  EASY:   { enabled: false },
  NORMAL: { enabled: true, equipment_failure: [5,6], unreliable_bystander: [5,6], clinical_curveball: [6] },
  HARD:   { enabled: true, equipment_failure: [4,5,6], unreliable_bystander: [4,5,6], clinical_curveball: [5,6] },
};

const HARD_MODE_DC_PENALTY    = 2;
const BLACK_CLOUD_DC_PENALTY  = 5;  // universe is working against you

const CURVEBALL_WEIGHTS = { EASY: 0, NORMAL: 6, HARD: 9 };

const HISTORY_WINDOWS = {
  category:     10,
  presentation: 30,
  crew:         5,
  curveball:    20,
  doa_spacing:  8,
  arrest_spacing: 5,
  ob_spacing:   10,
  zoo_spacing:  12,  // zoo scenarios span categories — space them globally
};

const RATE_LIMITS = {
  FREE: {
    scenarios_per_day: 3,
    debrief: 'partial',
    protocol_injection: false,
    custom_uploads: false,
    history_stored: 10,
    max_api_spend_usd: 0.50,
  },
  PAID: {
    scenarios_per_day: Infinity,
    debrief: 'full',
    protocol_injection: true,
    custom_uploads: true,
    history_stored: Infinity,
    max_api_spend_usd: 2.00,
  },
};

const NIGHT_HOURS = [22, 23, 0, 1, 2, 3, 4, 5];

module.exports = {
  CATEGORY_WEIGHTS,
  DIFFICULTY_POOL,
  MODIFIER_FIRE_RATES,
  COMPLICATION_THRESHOLDS,
  HARD_MODE_DC_PENALTY,
  BLACK_CLOUD_DC_PENALTY,
  CURVEBALL_WEIGHTS,
  HISTORY_WINDOWS,
  RATE_LIMITS,
  NIGHT_HOURS,
};
