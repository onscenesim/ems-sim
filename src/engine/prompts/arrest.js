'use strict';

// Dose references: AHA 2025 adult and pediatric cardiac-arrest algorithms.
// https://cpr.heart.org/en/resuscitation-science/cpr-and-ecc-guidelines/algorithms/
// Gameplay and evaluation must use the same default and exceptions.
const ARREST_TRANSPORT_DOCTRINE = `ARREST TRANSPORT DOCTRINE: The default for an active medical arrest (PEA, asystole, VF/pulseless VT) is resuscitation on scene until ROSC or appropriate field termination. A cath-lab destination alone is not a reason to transport during active CPR. Do not pressure the provider to depart or fault on-scene care under this default. Exceptions require established scene findings and applicable local protocols/resources: TRAUMATIC arrest when hospital intervention may benefit the patient (respect unsurvivable injuries and field-termination criteria); HYPOTHERMIC arrest needing hospital rewarming/ECMO capability; MATERNAL arrest with a visibly gravid uterus at approximately 20+ weeks when the local pathway calls for early transport for resuscitative hysterotomy with continuous CPR and manual left uterine displacement; and protocolized ECPR/refractory-VF transfer only where regional capability and eligibility are established. Appropriate transport under an established exception is not an error; assess timing and CPR continuity against that pathway. Do not assume an exception from a hidden label, age, or shock count alone. If transport is ordered without an established exception, the permitted crew concern is voiced once, then the crew complies. After ROSC, prioritize appropriate transport. These are transport permissions, never automatic loading/departure orders.`;

const ARREST_MEDICATION_PRINCIPLES = 'ARREST MEDICATION ELIGIBILITY: Antiarrhythmics are not routine treatment for PEA/asystole. Amiodarone dosing applies only to persistent shock-refractory VF/pulseless VT without a patient-specific contraindication; a wide complex or shock count alone is insufficient. Provider scope, patient-specific pathology/contraindications and pediatric weight-based dosing take precedence over adult dose defaults. Local protocol governs plausible timing variations. Do not invent a dose, weight, medication order, or unrolled administration, and do not disclose hidden pathology through coaching.';

function isPediatricArrest(seed) {
  if (typeof seed.patient_age === 'number' && Number.isFinite(seed.patient_age)) return seed.patient_age < 18;
  return /pediatric|infant|neonat|toddler|child|adolescent/i.test(seed.age_group || '');
}

function amiodaroneContraindicated(seed) {
  if (seed.amiodarone_contraindicated === true) return true;
  // Older saved seeds predate the explicit field. Use shipped case identities
  // and flags, not loose matches on a case key's differential or negated advice.
  return /amiodarone_contraindicated|amiodarone is contraindicated/i.test(seed.special_flags || '')
    || /\btorsades\b|\bTCA overdose\b/i.test(seed.presentation || '');
}

function buildArrestMedicationRules(seed) {
  if (seed.provider_level === 'BLS') return 'BLS ARREST MEDICATIONS: The unit has no IV/IO arrest drug capability. Do not require, prompt for, or administer IV/IO epinephrine or amiodarone; continue ordered BLS resuscitation and AED analysis within the manifest. An arriving ALS crew does not silently upgrade this unit or authorize unrolled care.';
  const lines = [ARREST_MEDICATION_PRINCIPLES,
    'EPINEPHRINE INTERVALS: Track every ordered arrest dose. The usual interval is 3–5 minutes; if re-ordered under 3 minutes without an applicable special-circumstance/local protocol, the partner states the elapsed interval and holds the dose until re-ordered. Special-circumstance protocols (including severe hypothermia) supersede generic timing.'];
  if (amiodaroneContraindicated(seed)) {
    lines.push('PATIENT-SPECIFIC AMIODARONE CONSTRAINT (internal): Amiodarone is contraindicated in this case. Never apply the default third/fifth-shock amiodarone sequence or substitute it automatically. If the provider orders it, portray the case-consistent clinical consequence according to the injected roll; do not make the contraindicated drug beneficial or expose the hidden cause. Any permitted crew warning requires revealed supporting findings under the coaching contract.');
  } else if (isPediatricArrest(seed)) {
    lines.push('PEDIATRIC AMIODARONE: Only for eligible refractory VF/pulseless VT, use PALS weight-based IV/IO dosing: 5 mg/kg initially (maximum 300 mg); subsequent doses, when indicated by the local PALS protocol, remain 5 mg/kg with a maximum of 150 mg each. These are dose ceilings, not fixed pediatric doses. Use a stated/measured weight or a documented length-based estimate; ask for clarification if a needed weight/dose is unavailable. Never use the fixed adult 300 mg/150 mg sequence for a child. Other pediatric arrest medications are weight-based under the applicable PALS protocol.');
  } else {
    lines.push('ADULT AMIODARONE: Only while eligible shock-refractory VF/pulseless VT persists, the default sequence is an ordered 300 mg IV/IO dose after the third shock and an ordered 150 mg dose after the fifth shock. Track shocks and prior doses; do not repeat the initial 300 mg dose. This sequence never applies to PEA/asystole, a perfusing tachycardia or a patient-specific contraindication.');
  }
  return lines.join('\n    ');
}

module.exports = { ARREST_TRANSPORT_DOCTRINE, ARREST_MEDICATION_PRINCIPLES, buildArrestMedicationRules, isPediatricArrest, amiodaroneContraindicated };
