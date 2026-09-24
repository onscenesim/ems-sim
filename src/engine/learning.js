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
    procedures: (turn.rolls || []).map(r => procedureRecord(r, turn.patientFocus)),
    vitals: visibleVitals(turn.vitals),
  }));
}
function isIntervention(t, patient) {
  return !t.report && !t.skip && t.procedures.some(p => p.intervention && (!patient || p.patient === patient));
}
function isPlayerDecision(t) {
  const action = t.action.trim();
  return !t.report && !t.skip && !!action && !/^(?:begin|end scenario|stop the scenario)$/i.test(action);
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
  const configuredIds = seed.learning_objectives || objectivesForCase(seed.category);
  // Runs seeded before review v3 contain baseline/reassessment IDs. Rebuild
  // those unfinished legacy reviews with the current player-action areas.
  const ids = configuredIds.some(id => id === 'baseline' || id === 'reassessment')
    ? objectivesForCase(seed.category) : configuredIds;
  const findings = ids.map(id => {
    const objective = OBJECTIVES[id];
    if (!objective) return null;
    let evidence = [];
    if (objective.kind === 'initial_approach') {
      const seen = new Set();
      evidence = timeline.filter(t => {
        if (!isPlayerDecision(t) || seen.has(t.patient)) return false;
        seen.add(t.patient);
        return true;
      });
    }
    if (objective.kind === 'handoff') evidence = timeline.filter(t => t.report && !t.skip);
    if (objective.kind === 'intervention') evidence = timeline.filter(t => isIntervention(t));
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
  return { version: 3, scored: false, score: null, notice: 'Draft review areas — awaiting clinical review. Evidence for reflection only; no grade or XP impact. Times mark the end of a turn, not the exact intervention time. Automatically updated observations are context and are never counted as player actions.', findings, timeline };
}
module.exports = { evaluateObjectives, decisionTimeline, visibleVitals };
