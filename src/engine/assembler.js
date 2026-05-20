'use strict';

const { CREW }    = require('../data/crew');
const { REGIONS } = require('../data/regions');
const { COMORBIDITIES } = require('../data/comorbidities');

function crewRecord(name) {
  return CREW.find(c => c.name === name) || null;
}

function regionRecord(id) {
  return REGIONS.find(r => r.id === id) || null;
}

function comorbidityRecord(id) {
  return COMORBIDITIES.find(c => c.id === id) || null;
}

/**
 * Build the scenario seed block that gets inserted into the system prompt.
 *
 * The seed block is what Claude reads to run the simulation. It must be:
 * - Complete (Claude needs no other source of truth)
 * - Structured but readable (it will be in a system prompt, not a UI)
 * - Authoritative on all hidden information
 *
 * @param {object} seed  Output of roller.rollScenario()
 * @returns {string}     Formatted seed block text
 */
function assembleSeedBlock(seed) {
  const region = regionRecord(seed.region);
  const partner = crewRecord(seed.crew_partner);
  const captain = crewRecord(seed.crew_captain);
  const comorbidity = seed.comorbidity_bundle ? comorbidityRecord(seed.comorbidity_bundle) : null;

  const isCurveball = !!seed.true_diagnosis;

  const lines = [];

  lines.push('=== SCENARIO SEED ===');
  lines.push(`Scenario ID: ${seed.scenario_id}`);
  lines.push(`Difficulty: ${seed.difficulty}`);
  lines.push(`Provider level: ${seed.provider_level}`);
  lines.push('');

  // --- Patient card ---
  lines.push('--- PATIENT CARD (hidden from user) ---');
  lines.push(`Patient name: ${seed.patient_name}`);
  lines.push(`Age: ${seed.patient_age} (${seed.age_group.replace('_', ' ')})`);
  lines.push(`Sex: ${seed.sex}`);
  lines.push(`Category: ${seed.category}`);
  if (isCurveball) {
    lines.push(`Surface presentation: ${seed.presentation}`);
    lines.push(`TRUE diagnosis (hidden until reveal): ${seed.true_diagnosis}`);
    lines.push(`Reveal trigger: ${seed.reveal_trigger}`);
    lines.push(`HINT (for your narration, not for user): ${seed.hint}`);
  } else {
    lines.push(`Presentation: ${seed.presentation}`);
    lines.push(`HINT (for your narration, not for user): ${seed.hint}`);
  }
  if (seed.special_flags) {
    lines.push(`Special flags: ${seed.special_flags}`);
  }
  lines.push('');

  // --- Comorbidities ---
  lines.push('--- COMORBIDITY BUNDLE ---');
  if (comorbidity) {
    lines.push(`Bundle: ${comorbidity.id}`);
    lines.push(`Components: ${comorbidity.components}`);
    lines.push(`Clinical impact: ${comorbidity.clinical_impact}`);
    if (comorbidity.notes) lines.push(`Notes: ${comorbidity.notes}`);
  } else {
    lines.push('Bundle: otherwise_healthy');
    lines.push('No significant past medical history, no regular medications, no known allergies.');
  }
  lines.push('');

  // --- Trajectory ---
  lines.push('--- SCENARIO TRAJECTORY ---');
  lines.push(`Trajectory: ${seed.trajectory}`);
  if (seed.decompensation_clock !== null) {
    lines.push(`Decompensation clock: ${seed.decompensation_clock} minutes from scene arrival`);
    lines.push('INSTRUCTION: At decompensation_clock minutes of scene time, patient status worsens. If the user has not addressed the core problem by this time, initiate the appropriate clinical deterioration described by the trajectory. Be specific and clinical — do not vaguely say "patient looks worse."');
  } else {
    lines.push('Patient is stable. No decompensation clock active.');
  }
  lines.push('');

  // --- Complications ---
  lines.push('--- COMPLICATION ENGINE ---');
  if (seed.complication_type !== 'none' && seed.complication_roll !== null) {
    lines.push(`Complication type: ${seed.complication_type}`);
    switch (seed.complication_type) {
      case 'equipment_failure':
        lines.push('INSTRUCTION: At a clinically inconvenient moment (your discretion, maximum dramatic impact), one piece of equipment fails. Choose which piece of equipment based on what the user is relying on. Narrate it through the partner\'s observation or user\'s direct experience — never label it as "the complication engine fired."');
        break;
      case 'unreliable_bystander':
        lines.push('INSTRUCTION: A bystander or family member on scene is actively giving incorrect or misleading clinical history. The misinformation should be plausible and relevant to the presentation. The user must notice the inconsistency to correct it.');
        break;
      case 'clinical_curveball':
        lines.push('INSTRUCTION: There is a separate complicating clinical finding that develops during the scenario. This is in addition to the primary presentation — not a replacement. Time its revelation for maximum clinical challenge, after the user has begun treatment.');
        break;
    }
  } else {
    lines.push('No complication active this scenario.');
  }
  lines.push('');

  // --- Scene modifiers ---
  lines.push('--- SCENE MODIFIERS ---');
  lines.push(`Time of day: ${seed.time_of_day}`);
  lines.push(`Caller behavior: ${seed.caller_behavior}`);
  if (seed.weather) lines.push(`Weather: ${seed.weather}`);
  if (seed.special_circumstance) lines.push(`Special circumstance: ${seed.special_circumstance}`);
  lines.push('');

  // --- Region context ---
  if (region) {
    lines.push('--- REGION CONTEXT ---');
    lines.push(`Region: ${region.id} (${region.examples})`);
    lines.push(`Response times: ${region.response_times}`);
    lines.push(`Nearest hospital: ${region.nearest_hospital_min}`);
    lines.push(`Major hospital: ${region.major_hospital_min}`);
    lines.push(`ALS availability: ${region.als_availability}`);
    lines.push(`ALS scope tag: ${region.als_scope_tag}`);
    lines.push(`Medical direction: ${region.medical_direction_culture}`);
    lines.push(`BLS scope notes: ${region.bls_scope_notes}`);
    if (region.agency_culture) lines.push(`Agency culture: ${region.agency_culture}`);
    lines.push('');
  }

  // --- Crew ---
  lines.push('--- CREW ---');
  if (partner) {
    lines.push(`Partner: ${partner.name} (${partner.role})`);
    lines.push(`  Competency: ${partner.competency} | Enthusiasm: ${partner.enthusiasm} | Confrontation: ${partner.confrontation}`);
    lines.push(`  Personality: ${partner.personality_notes}`);
    lines.push(`  Trigger behaviors: ${partner.trigger_behaviors}`);
  }
  if (captain) {
    lines.push(`Captain: ${captain.name} (${captain.role})`);
    lines.push(`  Competency: ${captain.competency} | Enthusiasm: ${captain.enthusiasm} | Confrontation: ${captain.confrontation}`);
    lines.push(`  Personality: ${captain.personality_notes}`);
    lines.push(`  Trigger behaviors: ${captain.trigger_behaviors}`);
  }
  lines.push('');

  // --- Engine instructions ---
  lines.push('--- ENGINE INSTRUCTIONS ---');
  lines.push('1. You are the simulation engine and play ALL non-user roles: patient, partner, captain, bystanders, dispatch, medical direction, family members, and receiving hospital.');
  lines.push('2. DICE ROLLS: All dice rolls are performed server-side and injected into the conversation as [SYSTEM ROLL: procedure — d20=X vs DC Y — OUTCOME]. Your ONLY job is to narrate the clinical consequence of that pre-determined outcome. NEVER write your own [ROLL: ...] notation. NEVER invent a dice result. NEVER decide success or failure yourself — this rule applies to ALL procedures, including those not tracked in the roll database. If a user performs a procedural intervention (IV access, intubation, medication push, airway procedure, needle decompression, cardioversion, etc.) and NO [SYSTEM ROLL: ...] appears in their message, the procedure is untracked. You have exactly two options: (a) if it is a routine assessment or guaranteed action (pulse check, lung sounds, applying O2), narrate it matter-of-factly with no outcome judgment; (b) if it is a clinical skill that could realistically succeed or fail, narrate the attempt but DO NOT commit to success or failure — describe what was done, not whether it worked. NEVER use words like successfully, confirmed, patent, failed, or secured to describe the outcome of an unrolled intervention. The user can re-attempt on their next turn and the server will roll it then.');
  lines.push('3. ZERO GUIDANCE POLICY: Do not suggest interventions, hint at the diagnosis, or volunteer clinical information the user has not asked for. Let errors have consequences. Errors do not trigger warnings — they produce outcomes.');
  lines.push('4. CLINICAL NARRATION ONLY: All findings are revealed through clinical observations that the user requests. You never label diagnoses directly. Vital signs are numbers. Exam findings are physical descriptions. ECG is a waveform description. Let the user interpret.');
  lines.push('5. SCENE CLOCK: Track simulated scene time in minutes. Every action takes time. Simple assessments: 1 min. Full head-to-toe: 3 min. Procedures: 2-5 min depending on complexity. Packaging: 2 min. The decompensation clock runs against scene time.');
  lines.push('6. DEBRIEF TRIGGER: When the user says "transfer of care", "patient is in ED hands", "we\'re clear", "pronounce", or equivalent, close the scenario and ask if they want the debrief.');
  lines.push('7. DISPATCH: Begin the scenario with a dispatch message in this format: "DISPATCH: [nature of call] — [address or location] — [any additional info from caller]. Your partner is [partner name]. Time: [time_of_day]."');
  lines.push('8. The hint above is for your internal narration quality only. Do not reveal it to the user in any form.');
  if (isCurveball) {
    lines.push('9. CURVEBALL: The surface presentation is what the user sees. The true diagnosis is hidden. Reveal it ONLY when the reveal_trigger condition is met by user action. If the user never triggers the reveal, they finish the scenario without knowing. Debrief reveals the true diagnosis.');
  }
  lines.push('10. TRANSPORT REQUIRES EXPLICIT ORDER: Never move the ambulance or go en route without the user explicitly stating a destination and ordering transport. Packaging the patient and loading into the ambulance does NOT mean transport has begun — the unit is stationary until ordered otherwise. The user must say something like "let\'s go to [hospital]", "go en route to [destination]", "transport to [hospital]", or equivalent. Your partner will ask for a destination if the unit is loaded and none has been given, but will not move without one.');
  lines.push('11. AMBIGUOUS SHORTHAND: EMS abbreviations can be genuinely ambiguous. If the user writes something like "apply a 4L" or "get a 4L" without clear context, do NOT assume O2 or monitor — ask one short clarifying question before acting: e.g. "4 liters O2 or 4-lead monitor?" Similarly, "4L NC" unambiguously means nasal cannula oxygen; "4-lead ECG" or "4L ECG" unambiguously means cardiac monitoring. When the meaning is clear from context, proceed without asking. Only clarify when the shorthand is genuinely ambiguous and the two interpretations would produce different clinical actions.');
  lines.push('');
  lines.push('12. POST-HANDOFF BOUNDARY: Once the patient has been physically delivered to the receiving facility and the ED or hospital team has taken over at bedside, do NOT accept further clinical interventions from the user. Respond as the charge nurse or receiving physician: something like "We have it from here — thanks for the report." If the user continues attempting clinical orders, gently redirect: "The patient is in ED hands now. Do you want to clear and run a debrief?" This boundary applies the moment the receiving team physically takes over — not just when transport begins. Packaging and loading do NOT trigger this boundary; arrival at the facility and bedside handoff do.');
  lines.push('');
  lines.push('=== END SEED ===');

  return lines.join('\n');
}

/**
 * Build a compact scenario log summary for the debrief API call.
 */
function buildDebriefContext(seed, events) {
  const lines = [];
  lines.push('=== SCENARIO LOG FOR DEBRIEF ===');
  lines.push(`Scenario ID: ${seed.scenario_id}`);
  lines.push(`Category: ${seed.category} | Difficulty: ${seed.difficulty}`);
  lines.push(`Presentation: ${seed.presentation}`);
  if (seed.true_diagnosis) lines.push(`True diagnosis: ${seed.true_diagnosis}`);
  if (seed.special_flags) lines.push(`Special flags: ${seed.special_flags}`);
  lines.push(`Patient: ${seed.patient_age}yo ${seed.sex} | Comorbidity: ${seed.comorbidity_bundle || 'otherwise_healthy'}`);
  lines.push(`Trajectory: ${seed.trajectory} | Decompensation clock: ${seed.decompensation_clock || 'N/A'} min`);
  lines.push(`Complication: ${seed.complication_type}`);
  lines.push(`Region: ${seed.region} | Provider: ${seed.provider_level}`);
  lines.push(`Partner: ${seed.crew_partner} | Captain: ${seed.crew_captain}`);
  lines.push('');
  lines.push('--- EVENT TIMELINE ---');
  for (const ev of events) {
    const parts = [`T+${ev.scene_minute}min`, `[${ev.event_type}]`];
    if (ev.procedure_id) parts.push(ev.procedure_id);
    if (ev.roll !== null && ev.roll !== undefined) parts.push(`d20=${ev.roll} vs DC${ev.dc} → ${ev.outcome}`);
    if (ev.detail) parts.push(`| ${ev.detail}`);
    lines.push(parts.join(' '));
  }
  lines.push('');
  lines.push('--- DEBRIEF FLAGS ---');
  const amsCategories = ['toxicology', 'medical', 'neuro', 'behavioral', 'pediatric'];
  const hasBGL = events.some(e => e.procedure_id === 'glucometry' || e.procedure_id === 'vitals_monitor' || (e.detail && /glucose|BGL|glucomet|finger.?stick/i.test(e.detail)));
  if (!hasBGL && amsCategories.includes((seed.category || '').toLowerCase())) {
    lines.push('BGL_NOT_CHECKED: Blood glucose was never checked. In this category, hypoglycemia is always on the differential. Flag this as a missed critical assessment in debrief.');
  }
  lines.push('');
  lines.push('--- DEBRIEF CONSTRAINTS ---');
  lines.push('You have access ONLY to the structured event log above — not the full conversation transcript.');
  lines.push('NEVER fabricate specific facility or hospital names. Use "the receiving facility" if the destination is not in this log.');
  lines.push('NEVER invent medication names, dosages, or procedures not present in this log.');
  lines.push('NEVER assign specific timestamps (e.g. T+12) to events that are not in this log — use vague language ("early in the call", "during transport") instead.');
  lines.push('If an event is in this log, reference it precisely. If it is not, acknowledge uncertainty rather than guessing.');
  lines.push('=== END LOG ===');
  return lines.join('\n');
}

module.exports = { assembleSeedBlock, buildDebriefContext };
