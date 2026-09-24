'use strict';
const { OBJECTIVES, objectivesForCase } = require('../data/learningObjectives');

// Only observations displayed to the player. Never expose hidden SpO2,
// artifact causes, or the private case key as evidence they should have known.
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
function decisionTimeline(turns = []) {
  return turns.map((turn, index) => ({
    turn: index + 1,
    minute: Number.isFinite(turn.sceneMinute) ? turn.sceneMinute : null,
    patient: patientId(turn.patientFocus),
    action: turn.user || '',
    scene: turn.assistant || '',
    report: !!turn.report,
    skip: !!turn.skip,
    procedures: (turn.rolls || []).map(r => ({ id: r.procedure_id, patient: patientId(r.patient || turn.patientFocus), outcome: r.outcome })),
    vitals: visibleVitals(turn.vitals),
  }));
}
const OBSERVATION_PROCEDURES = new Set(['vitals_manual', 'vitals_monitor', 'cardiac_monitor', 'twelve_lead', 'glucometry', 'physical_exam', 'scene_safety', 'reassessment', 'pulse_check', 'rhythm_check', 'handoff_report', 'radio_contact', 'tourniquet_time', 'capnography_confirmation', 'fetal_assessment']);
function isIntervention(t, patient) {
  return !t.report && !t.skip && t.procedures.some(p => p.patient === patient && !OBSERVATION_PROCEDURES.has(p.id));
}
function evidenceContext(moment, timeline, kind) {
  const earlier = timeline.filter(t => t.turn < moment.turn);
  const previous = earlier.filter(t => t.patient === moment.patient && Object.keys(t.vitals).length).at(-1);
  const intervention = kind === 'reassessment' ? earlier.filter(t => isIntervention(t, moment.patient)).at(-1) : null;
  const elapsed = intervention && moment.minute !== null && intervention.minute !== null
    ? moment.minute - intervention.minute : null;
  return {
    ...moment,
    priorObservation: previous ? { turn: previous.turn, minute: previous.minute, vitals: previous.vitals } : null,
    precedingIntervention: intervention ? { turn: intervention.turn, minute: intervention.minute, action: intervention.action } : null,
    elapsedMinutes: elapsed !== null && elapsed >= 0 ? Math.round(elapsed * 100) / 100 : null,
  };
}
function evaluateObjectives(seed, turns = []) {
  const timeline = decisionTimeline(turns);
  const ids = seed.learning_objectives || objectivesForCase(seed.category);
  const findings = ids.map(id => {
    const objective = OBJECTIVES[id];
    if (!objective) return null;
    let evidence = [];
    if (objective.kind === 'baseline') {
      const seen = new Set();
      evidence = timeline.filter(t => {
        if (!Object.keys(t.vitals).length || seen.has(t.patient)) return false;
        seen.add(t.patient);
        return true;
      });
    }
    if (objective.kind === 'handoff') evidence = timeline.filter(t => t.report && !t.skip);
    if (objective.kind === 'procedure') evidence = timeline.filter(t => !t.report && !t.skip && t.procedures.some(p => objective.procedures.includes(p.id)));
    if (objective.kind === 'reassessment') evidence = timeline.filter((t, i) => Object.keys(t.vitals).length > 0 && timeline.slice(0, i).some(previous => isIntervention(previous, t.patient)));
    return {
      ...objective, evidence: evidence.map(t => evidenceContext(t, timeline, objective.kind)),
      status: evidence.length ? 'evidence_recorded' : 'not_observed',
      feedback: evidence.length
        ? 'Review this recorded moment in context. A recorded attempt or observation does not establish that care was indicated, timely, or successful.'
        : 'No matching structured evidence was found. This is not a failed objective; review the transcript for indication, verbal assessments, and logging gaps.',
    };
  }).filter(Boolean);
  return { version: 2, scored: false, score: null, notice: 'Draft objectives — awaiting clinical review. Evidence for reflection only; no grade or XP impact. Times mark the end of a turn, not the exact intervention time.', findings, timeline };
}
module.exports = { evaluateObjectives, decisionTimeline, visibleVitals };
