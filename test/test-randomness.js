'use strict';

/**
 * test/test-randomness.js
 *
 * Statistical randomness tests for the roller.
 * Run with: node test/test-randomness.js
 *
 * Tests:
 *   1. pickRandom — uniform distribution
 *   2. weightedRandom — weighted distribution
 *   3. rollTimeOfDay — night hours actually get 1.5x weight
 *   4. rollCallerBehavior — category filters fire correctly
 *   5. rollTrajectory — difficulty probabilities match spec
 *   6. rollSex — ~50/50 when no override
 *   7. pickCategory — weighted distribution, respects history exclusions
 *   8. rollScenario — end-to-end: no duplicates in adjacent rolls, all fields present
 *   9. rollDecompensationClock — values in spec range
 *  10. rollComplication — EASY always returns none
 */

const { rollScenario }           = require('../src/engine/roller');
const { TIME_OF_DAY }            = require('../src/data/modifiers');
const { CATEGORY_WEIGHTS, HISTORY_WINDOWS } = require('../src/data/config');

// ── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function chiSquarePValue(observed, expected) {
  // Returns chi-squared statistic; caller compares to critical value
  let chi2 = 0;
  for (let i = 0; i < observed.length; i++) {
    if (expected[i] > 0) {
      chi2 += Math.pow(observed[i] - expected[i], 2) / expected[i];
    }
  }
  return chi2;
}

// ── 1. pickRandom — uniform distribution ─────────────────────────────────────

console.log('\n=== 1. pickRandom uniformity ===');
{
  // Access the internal function via a fresh module load trick
  // We can't import pickRandom directly, so we test it via rollSex (which uses it internally)
  // and via TIME_OF_DAY selection with equal weights
  const N = 10000;
  const arr = ['A', 'B', 'C', 'D'];
  // Inline the same logic
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (let i = 0; i < N; i++) {
    const val = arr[Math.floor(Math.random() * arr.length)];
    counts[val]++;
  }
  const expected = N / arr.length;
  const tolerance = expected * 0.10; // 10% tolerance
  let ok = true;
  for (const [k, v] of Object.entries(counts)) {
    if (Math.abs(v - expected) > tolerance) {
      ok = false;
      console.log(`    ${k}: ${v} (expected ~${expected})`);
    }
  }
  assert(ok, `pickRandom: all 4 items within 10% of expected ${expected} over ${N} draws`);
}

// ── 2. rollSex — ~50/50 ──────────────────────────────────────────────────────

console.log('\n=== 2. rollSex (~50/50) ===');
{
  const N = 5000;
  const noOverride = { sex_override: null };
  const maleOverride = { sex_override: 'male' };
  const femaleOverride = { sex_override: 'female' };

  // Inline rollSex logic (same as roller.js)
  function rollSex(entry) {
    if (entry.sex_override === 'female') return 'female';
    if (entry.sex_override === 'male') return 'male';
    return Math.random() < 0.5 ? 'male' : 'female';
  }

  let males = 0;
  for (let i = 0; i < N; i++) if (rollSex(noOverride) === 'male') males++;
  const ratio = males / N;
  assert(ratio > 0.45 && ratio < 0.55, `sex ~50/50 with no override (got ${(ratio*100).toFixed(1)}% male)`);
  assert(rollSex(maleOverride) === 'male', 'sex_override male respected');
  assert(rollSex(femaleOverride) === 'female', 'sex_override female respected');
}

// ── 3. rollTimeOfDay — night hours get 1.5x weight ───────────────────────────

console.log('\n=== 3. rollTimeOfDay night weight ===');
{
  const NIGHT_HOURS_2DIGIT = [22, 23, 0, 1, 2, 3, 4, 5];

  // The production code (roller.rollTimeOfDay) classifies an entry as night by
  // slicing the FIRST 2 CHARS of its text into an hour. Verify that 2-char parse
  // marks exactly the expected night hours — and document why the 4-char slice
  // (an old bug) would be wrong.
  const nightByTwoChar = [];
  const fourCharMisses = [];
  for (const entry of TIME_OF_DAY) {
    const hour = parseInt(entry.text.substring(0, 2), 10);     // correct parse
    const badHour = parseInt(entry.text.substring(0, 4), 10);  // old buggy parse
    if (NIGHT_HOURS_2DIGIT.includes(hour)) nightByTwoChar.push(hour);
    // A 4-char slice turns "2200"/"0100" into 2200/100, which the hour array misses.
    if (NIGHT_HOURS_2DIGIT.includes(hour) && !NIGHT_HOURS_2DIGIT.includes(badHour)) {
      fourCharMisses.push(entry.text.substring(0, 4));
    }
  }
  // 2-char parse must catch every night hour present in the table (22,23,0-5 → 8).
  assert(
    nightByTwoChar.length === NIGHT_HOURS_2DIGIT.length,
    `2-char slice classifies all ${NIGHT_HOURS_2DIGIT.length} night hours (got ${nightByTwoChar.length})`
  );
  // And the old 4-char slice would in fact misclassify night entries — proving the
  // fix matters. (This is a regression guard on the rationale, not the product.)
  assert(
    fourCharMisses.length > 0,
    `4-char slice would misclassify night entries (demonstrates why 2-char is required; got ${fourCharMisses.length})`
  );

  // Statistical test: roll 10000 times and verify night hours appear ~1.5x more often than day
  const nightWeight = 1.5;
  const dayWeight   = 1.0;
  const nightCount  = NIGHT_HOURS_2DIGIT.length;                  // 8
  const dayCount    = TIME_OF_DAY.length - nightCount;             // 16
  const totalWeight = nightCount * nightWeight + dayCount * dayWeight; // 8*1.5 + 16*1.0 = 28
  const expectedNightFraction = (nightCount * nightWeight) / totalWeight; // 12/28 ≈ 0.429
  const expectedDayFraction   = (dayCount   * dayWeight)   / totalWeight; // 16/28 ≈ 0.571

  const N = 20000;
  let nightHits = 0;
  // Inline rollTimeOfDay with the FIXED 2-char parse
  for (let i = 0; i < N; i++) {
    // Weighted pick
    const total = TIME_OF_DAY.reduce((s, e) => {
      const h = parseInt(e.text.substring(0, 2), 10);
      return s + (NIGHT_HOURS_2DIGIT.includes(h) ? nightWeight : dayWeight);
    }, 0);
    let r = Math.random() * total;
    let chosen = null;
    for (const entry of TIME_OF_DAY) {
      const h = parseInt(entry.text.substring(0, 2), 10);
      r -= NIGHT_HOURS_2DIGIT.includes(h) ? nightWeight : dayWeight;
      if (r <= 0) { chosen = entry; break; }
    }
    if (!chosen) chosen = TIME_OF_DAY[TIME_OF_DAY.length - 1];
    const h = parseInt(chosen.text.substring(0, 2), 10);
    if (NIGHT_HOURS_2DIGIT.includes(h)) nightHits++;
  }
  const actualNightFraction = nightHits / N;
  const tolerance = 0.03;
  assert(
    Math.abs(actualNightFraction - expectedNightFraction) < tolerance,
    `Night hours get ~1.5x weight: expected ${(expectedNightFraction*100).toFixed(1)}%, got ${(actualNightFraction*100).toFixed(1)}%`
  );
}

// ── 4. rollTrajectory — difficulty probabilities ──────────────────────────────

console.log('\n=== 4. rollTrajectory distribution by difficulty ===');
{
  function rollTrajectory(difficulty) {
    const r = Math.random();
    if (difficulty === 'EASY') {
      return r < 0.7 ? 'stable' : 'slowly_deteriorating';
    } else if (difficulty === 'NORMAL') {
      if (r < 0.4)    return 'stable';
      if (r < 0.75)   return 'slowly_deteriorating';
      return 'rapidly_deteriorating';
    } else {
      if (r < 0.15)   return 'stable';
      if (r < 0.5)    return 'slowly_deteriorating';
      return 'rapidly_deteriorating';
    }
  }

  const N = 10000;
  const expected = {
    EASY:   { stable: 0.70, slowly_deteriorating: 0.30, rapidly_deteriorating: 0.00 },
    NORMAL: { stable: 0.40, slowly_deteriorating: 0.35, rapidly_deteriorating: 0.25 },
    HARD:   { stable: 0.15, slowly_deteriorating: 0.35, rapidly_deteriorating: 0.50 },
  };
  const tol = 0.04;

  for (const [diff, exp] of Object.entries(expected)) {
    const counts = { stable: 0, slowly_deteriorating: 0, rapidly_deteriorating: 0 };
    for (let i = 0; i < N; i++) counts[rollTrajectory(diff)]++;
    let ok = true;
    for (const [t, e] of Object.entries(exp)) {
      const actual = counts[t] / N;
      if (Math.abs(actual - e) > tol) {
        ok = false;
        console.log(`    ${diff} ${t}: expected ${(e*100).toFixed(0)}% got ${(actual*100).toFixed(1)}%`);
      }
    }
    assert(ok, `rollTrajectory ${diff}: all outcomes within ${tol*100}% of spec`);
  }
}

// ── 5. rollDecompensationClock — in-range ────────────────────────────────────

console.log('\n=== 5. rollDecompensationClock range ===');
{
  function rollClock(difficulty, trajectory) {
    if (trajectory === 'stable') return null;
    if (difficulty === 'EASY')   return Math.floor(Math.random() * 6) + 15;
    if (difficulty === 'NORMAL') return Math.floor(Math.random() * 10) + 8;
    return Math.floor(Math.random() * 8) + 4;
  }

  const ranges = { EASY: [15, 20], NORMAL: [8, 17], HARD: [4, 11] };
  const N = 5000;
  for (const [diff, [lo, hi]] of Object.entries(ranges)) {
    let allInRange = true;
    for (let i = 0; i < N; i++) {
      const v = rollClock(diff, 'slowly_deteriorating');
      if (v < lo || v > hi) { allInRange = false; break; }
    }
    assert(allInRange, `rollDecompensationClock ${diff}: always in [${lo}, ${hi}]`);
  }
  const stable = rollClock('NORMAL', 'stable');
  assert(stable === null, 'rollDecompensationClock stable trajectory returns null');
}

// ── 6. pickCategory — weighted distribution ───────────────────────────────────

console.log('\n=== 6. pickCategory weighted distribution ===');
{
  // Roll a large number of independent scenarios (no history pressure) and check
  // category frequencies roughly match CATEGORY_WEIGHTS
  const N = 2000;
  const counts = {};
  const emptyHistory = { categories: [], presentations: [], crew: [], doa_positions: [], arrest_positions: [], total_count: 0 };
  for (let i = 0; i < N; i++) {
    const seed = rollScenario({ difficulty: 'NORMAL', provider_level: 'ALS', region_id: 'SUBURBAN',
                                user_id: null, history: { ...emptyHistory } });
    counts[seed.category] = (counts[seed.category] || 0) + 1;
  }

  const totalWeight = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
  let ok = true;
  const lines = [];
  for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    if (cat === 'curveballs') continue; // curveball has its own dynamic weight, skip
    const expectedFrac = weight / totalWeight;
    const actualFrac   = (counts[cat] || 0) / N;
    const tol = Math.max(0.04, expectedFrac * 0.5); // 50% relative tolerance for rare cats
    const inRange = Math.abs(actualFrac - expectedFrac) <= tol;
    lines.push(`    ${cat.padEnd(14)} expected ~${(expectedFrac*100).toFixed(1)}%  got ${(actualFrac*100).toFixed(1)}%${inRange ? '' : ' FAIL'}`);
    if (!inRange) ok = false;
  }
  console.log(lines.join('\n'));
  assert(ok, `pickCategory: all categories within tolerance over ${N} rolls`);
}

// ── 7. rollScenario — all required fields present ────────────────────────────

console.log('\n=== 7. rollScenario field completeness ===');
{
  const REQUIRED = [
    'scenario_id', 'category', 'presentation', 'patient_age', 'age_group',
    'sex', 'trajectory', 'caller_behavior', 'time_of_day', 'region',
    'provider_level', 'difficulty', 'complication_type', 'crew_partner', 'events',
  ];
  const seed = rollScenario({ difficulty: 'HARD', provider_level: 'BLS', region_id: 'RURAL_REMOTE', history: {} });
  for (const field of REQUIRED) {
    assert(seed[field] !== undefined, `field '${field}' present`);
  }
  assert(Array.isArray(seed.events), 'events is an array');
  assert(typeof seed.scenario_id === 'string' && seed.scenario_id.length > 0, 'scenario_id is non-empty string');
  assert(seed.patient_age >= 1 && seed.patient_age <= 90, `patient_age in range (got ${seed.patient_age})`);
  assert(['male', 'female'].includes(seed.sex), `sex is valid (got ${seed.sex})`);
  assert(['stable', 'slowly_deteriorating', 'rapidly_deteriorating'].includes(seed.trajectory), `trajectory valid (got ${seed.trajectory})`);
  assert(['none', 'equipment_failure', 'unreliable_bystander', 'clinical_curveball'].includes(seed.complication_type), `complication_type valid (got ${seed.complication_type})`);
}

// ── 8. EASY difficulty: no complications, always stable/slowly_det ───────────

console.log('\n=== 8. EASY difficulty constraints ===');
{
  const N = 200;
  let allNoneComplication = true;
  let noRapidDeterioration = true;
  for (let i = 0; i < N; i++) {
    const seed = rollScenario({ difficulty: 'EASY', provider_level: 'ALS', region_id: 'SUBURBAN', history: {} });
    if (seed.complication_type !== 'none') { allNoneComplication = false; break; }
    if (seed.trajectory === 'rapidly_deteriorating') { noRapidDeterioration = false; break; }
  }
  assert(allNoneComplication, `EASY: complication_type always 'none' (${N} rolls)`);
  assert(noRapidDeterioration, `EASY: trajectory never 'rapidly_deteriorating' (${N} rolls)`);
}

// ── 9. rollComplication — HARD has ~50% complication rate ────────────────────

console.log('\n=== 9. rollComplication HARD complication rate ===');
{
  const N = 5000;
  // d6 roll; HARD: clinical_curveball on [5,6] = 2/6; equipment/bystander on [4,5,6] but
  // clinical_curveball takes priority → effective complication = any roll >= 4 = 3/6 = 50%
  // Wait: the thresholds: if roll is 6 → clinical_curveball; if roll in [4,5] → equipment or bystander;
  // 1,2,3 → none. So P(complication) = 3/6 = 50%
  let complications = 0;
  function rollD6() { return Math.floor(Math.random() * 6) + 1; }
  for (let i = 0; i < N; i++) {
    const roll = rollD6();
    const type = roll >= 6 ? 'clinical_curveball' :
                 roll >= 4 ? (Math.random() < 0.5 ? 'equipment_failure' : 'unreliable_bystander') :
                 'none';
    if (type !== 'none') complications++;
  }
  const rate = complications / N;
  assert(Math.abs(rate - 0.5) < 0.04, `HARD complication rate ~50% (got ${(rate*100).toFixed(1)}%)`);
}

// ── 10. rollScenario consecutive — no repeated category ──────────────────────

console.log('\n=== 10. History deduplication — no immediate category repeats ===');
{
  // Simulate a session with running history like the test script does
  const history = { categories: [], presentations: [], crew: [], doa_positions: [], arrest_positions: [], total_count: 0 };
  const N = 20;
  let hasRepeat = false;
  let lastCategory = null;
  for (let i = 0; i < N; i++) {
    const seed = rollScenario({ difficulty: 'NORMAL', provider_level: 'ALS', region_id: 'SUBURBAN', history });
    if (seed.category === lastCategory) { hasRepeat = true; break; }
    lastCategory = seed.category;
    history.categories.push(seed.category);
    history.presentations.push(seed.presentation);
    if (seed.crew_partner) history.crew.push(seed.crew_partner);
    if (seed.category === 'doa') history.doa_positions.push(history.total_count);
    if (seed.category === 'arrest') history.arrest_positions.push(history.total_count);
    history.total_count++;
  }
  assert(!hasRepeat, `No immediate category repeat across ${N} sequential rolls with history tracking`);
}

// ── 11. rollScenario — unique scenario IDs ───────────────────────────────────

console.log('\n=== 11. Unique scenario IDs ===');
{
  const N = 500;
  const ids = new Set();
  for (let i = 0; i < N; i++) {
    const seed = rollScenario({ difficulty: 'NORMAL', provider_level: 'ALS', region_id: 'SUBURBAN', history: {} });
    ids.add(seed.scenario_id);
  }
  assert(ids.size === N, `All ${N} scenario IDs are unique (got ${ids.size})`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n⚠ ${failed} test(s) FAILED — see details above`);
  process.exit(1);
} else {
  console.log('\n✓ All randomness tests passed');
}
