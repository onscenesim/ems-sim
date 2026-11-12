'use strict';

const { normalizeForDetection } = require('./dice');

const PROCEDURE_SECONDS = {
  pulse_check: 10, rhythm_check: 10, capillary_refill: 10, tourniquet_time: 10,
  reassessment: 30, vitals_manual: 45, vitals_monitor: 30, physical_exam: 60,
  glucometry: 30, cardiac_monitor: 30, capnography_confirmation: 30,
  suction: 30, bvm: 30, oxygen: 30, medication_push: 30, cpr: 120,
  peripheral_iv: 90, io_access: 60, intubation: 90,
};
const OVERLAP = /\b(?:while|simultaneously|in parallel|at the same time)\b/i;

function hasBundledSuction(rolls) {
  const suction = rolls.find(roll => roll.procedure_id === 'suction');
  return !!suction && rolls.some(roll => roll.procedure_id === 'intubation' && roll.patient === suction.patient);
}

// The clock advances by work performed. An explicitly concurrent assignment
// to another available crew member can overlap the current group of tasks.
function careSeconds(text, rolls, { partner, captain } = {}) {
  const order = normalizeForDetection(text);
  const roles = Object.entries({ partner, captain }).filter(([, name]) => name);
  const bundledSuction = hasBundledSuction(rolls);
  let total = 0;
  let previousIndex = 0;
  let previousActor = 'provider';
  let leadingOverlap = false;
  let group = new Map();
  for (const roll of rolls) {
    const id = roll.procedure_id;
    const seconds = roll.continued && !['cpr', 'bvm', 'suction'].includes(id)
      ? 0 : PROCEDURE_SECONDS[id] ?? (roll.no_roll ? 0 : 60);
    if (!seconds || (id === 'suction' && bundledSuction)) continue;
    const index = roll.orderIndex ?? order.length;
    const prefix = order.slice(previousIndex, index).toLowerCase();
    const clause = prefix.split(/[;.!?\n,]|\b(?:and|then|while)\b/i).at(-1).trim();
    const words = clause.split(/\W+/);
    const sameOrder = group.size > 0 && index === previousIndex && roll.orderIndex != null;
    const actor = sameOrder ? previousActor : roles.find(([role, name]) => words.includes(role)
      || words.includes(name.toLowerCase().split(/\W+/)[0]))?.[0] || 'provider';
    const parallel = sameOrder || (!roll.requiredRoute && (OVERLAP.test(prefix) || leadingOverlap));
    leadingOverlap = !group.size && OVERLAP.test(prefix);
    if (!parallel && group.size) {
      total += Math.max(...group.values());
      group = new Map();
    }
    group.set(actor, (group.get(actor) || 0) + seconds);
    previousIndex = index;
    previousActor = actor;
  }
  return total + Math.max(0, ...group.values());
}

function clockStamp(minute) {
  const seconds = Math.round(minute * 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

module.exports = { careSeconds, clockStamp, hasBundledSuction };
