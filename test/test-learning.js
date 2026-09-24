'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { evaluateObjectives, decisionTimeline } = require('../src/engine/learning');

test('review preserves the call record without manufacturing objectives or questions', () => {
  const review = evaluateObjectives({ category: 'arrest', learning_objectives: ['initial_approach', 'interventions', 'handoff'] }, [
    { user: 'Go inside and lay eyes on the patient', assistant: 'The patient is unresponsive.', sceneMinute: 1, vitals: { GCS: 3, PulseOx: { quality: 'absent', trueSpO2: 45 } } },
    { user: 'Obtain IO access. Continue CPR', assistant: 'The IO flushes without extravasation.', sceneMinute: 8, rolls: [
      { procedure_id: 'cpr', outcome: 'SUCCESS', roll: 17, dc: 12 },
      { procedure_id: 'io_access', outcome: 'SUCCESS', roll: 19, dc: 7 },
    ] },
    { user: 'Obtain another IV', assistant: 'No catheter can be advanced.', sceneMinute: 20, rolls: [
      { procedure_id: 'peripheral_iv', outcome: 'FAILURE', roll: 4, dc: 10 },
    ] },
    { user: 'Give the bedside handoff', assistant: 'Transfer completed.', sceneMinute: 24, report: true },
  ]);
  assert.equal(review.version, 5);
  assert.deepEqual(review.findings, []);
  assert.equal(review.scored, false);
  assert.equal(review.score, null);
  assert.equal(review.timeline.length, 4);
  assert.deepEqual(review.timeline[0].vitals, { GCS: 3, Pleth: 'absent' });
  assert.equal(review.timeline[1].procedures[1].id, 'io_access');
  assert.equal(review.timeline[2].procedures[0].outcome, 'FAILURE');
  assert.equal(review.timeline[3].report, true);
  assert.doesNotMatch(JSON.stringify(review), /Questions from this call|Next practice|first two actions/);
  assert.equal(JSON.stringify(review).includes('trueSpO2'), false);
});

test('timeline preserves patient, report, and assessment attribution', () => {
  const timeline = decisionTimeline([
    { user: 'Check first patient', sceneMinute: 0.5, patientFocus: { id: 'primary' }, rolls: [{ procedure_id: 'vitals_manual', no_roll: true }] },
    { user: 'Assess second patient', sceneMinute: 1, patientFocus: { id: 'secondary' }, rolls: [{ procedure_id: 'twelve_lead', outcome: 'SUCCESS' }] },
    { user: 'Radio report', sceneMinute: 2, patientFocus: { id: 'secondary' }, report: true },
  ]);
  assert.deepEqual(timeline.map(t => t.patient), ['patient_1', 'patient_2', 'patient_2']);
  assert.equal(timeline[0].procedures[0].intervention, false);
  assert.equal(timeline[1].procedures[0].intervention, false);
  assert.equal(timeline[2].report, true);
});

test('plain-text review export includes every review tab and the recorded details', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/practice.js'), 'utf8');
  const exportText = vm.runInNewContext(`${source}\nPracticeUI.exportText`, {});
  const review = evaluateObjectives({}, [
    { user: 'Obtain IO access', assistant: 'The right tibial IO flushes cleanly.', sceneMinute: 8,
      rolls: [{ procedure_id: 'io_access', outcome: 'SUCCESS', roll: 19, dc: 7 }],
      vitals: { HR: 48, Rhythm: 'PEA' } },
    { user: 'Give handoff', assistant: 'The team accepts care.', sceneMinute: 24, report: true,
      vitals: { HR: 100, BP: '114/74' } },
  ]);
  review.debriefText = [
    '### 1. SCENE & ASSESSMENT', 'Assessment detail.',
    '### 2. CLINICAL DECISION-MAKING', 'Decision detail.',
    '### 3. WHAT THIS PATIENT ACTUALLY HAD', 'Diagnosis detail.',
    '### 4. KEY TAKEAWAYS', '* Practice detail.',
    '### 5. PROTOCOL CHECK', 'Protocol detail.',
  ].join('\n');
  review.patientOutcome = 'Discharged home on September 28, 2026';
  const result = exportText(review);
  for (const expected of ['LEARNING REVIEW', 'DEBRIEF',
    '### 1. SCENE & ASSESSMENT', '### 2. CLINICAL DECISION-MAKING',
    '### 3. WHAT THIS PATIENT ACTUALLY HAD', '### 4. KEY TAKEAWAYS',
    '### 5. PROTOCOL CHECK', 'Protocol detail.', 'TIMELINE',
    'Obtain IO access', 'IO Access · SUCCESS', 'The right tibial IO flushes cleanly.',
    'Report', 'VITALS', 'HR: 48', 'BP: 114/74', 'UNSCORED RECORD']) {
    assert.ok(result.includes(expected), `Missing ${expected}`);
  }
  assert.doesNotMatch(result, /PATIENT OUTCOME|Discharged home/);
  assert.doesNotMatch(result, /Bad old question|Next practice/);
});
