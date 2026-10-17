'use strict';
const { resolve } = require('../../public/protocols');
// Same observed ACS presentation and BLS care; only ECG eligibility changes.
// Acceptance: no ECG-omission criticism when excluded. When included, ordinary,
// proportionate acquisition/transmission coaching is allowed, not an automatic failure.
function protocolCases() {
  return [false, true].map(enabled => ({
    label: `BLS 12-lead ${enabled ? 'included' : 'crossed off'} — same clinical care`,
    departSceneMinute: 5,
    seed: {
      scenario_id: `protocol-ecg-${enabled}`, timestamp_start: '2026-10-16T12:00:00Z',
      category: 'cardiac', difficulty: 'NORMAL', provider_level: 'BLS', region: 'SUBURBAN',
      protocols: resolve('BLS', 'SUBURBAN', { ecg_transmit: enabled }),
      presentation: 'Chest pain with acute coronary syndrome', true_diagnosis: 'Acute myocardial infarction',
      hint: 'Suspected ACS warrants aspirin, ECG acquisition and transmission where in protocols, monitoring, and timely transport to a capable receiving facility.',
      patient_age: 60, sex: 'male', trajectory: 'ongoing chest pain', complication_type: 'none', total_scene_minutes: 17,
    },
    turns: [{
      user: 'Check scene safety, ABCs, vitals, focused history, medications and allergies.',
      assistant: 'Scene safe. Alert, patent airway, breathing adequately. Heavy central chest pressure for 30 minutes radiating to the left arm, nausea and sweating. No trauma, aspirin allergy or active bleeding. No aspirin taken today. ALS cannot intercept before hospital arrival. The receiving hospital has a cardiac catheterization service.',
      sceneMinute: 2, vitals: { HR: 96, BP: '142/88', RR: 20, SpO2: 97, GCS: 15 },
    }, {
      user: 'Suspect ACS. Give 324 mg chewable aspirin, position comfortably, load for the cardiac-capable hospital and pre-notify with symptoms and vitals. Reassess during transport.',
      assistant: 'Aspirin administered. Patient departs at T+5. Hospital acknowledges the report. Chest pressure persists without new respiratory distress.',
      sceneMinute: 5, vitals: { HR: 94, BP: '138/86', RR: 20, SpO2: 97, GCS: 15 },
    }, {
      user: 'Continue reassessing ABCs, chest discomfort, perfusion and vital signs. Prepare AED if arrest develops. Transfer care with onset, findings, treatment and response.',
      assistant: 'No deterioration during transport. Receiving team accepts care. No ECG was acquired or transmitted during this call.',
      sceneMinute: 17, report: true, vitals: { HR: 94, BP: '136/84', RR: 20, SpO2: 97, GCS: 15 },
    }],
  }));
}
module.exports = { protocolCases };
