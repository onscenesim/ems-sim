'use strict';

const { commandClauses } = require('./command-intent');
const { patientResolver } = require('./patient-records');

const ACCESS_PROCEDURES = new Map([['peripheral_iv', 'IV'], ['io_access', 'IO']]);
const patientOf = line => /^patient_\d+$/.test(line.patient) ? line.patient : 'patient_1';
const usable = line => ['patent', 'marginal'].includes(line.status);
function bestAccess(access, patient = 'patient_1', route = null, target = null) {
  const lines = access.filter(line => patientOf(line) === patient && usable(line) && (!route || line.kind === route)
    && (!target || line.target === target));
  return lines.find(line => line.status === 'patent') || lines[0];
}

function accessRemovals(text, focus, records) {
  const resolve = patientResolver(text, focus, records);
  return commandClauses(text).flatMap(clause => {
    if (!/\b(?:remove|pull out|pull the|discontinue|d\/c|take out)\b/i.test(clause.text)
        || !/\b(?:iv|io|intravenous|intraosseous|line|catheter|access)\b/i.test(clause.text)) return [];
    const kind = /\b(?:io|intraosseous)\b/i.test(clause.text) ? 'IO' : /\b(?:iv|intravenous)\b/i.test(clause.text) ? 'IV' : null;
    return [{ kind, patient: resolve(clause.index), orderIndex: clause.index,
      side: clause.text.match(/\b(left|right)\b/i)?.[1].toLowerCase(),
      number: Number(clause.text.match(/#\s*(\d+)/)?.[1]) || null,
      all: /\b(?:all|both|every)\b/i.test(clause.text) }];
  });
}

function removeAccess(access, removal) {
  let number = 0;
  const matches = access.filter(line => {
    if (patientOf(line) !== removal.patient || removal.kind && line.kind !== removal.kind) return false;
    number++;
    return usable(line) && (!removal.number || number === removal.number)
      && (!removal.side || line.target?.startsWith(removal.side));
  });
  // An unqualified removal cannot silently discard a choice of several lines.
  if (!removal.all && matches.length !== 1) return false;
  for (const line of matches) line.status = 'removed';
  return matches.length > 0;
}

function addPlacement(access, roll) {
  const kind = ACCESS_PROCEDURES.get(roll.procedure_id);
  if (!kind || roll.no_roll) return;
  const status = roll.outcome === 'SUCCESS' ? 'patent' : roll.outcome === 'MARGINAL' ? 'marginal'
    : kind === 'IV' && roll.outcome === 'COMPLICATION' ? 'blown' : null;
  if (status) access.push({ kind, status, patient: patientOf(roll), ...(roll.target ? { target: roll.target } : {}) });
}

// An explicit nonvascular route or established formulation needs no IV/IO.
// Fluids/blood and otherwise unspecified vascular administrations always do.
function needsAccess(entry) {
  if (entry.proc?.id !== 'medication_push' && entry.procedure_id !== 'medication_push') return false;
  if (['IV', 'IO'].includes(entry.administration_route)) return true;
  if (entry.administration_route) return false;
  if (entry.vascular_required || ['fluid', 'blood'].includes(entry.medication_kind)) return true;
  if (entry.medication_route_explicit) return false;
  return !['PO', 'SL', 'BUCCAL', 'IM', 'IN', 'NEB'].includes(entry.medication_animation_route);
}

function heldMedication(entry, patient, route) {
  const medication = entry.medication_name || entry.matched_drug || entry.matchedKey || 'Medication';
  const label = `Patient ${patient.replace('patient_', '')}`;
  return { procedure_id: 'medication_push', matchedKey: entry.matchedKey || entry.matched_drug,
    medication_name: medication, patient, held: true, vascular: true,
    reason: `${medication} held: ${label} has no usable ${route || 'IV/IO'} access. Establish access first, or specify an appropriate nonvascular route.` };
}

// Recheck after narration reconciliation. A refused placement cannot authorize
// a medication merely because it had received a successful pre-narration die.
function reconcileAccess(access, rolls, removals = []) {
  const staged = structuredClone(access), kept = [], suppressed = [], removalNotes = [];
  const pending = [...removals];
  const remove = removal => {
    if (!removeAccess(staged, removal)) removalNotes.push(`${removal.patient}: no matching unique usable ${removal.kind || 'IV/IO'} line was selected for removal. Ask which recorded line if ambiguous; do not narrate removal.`);
  };
  for (const roll of rolls) {
    while (pending.length && pending[0].orderIndex <= (roll.orderIndex ?? Infinity)) remove(pending.shift());
    const patient = patientOf(roll);
    if (needsAccess(roll) && !bestAccess(staged, patient, roll.access_route || roll.administration_route, roll.access_target)) {
      suppressed.push(heldMedication(roll, patient, roll.access_route || roll.administration_route));
      continue;
    }
    kept.push(roll);
    addPlacement(staged, roll);
  }
  for (const removal of pending) remove(removal);
  return { access: staged, rolls: kept, suppressed, removalNotes };
}

module.exports = { ACCESS_PROCEDURES, patientOf, bestAccess, accessRemovals, removeAccess, addPlacement, needsAccess, heldMedication, reconcileAccess };
