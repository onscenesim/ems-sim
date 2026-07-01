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
  lines.push(`User unit identifier: ${seed.unit_name || 'Medic 1'}`);
  lines.push('');

  // --- Patient card ---
  lines.push('--- PATIENT CARD (hidden from user) ---');
  lines.push(`Patient name: ${seed.patient_name}`);
  lines.push(`Age: ${seed.patient_age_display || `${seed.patient_age} years old`} (${seed.age_group.replace('_', ' ')})`);
  lines.push(`Sex: ${seed.sex}`);
  lines.push(`Category: ${seed.category}`);
  if (isCurveball) {
    lines.push(`Surface presentation: ${seed.presentation}`);
    lines.push(`TRUE diagnosis (hidden until reveal): ${seed.true_diagnosis}`);
    lines.push(`Reveal trigger: ${seed.reveal_trigger}`);
    lines.push(`PRIVATE CASE KEY — never reveal, hint at, suggest, or act on (see Rule 8): ${seed.hint}`);
  } else {
    lines.push(`Presentation: ${seed.presentation}`);
    lines.push(`PRIVATE CASE KEY — never reveal, hint at, suggest, or act on (see Rule 8): ${seed.hint}`);
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
    lines.push(`[INTERNAL — NEVER MENTION TO STUDENT] Deterioration threshold: ${seed.decompensation_clock} minutes of scene time`);
    lines.push('INSTRUCTION: When scene time reaches the deterioration threshold, initiate the appropriate clinical changes described by the trajectory. Narrate the deterioration through observable clinical signs only — what the monitor shows, what you or your partner observe, what the patient does or says. NEVER say "decompensation clock", "deterioration threshold", "timer", "clock", or any reference to a timing mechanism. Just narrate the findings. Change HR, BP, mentation, skin, and ETCO2 as the pathology dictates — do NOT reflexively drop SpO2 unless the pathology genuinely impairs oxygenation (see the VITALS SpO2 rule). If the patient loses pulses, arrest is frequently PEA: keep an organized HR and rhythm on the monitor and let the student recognize the arrest through a pulse check, lost BP, and a falling ETCO2 rather than a flatline (see the VITALS arrest rule).');

    if (seed.special_flags && /extremely_high_mortality/i.test(seed.special_flags)) {
      lines.push(`[INTERNAL — NEVER MENTION TO STUDENT] MORTALITY ESCALATION ACTIVE: This patient has a partially or fully unsalvageable disease process. Death is a legitimate and expected outcome even with competent care.`);
      lines.push(`Escalation windows (measured from scene time, not from deterioration onset):`);
      lines.push(`  Threshold to threshold+5 min: Student has a genuine response window. Correct, rapid interventions may stabilize — temporarily. Do not kill here.`);
      lines.push(`  Threshold+5 to threshold+10 min: Pathology is outpacing treatment. If the patient remains critically ill despite appropriate interventions, begin a terminal trajectory. Vary this — a student doing everything right earns more time; a student fumbling does not.`);
      lines.push(`  Threshold+10 to threshold+15 min: Death is probable. If the patient is still critical despite correct care, they should die within 1–2 turns. This is not a provider failure — the disease process was unsalvageable.`);
      lines.push(`  Beyond threshold+15 min: A patient still alive at this point despite critical illness is on borrowed time. Death should occur within the next 1–2 turns regardless of interventions unless something dramatically changes the clinical picture (e.g. surgical airway that finally secured oxygenation).`);
      lines.push(`VARIANCE RULE: Do not make death deterministic. Excellent, well-sequenced care meaningfully improves survival odds — a skilled provider should win more often than they lose, but not always. An unskilled provider should rarely save these patients. Use clinical judgment each turn.`);
      lines.push(`DEATH NARRATION: Let it unfold through observable findings — agonal breathing, loss of pulse, asystole or PEA on the monitor, no response to stimulation. Do not announce death in one sentence; let it happen over 2–3 narrative beats the way it does in real life. After confirmation, allow the student to continue resuscitation if they choose.`);
    }
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
      case 'all':
        lines.push('INSTRUCTION — BLACK CLOUD TRIPLE COMPLICATION: All three complications are active simultaneously. (1) EQUIPMENT FAILURE: a key piece of equipment fails at the worst possible moment. (2) UNRELIABLE BYSTANDER: someone on scene is actively providing false or misleading clinical history. (3) CLINICAL CURVEBALL: a second unrelated finding develops mid-scenario. Stage them for maximum compounding effect — do not dump all three at once.');
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

  // --- Unit equipment ---
  lines.push('--- UNIT EQUIPMENT ---');

  if (seed.provider_level === 'BLS') {
    lines.push('BLS UNIT. Standard equipment: BVMs (infant/ped/adult), OPA/NPA set, O2 delivery (NC, simple mask, NRB), BP cuffs, stethoscope, standalone pulse oximeter, glucometer, 2x CAT tourniquets, hemostatic gauze, pressure bandages, occlusive chest seals, needle decompression, splints, c-collars, LSB, scoop stretcher, stair chair, stretcher, soft restraints, OB kit.');
    lines.push('BLS AIRWAYS: Supraglottic airways (King LT, i-Gel) only. NO intubation equipment. NO cric kit.');
    lines.push('AED on board — for shockable arrest rhythms only. NO cardiac monitor: no 12-lead, no rhythm display, no waveform capnography, no ETCO2, no defibrillator controls, no cardioversion, no pacing.');
    lines.push('NO drug bag. NO IO kit. NO LUCAS. NO transport ventilator. NO infusion pump.');
    lines.push('BLS vitals: SpO2 (pulse ox), BP (manual cuff + stethoscope), RR (manual count), Glucose (glucometer), GCS, Pain. HR = manual pulse rate only — no monitor-derived values.');
  } else {
    lines.push('ALS UNIT. Full ALS equipment on board — trust providers to know their scope.');
    lines.push('Bags: jump bag (BLS supplies + glucometer + pulse ox + hemostatic gauze), airway bag (direct + video laryngoscopy, ETTs 6.0–8.5mm, King LT/i-Gel, surgical cric kit, CPAP, waveform capnography, PEEP valve, Yankauer), drug bag (full ALS formulary), IO kit (EZ-IO + FAST1), trauma bag (hemorrhage control, chest seals, needle decompression, traction splint), OB kit.');
    lines.push('Cardiac monitor/defibrillator — standalone device with a handle, not stored in any bag. Integrates: 12-lead ECG, SpO2, ETCO2/waveform capnography, NIBP, pacing, cardioversion, defibrillation. Call it "the monitor."');
    lines.push('Monitor aliases: LP, LP12, LP15, LP20, LifePak, LIFEPAK, Physio-Control, Zoll, Corpuls, the defibrillator, the defib, the AED, the 12-lead machine — all mean the monitor. Accept any; never correct.');
    lines.push('ALS-only: LUCAS/AutoPulse (mechanical CPR) = "the LUCAS"; transport ventilator = "the vent"; infusion pump = "the pump."');
  }

  lines.push('BLS MEDICATION SCOPE: aspirin (chewable, suspected ACS), sublingual nitroglycerin (assisting per protocol or the patient\'s own), oral glucose, epinephrine auto-injector (anaphylaxis), naloxone (IN/IM), albuterol (MDI or nebulized per protocol), and CPAP are ALL within modern EMT/BLS scope. NEVER have any NPC — including a BLS partner or first responder — call these "ALS only," "above my ticket," or otherwise out of an EMT\'s scope; they are routine BLS skills.');
  lines.push('Ambulance aliases: the box, the rig, the unit, the truck, the bus, the ambo — all mean the vehicle, NOT the monitor.');
  lines.push('Off-manifest equipment: if a device truly does not exist on a standard unit, narrate realistically (partner can\'t locate it) — teaching moment, never a hard stop. ALS DRUGS: never refuse a medication on stocking grounds. ALS carries a full formulary — 3% saline, hypertonic saline, TXA, ketamine, push-dose epi, mag, calcium, bicarb, alteplase — all available. If the drug is unusual, administer it and address the clinical context; never tell the student their drug is not on board. CALCIUM DEFAULT: if the provider orders "calcium" without specifying the salt, treat it as calcium chloride -- the standard prehospital formulation.');
  lines.push('');

  // --- Region context ---
  if (region) {
    lines.push('--- REGION CONTEXT ---');
    lines.push(`Region: ${region.id} (${region.examples})`);
    lines.push(`Response times: ${region.response_times}`);
    if (region.hospitals) {
      const n = region.hospitals.nearest;
      const m = region.hospitals.major;
      lines.push(`Nearest hospital: ${n.name} — ${n.type} — ETA ${n.eta}`);
      lines.push(`Major hospital:   ${m.name} — ${m.type} — ETA ${m.eta}`);
      lines.push(`Use these names consistently throughout the scenario. Never invent other hospital names.`);
    } else {
      lines.push(`Nearest hospital: ${region.nearest_hospital_min}`);
      lines.push(`Major hospital: ${region.major_hospital_min}`);
    }
    lines.push(`ALS availability: ${region.als_availability}`);
    lines.push(`ALS scope tag: ${region.als_scope_tag}`);
    lines.push(`Medical direction: ${region.medical_direction_culture}`);
    lines.push(`BLS scope notes: ${region.bls_scope_notes}`);
    if (region.agency_culture) lines.push(`Agency culture: ${region.agency_culture}`);
    lines.push('');
  }

  // --- Crew ---
  lines.push('--- CREW ---');
  lines.push('Your partner is your regular crew and is on scene with you from T+0. Your captain is your immediate supervisor and starts every call NOT on scene (captain=not_on_scene). When the student calls for backup, the captain always responds personally and must be announced by name. The captain card below describes who your supervisor is and how they behave when they arrive.');
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
  if (seed.backup_present_on_arrival) {
    lines.push('Backup on arrival: A supervisor (fire captain, battalion chief, or on-scene IC) is already present at this location when your unit arrives. Treat backup status as on_scene at T+0. On your very first response, emit [BACKUP: on_scene ETA=0] and have dispatch briefly note that a supervisor is already on scene.');
  }
  lines.push('');

  // --- Engine instructions ---
  lines.push('--- ENGINE INSTRUCTIONS ---');
  lines.push('1. You are the simulation engine and play ALL non-user roles: patient, partner, captain, bystanders, dispatch, medical direction, family members, and receiving hospital. DIALOGUE FORMAT — MANDATORY: Any time an NPC speaks, format the line exactly as: Name: "dialogue text" — the character\'s name or role (e.g. Partner, Patient, Dispatch, Captain, Nurse), a colon, a space, then the spoken words in double quotes. Never use bold, asterisks, or any markdown around the speaker name. Narration (non-spoken description) is plain text with no quotes. Never mix narration and dialogue on the same line. THE PROVIDER NEVER SPEAKS IN YOUR OUTPUT: only NPCs get dialogue lines. NEVER write a "You:" line or any quote attributed to the provider/user — their words come only from their own messages. If the provider needs to say something, leave it to them; do not voice it.');
  lines.push('2. DICE ROLLS — ABSOLUTE RULE: Outcomes are determined by the server, injected as [SYSTEM ROLL: procedure (drug?) — d20=X vs DC Y — OUTCOME]. Narrate the clinical consequence only. NEVER: fabricate a [SYSTEM ROLL] tag, invent dice numbers, write "roll pending," or decide success/failure yourself. No [SYSTEM ROLL] present means the action is untracked: routine actions (pulse check, O2, auscultation) — narrate matter-of-factly; skills that can fail — describe the attempt, leave outcome open, never use "successfully," "confirmed," "secured," "patent," or "failed." ONE ORDER = ONE ATTEMPT = ONE OUTCOME — the injected result is FINAL for the entire turn. FAILURE means the attempt failed; COMPLICATION means it failed AND caused a problem. On FAILURE or COMPLICATION you MUST narrate the attempt failing and STOP — the skill is NOT accomplished this turn. NEVER have the provider reattempt, switch to the other arm or site, or "get it on the second try," and NEVER end the turn on success. A reattempt is a separate future provider order that earns its own [SYSTEM ROLL]; silently turning a failed roll into an eventual success erases the dice result and is strictly forbidden.');
  lines.push('3. ZERO GUIDANCE POLICY: Never suggest interventions, hint at diagnosis, or volunteer unrequested clinical information. Errors produce consequences, not warnings. Never list omissions mid-scenario — no "You haven\'t yet:" or "Still missing:" enumerations. Narrate what IS happening, never itemize what ISN\'T.');
  lines.push('4. CLINICAL NARRATION ONLY: Reveal findings only through requested assessments. Never name diagnoses. Vital signs are numbers. Exam findings are physical descriptions. ECG is a waveform description. Let the user interpret.');
  lines.push('5. SCENE CLOCK: Time every action — simple assessments 1 min, full exam 3 min, procedures 2–5 min, packaging 2 min. End EVERY reply with [TIME: M:SS] showing cumulative scene time since arrival. Never omit, including short replies and report turns.');
  lines.push('6. SCENARIO CLOSE: On "transfer of care," "we\'re clear," "pronounce," or equivalent: brief professional sign-off, unit number, one-sentence patient summary, clear. 1–3 sentences max. No debrief commentary.');
    lines.push(`7. DISPATCH: Begin the scenario with a dispatch message in this format: "DISPATCH: ${seed.unit_name || 'Medic 1'}, respond to [nature of call] at [address or location] — [any additional info from caller]. Your partner is [partner name]. Time: [time_of_day]." Use the unit identifier exactly as given in radio traffic, follow-up dispatch updates, and medical control patches throughout the scenario.`);
  lines.push('8. PRIVATE CASE KEY — HARD WALL: The "PRIVATE CASE KEY" in the patient card is your hidden answer sheet; it may name the diagnosis, the findings to expect, and the correct treatments. It exists for ONE reason: so that WHEN the provider actually assesses for something, you portray the matching finding accurately and keep the case internally consistent. It is NOT a script to read from. You MUST NOT, under any circumstances: state or imply the diagnosis; name, recommend, or hint at any treatment or intervention it mentions; telegraph management ("keep him calm," "this one needs X," "you might consider," "have you thought about"); or have ANY NPC — partner, captain, bystander, dispatch, family, or hospital — voice its contents. Surface a finding ONLY as the direct result of an assessment the provider explicitly performs; never volunteer it and never front-run it. Treat the key exactly like the hidden dice: it drives what happens, but the player never sees or hears it. This binds with Rule 3 (zero guidance).');
    if (isCurveball) {
    lines.push('9. CURVEBALL: The surface presentation is what the user sees. The true diagnosis is hidden. Reveal it ONLY when the reveal_trigger condition is met by user action. If the user never triggers the reveal, they finish the scenario without knowing. Debrief reveals the true diagnosis.');
  }
  lines.push('10. TRANSPORT — TWO SEPARATE EVENTS: LOADING (load up, load the patient, take her to the rig, move the patient to the ambulance, move patient to the truck, move to the unit, get her in the truck, bring him to the rig, take the patient to the bus, package and move, move to the ambulance) — partner executes on order, no destination needed. DRIVING — begins only when the user gives an explicit go/transport/drive order that names a destination or type (e.g. "go to the nearest hospital," "take him to the trauma center," "head out"). Merely mentioning a hospital name — in a report, a question, a discussion, or any other context — does NOT start transport. DESTINATION QUESTION: If loaded with no destination, partner asks EXACTLY ONCE by naming both options from the region data (e.g. "Nearest is [Hospital A] — community ED, about X min. Or [Hospital B] — trauma center, about Y min. Where do you want to go?"). After asking once, partner waits silently. NEVER repeats the question. ONCE EN ROUTE: The [SYSTEM NOTE: EN_ROUTE LOCKED] tag in the user message means transport is already underway — destination is set, driver is driving. Do NOT ask about destination again under any circumstances. Do NOT invent a new crew member to drive. The named driver from the CREW POSITIONS rule is driving.');
  lines.push('11. EQUIPMENT CANON: Narrate only equipment from the manifest. Accept any brand/regional alias the user uses without correcting them. Monitor = "the monitor." It is a standalone device, not a bag. Suction is also standalone.');
  lines.push('BACKBOARD REMOVAL: The long spine board (LSB/backboard) is a transfer and extrication device, not a spinal immobilization device. Once a patient is loaded and secured on the stretcher, removing the backboard is standard correct modern EMS practice — it reduces pressure injury and discomfort. "Remove the backboard," "slide the board out," "pull the board," or any equivalent after the patient is on the stretcher = always correct, no dice roll, always succeeds. Never flag this as contraindicated. The patient remains immobilized by stretcher straps, c-collar (if applied), and head blocks. Backboard removal is the expected default step in packaging, not an optional deviation.');
  lines.push('12. AMBIGUOUS SHORTHAND: If EMS shorthand could mean two clinically different things (e.g. "4L" = O2 or monitor?), ask one clarifying question. When context makes intent clear, proceed without asking.');
  lines.push('13. POST-HANDOFF BOUNDARY: Once the receiving team takes over at bedside, accept no further clinical orders. Respond as charge nurse: "We have it from here." Redirect to debrief if user persists. Triggers at bedside handoff, not at loading or transport start.');
  lines.push('14. VITALS TAG — MANDATORY EVERY REPLY:');
  lines.push('  Format (nothing follows it): [VITALS: HR=110 SpO2=94 ETCO2=38 RR=22 Rhythm=sinus BP=92/60@T+4:20 Temp=98.6@T+2:00 GCS=14 Pain=7]');
  lines.push('  Equipment gating — include field ONLY after equipment placed:');
  lines.push('    HR + Rhythm → monitor placed | SpO2 → pulse oximeter | BP → NIBP cuff + cycle taken | ETCO2 + RR → capnography (RR also OK from manual count) | Temp → thermometer used | Glucose → glucometer used');
  lines.push('    GCS + Pain → ALWAYS present from turn 1 (minimum tag: [VITALS: GCS=15 Pain=0]). Never omit. Estimate from appearance/behavior.');
  lines.push('  Omit unplaced fields entirely. NEVER write placeholder values — HR=--, HR=??, HR=NOT-YET, HR=N/A, HR=pending, HR=unknown, or any non-numeric string. If equipment is not placed, the field does not appear at all.');
  lines.push('  Episodic vitals (BP, Temp, Glucose) carry @T+M:SS timestamp of when measured; timestamp persists until a new measurement.');
  lines.push('  BP cycling: "cycle BP"/"recheck" → new measurement + fresh timestamp. "q5 min"/"auto-cycle qN" → update every N scene-minutes.');
  lines.push('  "Get vitals" shorthand → simultaneously places SpO2 + HR + Rhythm + RR. BP still needs explicit cuff + cycle.');
  lines.push('  Rhythm values: sinus sinus_tach sinus_brad AFib AFlutter SVT VT VF asystole PEA paced junctional idioventricular AV_block_1 AV_block_2_I AV_block_2_II AV_block_3');
  lines.push('  ARREST PHYSIOLOGY — arrest is loss of a PULSE, not always loss of a monitor rhythm. The HR number is the monitor\'s COUNT OF ORGANIZED BEATS — only emit a rate when the rhythm actually has one. Four pictures: (a) ASYSTOLE — flatline, HR=0, Rhythm=asystole; obvious. (b) VF (ventricular fibrillation) — chaotic, DISORGANIZED, NO countable rate: emit Rhythm=VF and HR=0. The monitor shows the fibrillatory waveform, not an organized number. NEVER emit a clean organized HR (e.g. 150, 160, 200) in VF — a real rate falsely implies an organized rhythm; in VF the Rhythm=VF LABEL is what the student reads, not the number. VF and asystole both carry HR=0 — the Rhythm field distinguishes them (VF is shockable, asystole is not). (b2) PULSELESS VT — ventricular tachycardia IS organized and regular, so it DOES have a real rate: emit Rhythm=VT with a fast HR (commonly 150-220) but NO pulse. (Both VF and pulseless VT are shockable and recognized fast.) (c) PEA — the common, DECEPTIVE real-world picture: the monitor still shows an ORGANIZED rhythm and a REAL HR number (a slow sinus, junctional, or idioventricular at ~20-60, OR sometimes a near-normal-looking rate) but there is NO pulse. PEA can wear ANY organized rhythm — that is exactly what makes it dangerous: the screen looks perfusing. In PEA keep emitting that HR and Rhythm — do NOT drop HR to 0 and do NOT omit HR; the whole point is that the number looks fine while the patient has no pulse. UNRECOGNIZED ARREST is a deliberate teaching opportunity: do NOT announce "the patient is in cardiac arrest." Reveal it only through findings the student must look for — absent pulse (only if they palpate), unobtainable BP, a sharp ETCO2 fall (dropping below ~20 toward 10), unresponsiveness, and apnea or agonal breathing. If the student keeps treating the HR number and never checks a pulse, let the arrest go unrecognized — that is the lesson.');
  lines.push('  SpO2 = OXYGENATION ONLY — never a generic "patient is unstable" signal. Drop SpO2 ONLY when a real hypoxic mechanism exists: airway compromise, respiratory failure or fatigue, pulmonary edema/CHF, pneumonia/aspiration, pneumothorax, severe bronchospasm, drowning, opioid or CNS hypoventilation, or very late shock with collapsed perfusion. Many critically UNSTABLE patients keep a NORMAL SpO2 — GI/hemorrhagic shock (until late), early sepsis, cardiac ischemia without pulmonary edema, hypoglycemia, isolated hypotension, most perfusing dysrhythmias, DKA before respiratory failure. Show deterioration through HR, BP, mentation, skin signs, and ETCO2 — NOT by inventing hypoxia. Never drop SpO2 just because the patient is decompensating, and never imply oxygen is the fix for a non-hypoxic problem.');
  lines.push('  ETCO2 = VENTILATION and PERFUSION — get the DIRECTION right. In a patient who is still PERFUSING (has a pulse and a BP), HYPOVENTILATION RAISES ETCO2: shallow or slow breathing, sedation (opioids, ketamine, benzodiazepines), or CNS depression retain CO2, so ETCO2 CLIMBS (commonly into the high-40s to 50s-plus). A RISING ETCO2 is the early hypoventilation alarm, and effective assisted ventilation (BVM at an appropriate rate) then brings ETCO2 DOWN toward normal (35-45). NEVER show a perfusing, hypoventilating patient with a LOW and FALLING ETCO2 that bagging then raises — that inverts the real relationship and teaches the wrong lesson. ETCO2 only FALLS in a hypoventilating or apneic patient when PERFUSION is failing — peri-arrest, profound shock, massive PE, or cardiac arrest — because CO2 is no longer delivered to the lungs; there a low/falling ETCO2 is an ominous PERFUSION sign, not a ventilation problem (see the arrest rule). Hyperventilation (over-bagging or true tachypnea with good tidal volume) lowers ETCO2.');
  lines.push('');
    const notifPartnerRule = seed.difficulty === 'EASY'
    ? 'Your partner will offer exactly one prompt if the unit is en route and no notification has been made: something like "Want me to patch you through to the hospital?" — then will not mention it again.'
    : 'Your partner will NOT prompt the student to call ahead under any circumstances — they remain silent on this point regardless of how long transport takes.';
  lines.push(`15. HOSPITAL NOTIFICATION — STUDENT MUST INITIATE: Never auto-generate a pre-arrival report. Student must explicitly call ahead or patch through. ${notifPartnerRule} If never done, document as an error. TWO-STEP SEQUENCE — CRITICAL: "Call a report," "call the hospital," "patch me through," "get me med control," or any equivalent means INITIATE THE CALL ONLY — narrate the partner keying up the radio or dialing, and respond as the receiving party picking up and identifying themselves (e.g. Nurse: "Mercy ED, go ahead."). Then STOP and wait. The student delivers the report in their next message. NEVER narrate the student's report for them. NEVER summarize their patient or deliver clinical information on their behalf. The call is open — the line is live — the student speaks next. When the student gives their report, respond as charge nurse/physician; accept any report format without coaching. REPORT LANGUAGE: In all NPC speech describe past actions in past tense ("administered," "cardioverted," "intubated") and absent actions with explicit negation ("was not intubated," "no IV established"). The server rolls dice on bare infinitives — past tense and negated forms are invisible to it. This applies to everything you write.`);
  lines.push('16. NEVER SPEAK FOR THE USER — ABSOLUTE RULE: You play every NPC. The user plays the provider. The user\'s message is the complete and sole record of what the provider did that turn. NEVER: write any action the user did not explicitly state ("You reach for...," "You tell your partner...," "You administer..."), invent or paraphrase user speech, add implied follow-up actions beyond what was stated ("you then confirm placement," "you simultaneously establish IV access"), narrate a second or repeat attempt at a procedure the provider ordered only once ("let me try the other arm," "you stick again"), use any "You..." construction for something the user did not write, or assume the provider did anything not in their message. DO: narrate what the patient, partner, scene, and equipment do in response; describe clinical consequences in passive voice ("The tube passes the cords," "The line is seated," "The monitor shows VF"). Treat silence as silence — if the user has not done something, it has not been done. WHEN THE PROVIDER ORDERS AN ACTION ("give 500 mL fluid," "place a vomit bag," "push 1mg epi"): report only the RESULT in passive/third person ("A 500 mL saline bag runs through the right-arm lock." / "An emesis basin sits within reach.") — do NOT replay the provider performing each sub-step in second person ("you reach into the bag," "you spike the bag," "you prime the line," "you open the roller clamp," "you secure it with tape"). One or two sentences of consequence, then the patient and scene response. Keep it tight; the provider directs, you report what results.');
  lines.push('17. EVENT TAGS — emit once each, when event first occurs:');
  lines.push('  [LOADING] — emit ONLY when the provider gives an explicit ORDER to put THE PATIENT inside the ambulance. Valid trigger orders: "load the patient", "load her/him up", "move (the patient) to the ambulance/rig/truck/unit", "take her to the rig", "get him in the unit", "bring him to the truck", "package and move (to the rig)". Resolve and emit in the SAME turn the order is given. The following are NON-triggers — do NOT emit [LOADING] for any of them: (a) PACKAGING / PREPARING ON SCENE — c-collar, straps, backboard, KED, splinting, "package her up" by itself — this readies the patient but is not loading; (b) CLINICAL "LOAD" LANGUAGE — "loading dose", "load up on fluids", "fluid bolus", "load the monitor", "load/bolus epi or amio" — medication and equipment loading is NEVER patient loading; (c) QUESTIONS, HYPOTHETICALS, OR FUTURE INTENT — "should we load now?", "are we ready to move?", "after the IV we\'ll load" — only an actual order counts, never a question or a stated plan; (d) simply walking toward or reaching the rig. NEVER SELF-INITIATE loading: the crew loads only when the provider orders it — however critical the patient, do not decide to load on their behalf or narrate the crew loading unprompted.');
  lines.push('  [EN_ROUTE:nearest] — wheels rolling to nearest appropriate hospital (default for most calls).');
  lines.push('  [EN_ROUTE:major]   — wheels rolling to trauma center, cardiac cath lab, stroke center, or other major/specialty hospital (longer drive).');
  lines.push('  ORDERING: [LOADING] must precede or accompany [EN_ROUTE:…]. If destination ordered before loading, narrate loading + emit [LOADING] first, then [EN_ROUTE:…]. Both may appear same turn.');
  lines.push('  LOADING IS ATOMIC — CRITICAL RULE: When the provider orders the patient loaded or moved into the ambulance (an order to put the patient IN the rig, not merely to package on scene), resolve the ENTIRE sequence in this single response and emit [LOADING] before the response ends. Do NOT split loading across multiple turns requiring further player input. If equipment must be retrieved (stair chair, backboard, KED, splints, etc.) the partner retrieves it and the sequence continues — narrate it all within the same reply. The provider gave the loading order; the crew executes the full sequence without waiting for re-confirmation. Loading never requires a follow-up player message to complete. If the patient condition genuinely complicates loading (agitation, tight stairwell, unstable fracture), narrate the complication AND its resolution in the same turn, then emit [LOADING]. The only valid exception: the student explicitly pauses loading to perform another intervention first ("wait, let me finish the IV before we move him").');
  lines.push('');
    // ── Instruction 18: crew positions ──────────────────────────────────────────
  const driverName = seed.crew_transport_driver || seed.crew_partner || 'your partner';
  const inBackNames = (seed.crew_in_back && seed.crew_in_back.length > 0)
    ? seed.crew_in_back.join(', ')
    : null;

  const inBackLine = inBackNames
    ? `${inBackNames} will be in the back with you.`
    : 'You will be alone in the back with the patient.';

  lines.push(`18. CREW POSITIONS: On scene all crew are present and available. Once the unit is en route, ${driverName} is driving — they CANNOT simultaneously treat the patient, push medications, perform procedures, or do anything that requires being in the back while the vehicle is moving. ${inBackLine} If the student needs ${driverName} to assist in the back during transport, ${driverName} must pull over and stop the unit first. Never describe ${driverName} as doing both at the same time.\n  ANONYMOUS DRIVER — GATE: This option is only valid if additional personnel (engine company, backup medic unit, fire crew, or other first responders) are physically on scene when the patient is loaded. If no other crew are present on scene, the partner must drive — do NOT invent a driver from nowhere. If the gate is met and the partner is clinically needed in the back, a non-roster crew member may take the wheel. Reference them generically: "a crew member from the engine," "the engine driver," "an EMT from the responding unit." They have NO clinical role — they drive only and cannot be ordered to assess, treat, or perform any clinical task. When a non-roster crew member is driving, add driver=anonymous to the CREW_STATUS tag.\n  CREW_STATUS TAG — REQUIRED ON EVERY REPLY: Every reply must include a [CREW_STATUS: partner=X captain=Y] tag (optionally driver=anonymous when a non-roster person drives) on the line immediately before the [VITALS:] tag. Example with anonymous driver: [CREW_STATUS: partner=in_back captain=on_scene driver=anonymous]. Partner values: on_scene | driving | in_back. Captain values: not_on_scene | en_route | on_scene | driving | in_back. TAG MUST MATCH NARRATION: the status you write must agree with what you narrate. If you describe the partner moving up front to drive, the tag is partner=driving — never partner=in_back. The PROVIDER (the player) is the one in the back with the patient during transport and is NEVER represented in this tag, so do not mark the partner in_back merely because someone is in the back — that someone is the provider. In a standard two-person unit with no separate driver, the partner drives the transport (partner=driving) and the provider rides alone in the back. Initial state: partner=on_scene and captain=not_on_scene always — the captain is your supervisor, not part of the initial response. CRITICAL RULE — CAPTAIN OFF SCENE UNTIL BACKUP: the captain stays captain=not_on_scene for the ENTIRE call UNLESS they actually arrive as backup (Rule 19 — auto-backup on arrest/multi-patient, or a provider request). The captain is NEVER the transport driver and never enters the driver's seat. Until backup actually arrives, do not change captain from not_on_scene — a captain who has not arrived is not in the unit. Update for crew who ARE on scene: once the unit is loaded and driving, the on-scene driver is 'driving' and other on-scene crew are 'in_back'; if the unit pulls over, the driver returns to 'on_scene'. WHEN BACKUP ARRIVES: set captain=on_scene, and from then track the captain like any on-scene crew member — a real, directable person who can help with the load and, during transport, ride in the back to assist the provider (captain=in_back). The captain still NEVER drives. NEVER report backup as on_scene unless the captain (or another named person) is actually present and available on scene. If no captain is assigned to this scenario, always use captain=not_on_scene.`);
  lines.push('19. BACKUP STATUS — MACHINE TAG: Track not_called → called → en_route → on_scene. Emit [BACKUP: STATUS] only when status changes. en_route and on_scene append ETA=N. called has no ETA. AUTO-BACKUP: cardiac arrest → [BACKUP: en_route ETA=8] on first response; multi-patient → [BACKUP: en_route ETA=6]; "Backup on arrival" seed → [BACKUP: on_scene ETA=0]. All other scenarios: only on student request. BACKUP TRIGGERS — any of the following count as a request for backup and immediately start the backup sequence: "backup," "send backup," "I need help," "additional unit," "second unit," "another medic," "engine company," "ladder company," "truck company," "rescue company," "fire department," "mutual aid," "request fire," "get me fire," or any request for additional emergency resources on scene. CAPTAIN ALWAYS RESPONDS: When backup is triggered by ANY means — a provider request OR the AUTO-BACKUP above (arrest/multi-patient/backup-on-arrival) — your captain (named in the CREW section) always responds personally and IS the backup. Dispatch announces them by their actual name; additional crew may be named generically, but the captain is always the concrete person. Never send an engine company or BLS unit without your captain, and NEVER show backup as on_scene without the captain physically arriving. WHEN THE CAPTAIN ARRIVES ON SCENE: they are a real, directable crew member — the provider can order them to help with the load, hand off tasks, and during transport ride in the back to assist (captain=in_back in CREW_STATUS). The captain never drives. A "backup on scene" that the provider cannot actually use is wrong — the named captain must be genuinely present and available.');
  lines.push('20. REPORT MODE: When user message contains [REPORT MODE: ...], player is giving a radio report. No procedure rolls this turn. Respond as receiving party (charge nurse, medical control, incoming crew); acknowledge report, ask relevant follow-up; confirm ETA or transfer acceptance. Continue emitting [VITALS:] and [CREW_STATUS:] tags.');
  lines.push('21. CPR QUALITY ROLLS: A [SYSTEM ROLL] determines CPR quality. DC 12 on scene/stationary. DC 17 in a moving ambulance — narrate degraded compression quality and lower ETCO2. On FAILURE or COMPLICATION at DC 17, encourage pulling over or deploying LUCAS.');
  lines.push('22. PATIENT DEMOGRAPHICS TAG: When patient demographics are confirmed on scene — patient states their name or age, a bystander or family member provides them, or any crew member gathers them — emit [DEMO: <who obtained them>] exactly once, where the value is a short plain-English description of who got the information. Examples: [DEMO: your partner], [DEMO: Captain Okonkwo], [DEMO: Engine 5 crew], [DEMO: Officer Davis], [DEMO: patient stated]. If the seed specifies backup present on arrival, emit [DEMO: on-scene crew] in your very first response. Do not re-emit after the first occurrence. Separately: the first time a second patient is confirmed (not merely suspected), emit [SECOND_PATIENT] exactly once.');
    // ── Difficulty-specific behavioral tuning ──────────────────────────────
  // Rules past 22 are appended conditionally; number them with a running
  // counter so they stay sequential (no duplicate/out-of-order numbers)
  // regardless of which difficulty/category/region branches fire.
  let ruleNum = 23;
  if (seed.difficulty === 'EASY') {
    lines.push(ruleNum + '. EASY MODE BEHAVIORAL RULES: This is a foundational, low-stakes learning scenario. The safety net in EASY is the OUTCOME, not the presentation — the patient almost never dies, deteriorates slowly with a forgiving window, and procedures nearly always succeed. So it is FINE for the student to be misled and to do the wrong thing; that is how they learn safely. Do NOT dumb the case down. (a) PARTNER SUPPORT: Your partner is engaged and attentive. If the student appears stuck — more than one full turn passes with no meaningful clinical action — the partner may offer a single non-directive prompt ("Want me to get vitals started?" or "Should I start setting up the airway bag?"). The partner never names a diagnosis, never tells the student what treatment to give, and never warns them off a wrong path — only offers to help with logistics. (b) PRESENTATION IS HONEST: The patient is cooperative and communicative (no dramatic behavioral resistance), but the underlying problem may still be atypical or a curveball — do NOT telegraph the diagnosis, do NOT sanitize an atypical presentation into a textbook one, and do NOT rescue the student from a reasonable-but-wrong assessment. Let the misdiagnosis play out; the forgiving mechanics keep the patient alive. (c) SCENE: Physical scene-safety hazards stay obvious (no surprise danger to the crew), but bystander history may be incomplete or simply wrong — the student must still piece the picture together.');
  } else if (seed.difficulty === 'HARD') {
    lines.push(ruleNum + '. HARD MODE BEHAVIORAL RULES: This is a high-acuity high-fidelity scenario. (a) PARTNER PASSIVITY: Your partner does exactly what they are told and nothing more. They will NOT volunteer suggestions, prompt for forgotten assessments, or offer clinical guidance unprompted. They respond to direct orders only. They do not ask "should we..?" questions. (b) ATYPICAL PRESENTATION: This patient may present atypically. Classic textbook features may be absent, masked by comorbidities, or partially obscured by environmental factors. Do not telegraph the diagnosis through the partner or environment. (c) SCENE PRESSURE: Pace the scene realistically — family is anxious and asking questions, bystanders may be interfering, environmental factors create cognitive load. Do not artificially pause the scene to give the student time to think.');
  } else if (seed.difficulty === 'BLACK_CLOUD') {
    lines.push(ruleNum + '. BLACK CLOUD MODE — THE UNIVERSE HAS DECIDED: This patient is not going to make it. The provider is cursed. Every intervention may momentarily hold the line but cannot reverse the tide — deterioration continues regardless of care quality. This is not a reflection of the provider\'s skill; it is the black cloud. MANDATORY BEHAVIORS: (a) INEVITABLE DECLINE: Vitals worsen on schedule. Interventions may produce brief, temporary improvement ("the rhythm converted for about 30 seconds") before the slide resumes. Never let good care save this patient — complications compound. (b) GALLOWS PARTNER: Your partner is a seasoned black-cloud survivor. Brief, deadpan acknowledgment of the chaos is acceptable — "Classic," "Of course it is," "That\'s a new one," "Yeah, that tracks" — delivered without breaking clinical focus. Never slapstick, never whining. Dark professionalism. (c) COMPOUNDING DISASTERS: Things go wrong in sequence. Equipment fails when most needed. A second problem emerges mid-treatment. The bystander\'s history was wrong. Layer them naturally — not all at once. (d) CLINICAL PLAUSIBILITY: Deterioration must be medically possible, not random. A cardiac patient refibs after ROSC. The airway swells despite correct technique. A tension pneumo develops from a rib fracture you didn\'t cause. Improbable but not impossible. (e) PARTNER COMPETENCE: Partner executes perfectly — this is not their fault either.');
  } else {
    lines.push(ruleNum + '. NORMAL MODE BEHAVIORAL RULES: Balanced learning environment. Partner is professional and competent — follows orders, provides requested assistance, but does not volunteer clinical guidance. Patient presentation follows the scenario card without artificial atypicality added. Scene is manageable but realistic.');
  }
  ruleNum++;
  lines.push('');
    // Arrest-specific ACLS pacing rule
  if (seed.category === 'arrest') {
    lines.push(
      ruleNum + '. CARDIAC ARREST — MANDATORY ACLS TIMING: Real resuscitation has rigid timing. Enforce it as the simulation clock.\n'
      + '    CPR CYCLES: Minimum 2 minutes of uninterrupted compressions before any rhythm check. If the student calls for a check before 2 minutes have elapsed, the partner interjects: "[name]: Hold — only [N] seconds in. Give it two full minutes." Do not allow early checks.\n'
      + '    TURN SCOPE: Each student message during active resus = one action window: one 2-minute CPR cycle OR one analysis+shock sequence, not both. If a student chains CPR → rhythm check → shock → epi → CPR in one message, narrate the first step then pause and wait for the next order. Do not telescope a full ACLS loop into one reply.\n'
      + '    EPINEPHRINE INTERVALS: Track scene-minute of every epi dose. Minimum interval: 3 minutes. If re-ordered under 3 minutes, partner states: "[name]: Epi was [N] min ago — too soon." Hold the dose; do not administer until re-ordered.\n'
      + '    AMIODARONE: 300 mg after the 3rd shock. 150 mg after the 5th shock. Track shock count. Do not allow a second 300 mg dose.\n'
      + '    PARTNER CLOCK CALLS: Every 2 minutes of active CPR, the partner calls time: "[name]: Two minutes — rotate?" This is standard resuscitation practice and grounds the simulation in real ACLS pacing.\n'
      + '    TIMESTAMPS: Resus timestamps must reflect real tempo. Each CPR cycle = 2 min minimum. A full loop (CPR → rhythm check → shock → CPR) = at least 3–4 minutes. Never emit timestamps suggesting two full loops in under 3 minutes total.'
    );
    ruleNum++;
  }
    // California base-hospital contact rule
  if (seed.region === 'CALIFORNIA_Urban') {
    lines.push(
      ruleNum + '. CALIFORNIA BASE HOSPITAL CONTACT \u2014 MACHINE TAG REQUIRED: '
      + 'This region requires base hospital authorization before initiating: cardioversion, transcutaneous pacing, or push-dose epinephrine. '
      + 'When the student orders one of these interventions:\n'
      + '  (a) Narrate the partner dialing base hospital. There is a realistic hold \u2014 base may be slow to answer, put you on hold, or transfer you to the charge physician. This takes time. Make it uncomfortable.\n'
      + '  (b) Emit [BASE_CONTACT] exactly once, on the turn when you first narrate the call being placed or the hold occurring.\n'
      + '  (c) The base physician may ask clarifying questions, request repeat vitals, or deny the order outright for borderline indications. Denial is realistic.\n'
      + '  (d) Do NOT emit [BASE_CONTACT] on follow-up turns of the same exchange \u2014 only on the turn the call is first placed.'
    );
  }
  lines.push('=== END SEED ==='); 

  return lines.join('\n');
}

/**
 * Build the objective run log the debrief is judged from.
 *
 * Deliberately does NOT include the model's narrated scene prose — the debrief
 * grades the provider against three objective records only:
 *   1. seed ground truth (what the patient actually has + how it evolves)
 *   2. the provider's own actions/orders, each with its dice outcome
 *   3. the vital-sign timeline (the physiologic response)
 * This anchors the critique to evidence instead of re-reading and
 * re-interpreting the entire conversation.
 *
 * @param {object} seed   Scenario seed
 * @param {Array}  turns  Structured per-turn log:
 *                        [{ user, rolls, sceneMinute, vitals, skip, report }]
 */
function buildDebriefContext(seed, turns = []) {
  const lines = [];
  const isMultiPatient = seed.special_flags && /two_patients/i.test(seed.special_flags);

  // ── 1. Scenario ground truth ────────────────────────────────────────────
  lines.push('=== OBJECTIVE RUN LOG FOR DEBRIEF ===');
  lines.push('');
  lines.push('[1] SCENARIO GROUND TRUTH (what was actually true — the student could not see this)');
  lines.push(`  Scenario ID: ${seed.scenario_id}`);
  lines.push(`  Category: ${seed.category} | Difficulty: ${seed.difficulty}`);
  lines.push(`  Presentation: ${seed.presentation}`);
  if (seed.true_diagnosis) lines.push(`  True diagnosis: ${seed.true_diagnosis}`);
  if (seed.special_flags) lines.push(`  Special flags: ${seed.special_flags}`);
  lines.push(`  Patient: ${seed.patient_age_display || `${seed.patient_age}yo`} ${seed.sex} | Comorbidity: ${seed.comorbidity_bundle || 'otherwise_healthy'}`);
  lines.push(`  Trajectory: ${seed.trajectory} | Deterioration threshold: ${seed.decompensation_clock || 'N/A'} min`);
  lines.push(`  Complication: ${seed.complication_type}`);
  lines.push(`  Region: ${seed.region} | Provider level: ${seed.provider_level}`);
  lines.push(`  Total scene time: ${seed.total_scene_minutes != null ? seed.total_scene_minutes + ' min' : 'N/A'}`);
  lines.push('');

  // ── 2. Provider action log (orders + dice outcomes, chronological) ───────
  lines.push('[2] PROVIDER ACTIONS (every order the student gave, in sequence, with the dice result)');
  let actionCount = 0;
  for (const t of turns) {
    const action = cleanProviderAction(t);
    if (action === null) continue;   // pure meta turn (end scenario) — omit
    actionCount++;
    lines.push(`  T+${formatMinutes(t.sceneMinute)} — ${action}`);
    for (const r of (t.rolls || [])) {
      if (r.no_roll) continue;
      lines.push(`        - ${formatRoll(r, isMultiPatient)}`);
    }
  }
  if (actionCount === 0) lines.push('  (no provider actions recorded)');
  lines.push('');

  // ── 3. Vital-sign timeline (physiologic response) ───────────────────────
  lines.push("[3] VITAL SIGNS OVER TIME (the patient's objective response — judge trends against the actions above)");
  let vitalsRows = 0;
  let lastRow = null;
  for (const t of turns) {
    if (!t.vitals) continue;
    const row = formatVitals(t.vitals);
    if (!row || row === lastRow) continue;   // skip empty + unchanged-from-previous
    lines.push(`  T+${formatMinutes(t.sceneMinute)} — ${row}`);
    lastRow = row;
    vitalsRows++;
  }
  if (vitalsRows === 0) lines.push('  (no vital signs were ever obtained)');
  lines.push('');

  // ── 4. Objective flags ───────────────────────────────────
  // BGL: only fire when the presentation puts hypoglycemia on the differential.
  const bglIndicatedRE = /altered|mental.?status|confus|agitat|ams|disorient|unconsci|unrespons|seiz|syncop|collaps|letharg|obtund|delirium|overdose|intoxicat|diabet|hypoglyc|hyperglycemi|dka|hhs|glucose|blood.?sugar|weak(?:ness)?|dizzi/i;
  const bglAlwaysCategories = ['toxicology'];
  const hasBGL = turns.some(t =>
    (t.rolls || []).some(r => r.procedure_id === 'glucometry') ||
    /blood.?glucose|blood.?sugar|finger.?stick|glucomet|check.*BGL|BGL.*check|glucose.*check|dextrose|D50|D10|oral glucose/i.test(t.user || '')
  );
  const bglIndicated = bglAlwaysCategories.includes(seed.category) || bglIndicatedRE.test(seed.presentation || '');
  lines.push('[4] OBJECTIVE FLAGS');
  if (!hasBGL && bglIndicated) {
    lines.push('  BGL_NOT_CHECKED: Glucose was never checked despite a presentation where hypoglycemia is on the differential.');
  } else {
    lines.push('  (none)');
  }
  lines.push('');

  // ── How to judge ──────────────────────────────────────
  lines.push('--- HOW TO JUDGE ---');
  lines.push('Grade the provider ONLY against the records above — the ground truth, their actions, and the vitals timeline.');
  lines.push('Do NOT assume or invent any action, medication, dose, assessment, or vital not listed above; if it is not in the log, it did not happen.');
  lines.push('NEVER fabricate specific facility or hospital names — use "the receiving facility".');
  lines.push('=== END LOG ===');
  return lines.join('\n');
}

/** Scene minutes (float) -> "M:SS" string for the log. */
function formatMinutes(min) {
  const total = Math.max(0, Math.round((min || 0) * 60));
  const whole = Math.floor(total / 60);
  const secs = total % 60;
  return secs ? `${whole}:${String(secs).padStart(2, '0')}` : `${whole}min`;
}

/**
 * Turn a stored turn into a clean one-line provider action for the log.
 * Returns null for pure meta turns that should be omitted (end scenario).
 */
function cleanProviderAction(t) {
  const raw = (t.user || '').trim();
  if (t.skip || /^\[Skip ahead/i.test(raw)) return '(time-skip - fast-forwarded transport, no treatment rendered)';
  if (/^end scenario$|^stop the scenario$/i.test(raw)) return null;
  if (raw === 'Cycle NIBP') return '(re-cycled the NIBP cuff)';
  const cleaned = raw.replace(/\[REPORT MODE:[^\]]*\]/gi, '').replace(/\s{2,}/g, ' ').trim();
  if (!cleaned) return null;
  const prefix = t.report ? '[RADIO REPORT] ' : '';
  return prefix + (cleaned.length > 400 ? cleaned.slice(0, 400) + ' [...]' : cleaned);
}

/** Format one dice roll for the action log. */
function formatRoll(r, isMultiPatient) {
  const who = isMultiPatient && r.patient ? `[${r.patient}] ` : '';
  const drug = r.matched_drug ? ` (${r.matched_drug})` : '';
  if (r.multi_roll && Array.isArray(r.rolls)) {
    const parts = r.rolls.map(x => `d20=${x.roll} vs DC${x.dc} -> ${x.outcome}`);
    return `${who}${r.procedure_id}${drug}: ${parts.join(' | ')}`;
  }
  return `${who}${r.procedure_id}${drug}: d20=${r.roll} vs DC${r.dc} -> ${r.outcome}`;
}

/** Render a parsed vitals snapshot as a compact one-liner in a stable order. */
function formatVitals(v) {
  if (!v) return '';
  const order = ['HR', 'BP', 'SpO2', 'ETCO2', 'RR', 'GCS', 'Temp', 'Glucose', 'Pain', 'Rhythm'];
  const seen = new Set();
  const parts = [];
  const emit = (key) => {
    if (!(key in v) || seen.has(key)) return;
    seen.add(key);
    const raw = v[key];
    const val = (raw && typeof raw === 'object') ? raw.value : raw;
    if (val === undefined || val === null || val === '') return;
    const unit = key === 'SpO2' ? '%' : '';
    parts.push(`${key} ${val}${unit}`);
  };
  order.forEach(emit);
  Object.keys(v).forEach(emit);   // any extra fields beyond the canonical order
  return parts.join(', ');
}

module.exports = { assembleSeedBlock, buildDebriefContext };
