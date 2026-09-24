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
