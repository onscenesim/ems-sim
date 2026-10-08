'use strict';

const ECG = require('../../public/twelve-lead');
const { buildDebriefContext } = require('../../src/engine/assembler');

function evidenceFixture() {
  const seed = {
    scenario_id: 'debrief-evidence-regression', timestamp_start: '2026-10-08T12:00:00Z',
    provider_level: 'ALS', category: 'cardiac', difficulty: 'NORMAL', region: 'SUBURBAN',
    patient_age: 72, sex: 'female', presentation: 'Inferior STEMI',
    trajectory: 'stable', complication_type: 'none', total_scene_minutes: 18,
  };
  const disclosure = 'Her daughter hands you a signed, valid DNR: no CPR if she arrests; continue other indicated care.';
  const scene = 'The crew finishes the assessment. '.repeat(24) + disclosure
    + ' The stretcher is ready and the route is clear. '.repeat(24);
  const focus = { id: 'patient_1', label: 'Primary patient' };
  const vitals = { HR: 48, Rhythm: 'sinus_brad', BP: { value: '94/60', tMin: 1 }, SpO2: 96, RR: 18 };
  const paper = ECG.create({ seed, vitals, patientId: focus.id, minute: 2, id: 'original-paper' });
  const turns = [
    { user: 'Assess ABCs and attach the monitor.', assistant: 'The monitor is attached.',
      vitals, sceneMinute: 1, patientFocus: focus },
    { user: 'Acquire a 12-lead ECG and ask about advance directives.', assistant: scene,
      sceneMinute: 2, patientFocus: focus, twelveLeads: [paper] },
    { user: 'Continue indicated care, respect the DNR, and depart for the receiving facility.',
      assistant: 'Transport starts with monitoring and existing care continuing.', sceneMinute: 4, patientFocus: focus },
    { user: '[Skip ahead to hospital]', skip: true,
      assistant: 'You reach the ambulance bay. The patient remains awake.', sceneMinute: 18, patientFocus: focus },
  ];
  return { seed, turns, disclosure, context: buildDebriefContext(seed, turns, 4) };
}

module.exports = { evidenceFixture };
