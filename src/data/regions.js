'use strict';

const REGIONS = [
  {
    id: "URBAN_DENSE", examples: "Chicago, NYC, Toronto\n", response_times: "4-6 minutes",
    nearest_hospital_min: "5-10 minutes", major_hospital_min: "7-14 minutes", als_availability: "always available, close",
    weather_weights: "full four seasons", agency_culture: "high call volume, protocol-driven, seen everything", scope_of_practice: "ALS with no RSI",
    medical_direction_culture: "hospital patch, usually fast", als_scope_tag: "restricted",
    crew_pool: ["partner", "captain"], acuity_minimum: "EASY", bls_scope_notes: "BLS provides oxygen, CPR, AED, glucose gel, epi autoinjector, aspirin assist. No BGL in some systems. ALS always available as backup.",
  },
  {
    id: "URBAN_SPRAWL", examples: "Houston, Phoenix, Los Angeles", response_times: "6-10 minutes",
    nearest_hospital_min: "10-20 minutes", major_hospital_min: "20-30 minutes", als_availability: "available, moderate response",
    weather_weights: "heat weighted heavily, ice excluded", agency_culture: "mixed, car dependant", scope_of_practice: "full ALS with RSI, blood, finger thoracotomy",
    medical_direction_culture: "standard", als_scope_tag: "full",
    crew_pool: ["partner", "captain"], acuity_minimum: "EASY", bls_scope_notes: "BLS provides full standard BLS scope. ALS backup available moderate wait.",
  },
  {
    id: "SUBURBAN", examples: "Generic midwest or mid-atlantic suburb", response_times: "6-8 minutes",
    nearest_hospital_min: "10-15 minutes", major_hospital_min: "20-30 minutes ", als_availability: "available but may be cross-staffed",
    weather_weights: "standard four season", agency_culture: "mixed volunteer and career, \n               pride in community, less jaded", scope_of_practice: "full ALS with RSI",
    medical_direction_culture: "standard", als_scope_tag: "full",
    crew_pool: ["partner", "captain", "partner_BLS", "captain_BLS"], acuity_minimum: "EASY", bls_scope_notes: "BLS provides full standard BLS scope. Volunteer BLS crews common. ALS backup available but may be cross-staffed.",
  },
  {
    id: "RURAL_TEMPERATE", examples: "Rural Ontario, Rural Pennsylvania", response_times: "12-20 minutes",
    nearest_hospital_min: "30-50 minutes", major_hospital_min: "60-100 minutes", als_availability: "may not exist, air medical possible",
    weather_weights: "winter weighted, fog, ice", agency_culture: "volunteer heavy, deeply community connected,\n               crew may know the patient personally", scope_of_practice: "may be BLS only. If ALS, you are the only medic",
    medical_direction_culture: "difficult, cell service variable", als_scope_tag: "variable",
    crew_pool: ["partner_BLS", "captain_BLS"], acuity_minimum: "NORMAL", bls_scope_notes: "Frequently BLS only. ALS provider operating alone without backup is the ALS variant. BLS scope: standard EMT-B. No IO, no RSI, no cardiac medications without medical direction patch.",
  },
  {
    id: "RURAL_REMOTE", examples: "Northern Alberta, Rural Montana, Northern Ontario", response_times: "20-40 minutes",
    nearest_hospital_min: "60-120 minutes", major_hospital_min: "360-720 minutes, air medical primary", als_availability: "rarely available",
    weather_weights: "extreme cold weighted, \n                blizzard, ice, wildlife hazard", agency_culture: "volunteer, isolated, \n               extended scene time expected and accepted", scope_of_practice: "ALS with RSI",
    medical_direction_culture: "satellite phone possible, \n            radio often unreliable", als_scope_tag: "full",
    crew_pool: ["partner_BLS", "captain_BLS"], acuity_minimum: "NORMAL", bls_scope_notes: "BLS scope only for most calls. ALS unavailable. Standard EMT-B interventions. Air medical is primary ALS escalation — weather dependent. Expect to operate entirely within BLS scope even as an ALS provider.",
  },
  {
    id: "NORTHERN_URBAN", examples: "Winnipeg, Edmonton, Anchorage", response_times: "6-10 minutes",
    nearest_hospital_min: "10-20 minutes", major_hospital_min: "30-40 minutes", als_availability: "available",
    weather_weights: "extreme cold heavily weighted,\n                blizzard, ice, black ice standard", agency_culture: "experienced with environmental emergencies,\n               cold weather protocols standard", scope_of_practice: "ALS",
    medical_direction_culture: "standard", als_scope_tag: "full",
    crew_pool: ["partner", "captain"], acuity_minimum: "EASY", bls_scope_notes: "Full standard BLS scope. ALS available. Cold weather protocols standard for all providers.",
  },
  {
    id: "TROPICAL_ISLAND", examples: "Hawaii, Puerto Rico, Caribbean EMS systems", response_times: "8-15 minutes",
    nearest_hospital_min: "15-40 minutes", major_hospital_min: "40-60 minutes air medical for inter-island", als_availability: "variable",
    weather_weights: "heat, humidity, \n                hurricane season possible", agency_culture: "community-oriented, \n               heat and humidity baseline", scope_of_practice: "ALS with no RSI",
    medical_direction_culture: "standard", als_scope_tag: "restricted",
    crew_pool: ["partner", "captain", "partner_BLS", "captain_BLS"], acuity_minimum: "EASY", bls_scope_notes: "BLS scope: standard EMT-B. ALS restricted — no RSI in most systems. Inter-island transport via air medical for critical patients.",
  },
  {
    id: "INTERNATIONAL_DEVELOPING", examples: "Rural Mexico, parts of Central America", response_times: "15-30 minutes",
    nearest_hospital_min: "30-90 minutes", major_hospital_min: "120-240 minutes", als_availability: "unlikely",
    weather_weights: "heat, rain, flooding", agency_culture: "resource-constrained, \n               improvisation expected", scope_of_practice: "basic to intermediate only",
    medical_direction_culture: "unreliable", als_scope_tag: "none",
    crew_pool: ["partner_BLS", "captain_BLS"], acuity_minimum: "HARD", bls_scope_notes: "BLS and basic intermediate scope only. Resource-constrained — not all standard BLS equipment may be available. Improvisation expected. No ALS backup. Long transport.",
  },
  {
    id: "CALIFORNIA_Urban", examples: "Los Angeles / San Francisco / Sacramento", response_times: "6-10 minutes",
    nearest_hospital_min: "8-15 minutes ", major_hospital_min: "10-20 minutes", als_availability: "available but may be slow to respond",
    weather_weights: "heat in inland valleys, fog on coast, \n         wildfire smoke seasonally significant,\n         earthquake not a weather event but worth noting\n         as a special circumstance possibility", agency_culture: "high call volume, burnout prevalent, \n         us-vs-them dynamic between field and administration,\n         crews are experienced but often demoralized,\n         documentation-heavy, liability-averse decisions common,\n         transport-first mentality even when scene stabilization \n         is clearly indicated. Fire vs Private EMS", scope_of_practice: "ALS and BLS crews. significantly restricted vs national standards\n       — BLS crews cannot take BGL and have no cardiac monitor\n       — No intubations or cricothyrotomy -Requires base contact to initiate Pacing, Push dose epinephrine, cardioversion",
    medical_direction_culture: "required frequently, often slow, \n            MD may override your clinical judgment on scene,\n            base hospital may deny orders that are \n            standard of care elsewhere", als_scope_tag: "restricted",
    crew_pool: ["partner", "captain"], acuity_minimum: "EASY", bls_scope_notes: "BLS scope significantly restricted vs national standard — no BGL, no cardiac monitoring in some systems. ALS requires base contact for most medications. RSI unavailable in most California urban systems.",
  },
];

module.exports = { REGIONS };
