'use strict';

// The learning review is an evidence record. Clinical takeaways belong in the
// case-specific debrief, not in prompts assembled from procedure names or dice.
function visibleVitals(vitals) {
  const result = {};
  for (const key of ['HR', 'BP', 'SpO2', 'EtCO2', 'ETCO2', 'RR', 'Temp', 'Glucose', 'BGL', 'GCS', 'Rhythm']) {
    if (vitals?.[key] !== undefined) result[key] = vitals[key];
  }
  if (vitals?.PulseOx) result.Pleth = vitals.PulseOx.quality;
  return result;
}

function patientId(value) {
  const id = value?.id || value || 'patient_1';
  return ({ primary: 'patient_1', secondary: 'patient_2' })[id] || id;
}

const OBSERVATION_PROCEDURES = new Set(['vitals_manual', 'vitals_monitor', 'cardiac_monitor', 'twelve_lead', 'glucometry', 'physical_exam', 'scene_safety', 'reassessment', 'pulse_check', 'rhythm_check', 'handoff_report', 'radio_contact', 'tourniquet_time', 'capnography_confirmation', 'fetal_assessment']);
function procedureRecord(roll, fallbackPatient) {
  const id = roll.procedure_id || 'unknown';
  return {
    id,
    patient: patientId(roll.patient || fallbackPatient),
    outcome: roll.outcome || null,
    intervention: !OBSERVATION_PROCEDURES.has(id),
    noRoll: !!roll.no_roll,
    roll: Number.isFinite(roll.roll) ? roll.roll : null,
    dc: Array.isArray(roll.dc) ? roll.dc : (Number.isFinite(roll.dc) ? roll.dc : null),
    disadvantage: !!roll.disadvantage,
    matchedDrug: roll.matched_drug || null,
    administrationRoute: roll.administration_route || null,
    attempts: Array.isArray(roll.rolls) ? roll.rolls.map(attempt => ({
      roll: Number.isFinite(attempt.roll) ? attempt.roll : null,
      dc: Number.isFinite(attempt.dc) ? attempt.dc : null,
      outcome: attempt.outcome || null,
    })) : [],
  };
}

function decisionTimeline(turns = []) {
  return turns.map((turn, index) => ({
    turn: index + 1,
    minute: Number.isFinite(turn.sceneMinute) ? turn.sceneMinute : null,
    patient: patientId(turn.patientFocus),
    action: turn.user || '',
    scene: turn.assistant || '',
    report: !!turn.report,
    skip: !!turn.skip,
    procedures: (turn.rolls || []).map(roll => procedureRecord(roll, turn.patientFocus)),
    vitals: visibleVitals(turn.vitals),
  }));
}

// Keep the established API name for callers and saved-run compatibility.
function evaluateObjectives(_seed, turns = []) {
  return {
    version: 5,
    scored: false,
    score: null,
    notice: 'This record shows the call sequence and logged observations. Times mark the end of a turn, not the exact intervention time. Procedure outcomes reflect the simulation, not decision quality. See the debrief for clinical takeaways.',
    findings: [],
    timeline: decisionTimeline(turns),
  };
}

module.exports = { evaluateObjectives, decisionTimeline, visibleVitals };
