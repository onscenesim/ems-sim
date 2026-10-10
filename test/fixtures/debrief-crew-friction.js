'use strict';

// Paired calls: the first four have identical clinical care and timing.
// Only the fifth has a recorded care gap, caused by choosing to keep arguing.
function crewFrictionCases() {
  const seed = {
    scenario_id: 'debrief-crew-friction', timestamp_start: '2026-10-10T12:00:00Z',
    category: 'medical', difficulty: 'HARD', provider_level: 'BLS', region: 'urban',
    presentation: 'Abdominal pain with shock from a ruptured abdominal aortic aneurysm',
    true_diagnosis: 'Ruptured abdominal aortic aneurysm with internal hemorrhage',
    hint: 'Support ABCs, minimize scene time, and transport to a facility with emergency vascular surgery. Definitive confirmation requires hospital evaluation.',
    patient_age: 72, sex: 'male', trajectory: 'progressive shock',
    complication_type: 'crew friction', total_scene_minutes: 18,
  };
  const variants = [
    ['Quiet crew, sound care', '', '', false],
    ['Holt ignored, same sound care', 'Holt talks over the assessment: "Just make him walk it off! We used to do that all the time. Let me tell you about 1998..." He continues rambling. No one acts on his suggestion.', '', false],
    ['Holt briefly corrected, same sound care', 'Holt talks over the assessment: "Just make him walk it off! We used to do that all the time. Let me tell you about 1998..." He continues rambling. No one acts on his suggestion.', 'No, we are not doing that. ', false],
    ['Other crew upsetting, same sound care', 'A crew member interrupts repeatedly: "You are overreacting. This is just another whiner. We are going to miss lunch again." The patient hears the dismissive comments. No one changes care or refuses a task.', 'That is frustrating. ', false],
    ['Argument causes documented care delay', 'Holt talks over the assessment: "Just make him walk it off! We used to do that all the time. Let me tell you about 1998..." He continues rambling. No one acts on his suggestion.', 'No, we are not doing that. ', true],
  ];
  return variants.map(([label, dialogue, response, delayed]) => ({
    label, seed: { ...seed, total_scene_minutes: delayed ? 38 : 18 },
    departSceneMinute: delayed ? 24 : 4,
    turns: [{
      user: 'Assess scene safety, ABCs, vitals, glucose, and focused history and exam.',
      assistant: 'Scene safe. Awake with a patent airway and adequate breathing. Sudden abdominal pain, pale clammy skin, weak radial pulses. No external bleeding. Abdomen diffusely tender. The nearby hospital has emergency vascular surgery; ALS cannot intercept before arrival. ' + dialogue,
      sceneMinute: 2, vitals: { HR: 124, BP: '82/50', RR: 24, SpO2: 96, Glucose: 112, GCS: 15 },
    }, {
      user: response + (delayed
        ? 'I recognize shock, but hold transport for 20 minutes while I argue with Holt about his outdated advice.'
        : 'Recognize shock of uncertain cause. Keep warm, monitor ABCs, and load and depart now for the hospital with emergency vascular surgery. Pre-notify with the findings and uncertainty.'),
      assistant: delayed
        ? 'Transport is held for the argument. At T+22 the patient is more confused with weaker pulses.'
        : 'Patient secured, kept warm, and departing at T+4. Receiving team acknowledges the shock report.',
      sceneMinute: delayed ? 22 : 4, vitals: { HR: 128, BP: delayed ? '66/40' : '80/48', RR: 24, SpO2: 96, GCS: delayed ? 13 : 15 },
    }, {
      user: delayed
        ? 'End the argument. Keep warm, load, and depart now for the hospital with emergency vascular surgery. Pre-notify and reassess ABCs and perfusion en route.'
        : 'Reassess airway, breathing, mental status, and perfusion throughout transport; update the receiving team. Keep warm.',
      assistant: 'Transport continues. Airway patent, ventilation adequate, radial pulses weak.',
      sceneMinute: delayed ? 24 : 10, vitals: { HR: 132, BP: '76/46', RR: 26, SpO2: 96, GCS: 14 },
    }, {
      user: 'Transfer care with onset, findings, vital trends, uncertain cause, interventions and response.',
      assistant: 'Hospital team accepts care.', sceneMinute: delayed ? 38 : 18, report: true,
    }],
  }));
}

module.exports = { crewFrictionCases };
