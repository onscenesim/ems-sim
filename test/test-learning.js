'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateObjectives } = require('../src/engine/learning');
const seed = { category: 'trauma' };
test('feedback cites failed attempts without treating chance as a failed decision', () => {
  const result = evaluateObjectives(seed, [
    { user: 'Apply tourniquet', sceneMinute: 2, patientFocus: { id: 'primary' }, rolls: [{ procedure_id: 'tourniquet', outcome: 'FAILURE' }], vitals: { HR: 120, PulseOx: { trueSpO2: 60, quality: 'poor' } } },
    { user: 'Recheck', sceneMinute: 4, patientFocus: { id: 'primary' }, vitals: { HR: 100 } },
  ]);
  assert.equal(result.score, null);
  assert.equal(result.scored, false);
  assert.equal(result.findings[1].status, 'evidence_recorded');
  assert.equal(result.findings[1].evidence[0].minute, 2);
  assert.equal(result.findings[2].evidence[0].turn, 2);
  assert.equal(JSON.stringify(result).includes('trueSpO2'), false);
});
test('plans, handoff mentions and a different patient cannot satisfy intervention/reassessment evidence', () => {
  const result = evaluateObjectives(seed, [
    { user: 'Consider tourniquet', sceneMinute: 1, rolls: [] },
    { user: 'Tourniquet applied', report: true, sceneMinute: 2, rolls: [{ procedure_id: 'tourniquet' }] },
    { user: 'Apply tourniquet to second patient', sceneMinute: 3, patientFocus: { id: 'secondary' }, rolls: [{ procedure_id: 'tourniquet', patient: 'secondary' }] },
    { user: 'Recheck primary', sceneMinute: 4, patientFocus: { id: 'primary' }, vitals: { HR: 100 } },
  ]);
  assert.deepEqual(result.findings[1].evidence.map(t => t.turn), [3]);
  assert.equal(result.findings[2].status, 'not_observed');
  assert.equal(result.findings[2].review.status, 'draft');
});
test('empty and legacy runs remain unscored and do not invent evidence', () => {
  const result = evaluateObjectives(seed);
  assert.ok(result.findings.every(f => f.status === 'not_observed'));
  assert.equal(result.score, null);
});

test('reassessment context uses the nearest earlier treatment and observations for that patient', () => {
  const result = evaluateObjectives(seed, [
    { user: 'Primary baseline', sceneMinute: 1, vitals: { HR: 120 } },
    { user: 'Control bleeding', sceneMinute: 2, rolls: [{ procedure_id: 'bleeding_control', outcome: 'FAILURE' }] },
    { user: 'Second patient assessment', sceneMinute: 3, patientFocus: { id: 'patient_2' }, vitals: { HR: 70 } },
    { user: 'Report previous care', sceneMinute: 4, report: true, rolls: [{ procedure_id: 'bleeding_control' }] },
    { user: 'Reassess primary', assistant: 'Visible repeat findings.', sceneMinute: 5, vitals: { HR: 110 } },
  ]);
  const finding = result.findings.find(f => f.id === 'reassessment');
  assert.equal(finding.evidence.length, 1);
  assert.equal(finding.evidence[0].precedingIntervention.turn, 2);
  assert.equal(finding.evidence[0].elapsedMinutes, 3);
  assert.deepEqual(finding.evidence[0].priorObservation.vitals, { HR: 120 });
  assert.equal(finding.evidence[0].scene, 'Visible repeat findings.');
  assert.equal(finding.reflection.questions.length, 2);
  assert.equal(finding.review.status, 'draft');
});

test('missing times and observations remain unknown and never turn into timing judgments', () => {
  const result = evaluateObjectives(seed, [
    { user: 'Control bleeding', rolls: [{ procedure_id: 'bleeding_control' }] },
    { user: 'Reassess primary', sceneMinute: 5, vitals: { HR: 110 } },
  ]);
  const evidence = result.findings.find(f => f.id === 'reassessment').evidence[0];
  assert.equal(evidence.elapsedMinutes, null);
  assert.equal(evidence.priorObservation, null);
  assert.equal(result.scored, false);
  assert.equal(result.score, null);
});

test('each patient retains their own first baseline assessment for review filtering', () => {
  const result = evaluateObjectives(seed, [
    { user: 'Primary baseline', sceneMinute: 1, vitals: { HR: 120 } },
    { user: 'Second baseline', sceneMinute: 2, patientFocus: { id: 'patient_2' }, vitals: { HR: 70 } },
    { user: 'Primary repeat', sceneMinute: 3, vitals: { HR: 110 } },
  ]);
  const evidence = result.findings.find(f => f.id === 'baseline').evidence;
  assert.deepEqual(evidence.map(t => [t.patient, t.turn]), [['patient_1', 1], ['patient_2', 2]]);
  assert.equal(evidence[1].priorObservation, null);
});
