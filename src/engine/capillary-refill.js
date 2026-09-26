'use strict';

// An episodic, explicitly requested assessment. Ignore unsolicited model values
// and preserve the actual reading/time rather than refreshing them every turn.
function applyCapillaryRefill(vitals, previous, assessed, minute = 0) {
  // A missing whole tag is not a new snapshot; Session retains its last reading.
  if (!vitals) return null;
  const result = { ...vitals };
  delete result.CapRefill;
  const raw = vitals?.CapRefill;
  const value = raw && typeof raw === 'object' ? raw.value : raw;
  if (assessed && typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    const seconds = Math.max(0, Math.round(minute * 60));
    result.CapRefill = { value, t: `T+${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, tMin: seconds / 60 };
  } else if (previous?.CapRefill !== undefined) {
    result.CapRefill = previous.CapRefill;
  }
  return Object.keys(result).length ? result : null;
}

module.exports = { applyCapillaryRefill };
