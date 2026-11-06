(function (root) {
  'use strict';
  const faceTransforms = {
    adult: 'translate(235 57) scale(.46)',
    female: 'translate(235 57) scale(.46)',
    child: 'translate(214 15) scale(.38)',
    baby: 'translate(209 34) scale(.38)',
  };

  function variantFor(patient = {}) {
    // Unknown ages must not be coerced to zero (newborn).
    const age = typeof patient?.age === 'number' ? patient.age : NaN;
    if (Number.isFinite(age) && age >= 0) {
      if (age < 4) return 'baby';
      if (age < 14) return 'child';
    }
    return patient?.sex === 'female' ? 'female' : 'adult';
  }

  function patientFor(current = {}, previous = {}) {
    // Use the response's focus before the notebook catches up. Never borrow
    // the primary patient's demographics for an unidentified secondary patient.
    const id = current.patient_focus?.id || previous.patient_focus?.id || 'patient_1';
    return {
      ...(id === 'patient_1' ? previous.patient || {} : {}),
      ...previous.patients?.find(patient => patient.id === id),
      ...current.patients?.find(patient => patient.id === id),
    };
  }

  function apply(overlay, patient) {
    if (!overlay) return;
    const variant = variantFor(patient);
    overlay.dataset.patientVariant = variant;
    overlay.querySelector('#loading-face-position')?.setAttribute('transform', faceTransforms[variant]);
    return variant;
  }

  const api = { variantFor, patientFor, apply };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TransportPatient = api;
})(typeof window === 'object' ? window : globalThis);
