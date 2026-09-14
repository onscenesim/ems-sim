'use strict';

// Educational signal model, not a calibrated device/physiology model. The
// narrative supplies physiology and equipment events; this reducer owns the
// monitor reading. Never feed its artifact-adjusted output back into physiology.
const valueOf = raw => raw && typeof raw === 'object' ? raw.value : raw;
const choice = (raw, values) => values.includes(valueOf(raw)) ? valueOf(raw) : null;
function saturation(raw) {
  const value = valueOf(raw);
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function isPulseless(vitals) {
  const rhythm = String(valueOf(vitals.Rhythm) || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return valueOf(vitals.Perfusion) === 'absent'
    || /^(?:vf|v_?fib\w*|ventricular_fib\w*|fine_vf|coarse_vf|asystole|flatline|pea|pulseless\w*)$/.test(rhythm);
}

function derivePulseOx(vitals, previous = null, seed = {}) {
  const measured = saturation(vitals.TrueSpO2) ?? saturation(vitals.SpO2);
  const trueSpO2 = measured ?? previous?.trueSpO2 ?? null;
  const probe = choice(vitals.PulseOxProbe, ['connected', 'disconnected', 'unplaced'])
    || (previous?.probe === 'disconnected' ? 'disconnected' : measured !== null ? 'connected' : previous?.probe || 'unplaced');
  const bp = String(valueOf(vitals.BP) || '').match(/^(\d+)\/(\d+)$/);
  // Explicit current perfusion takes precedence over an episodic/stale cuff.
  // BP is only a fallback; normal BP does not rule out poor peripheral flow.
  // Age-adjust the fallback so a normal infant BP is not treated as shock.
  const age = Number(seed.patient_age);
  const lowSbp = Number.isFinite(age) && age < 10 ? (age < 1 ? 70 : 70 + 2 * age) : 90;
  const perfusion = isPulseless(vitals) ? 'absent'
    : choice(vitals.Perfusion, ['normal', 'poor'])
      || (bp ? (Number(bp[1]) < lowSbp ? 'poor' : 'normal') : previous?.perfusion || 'normal');

  // Only the equipment and clinical complication roles may introduce a false
  // sensor reading. A lying bystander cannot change the monitor electronically.
  const mayDistort = ['equipment_failure', 'clinical_curveball', 'all'].includes(seed.complication_type);
  const artifact = mayDistort
    ? choice(vitals.PulseOxArtifact, ['none', 'false_low', 'false_high', 'dropout']) || previous?.artifact || 'none'
    : 'none';
  const hasReading = measured !== null;
  const pulseRate = Number(valueOf(vitals.PulseRate) ?? valueOf(vitals.HR));
  let quality = 'good', reason = 'reliable';
  if (probe !== 'connected') { quality = 'absent'; reason = probe; }
  else if (perfusion === 'absent') { quality = 'absent'; reason = 'no_perfusion'; }
  else if (artifact === 'dropout') { quality = 'absent'; reason = 'sensor_dropout'; }
  else if (valueOf(vitals.PulseRate) === 0) { quality = 'absent'; reason = 'no_pulse'; }
  else if (!hasReading) { quality = 'absent'; reason = 'no_reading'; }
  else if (artifact !== 'none') { quality = 'unreliable'; reason = 'artifact'; }
  else if (perfusion === 'poor') { quality = 'poor'; reason = 'low_perfusion'; }

  let displayedSpO2 = quality === 'absent' ? null : trueSpO2;
  // Fixed, bounded training artifacts. Low perfusion alone flags uncertainty
  // without forcing either a desaturation or a false number.
  if (displayedSpO2 !== null && artifact === 'false_low') displayedSpO2 = Math.max(0, Math.round(trueSpO2 - 12));
  if (displayedSpO2 !== null && artifact === 'false_high') displayedSpO2 = Math.min(100, Math.round(trueSpO2 + 12));
  return {
    trueSpO2, displayedSpO2, quality, reliable: quality === 'good', reason,
    probe, perfusion, artifact,
    pulseRate: quality === 'absent' ? 0 : Number.isFinite(pulseRate) && pulseRate > 0 ? Math.min(300, pulseRate) : 75,
  };
}

function applyPulseOx(vitals, previous, seed) {
  if (!vitals) return vitals;
  const pulseOx = derivePulseOx(vitals, previous?.PulseOx, seed);
  const result = { ...vitals, PulseOx: pulseOx };
  for (const field of ['TrueSpO2', 'Perfusion', 'PulseOxProbe', 'PulseOxArtifact', 'PulseRate']) delete result[field];
  if (pulseOx.displayedSpO2 === null) delete result.SpO2;
  else result.SpO2 = pulseOx.displayedSpO2;
  if (isPulseless(vitals)) delete result.BP;
  return result;
}

module.exports = { derivePulseOx, applyPulseOx };
