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
function timeText(moment) {
  if (!Number.isFinite(moment?.minute)) return `Turn ${moment?.turn ?? '?'}`;
  const seconds = Math.max(0, Math.round(moment.minute * 60));
  return `T+${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function compactText(value, limit = 180) {
  const text = String(value || '').replace(/\[[A-Z_]+:[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit - 1);
  const boundary = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, boundary > limit * 0.65 ? boundary : clipped.length)}…`;
}
function procedureName(procedure) {
  const raw = procedure.id === 'medication_push' && procedure.matchedDrug
    ? procedure.matchedDrug : procedure.id;
  return String(raw || 'recorded procedure').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
function patientName(id) {
  return String(id || 'patient').replace(/^patient_(\d+)$/, 'Patient $1');
}
function vitalValue(value) {
  if (value === undefined || value === null) return '—';
  return typeof value === 'object' && value.value !== undefined ? String(value.value) : String(value);
}
function vitalsText(vitals, limit = 4) {
  return Object.entries(vitals || {}).slice(0, limit).map(([key, value]) => `${key} ${vitalValue(value)}`).join(', ');
}
function observationsAround(moment, timeline) {
  const samePatient = entry => entry.patient === moment.patient && Object.keys(entry.vitals || {}).length;
  const before = timeline.filter(entry => entry.turn < moment.turn && samePatient(entry)).at(-1) || null;
  const after = Object.keys(moment.vitals || {}).length
    ? moment
    : timeline.find(entry => entry.turn > moment.turn && samePatient(entry)) || null;
  return { before, after };
}
function changedObservations(before, after) {
  if (!before || !after) return [];
  const preferred = ['HR', 'BP', 'SpO2', 'EtCO2', 'ETCO2', 'RR', 'GCS', 'Temp', 'Glucose', 'BGL', 'Rhythm'];
  return preferred.filter(key => before.vitals[key] !== undefined && after.vitals[key] !== undefined
    && vitalValue(before.vitals[key]) !== vitalValue(after.vitals[key])).slice(0, 2)
    .map(key => `${key} ${vitalValue(before.vitals[key])} at ${timeText(before)} to ${vitalValue(after.vitals[key])} at ${timeText(after)}`);
}
function outcomePhrase(outcome) {
  return ({ FAILURE: 'failed', COMPLICATION: 'had a complication', MARGINAL: 'was marginal', SUCCESS: 'had a successful skill check' })[outcome] || 'had a recorded result';
}
function previousScene(moment, timeline) {
  return timeline.filter(entry => entry.turn < moment.turn && entry.patient === moment.patient && entry.scene.trim()).at(-1) || null;
}
function nextDecision(moment, timeline) {
  return timeline.find(entry => entry.turn > moment.turn && entry.patient === moment.patient && (isPlayerDecision(entry) || entry.report)) || null;
}
function initialApproachPrompts(evidence, timeline) {
  if (!evidence.length) return { focus: null, questions: [], practice: null };
  const focus = evidence.map(moment => `${patientName(moment.patient)}: “${compactText(moment.action, 120)}” at ${timeText(moment)}`).join('; ') + '.';
  const questions = [];
  for (const moment of evidence) {
    const beforeScene = previousScene(moment, timeline);
    const { before } = observationsAround(moment, timeline);
    const who = evidence.length > 1 ? `${patientName(moment.patient)} — ` : '';
    if (beforeScene) {
      questions.push(`${who}before that decision, the scene had reported: “${compactText(beforeScene.scene)}” Which detail made your chosen first step the priority, and what detail would have moved something else ahead of it?`);
    }
    if (before) {
      questions.push(`${who}the latest recorded observations before that decision were ${vitalsText(before.vitals)}. Which value most affected the order of your first two actions, and which value still needed context?`);
    } else if (beforeScene) {
      questions.push(`${who}no structured vitals were available yet. What finding in that opening scene would have made you interrupt your planned assessment sequence for immediate treatment?`);
    }
  }
  return { focus, questions: questions.slice(0, 3), practice: null };
}
function proceduresForReview(moment, objective) {
  return objective.kind === 'procedure'
    ? moment.procedures.filter(procedure => objective.procedures.includes(procedure.id))
    : moment.procedures.filter(procedure => procedure.intervention);
}
function interventionPrompts(objective, evidence, timeline) {
  if (!evidence.length) return { focus: null, questions: [], practice: null };
  const summaries = evidence.flatMap(moment => proceduresForReview(moment, objective)
    .map(procedure => `${procedureName(procedure)} ${outcomePhrase(procedure.outcome)} at ${timeText(moment)}`));
  const focus = `${summaries.slice(0, 3).join('; ')}${summaries.length > 3 ? `; plus ${summaries.length - 3} more recorded intervention${summaries.length - 3 === 1 ? '' : 's'}` : ''}.`;
  const questions = [];
  let practice = null;
  for (const moment of evidence) {
    const procedures = proceduresForReview(moment, objective);
    const scene = compactText(moment.scene);
    for (const procedure of procedures) {
      const name = procedureName(procedure);
      if (['FAILURE', 'COMPLICATION'].includes(procedure.outcome)) {
        questions.push(`${name} ${outcomePhrase(procedure.outcome)} at ${timeText(moment)}${scene ? `; the simulation then showed: “${scene}”` : '.'} What finding would make you repeat the attempt, switch methods, or move on?`);
        practice ||= `Re-run the decision immediately after ${name} ${outcomePhrase(procedure.outcome)} at ${timeText(moment)}. Decide whether you would repeat it, change methods, or move on—and identify the patient finding that separates those branches.`;
      } else if (procedure.outcome === 'MARGINAL') {
        questions.push(`${name} was marginal at ${timeText(moment)}${scene ? `; the simulation response was: “${scene}”` : '.'} What evidence would you need before treating that result as adequate rather than escalating?`);
        practice ||= `Re-run the moment after the marginal ${name} result at ${timeText(moment)}. Set the finding that would make you accept it, and the finding that would make you escalate.`;
      }
    }
    if (procedures.length > 1) {
      const names = procedures.map(procedureName);
      const { before } = observationsAround(moment, timeline);
      const known = before ? ` The latest recorded observations beforehand were ${vitalsText(before.vitals)}.` : '';
      questions.push(`At ${timeText(moment)}, you attempted ${names.join(' and ')} in the same turn.${known} If only one could happen before the patient moved or changed, which problem took priority?`);
      practice ||= `Re-run ${timeText(moment)} with time for only one action: ${names.join(' or ')}. Choose using only the findings available before that turn.`;
    }
    const { before, after } = observationsAround(moment, timeline);
    const changes = changedObservations(before, after);
    if (changes.length) {
      questions.push(`After ${procedures.map(procedureName).join(' and ')}, the record moved from ${changes.join(' and ')}. What else could account for that later change before treating it as an intervention effect?`);
    }
    if (!procedures.some(procedure => ['FAILURE', 'COMPLICATION', 'MARGINAL'].includes(procedure.outcome)) && scene) {
      const next = nextDecision(moment, timeline);
      if (next) questions.push(`After ${procedures.map(procedureName).join(' and ')} at ${timeText(moment)}, the next decision was “${compactText(next.action, 120)}.” What in the simulation response supported moving on, and what response would have kept your attention on the original problem?`);
    }
  }
  return { focus, questions: [...new Set(questions)].slice(0, 3), practice };
}
function handoffPrompts(evidence, timeline) {
  const handoff = evidence[0];
  if (!handoff) return { focus: null, questions: [], practice: null };
  const earlier = timeline.filter(entry => entry.turn < handoff.turn && entry.patient === handoff.patient);
  const interventionMoments = earlier.filter(entry => isIntervention(entry, handoff.patient));
  const interventions = interventionMoments.flatMap(moment => moment.procedures.filter(procedure => procedure.intervention && procedure.patient === handoff.patient)
    .map(procedure => ({ moment, procedure })));
  const focus = interventions.length
    ? `Your handoff at ${timeText(handoff)} followed ${interventions.length} recorded intervention${interventions.length === 1 ? '' : 's'}; the last was ${procedureName(interventions.at(-1).procedure)} at ${timeText(interventions.at(-1).moment)}.`
    : `Your handoff was recorded at ${timeText(handoff)}.`;
  const questions = [];
  let practice = null;
  const unresolved = interventions.filter(({ procedure }) => ['FAILURE', 'COMPLICATION', 'MARGINAL'].includes(procedure.outcome)).at(-1);
  if (unresolved) {
    const name = procedureName(unresolved.procedure);
    const scene = compactText(unresolved.moment.scene);
    questions.push(`${name} ${outcomePhrase(unresolved.procedure.outcome)} before handoff${scene ? `, and the scene showed: “${scene}”` : '.'} What did the receiving team need to hear to avoid assuming that problem was resolved?`);
    practice = `Give the handoff again in one sentence that includes the ${name} result at ${timeText(unresolved.moment)} and what remained unresolved afterward.`;
  }
  const observations = earlier.filter(entry => Object.keys(entry.vitals).length);
  const changes = changedObservations(observations[0], observations.at(-1));
  if (changes.length) questions.push(`Before handoff, the record moved from ${changes.join(' and ')}. Which change belonged in the report, and what context kept it from proving a treatment effect?`);
  return { focus, questions: questions.slice(0, 2), practice };
}
function reflectionFor(objective, evidence, timeline) {
  if (objective.kind === 'initial_approach') return initialApproachPrompts(evidence, timeline);
  if (objective.kind === 'intervention' || objective.kind === 'procedure') return interventionPrompts(objective, evidence, timeline);
  if (objective.kind === 'handoff') return handoffPrompts(evidence, timeline);
  return { focus: null, questions: [], practice: null };
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
    const contextualEvidence = evidence.map(t => evidenceContext(t, timeline, objective.kind));
    const patientReflections = Object.fromEntries([...new Set(contextualEvidence.map(moment => moment.patient))]
      .map(patient => [patient, reflectionFor(objective, contextualEvidence.filter(moment => moment.patient === patient), timeline)]));
    return {
      ...objective, evidence: contextualEvidence,
      reflection: reflectionFor(objective, contextualEvidence, timeline),
      patientReflections,
      status: evidence.length ? 'evidence_recorded' : 'not_observed',
      feedback: evidence.length
        ? 'Review this recorded moment in context. A recorded attempt or observation does not establish that care was indicated, timely, or successful.'
        : 'No matching structured evidence was found. This is not a failed objective; review the transcript for indication, verbal assessments, and logging gaps.',
    };
  }).filter(Boolean);
  return { version: 4, scored: false, score: null, notice: 'Draft review areas — awaiting clinical review. Questions use only the recorded call sequence; no grade or XP impact. Times mark the end of a turn, not the exact intervention time. Automatically updated observations are context and are never counted as player actions.', findings, timeline };
}
module.exports = { evaluateObjectives, decisionTimeline, visibleVitals };
