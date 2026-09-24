'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateObjectives } = require('../src/engine/learning');
const seed = { category: 'trauma' };

test('initial approach uses the first player decision even when no vitals are present', () => {
  const result = evaluateObjectives(seed, [
    { user: 'begin', sceneMinute: 0, rolls: [] },
    { user: 'I check scene safety and introduce myself', sceneMinute: 1, rolls: [] },
    { user: 'Now obtain a full set of vitals', sceneMinute: 2, vitals: { HR: 120 } },
  ]);
  const finding = result.findings.find(item => item.id === 'initial_approach');
  assert.equal(finding.status, 'evidence_recorded');
  assert.deepEqual(finding.evidence.map(moment => moment.turn), [2]);
});

test('recorded interventions retain useful detail without treating chance as decision quality', () => {
  const result = evaluateObjectives(seed, [
    { user: 'Apply tourniquet', sceneMinute: 2, patientFocus: { id: 'primary' }, rolls: [{ procedure_id: 'tourniquet', outcome: 'FAILURE', roll: 4, dc: 12, disadvantage: true }], vitals: { HR: 120, PulseOx: { trueSpO2: 60, quality: 'poor' } } },
    { user: 'Give naloxone IN', sceneMinute: 3, rolls: [{ procedure_id: 'medication_push', matched_drug: 'naloxone', administration_route: 'IN', no_roll: true, outcome: 'SUCCESS' }] },
  ]);
  const finding = result.findings.find(item => item.id === 'interventions');
  assert.deepEqual(finding.evidence.map(moment => moment.turn), [1, 2]);
  assert.deepEqual(finding.evidence[0].procedures[0], {
    id: 'tourniquet', patient: 'patient_1', outcome: 'FAILURE', intervention: true,
    noRoll: false, roll: 4, dc: 12, disadvantage: true, matchedDrug: null,
    administrationRoute: null, attempts: [],
  });
  assert.equal(finding.evidence[1].procedures[0].matchedDrug, 'naloxone');
  assert.equal(finding.evidence[1].procedures[0].administrationRoute, 'IN');
  assert.equal(JSON.stringify(result).includes('trueSpO2'), false);
  assert.equal(result.score, null);
  assert.equal(result.scored, false);
});

test('automatic vitals and recorded assessments do not count as player interventions', () => {
  const result = evaluateObjectives(seed, [
    { user: 'Watch the patient', sceneMinute: 1, vitals: { HR: 115, GCS: 14 }, rolls: [] },
    { user: 'Obtain a 12 lead and repeat vitals', sceneMinute: 2, vitals: { HR: 105, GCS: 15 }, rolls: [
      { procedure_id: 'twelve_lead', outcome: 'SUCCESS', roll: 18, dc: 10 },
      { procedure_id: 'reassessment', no_roll: true, outcome: 'SUCCESS' },
    ] },
  ]);
  const finding = result.findings.find(item => item.id === 'interventions');
  assert.equal(finding.status, 'not_observed');
  assert.ok(result.timeline[1].procedures.every(procedure => !procedure.intervention));
});

test('report turns do not become interventions and only actual report mode satisfies handoff', () => {
  const result = evaluateObjectives(seed, [
    { user: 'Consider a tourniquet and mention a report', sceneMinute: 1, rolls: [] },
    { user: 'Tourniquet was applied', report: true, sceneMinute: 2, rolls: [{ procedure_id: 'tourniquet', outcome: 'SUCCESS' }] },
    { user: 'Apply tourniquet to second patient', sceneMinute: 3, patientFocus: { id: 'secondary' }, rolls: [{ procedure_id: 'tourniquet', patient: 'secondary', outcome: 'SUCCESS' }] },
  ]);
  assert.deepEqual(result.findings.find(item => item.id === 'interventions').evidence.map(moment => moment.turn), [3]);
  assert.deepEqual(result.findings.find(item => item.id === 'handoff').evidence.map(moment => moment.turn), [2]);
});

test('empty runs remain unscored and do not invent evidence', () => {
  const result = evaluateObjectives(seed);
  assert.ok(result.findings.every(finding => finding.status === 'not_observed'));
  assert.equal(result.version, 3);
  assert.equal(result.score, null);
});

test('each patient retains their own first player decision for review filtering', () => {
  const result = evaluateObjectives(seed, [
    { user: 'Primary opening assessment', sceneMinute: 1 },
    { user: 'Second patient opening assessment', sceneMinute: 2, patientFocus: { id: 'patient_2' } },
    { user: 'Primary follow-up decision', sceneMinute: 3 },
  ]);
  const evidence = result.findings.find(item => item.id === 'initial_approach').evidence;
  assert.deepEqual(evidence.map(moment => [moment.patient, moment.turn]), [['patient_1', 1], ['patient_2', 2]]);
});

test('legacy seeded objective IDs are upgraded to current review areas', () => {
  const result = evaluateObjectives({ category: 'trauma', learning_objectives: ['baseline', 'hemorrhage', 'reassessment'] }, [
    { user: 'Begin my assessment', sceneMinute: 1 },
  ]);
  assert.deepEqual(result.findings.map(finding => finding.id), ['initial_approach', 'interventions', 'handoff']);
});
