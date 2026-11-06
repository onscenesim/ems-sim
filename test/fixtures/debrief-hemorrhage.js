'use strict';

function hemorrhageCases() {
  const seed = {
    scenario_id: 'internal-hemorrhage-review', timestamp_start: '2026-11-06T12:00:00Z',
    category: 'trauma', difficulty: 'NORMAL', provider_level: 'BLS', region: 'SUBURBAN',
    patient_age: 38, sex: 'male', trajectory: 'progressive hemorrhagic shock',
    presentation: 'Blunt abdominal trauma after MVC with suspected intra-abdominal hemorrhage',
    hint: 'An injured spleen is bleeding internally. There is no accessible abdominal bleeding source. Definitive control requires hospital care. Evaluate field recognition and appropriate timely care, not diagnostic certainty.',
    special_flags: 'suspected_noncompressible_internal_hemorrhage',
    complication_type: 'none', total_scene_minutes: 14,
  };
  const vitals = { HR: 124, BP: '86/54', RR: 24, SpO2: 97, GCS: 15 };
  const initial = {
    user: 'Confirm scene safety, assess ABCs, expose and examine front and back for injuries, obtain manual vitals and ask about the mechanism.',
    assistant: 'Scene safe. Airway patent, breathing adequate with equal breath sounds. Pale and clammy with weak radial pulses. Left upper abdomen tender and guarded after a steering-wheel impact. Pelvis and limbs have no deformity or pain. No accessible external bleeding wound is found. No IV equipment or blood products are available on this BLS unit.',
    sceneMinute: 2, vitals,
  };
  function make(label, { external = false, omitExternal = false, delay = false, deteriorate = false, pelvic = false } = {}) {
    const caseSeed = { ...seed, total_scene_minutes: delay ? 34 : 14 };
    let first = structuredClone(initial);
    if (pelvic) {
      Object.assign(caseSeed, { presentation: 'High-energy pelvic injury with suspected internal pelvic hemorrhage',
        hint: 'Pelvic fracture with internal hemorrhage; stabilization is indicated but does not prove definitive hemostasis.' });
      first.assistant = first.assistant.replace('Left upper abdomen tender and guarded after a steering-wheel impact. Pelvis and limbs have no deformity or pain.',
        'Severe pelvic pain after a high-energy side impact; leg lengths differ. The pelvis is not rocked. No significant abdominal tenderness.');
    }
    if (external) first.assistant = first.assistant.replace('No accessible external bleeding wound is found.',
      'A deep left forearm laceration is visibly spurting blood. This is a separate accessible external bleeding source.');
    const turns = [first];
    if (external && !omitExternal) turns.push({
      user: 'Apply direct pressure to the left forearm wound with sterile gauze and maintain it.',
      assistant: 'Direct pressure stops the visible bleeding from the left forearm wound. The abdomen remains guarded and the pulse weak.',
      sceneMinute: 3, rolls: [{ procedure_id: 'bleeding_control', outcome: 'SUCCESS', roll: 18, dc: 12, target: 'left forearm', patient: 'patient_1' }],
      woundEvents: [{ woundId: 'forearm', patientId: 'patient_1', site: 'left forearm', action: 'attempt', method: 'pressure',
        before: { status: 'uncontrolled', holder: null, method: null }, after: { status: 'controlled_pressure', holder: 'provider', method: 'pressure' } }],
    });
    if (pelvic) turns.push({ user: 'Apply a pelvic binder at the greater trochanters without rocking the pelvis.',
      assistant: 'The binder is secured at the greater trochanters. Shock persists; no claim of definitive internal hemostasis is made.', sceneMinute: 3 });
    turns.push({
      user: delay ? 'Suspect internal hemorrhage, but stay here for 20 minutes trying to stop the internal bleeding with pressure on the abdomen before leaving.'
        : 'Suspect internal hemorrhage and recognize shock. Keep warm and load now; drive to the nearest appropriate trauma center. Pre-notify with findings and vital trends. Continue ABC support and reassessment within our BLS protocol.',
      assistant: delay ? 'The crew remains on scene for twenty additional minutes pressing on the closed abdomen. The internal bleeding continues and the patient becomes confused.'
        : `The patient is kept warm and loaded; transport starts at T+4 with the partner driving. The trauma center acknowledges the pre-alert.${external ? omitExternal ? ' The forearm wound remains untreated and continues spurting.' : ' You maintain forearm pressure in the back; that wound remains dry.' : ''}`,
      sceneMinute: delay ? 24 : 4, vitals: { ...vitals, GCS: delay ? 13 : 15 },
    });
    turns.push({ user: 'Continue transport and reassess ABCs, mentation and perfusion. Update the receiving team.',
      assistant: `Airway remains patent and breathing adequate. ${deteriorate || delay ? 'The patient becomes less responsive with weaker pulses despite continued care.' : 'The pulse remains weak and the abdomen guarded.'}${external && !omitExternal ? ' Visible forearm bleeding remains controlled with maintained pressure.' : ''}`,
      sceneMinute: delay ? 29 : 9, vitals: { ...vitals, BP: deteriorate || delay ? '68/40' : '84/52', GCS: deteriorate || delay ? 12 : 15 } });
    turns.push({ user: 'Transfer care with mechanism, findings, vital trends, treatment and response.',
      assistant: 'The receiving trauma team accepts bedside handoff. No subsequent hospital procedures or outcome have been observed.',
      sceneMinute: delay ? 34 : 14, report: true });
    return { label, seed: caseSeed, turns, departSceneMinute: delay ? 24 : 4,
      expectation: delay ? 'Criticize the avoidable scene delay and ineffective abdominal pressure, without demanding field internal hemostasis.'
        : omitExternal ? 'Identify the untreated visible forearm hemorrhage; do not fault failure to mechanically stop the internal source.'
        : pelvic ? 'Credit indicated pelvic stabilization and prompt transfer; persistent internal blood loss is not proof of failure.'
        : external ? 'Credit external control and timely internal-hemorrhage care separately; do not demand another external roll for ongoing internal shock.'
        : 'Credit recognition, BLS supportive care and prompt transport without a pressure/packing/tourniquet attempt; deterioration alone is not a care error.' };
  }
  return [make('Internal only: sound BLS care'), make('Internal only: deterioration despite sound care', { deteriorate: true }),
    make('Mixed bleeding: external controlled, internal ongoing', { external: true }),
    make('Mixed bleeding: external wound neglected', { external: true, omitExternal: true }),
    make('Internal bleeding: harmful scene delay', { delay: true }),
    make('Pelvic bleeding: appropriate binder and transport', { pelvic: true })];
}

module.exports = { hemorrhageCases };
