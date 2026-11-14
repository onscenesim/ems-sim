'use strict';

const { normalizeForDetection } = require('./dice');
const { patientFor } = require('./patient-records');

const PROCEDURES = new Set([
  'cpr', 'bvm', 'lucas', 'intubation', 'suction', 'supraglottic_airway',
  'oropharyngeal_airway', 'nasopharyngeal_airway', 'spinal_motion_restriction',
  'cpap', 'oxygen',
]);

// Use committed turns so cancelled or refused procedures never establish
// care. The same history is available after restoring older saved calls.
function ongoingCareFor(turns, text, focus, records) {
  const successes = new Set();
  for (const turn of turns) {
    for (const roll of turn.rolls || []) {
      if (roll.no_roll || roll.outcome !== 'SUCCESS' || !PROCEDURES.has(roll.procedure_id)) continue;
      const patient = /^patient_\d+$/.test(roll.patient) ? roll.patient : turn.patientFocus?.id || 'patient_1';
      successes.add(`${patient}|${roll.procedure_id}`);
      if (roll.trauma_variant === 'collar') successes.add(`${patient}|collar`);
    }
  }

  const order = normalizeForDetection(text);
  const boundaries = /([;.!?\n])|\b(?:and|then|while|also)\b/gi;
  const clauses = [];
  let sentence = [];
  let start = 0;
  let patientFocus = focus || 'patient_1';
  for (const end of [...order.matchAll(boundaries), { index: order.length, 0: '', 1: true }]) {
    const clause = order.slice(start, end.index);
    const patient = patientFor(clause, null, records);
    sentence.push({ end: end.index, patient, focus: patientFocus });
    if (patient && /^\s*(?:focus on|switch to|turn to|move to)\b/i.test(clause)) patientFocus = patient;
    if (end[1]) {
      // A single stated patient can qualify a linked order such as
      // "suction and intubate patient 2". Explicitly split targets still win.
      const targets = new Set(sentence.map(part => part.patient).filter(Boolean));
      const shared = targets.size === 1 ? [...targets][0] : null;
      for (const part of sentence) clauses.push({ end: part.end, patient: part.patient || shared || part.focus });
      sentence = [];
    }
    start = end.index + end[0].length;
  }
  return entry => {
    const id = entry.proc.id;
    if (!PROCEDURES.has(id) && id !== 'glucometry') return null;
    const patient = clauses.find(clause => entry.orderIndex < clause.end)?.patient || patientFocus;
    const care = entry.presentation?.trauma_variant === 'collar' ? 'collar' : id;
    return { patient, continued: successes.has(`${patient}|${care}`) };
  };
}

module.exports = { ongoingCareFor };
