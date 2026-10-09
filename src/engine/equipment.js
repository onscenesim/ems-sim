'use strict';

// An en-route crew or an unspecified backup cannot supply a monitor. On BLS,
// require both an arrived ALS resource and explicit equipment availability.
function hasCardiacMonitor(seed, backup = null) {
  return seed.provider_level !== 'BLS'
    || (backup?.status === 'on_scene' && backup.level === 'ALS' && backup.monitor === true);
}

const ECG_PROCEDURES = new Set(['twelve_lead', 'posterior_ecg', 'right_sided_ecg', 'v4r_ecg']);
function unavailableProcedure(id, context = {}) {
  return ECG_PROCEDURES.has(id) && context.monitor_available === false
    ? 'No cardiac monitor is available on this unit or from an arrived, equipped ALS crew.'
    : null;
}

module.exports = { hasCardiacMonitor, unavailableProcedure };
