'use strict';

const SHOCK_PROC_IDS = new Set(['defibrillation', 'cardioversion']);

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

module.exports = { SHOCK_PROC_IDS, resolveShock };
