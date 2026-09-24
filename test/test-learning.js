'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateObjectives } = require('../src/engine/learning');
const seed = { category: 'trauma' };

test('initial approach uses the first player decision even when no vitals are present', () => {
  const result = evaluateObjectives(seed, [
    { user: 'begin', assistant: 'The patient is pale and guarding the left leg.', sceneMinute: 0, rolls: [] },
    { user: 'I check scene safety and introduce myself', sceneMinute: 1, rolls: [] },
    { user: 'Now obtain a full set of vitals', assistant: 'FUTURE FINDING: the pressure is low.', sceneMinute: 2, vitals: { HR: 120 } },
  ]);
  const finding = result.findings.find(item => item.id === 'initial_approach');
  assert.equal(finding.status, 'evidence_recorded');
  assert.deepEqual(finding.evidence.map(moment => moment.turn), [2]);
  assert.match(finding.reflection.focus, /I check scene safety/);
  assert.match(finding.reflection.questions.join(' '), /pale and guarding the left leg/);
  assert.doesNotMatch(finding.reflection.questions.join(' '), /FUTURE FINDING|pressure is low/);
  assert.equal(finding.reflection.practice, null);
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
  assert.match(finding.reflection.questions.join(' '), /Tourniquet failed at T\+2:00/);
  assert.match(finding.reflection.practice, /Tourniquet failed at T\+2:00/);
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
  assert.deepEqual(finding.reflection.questions, []);
  assert.equal(finding.reflection.practice, null);
});

test('a diagnostic-procedure objective can use its own recorded evidence without calling it an intervention', () => {
  const result = evaluateObjectives({ category: 'cardiac', learning_objectives: ['cardiac_observation'] }, [
    { user: 'Obtain a 12 lead', assistant: 'The tracing shows ST-segment changes.', sceneMinute: 2, rolls: [
      { procedure_id: 'twelve_lead', outcome: 'SUCCESS', roll: 18, dc: 10 },
    ] },
    { user: 'Prepare for transport', sceneMinute: 3 },
  ]);
  const finding = result.findings[0];
  assert.match(finding.reflection.focus, /Twelve Lead had a successful skill check at T\+2:00/);
  assert.match(finding.reflection.questions.join(' '), /next decision was “Prepare for transport\.?”/);
  assert.doesNotMatch([finding.reflection.focus, ...finding.reflection.questions].join(' '), /After ,|^\.$/);
  assert.equal(result.timeline[0].procedures[0].intervention, false);
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
  assert.ok(result.findings.every(finding => !finding.reflection.practice && finding.reflection.questions.length === 0));
  assert.equal(result.version, 4);
  assert.equal(result.score, null);
});

test('failed and competing interventions produce call-specific branches and preserve causality', () => {
  const result = evaluateObjectives(seed, [
    { user: 'begin', assistant: 'Bright blood is soaking through a towel.', sceneMinute: 0.25 },
    { user: 'Get vitals and expose the leg', assistant: 'Bleeding remains visible.', sceneMinute: 1, vitals: { HR: 120, BP: '90/60' }, rolls: [{ procedure_id: 'vitals_manual', no_roll: true }] },
    { user: 'Apply direct pressure', assistant: 'The dressing shifts and bright blood continues to soak through.', sceneMinute: 2, rolls: [{ procedure_id: 'bleeding_control', outcome: 'FAILURE', roll: 5, dc: 12 }] },
    { user: 'Give fentanyl and apply the traction splint', assistant: 'Pain eases, but the splint retains some movement.', sceneMinute: 4, vitals: { HR: 108, BP: '96/64' }, rolls: [
      { procedure_id: 'medication_push', matched_drug: 'fentanyl', outcome: 'SUCCESS', roll: 16, dc: 8 },
      { procedure_id: 'traction_splint', outcome: 'MARGINAL', roll: 11, dc: 10 },
    ] },
  ]);
  const reflection = result.findings.find(item => item.id === 'interventions').reflection;
  const text = [reflection.focus, ...reflection.questions, reflection.practice].join(' ');
  assert.match(text, /Bleeding Control failed at T\+2:00/);
  assert.match(text, /dressing shifts and bright blood continues/);
  assert.match(text, /Traction Splint was marginal at T\+4:00/);
  assert.match(text, /HR 120 at T\+1:00 to 108 at T\+4:00/);
  assert.match(text, /What else could account for that later change/);
  assert.doesNotMatch(text, /make your reasoning explicit|connect each intervention|identify an area for improvement/i);
});

test('handoff prompts carry a specific unresolved intervention instead of generic advice', () => {
  const result = evaluateObjectives(seed, [
    { user: 'Apply traction splint', assistant: 'The splint has residual movement.', sceneMinute: 3, rolls: [{ procedure_id: 'traction_splint', outcome: 'MARGINAL' }] },
    { user: 'Radio report with assessment and treatments', assistant: 'Report acknowledged.', sceneMinute: 5, report: true },
  ]);
  const reflection = result.findings.find(item => item.id === 'handoff').reflection;
  assert.match(reflection.questions[0], /Traction Splint was marginal.*residual movement/);
  assert.match(reflection.practice, /Traction Splint result at T\+3:00.*remained unresolved/);
});

test('sparse records omit generic questions and next-practice filler', () => {
  const result = evaluateObjectives(seed, [{ user: 'Look at the patient', sceneMinute: 1 }]);
  const initial = result.findings.find(item => item.id === 'initial_approach').reflection;
  assert.match(initial.focus, /Look at the patient/);
  assert.deepEqual(initial.questions, []);
  assert.equal(initial.practice, null);
});

test('each patient retains their own first player decision for review filtering', () => {
  const result = evaluateObjectives(seed, [
    { user: 'Primary opening assessment', sceneMinute: 1 },
    { user: 'Second patient opening assessment', sceneMinute: 2, patientFocus: { id: 'patient_2' } },
    { user: 'Primary follow-up decision', sceneMinute: 3 },
  ]);
  const finding = result.findings.find(item => item.id === 'initial_approach');
  const evidence = finding.evidence;
  assert.deepEqual(evidence.map(moment => [moment.patient, moment.turn]), [['patient_1', 1], ['patient_2', 2]]);
  assert.match(finding.patientReflections.patient_1.focus, /Primary opening assessment/);
  assert.doesNotMatch(finding.patientReflections.patient_1.focus, /Second patient/);
  assert.match(finding.patientReflections.patient_2.focus, /Second patient opening assessment/);
  assert.doesNotMatch(finding.patientReflections.patient_2.focus, /Primary/);
});

test('legacy seeded objective IDs are upgraded to current review areas', () => {
  const result = evaluateObjectives({ category: 'trauma', learning_objectives: ['baseline', 'hemorrhage', 'reassessment'] }, [
    { user: 'Begin my assessment', sceneMinute: 1 },
  ]);
  assert.deepEqual(result.findings.map(finding => finding.id), ['initial_approach', 'interventions', 'handoff']);
});
