'use strict';

const { rollScenario } = require('../src/engine/roller');
const { assembleSeedBlock } = require('../src/engine/assembler');
const { detectAndRoll, rollProcedure } = require('../src/engine/dice');
const { INTERVENTIONS } = require('../src/data/interventions');
const { SCENARIO_POOLS } = require('../src/data/scenarios/index');
const { CATEGORY_WEIGHTS } = require('../src/data/config');

// ---- Pool inventory ----
console.log('\n=== SCENARIO POOL COUNTS ===');
let total = 0;
for (const [cat, pool] of Object.entries(SCENARIO_POOLS)) {
  const byDiff = { EASY: 0, NORMAL: 0, HARD: 0 };
  for (const e of pool) {
    const d = e.difficulty || 'NORMAL';
    if (byDiff[d] !== undefined) byDiff[d]++;
  }
  console.log(`  ${cat.padEnd(12)} ${pool.length} total  EASY:${byDiff.EASY} NORMAL:${byDiff.NORMAL} HARD:${byDiff.HARD}`);
  total += pool.length;
}
console.log(`  ${'TOTAL'.padEnd(12)} ${total}`);

console.log('\n=== INTERVENTIONS ===');
const noRoll = INTERVENTIONS.filter(i => i.no_roll).length;
const withDC  = INTERVENTIONS.filter(i => !i.no_roll).length;
console.log(`  ${INTERVENTIONS.length} procedures: ${withDC} with DC, ${noRoll} no-roll`);

// ---- Category weight distribution ----
console.log('\n=== CATEGORY WEIGHTS ===');
const totalWeight = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
for (const [cat, w] of Object.entries(CATEGORY_WEIGHTS)) {
  const pct = ((w / totalWeight) * 100).toFixed(1);
  console.log(`  ${cat.padEnd(12)} weight=${w}  (~${pct}%)`);
}

// ---- Roll 10 scenarios ----
const difficulties = ['EASY', 'NORMAL', 'HARD'];
const regions = ['URBAN_DENSE', 'SUBURBAN', 'RURAL_TEMPERATE', 'RURAL_REMOTE'];

console.log('\n=== ROLLING 10 SCENARIOS ===');
const history = { categories: [], presentations: [], crew: [], doa_positions: [], arrest_positions: [], total_count: 0 };

for (let i = 0; i < 10; i++) {
  const diff = difficulties[i % 3];
  const region = regions[i % 4];

  const seed = rollScenario({ difficulty: diff, provider_level: 'ALS', region_id: region, user_id: 'test-user', history });

  // Update history
  history.categories.push(seed.category);
  history.presentations.push(seed.presentation);
  if (seed.crew_partner) history.crew.push(seed.crew_partner);
  if (seed.category === 'doa') history.doa_positions.push(history.total_count);
  if (seed.category === 'arrest') history.arrest_positions.push(history.total_count);
  history.total_count++;

  const isCurveball = !!seed.true_diagnosis;
  const complication = seed.complication_type !== 'none' ? `⚡${seed.complication_type}` : '';
  const special = seed.special_circumstance ? '🎭SC' : '';

  console.log(`\n[${i + 1}] ${diff} | ${region} | ${seed.category}`);
  console.log(`    ${isCurveball ? '[CURVEBALL] ' : ''}${seed.presentation.substring(0, 80)}${seed.presentation.length > 80 ? '...' : ''}`);
  console.log(`    Age: ${seed.patient_age}y ${seed.sex} | ${seed.age_group} | Traj: ${seed.trajectory} | Decomp: ${seed.decompensation_clock ?? 'N/A'}min`);
  console.log(`    Comorbidity: ${seed.comorbidity_bundle || 'none'} | Complication: ${seed.complication_type} ${complication}${special}`);
  console.log(`    Partner: ${seed.crew_partner} | Time: ${seed.time_of_day.substring(0, 4)}`);
}

// ---- Dice engine test ----
console.log('\n=== DICE ENGINE TEST ===');
const testPhrases = [
  'start a line',
  'intubate the patient',
  'run a 12 lead',
  'give epinephrine 1mg IV',
  'needle decompression right side',
  'start CPR',
  'apply oxygen via NRB',
  'cardiovert at 150 joules',
  'bag the patient with BVM',
  'tourniquet to the left leg',
];

for (const phrase of testPhrases) {
  const result = detectAndRoll(phrase, {}, 'NORMAL');
  if (result) {
    if (result.no_roll) {
      console.log(`  "${phrase.substring(0, 35).padEnd(35)}" → ${result.procedure_id} [NO ROLL]`);
    } else {
      console.log(`  "${phrase.substring(0, 35).padEnd(35)}" → ${result.procedure_id} DC:${result.dc} roll:${result.roll} → ${result.outcome}`);
    }
  } else {
    console.log(`  "${phrase.substring(0, 35).padEnd(35)}" → [not detected]`);
  }
}

// ---- Seed block preview for scenario 1 ----
console.log('\n=== SEED BLOCK PREVIEW (scenario 1) ===');
const previewSeed = rollScenario({ difficulty: 'HARD', provider_level: 'ALS', region_id: 'CALIFORNIA_Urban', history });
const block = assembleSeedBlock(previewSeed);
console.log(block);
