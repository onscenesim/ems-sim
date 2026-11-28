'use strict';

const { normalizeForDetection } = require('./dice');
const { patientResolver, patientFor } = require('./patient-records');
const { commandClauses } = require('./command-intent');

const PROCEDURES = new Set([
  'cpr', 'bvm', 'lucas', 'intubation', 'suction', 'supraglottic_airway',
  'oropharyngeal_airway', 'nasopharyngeal_airway', 'spinal_motion_restriction',
  'cpap', 'bipap', 'ventilator', 'oxygen',
]);
const DEVICES = [
  ['intubation', /\b(?:ett|et tube|endotracheal tube|tube|extubat\w*)\b/i],
  ['supraglottic_airway', /\b(?:sga|supraglottic|i[ -]?gel|king|lma)\b/i],
  ['oropharyngeal_airway', /\b(?:opa|oral airway|oropharyngeal)\b/i],
  ['nasopharyngeal_airway', /\b(?:npa|nasal airway|nasopharyngeal)\b/i],
  ['lucas', /\b(?:lucas|autopulse|mechanical (?:cpr|compressions?))\b/i],
  ['cpr', /\b(?:cpr|compressions?)\b/i],
  ['bvm', /\b(?:bvm|bagging|manual (?:breaths|ventilation)|bag[ -]valve)\b/i],
  ['suction', /\bsuction\w*\b/i],
  ['bipap', /\b(?:bi[ -]?pap|bilevel|bi-level|niv)\b/i],
  ['cpap', /\bcpap\b/i],
  ['ventilator', /\b(?:ventilator|transport vent|the vent)\b/i],
  ['oxygen', /\b(?:oxygen|o2|nrb|non[ -]?rebreather|nasal cannula)\b/i],
  ['collar', /\b(?:c[ -]?collar|cervical collar)\b/i],
  ['spinal_motion_restriction', /\b(?:spinal|c-spine|backboard)\b/i],
];
const STOP = /\b(?:remove|take off|pull out|extubate|stop|pause|disconnect|discontinue|turn off|d\/c)\b/i;
const REPLACE = /\b(?:reintubat\w*|reinsert|replace|reapply|restart|redeploy|new (?:tube|airway|mask|device))\b/i;

function stopEvents(text, focus, records) {
  const resolve = patientResolver(text, focus, records);
  return commandClauses(text).flatMap(clause => {
    if (!STOP.test(clause.text)) return [];
    let devices = DEVICES.filter(([, pattern]) => pattern.test(clause.text));
    if (!devices.length) {
      const ids = /\bairway\b/i.test(clause.text) ? ['intubation', 'supraglottic_airway', 'oropharyngeal_airway', 'nasopharyngeal_airway']
        : /\b(?:ventilations?|breaths)\b/i.test(clause.text) ? ['bvm', 'ventilator']
        : /\bmask\b/i.test(clause.text) ? ['cpap', 'bipap', 'oxygen'] : [];
      devices = ids.map(id => [id]);
    }
    return devices.map(([procedure_id]) => ({
      procedure_id, patient: resolve(clause.index), active: false, orderIndex: clause.index,
    }));
  });
}

function faultEvents(reply, focus, records) {
  return String(reply).replace(/\[[^\]]*\]/g, '').split(/[.;!?\n]|\b(?:and|but|while)\b/i).flatMap(sentence => {
    if (/\b(?:no|not|without|never|if|risk|previously|earlier)\b/i.test(sentence)) return [];
    return DEVICES.filter(([, pattern]) => pattern.test(sentence)
      && /\b(?:stopped|stops|fails|failed|malfunction\w*|dislodged|disconnected|removed|switched off)\b/i.test(sentence))
      .map(([procedure_id]) => ({ procedure_id, patient: patientFor(sentence, focus, records), active: false, orderIndex: Infinity }));
  });
}

function careEvents(text, rolls, focus, records, reply = '') {
  const events = stopEvents(text, focus, records);
  for (const roll of rolls) {
    if (!PROCEDURES.has(roll.procedure_id) || roll.continued) continue;
    const patient = /^patient_\d+$/.test(roll.patient) ? roll.patient : focus || 'patient_1';
    const active = roll.outcome === 'SUCCESS';
    events.push({ procedure_id: roll.procedure_id, patient, active, orderIndex: roll.orderIndex ?? -1 });
    if (roll.trauma_variant === 'collar') events.push({ procedure_id: 'collar', patient, active, orderIndex: roll.orderIndex ?? -1 });
    if (active && ['cpap', 'bipap', 'ventilator', 'bvm'].includes(roll.procedure_id)) {
      for (const id of ['cpap', 'bipap', 'ventilator', 'bvm'].filter(id => id !== roll.procedure_id)) {
        events.push({ procedure_id: id, patient, active: false, orderIndex: roll.orderIndex ?? -1 });
      }
    }
  }
  events.push(...faultEvents(reply, focus, records));
  return events.sort((a, b) => a.orderIndex - b.orderIndex)
    .map(({ orderIndex, ...event }) => event);
}

function activeCare(turns, records) {
  const active = new Set();
  for (const turn of turns) {
    const focus = turn.patientFocus?.id || 'patient_1';
    const events = turn.careEvents || careEvents(turn.report || turn.skip ? '' : turn.user || '', turn.rolls || [], focus, records, turn.assistant);
    for (const event of events) {
      const key = `${event.patient}|${event.procedure_id}`;
      if (event.active) active.add(key); else active.delete(key);
    }
  }
  return active;
}

function ongoingCareFor(turns, text, focus, records) {
  const successes = activeCare(turns, records);
  const order = normalizeForDetection(text);
  const resolve = patientResolver(order, focus, records);
  const stops = stopEvents(order, focus, records);
  return entry => {
    const id = entry.proc.id;
    const patient = resolve(entry.orderIndex);
    const care = entry.presentation?.trauma_variant === 'collar' ? 'collar' : id;
    const stopped = stops.some(event => event.patient === patient && event.procedure_id === care && event.orderIndex <= entry.orderIndex);
    const clause = commandClauses(order).find(clause => clause.index <= entry.orderIndex
      && entry.orderIndex <= clause.index + clause.text.length + 2)?.text || entry.sentence || '';
    return { patient, continued: PROCEDURES.has(id) && !stopped && !REPLACE.test(clause) && successes.has(`${patient}|${care}`) };
  };
}

module.exports = { ongoingCareFor, careEvents, stopEvents, activeCare };
