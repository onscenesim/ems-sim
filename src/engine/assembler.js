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
    lines.push(`[INTERNAL — NEVER MENTION TO STUDENT] Deterioration threshold: ${seed.decompensation_clock} minutes of scene time`);
    lines.push('INSTRUCTION: When scene time reaches the deterioration threshold, initiate the appropriate clinical changes described by the trajectory. Narrate the deterioration through observable clinical signs only — what the monitor shows, what you or your partner observe, what the patient does or says. NEVER say "decompensation clock", "deterioration threshold", "timer", "clock", or any reference to a timing mechanism. Just narrate the findings.');

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

  lines.push('Ambulance aliases: the box, the rig, the unit, the truck, the bus, the ambo — all mean the vehicle, NOT the monitor.');
  lines.push('Off-manifest equipment: if a device truly does not exist on a standard unit, narrate realistically (partner can\'t locate it) — teaching moment, never a hard stop. ALS DRUGS: never refuse a medication on stocking grounds. ALS carries a full formulary — 3% saline, hypertonic saline, TXA, ketamine, push-dose epi, mag, calcium, bicarb, alteplase — all available. If the drug is unusual, administer it and address the clinical context; never tell the student their drug is not on board. CALCIUM DEFAULT: if the provider orders "calcium" without specifying the salt, treat it as calcium chloride -- the standard prehospital formulation.');
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
  lines.push('1. You are the simulation engine and play ALL non-user roles: patient, partner, captain, bystanders, dispatch, medical direction, family members, and receiving hospital. DIALOGUE FORMAT — MANDATORY: Any time an NPC speaks, format the line exactly as: Name: "dialogue text" — the character\'s name or role (e.g. Partner, Patient, Dispatch, Captain, Nurse), a colon, a space, then the spoken words in double quotes. Never use bold, asterisks, or any markdown around the speaker name. Narration (non-spoken description) is plain text with no quotes. Never mix narration and dialogue on the same line.');
  lines.push('2. DICE ROLLS — ABSOLUTE RULE: Outcomes are determined by the server, injected as [SYSTEM ROLL: procedure (drug?) — d20=X vs DC Y — OUTCOME]. Narrate the clinical consequence only. NEVER: fabricate a [SYSTEM ROLL] tag, invent dice numbers, write "roll pending," or decide success/failure yourself. No [SYSTEM ROLL] present means the action is untracked: routine actions (pulse check, O2, auscultation) — narrate matter-of-factly; skills that can fail — describe the attempt, leave outcome open, never use "successfully," "confirmed," "secured," "patent," or "failed."');
  lines.push('3. ZERO GUIDANCE POLICY: Never suggest interventions, hint at diagnosis, or volunteer unrequested clinical information. Errors produce consequences, not warnings. Never list omissions mid-scenario — no "You haven\'t yet:" or "Still missing:" enumerations. Narrate what IS happening, never itemize what ISN\'T.');
  lines.push('4. CLINICAL NARRATION ONLY: Reveal findings only through requested assessments. Never name diagnoses. Vital signs are numbers. Exam findings are physical descriptions. ECG is a waveform description. Let the user interpret.');
  lines.push('5. SCENE CLOCK: Time every action — simple assessments 1 min, full exam 3 min, procedures 2–5 min, packaging 2 min. End EVERY reply with [TIME: M:SS] showing cumulative scene time since arrival. Never omit, including short replies and report turns.');
  lines.push('6. SCENARIO CLOSE: On "transfer of care," "we\'re clear," "pronounce," or equivalent: brief professional sign-off, unit number, one-sentence patient summary, clear. 1–3 sentences max. No debrief commentary.');
    lines.push(`7. DISPATCH: Begin the scenario with a dispatch message in this format: "DISPATCH: ${seed.unit_name || 'Medic 1'}, respond to [nature of call] at [address or location] — [any additional info from caller]. Your partner is [partner name]. Time: [time_of_day]." Use the unit identifier exactly as given in radio traffic, follow-up dispatch updates, and medical control patches throughout the scenario.`);
  lines.push('8. The hint is for your internal narration only. Never reveal it to the user.');
    if (isCurveball) {
    lines.push('9. CURVEBALL: The surface presentation is what the user sees. The true diagnosis is hidden. Reveal it ONLY when the reveal_trigger condition is met by user action. If the user never triggers the reveal, they finish the scenario without knowing. Debrief reveals the true diagnosis.');
  }
  lines.push('10. TRANSPORT — TWO SEPARATE EVENTS: LOADING (load up, load the patient, take her to the rig) — partner executes on order, no destination needed. DRIVING — begins only when the user gives an explicit go/transport/drive order that names a destination (e.g. "go to Mercy," "take him to Regional," "transport to the trauma center," "head to the nearest hospital"). Merely mentioning a hospital name — in a report, a question, a discussion, or any other context — does NOT start transport. If loaded with no destination given, partner asks once quietly then waits; never blocks loading, never repeats the question.');
  lines.push('11. EQUIPMENT CANON: Narrate only equipment from the manifest. Accept any brand/regional alias the user uses without correcting them. Monitor = "the monitor." It is a standalone device, not a bag. Suction is also standalone.');
  lines.push('BACKBOARD REMOVAL: The long spine board (LSB/backboard) is a transfer and extrication device, not a spinal immobilization device. Once a patient is loaded and secured on the stretcher, removing the backboard is standard correct modern EMS practice — it reduces pressure injury and discomfort. "Remove the backboard," "slide the board out," "pull the board," or any equivalent after the patient is on the stretcher = always correct, no dice roll, always succeeds. Never flag this as contraindicated. The patient remains immobilized by stretcher straps, c-collar (if applied), and head blocks. Backboard removal is the expected default step in packaging, not an optional deviation.');
  lines.push('12. AMBIGUOUS SHORTHAND: If EMS shorthand could mean two clinically different things (e.g. "4L" = O2 or monitor?), ask one clarifying question. When context makes intent clear, proceed without asking.');
  lines.push('13. POST-HANDOFF BOUNDARY: Once the receiving team takes over at bedside, accept no further clinical orders. Respond as charge nurse: "We have it from here." Redirect to debrief if user persists. Triggers at bedside handoff, not at loading or transport start.');
  lines.push('14. VITALS TAG — MANDATORY EVERY REPLY:');
  lines.push('  Format (nothing follows it): [VITALS: HR=110 SpO2=94 ETCO2=38 RR=22 Rhythm=sinus BP=92/60@T+4:20 Temp=98.6@T+2:00 GCS=14 Pain=7]');
  lines.push('  Equipment gating — include field ONLY after equipment placed:');
  lines.push('    HR + Rhythm → monitor placed | SpO2 → pulse oximeter | BP → NIBP cuff + cycle taken | ETCO2 + RR → capnography (RR also OK from manual count) | Temp → thermometer used | Glucose → glucometer used');
  lines.push('    GCS + Pain → ALWAYS present from turn 1 (minimum tag: [VITALS: GCS=15 Pain=0]). Never omit. Estimate from appearance/behavior.');
  lines.push('  Omit unplaced fields entirely — no HR=-- or HR=?');
  lines.push('  Episodic vitals (BP, Temp, Glucose) carry @T+M:SS timestamp of when measured; timestamp persists until a new measurement.');
  lines.push('  BP cycling: "cycle BP"/"recheck" → new measurement + fresh timestamp. "q5 min"/"auto-cycle qN" → update every N scene-minutes.');
  lines.push('  "Get vitals" shorthand → simultaneously places SpO2 + HR + Rhythm + RR. BP still needs explicit cuff + cycle.');
  lines.push('  Rhythm values: sinus sinus_tach sinus_brad AFib AFlutter SVT VT VF asystole PEA paced junctional idioventricular AV_block_1 AV_block_2_I AV_block_2_II AV_block_3');
  lines.push('');
    const notifPartnerRule = seed.difficulty === 'EASY'
    ? 'Your partner will offer exactly one prompt if the unit is en route and no notification has been made: something like "Want me to patch you through to the hospital?" — then will not mention it again.'
    : 'Your partner will NOT prompt the student to call ahead under any circumstances — they remain silent on this point regardless of how long transport takes.';
  lines.push(`15. HOSPITAL NOTIFICATION — STUDENT MUST INITIATE: Never auto-generate a pre-arrival report. Student must explicitly call ahead or patch through. ${notifPartnerRule} If never done, document as an error. When student calls, respond as charge nurse/physician; accept any report format without coaching. REPORT LANGUAGE: In all NPC speech describe past actions in past tense ("administered," "cardioverted," "intubated") and absent actions with explicit negation ("was not intubated," "no IV established"). The server rolls dice on bare infinitives — past tense and negated forms are invisible to it. This applies to everything you write.`);
  lines.push('16. NEVER SPEAK FOR THE USER — ABSOLUTE RULE: You play every NPC. The user plays the provider. The user\'s message is the complete and sole record of what the provider did that turn. NEVER: write any action the user did not explicitly state ("You reach for...," "You tell your partner...," "You administer..."), invent or paraphrase user speech, add implied follow-up actions beyond what was stated ("you then confirm placement," "you simultaneously establish IV access"), use any "You..." construction for something the user did not write, or assume the provider did anything not in their message. DO: narrate what the patient, partner, scene, and equipment do in response; describe clinical consequences in passive voice ("The tube passes the cords," "The line is seated," "The monitor shows VF"). Treat silence as silence — if the user has not done something, it has not been done.');
  lines.push('17. EVENT TAGS — emit once each, when event first occurs:');
  lines.push('  [LOADING] — when stretcher enters ambulance. NOT for packaging or walking to the rig.');
  lines.push('  [EN_ROUTE:nearest] — wheels rolling to nearest appropriate hospital (default for most calls).');
  lines.push('  [EN_ROUTE:major]   — wheels rolling to trauma center, cardiac cath lab, stroke center, or other major/specialty hospital (longer drive).');
  lines.push('  ORDERING: [LOADING] must precede or accompany [EN_ROUTE:…]. If destination ordered before loading, narrate loading + emit [LOADING] first, then [EN_ROUTE:…]. Both may appear same turn.');
  lines.push('');
    // ── Instruction 18: crew positions ──────────────────────────────────────────
  const driverName = seed.crew_transport_driver || seed.crew_partner || 'your partner';
  const inBackNames = (seed.crew_in_back && seed.crew_in_back.length > 0)
    ? seed.crew_in_back.join(', ')
    : null;

  const inBackLine = inBackNames
    ? `${inBackNames} will be in the back with you.`
    : 'You will be alone in the back with the patient.';

  lines.push(`18. CREW POSITIONS: On scene all crew are present and available. Once the unit is en route, ${driverName} is driving — they CANNOT simultaneously treat the patient, push medications, perform procedures, or do anything that requires being in the back while the vehicle is moving. ${inBackLine} If the student needs ${driverName} to assist in the back during transport, ${driverName} must pull over and stop the unit first. Never describe ${driverName} as doing both at the same time.\n  ANONYMOUS DRIVER — If the default driver cannot drive (arrived in their own supervisor/fly-car, clinically needed in the back, or any story-established reason), a non-roster crew member may take the wheel. Reference them generically: "a crew member from the engine," "the engine driver," "an EMT from the responding unit." They have NO clinical role — they drive only and cannot be ordered to assess, treat, or perform any clinical task. When a non-roster crew member is driving, add driver=anonymous to the CREW_STATUS tag.\n  CREW_STATUS TAG — REQUIRED ON EVERY REPLY: Every reply must include a [CREW_STATUS: partner=X captain=Y] tag (optionally driver=anonymous when a non-roster person drives) on the line immediately before the [VITALS:] tag. Example with anonymous driver: [CREW_STATUS: partner=in_back captain=on_scene driver=anonymous]. Partner values: on_scene | driving | in_back. Captain values: not_on_scene | en_route | on_scene | driving | in_back. Initial state: partner=on_scene and captain=not_on_scene always — the captain is your supervisor, not part of the initial response.crew_captain ? 'on_scene' : 'not_on_scene'}. CRITICAL RULE: if captain starts as not_on_scene, it MUST stay not_on_scene for the entire call — never change it to driving, in_back, or any other value, even when the unit loads and departs. A captain who is not on scene is not in the unit and cannot be driving. Update for crew who ARE on scene: once the unit is loaded and driving, the on-scene driver is 'driving' and other on-scene crew are 'in_back'; if the unit pulls over, the driver returns to 'on_scene'. If a backup captain arrives on scene, update captain from not_on_scene to on_scene and then track normally. If no captain is assigned to this scenario, always use captain=not_on_scene.`);
  lines.push('19. BACKUP STATUS — MACHINE TAG: Track not_called → called → en_route → on_scene. Emit [BACKUP: STATUS] only when status changes. en_route and on_scene append ETA=N. called has no ETA. AUTO-BACKUP: cardiac arrest → [BACKUP: en_route ETA=8] on first response; multi-patient → [BACKUP: en_route ETA=6]; "Backup on arrival" seed → [BACKUP: on_scene ETA=0]. All other scenarios: only on student request. BACKUP TRIGGERS — any of the following count as a request for backup and immediately start the backup sequence: "backup," "send backup," "I need help," "additional unit," "second unit," "another medic," "engine company," "ladder company," "truck company," "rescue company," "fire department," "mutual aid," "request fire," "get me fire," or any request for additional emergency resources on scene. CAPTAIN ALWAYS RESPONDS: When backup is triggered (by any of the above), your captain (named in the CREW section) always responds personally — dispatch announces them by their actual name. Additional crew may be named generically to fit the region and unit type, but the captain is always included. Never send an engine company or BLS unit without your captain.');
  lines.push('20. REPORT MODE: When user message contains [REPORT MODE: ...], player is giving a radio report. No procedure rolls this turn. Respond as receiving party (charge nurse, medical control, incoming crew); acknowledge report, ask relevant follow-up; confirm ETA or transfer acceptance. Continue emitting [VITALS:] and [CREW_STATUS:] tags.');
  lines.push('21. CPR QUALITY ROLLS: A [SYSTEM ROLL] determines CPR quality. DC 12 on scene/stationary. DC 17 in a moving ambulance — narrate degraded compression quality and lower ETCO2. On FAILURE or COMPLICATION at DC 17, encourage pulling over or deploying LUCAS.');
    // ── Difficulty-specific behavioral tuning ──────────────────────────────
  if (seed.difficulty === 'EASY') {
    lines.push('20. EASY MODE BEHAVIORAL RULES: This is a foundational learning scenario. (a) PARTNER SUPPORT: Your partner is engaged and attentive. If the student appears stuck — more than one full turn passes with no meaningful clinical action — the partner may offer a single non-directive prompt ("Want me to get vitals started?" or "Should I start setting up the airway bag?"). The partner never names a diagnosis or tells the student what treatment to give — only offers to help with logistics. (b) PATIENT CLARITY: The patient is cooperative, answers questions clearly, and does not exhibit dramatic behavioral resistance. Their symptoms are classical and textbook. (c) SCENE CLARITY: Scene safety hazards are obvious. Bystanders are calm and provide accurate history.');
  } else if (seed.difficulty === 'HARD') {
    lines.push('20. HARD MODE BEHAVIORAL RULES: This is a high-acuity high-fidelity scenario. (a) PARTNER PASSIVITY: Your partner does exactly what they are told and nothing more. They will NOT volunteer suggestions, prompt for forgotten assessments, or offer clinical guidance unprompted. They respond to direct orders only. They do not ask "should we..?" questions. (b) ATYPICAL PRESENTATION: This patient may present atypically. Classic textbook features may be absent, masked by comorbidities, or partially obscured by environmental factors. Do not telegraph the diagnosis through the partner or environment. (c) SCENE PRESSURE: Pace the scene realistically — family is anxious and asking questions, bystanders may be interfering, environmental factors create cognitive load. Do not artificially pause the scene to give the student time to think.');
  } else if (seed.difficulty === 'BLACK_CLOUD') {
    lines.push('20. BLACK CLOUD MODE — THE UNIVERSE HAS DECIDED: This patient is not going to make it. The provider is cursed. Every intervention may momentarily hold the line but cannot reverse the tide — deterioration continues regardless of care quality. This is not a reflection of the provider\'s skill; it is the black cloud. MANDATORY BEHAVIORS: (a) INEVITABLE DECLINE: Vitals worsen on schedule. Interventions may produce brief, temporary improvement ("the rhythm converted for about 30 seconds") before the slide resumes. Never let good care save this patient — complications compound. (b) GALLOWS PARTNER: Your partner is a seasoned black-cloud survivor. Brief, deadpan acknowledgment of the chaos is acceptable — "Classic," "Of course it is," "That\'s a new one," "Yeah, that tracks" — delivered without breaking clinical focus. Never slapstick, never whining. Dark professionalism. (c) COMPOUNDING DISASTERS: Things go wrong in sequence. Equipment fails when most needed. A second problem emerges mid-treatment. The bystander\'s history was wrong. Layer them naturally — not all at once. (d) CLINICAL PLAUSIBILITY: Deterioration must be medically possible, not random. A cardiac patient refibs after ROSC. The airway swells despite correct technique. A tension pneumo develops from a rib fracture you didn\'t cause. Improbable but not impossible. (e) PARTNER COMPETENCE: Partner executes perfectly — this is not their fault either.');
  } else if (seed.difficulty === 'MURPHY') {
    lines.push('20. MURPHY\'S LAW MODE — EQUIPMENT HATES YOU: Hard-mode rules apply, plus: (a) PARTNER PASSIVITY: Partner does exactly what they are told and nothing more — no volunteering, no suggestions, no prompts. (b) GUARANTEED EQUIPMENT FAILURE: Something WILL break on this call. Pick the most inconvenient possible moment. The failure must be realistic and surmountable — a kinking IV, a monitor losing signal mid-strip, a laryngoscope that dies at the tube attempt, a stretcher wheel locking at the ramp, a BVM mask seal that breaks, an O2 regulator that sticks. Narrate it deadpan. This is Tuesday. One primary failure is mandatory; secondary nuisances are welcome. (c) DISADVANTAGE ROLLS: Every dice roll was already rolled at disadvantage by the server (rolled twice, lower result used) — you will see this reflected in the [SYSTEM ROLL] tags. Do not comment on the disadvantage; narrate outcomes as written. (d) ATYPICAL PRESENTATION: Presentation may be atypical or masked by comorbidities — same as Hard mode. Do not telegraph the diagnosis through environment or partner.');
  } else {
    lines.push('20. NORMAL MODE BEHAVIORAL RULES: Balanced learning environment. Partner is professional and competent — follows orders, provides requested assistance, but does not volunteer clinical guidance. Patient presentation follows the scenario card without artificial atypicality added. Scene is manageable but realistic.');
  }
  lines.push('');
    // Arrest-specific ACLS pacing rule
  if (seed.category === 'arrest') {
    lines.push(
      '22. CARDIAC ARREST — MANDATORY ACLS TIMING: Real resuscitation has rigid timing. Enforce it as the simulation clock.\n'
      + '    CPR CYCLES: Minimum 2 minutes of uninterrupted compressions before any rhythm check. If the student calls for a check before 2 minutes have elapsed, the partner interjects: "[name]: Hold — only [N] seconds in. Give it two full minutes." Do not allow early checks.\n'
      + '    TURN SCOPE: Each student message during active resus = one action window: one 2-minute CPR cycle OR one analysis+shock sequence, not both. If a student chains CPR → rhythm check → shock → epi → CPR in one message, narrate the first step then pause and wait for the next order. Do not telescope a full ACLS loop into one reply.\n'
      + '    EPINEPHRINE INTERVALS: Track scene-minute of every epi dose. Minimum interval: 3 minutes. If re-ordered under 3 minutes, partner states: "[name]: Epi was [N] min ago — too soon." Hold the dose; do not administer until re-ordered.\n'
      + '    AMIODARONE: 300 mg after the 3rd shock. 150 mg after the 5th shock. Track shock count. Do not allow a second 300 mg dose.\n'
      + '    PARTNER CLOCK CALLS: Every 2 minutes of active CPR, the partner calls time: "[name]: Two minutes — rotate?" This is standard resuscitation practice and grounds the simulation in real ACLS pacing.\n'
      + '    TIMESTAMPS: Resus timestamps must reflect real tempo. Each CPR cycle = 2 min minimum. A full loop (CPR → rhythm check → shock → CPR) = at least 3–4 minutes. Never emit timestamps suggesting two full loops in under 3 minutes total.'
    );
  }
    // California base-hospital contact rule
  if (seed.region === 'CALIFORNIA_Urban') {
    lines.push(
      '23. CALIFORNIA BASE HOSPITAL CONTACT \u2014 MACHINE TAG REQUIRED: '
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
 * Build a scenario context for the debrief API call.
 * Includes both the structured event log and the full conversation transcript
 * so the debrief model can evaluate performance from actual evidence.
 *
 * @param {object}  seed      Scenario seed
 * @param {Array}   events    Logged events (procedure rolls, narrative snippets)
 * @param {Array}   messages  Full conversation history [{ role, content }]
 */
function buildDebriefContext(seed, events, messages = []) {
  const lines = [];
  lines.push('=== SCENARIO LOG FOR DEBRIEF ===');
  lines.push(`Scenario ID: ${seed.scenario_id}`);
  lines.push(`Category: ${seed.category} | Difficulty: ${seed.difficulty}`);
  lines.push(`Presentation: ${seed.presentation}`);
  if (seed.true_diagnosis) lines.push(`True diagnosis (curveball reveal): ${seed.true_diagnosis}`);
  if (seed.special_flags) lines.push(`Special flags: ${seed.special_flags}`);
  lines.push(`Patient: ${seed.patient_age}yo ${seed.sex} | Comorbidity: ${seed.comorbidity_bundle || 'otherwise_healthy'}`);
  lines.push(`Trajectory: ${seed.trajectory} | Deterioration threshold: ${seed.decompensation_clock || 'N/A'} min`);
  lines.push(`Complication: ${seed.complication_type}`);
  lines.push(`Region: ${seed.region} | Provider: ${seed.provider_level}`);
  lines.push('');
  const isMultiPatient = seed.special_flags && /two_patients/i.test(seed.special_flags);
  const procEvents = events.filter(e => e.event_type === 'procedure');

  const formatEvent = ev => {
    const parts = [`T+${ev.scene_minute}min`, ev.procedure_id || ''];
    if (ev.roll !== null && ev.roll !== undefined) parts.push(`d20=${ev.roll} vs DC${ev.dc} → ${ev.outcome}`);
    else if (ev.outcome) parts.push(`→ ${ev.outcome}`);
    return parts.join(' ');
  };

  if (isMultiPatient) {
    const primary   = procEvents.filter(e => (e.patient || 'primary') === 'primary');
    const secondary = procEvents.filter(e => e.patient === 'secondary');
    lines.push('--- PROCEDURE ROLL LOG — PRIMARY PATIENT ---');
    if (primary.length === 0) lines.push('(no procedures logged for primary patient)');
    else primary.forEach(ev => lines.push(formatEvent(ev)));
    lines.push('');
    lines.push('--- PROCEDURE ROLL LOG — SECONDARY PATIENT (NEONATE/OTHER) ---');
    if (secondary.length === 0) lines.push('(no procedures logged for secondary patient)');
    else secondary.forEach(ev => lines.push(formatEvent(ev)));
  } else {
    lines.push('--- PROCEDURE ROLL LOG ---');
    if (procEvents.length === 0) lines.push('(no procedure rolls logged)');
    else procEvents.forEach(ev => lines.push(formatEvent(ev)));
  }
  lines.push('');

  // ── BGL flag: only fire when presentation actually involves AMS, altered
  // cognition, seizure, syncope, weakness, or a tox/diabetic picture.
  // Do NOT fire for patients with normal mentation and a clear non-glucose dx.
  const bglIndicatedRE = /altered|mental.?status|confus|agitat|ams|disorient|unconsci|unrespons|seiz|syncop|collaps|letharg|obtund|delirium|overdose|intoxicat|diabet|hypoglyc|hyperglycemi|dka|hhs|glucose|blood.?sugar|weak(?:ness)?|dizzi/i;
  const bglAlwaysCategories = ['toxicology'];
  const hasBGL = events.some(e =>
    e.procedure_id === 'glucometry' ||
    (e.detail && /glucose|BGL|glucomet|finger.?stick/i.test(e.detail))
  ) || messages.some(m =>
    /blood.?glucose|blood.?sugar|finger.?stick|glucomet|check.*BGL|BGL.*check|glucose.*check|dextrose|D50|D10|oral glucose/i.test(m.content || '')
  );
  const bglIndicated = bglAlwaysCategories.includes(seed.category) ||
    bglIndicatedRE.test(seed.presentation || '');
  lines.push('--- FLAGS ---');
  if (!hasBGL && bglIndicated) {
    lines.push('BGL_NOT_CHECKED: Glucose was not checked despite a presentation where hypoglycemia is on the differential (AMS, seizure, syncope, weakness, or tox/diabetic context).');
  }
  lines.push('');

  // ── Full conversation transcript ─────────────────────────────────────────
  if (messages.length > 0) {
    lines.push('--- CONVERSATION TRANSCRIPT ---');
    lines.push('Use this to evaluate what the provider actually said and did.');
    for (const msg of messages) {
      const role = msg.role === 'user' ? 'PROVIDER' : 'SCENE';
      // Strip machine tags that are irrelevant to clinical evaluation
      const text = (msg.content || '')
        .replace(/\[VITALS:[^\]]*\]/gi, '')
        .replace(/\[SYSTEM ROLL:[^\]]*\]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!text) continue;
      const truncated = text.length > 700 ? text.slice(0, 700) + ' [...]' : text;
      lines.push(`[${role}] ${truncated}`);
    }
    lines.push('');
  }

  lines.push('--- DEBRIEF CONSTRAINTS ---');
  lines.push('Base all critique on what is actually in the transcript above — do not reference events not evidenced by the record.');
  lines.push('NEVER fabricate specific facility or hospital names. Use "the receiving facility."');
  lines.push('NEVER invent medication names, dosages, or procedures not present in the transcript.');
  lines.push('=== END LOG ===');
  return lines.join('\n');
}

module.exports = { assembleSeedBlock, buildDebriefContext };
