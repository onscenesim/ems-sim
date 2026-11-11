'use strict';

const SHOCK_PROC_IDS = new Set(['defibrillation', 'cardioversion']);

function shockEnergy(message, procedureId, patient, vitals, previous) {
  const explicit = /\b(\d{1,4}(?:\.\d+)?)\s*(?:joules?|j)\b(?!\s*(?:\/|per)\s*kg\b)/i.exec(message)
    || /\b(?:shock|defib(?:rillate|rillation)?|cardiovert|cardioversion)\s+(?:at|to)\s+(\d{1,3})(?=\s*(?:[.,;!?]|$))/i.exec(message);
  if (Number(explicit?.[1]) > 0) return Math.min(360, Math.max(1, Math.round(Number(explicit[1]))));

  const sync = procedureId === 'cardioversion';
  const retry = previous && previous.outcome !== 'SUCCESS';
  const age = patient.age == null || patient.age === '' ? NaN : Number(patient.age);
  const typedWeight = /\b(\d{1,3}(?:\.\d+)?)\s*(?:kg|kilograms?)\b/i.exec(message);
  const recordedWeight = Number(typedWeight?.[1] ?? patient.weight_kg ?? vitals?.WeightKg);
  const perKg = Number(/\b(\d{1,2}(?:\.\d+)?)\s*(?:joules?|j)\s*(?:\/|per)\s*kg\b/i.exec(message)?.[1]);
  if (recordedWeight > 0 && perKg > 0) return Math.min(360, Math.max(1, Math.round(recordedWeight * perKg)));
  if (age >= 0 && age < 18) {
    // The simulator does not always have a weight; use an age-based estimate.
    const kg = recordedWeight > 0 ? recordedWeight : age < 1 ? 4 + 7 * age
      : age < 13 ? 2 * age + 8 : 40 + 4 * (age - 13);
    const dose = perKg > 0 ? perKg : sync ? (retry ? 2 : 1) : (retry ? 4 : 2);
    return Math.min(sync ? 200 : 360, Math.max(1, Math.round(kg * dose)));
  }

  const rhythm = `${vitals?.Rhythm || ''} ${message}`.replace(/_/g, ' ');
  const initial = sync && !/\b(?:a[ -]?fib|a[ -]?flutter|atrial (?:fibrillation|flutter)|af|afl)\b/i.test(rhythm) ? 100 : 200;
  if (!retry) return initial;
  const lastEnergy = previous.shock_energy ?? initial;
  return [100, 200, 300, 360].find(joules => joules >= initial && joules > lastEnergy) ?? 360;
}

function resolveShock(roll, syncEnabled) {
  const synchronized = roll.procedure_id === 'cardioversion' && syncEnabled;
  const missedSync = roll.procedure_id === 'cardioversion' && !synchronized;
  if (!missedSync) return { ...roll, shock_sync: synchronized };
  const forced = { roll: 1, outcome: 'COMPLICATION', both_rolls: null };
  return {
    ...roll, ...forced, disadvantage: false, shock_sync: false, shock_sync_missed: true,
    ...(roll.multi_roll ? { rolls: roll.rolls.map(result => ({ ...result, ...forced })) } : {}),
  };
}

module.exports = { SHOCK_PROC_IDS, shockEnergy, resolveShock };
