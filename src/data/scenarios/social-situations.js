'use strict';

const TRAFFICKING_AGES = ['pediatric — adolescent', 'young_adult', 'middle_aged'];
const TRAFFICKING_HISTORY = 'If the patient is medically able, and only after they agree to a conversation out of earshot of anyone accompanying them, relevant open questions about safety can elicit that someone pressures them to see paying clients and that they are afraid to stop. They may decline details and will consider speaking privately with the receiving team. Do not describe sexual acts, solicit proof or graphic details, or expose the disclosure to an accompanying person. A minor describes exploitation in age-appropriate language and is offered child safeguarding. Explain the limits of confidentiality and follow the applicable reporting pathway for the patient’s age. The patient can disclose later if too sick to speak on scene. Never have an obtunded patient disclose or let an uninformed witness narrate the exploitation.';

const SEX_TRAFFICKING = [
  {
    presentation: 'Sex trafficking — wrist injury during a commercial encounter',
    category_override: 'trauma',
    trajectory_override: 'stable',
    safeguarding: {
      dispatch: 'Wrist injury at a hotel. Caller reports the patient is awake and there is no major bleeding.',
      opening: 'The patient is seated by their hotel-room door holding one wrist. An acquaintance nearby says the patient slipped and offers to answer questions for them.',
      history: 'No daily medication or known allergies per patient. The patient can answer questions and recalls the event. In private, they report being pushed and landing on the wrist during an encounter with a paying client. No loss of consciousness or head strike on elicited history.',
      behavior: `The acquaintance eventually steps away for an exam if calmly asked. The initial fall story is the acquaintance’s account. ${TRAFFICKING_HISTORY}`,
    },
    hint: 'Painful swollen wrist after a fall onto it; distal sensation and perfusion intact. Initial GCS 15, HR 98, BP 126/78, RR 18 and SpO2 99% on room air. Assess for additional injuries and address pain and splinting per scope. The patient’s private account raises a safeguarding concern independent of whether they have a fracture. Adult consensual sex work alone does not imply trafficking. No field finding confirms a specific criminal charge.',
  },
  {
    presentation: 'Sex trafficking — severe intoxication with depressed breathing',
    category_override: 'toxicology',
    trajectory_override: 'rapidly_deteriorating',
    safeguarding: {
      dispatch: 'Unresponsive person with breathing difficulty in a hotel lobby. Bystanders report the patient is very difficult to wake and barely breathing.',
      opening: 'A guest waves the crew over to a person slumped on the lobby floor. Staff say the patient was talking a short time ago. Breathing is visibly slow and shallow.',
      history: 'Witnesses saw increasing drowsiness and moved the patient to the floor. No witnessed fall and no reliable drug history. If alert after effective care, the patient reports taking something offered by someone they knew and is unsure what it contained.',
      behavior: `A person claiming to be a friend offers to take the patient away; they did not see the onset and will wait aside if asked. Bystanders can only describe the medical event. ${TRAFFICKING_HISTORY}`,
    },
    hint: 'Severe intoxication with opioid-type respiratory depression. Initial RR 5 and shallow, palpable pulse, HR 60, BP 104/64, SpO2 83% on room air if measured, GCS 7 and small pupils. Support airway and ventilation promptly, check glucose and competing causes as feasible, use indicated reversal within scope, and reassess for recurrent hypoventilation. Allow actual treatment to change breathing and alertness. A private conversation is possible only after adequate recovery and without delaying transport. Unknown exact substance and co-ingestion in the field.',
  },
  {
    presentation: 'Sex trafficking — progressive confusion from untreated neurosyphilis',
    category_override: 'neuro',
    trajectory_override: 'slowly_deteriorating',
    safeguarding: {
      dispatch: 'A walk-in clinic requests EMS for a patient with worsening confusion and difficulty walking.',
      opening: 'The patient sits on an exam chair and answers slowly. Clinic staff are present, with someone who came in with the patient waiting near the doorway.',
      history: 'Clinic staff report weeks of new headache and gait difficulty, and have a prior reactive syphilis test with no documented treatment. They can provide this information discreetly when asked. No confirmatory CSF results are available.',
      behavior: `The accompanying person says they are just tired and offers to drive them home. They can be asked to wait outside. The patient may be too confused for a sustained interview, though brief lucid answers are possible. ${TRAFFICKING_HISTORY}`,
    },
    hint: 'Untreated neurosyphilis is the private diagnosis. Initial GCS 14 with disorientation, HR 94, BP 126/76, RR 18, SpO2 98%, temperature 37.7 C and glucose 105 mg/dL if measured. Focused assessment finds gait difficulty by history, delayed answers and no clear unilateral deficit. Do not require walking an unsafe patient. A reactive test plus symptoms raises concern and does not establish the CNS diagnosis in the field. Assess undifferentiated altered mental status, check immediate threats and arrange timely hospital evaluation. Reassess mental status en route.',
  },
  {
    presentation: 'Sex trafficking — pelvic infection with sepsis in a patient with HIV',
    category_override: 'medical',
    sex_override: 'female',
    trajectory_override: 'rapidly_deteriorating',
    safeguarding: {
      dispatch: 'A patient at a residence reports severe lower abdominal pain, fever and weakness.',
      opening: 'The patient lies curled on a couch and looks ill. An acquaintance is nearby and says they have had a stomach bug for days.',
      history: 'In a private history the patient reports worsening pelvic pain and fever for several days, new discharge, established HIV and gaps in access to prescribed antiretrovirals. Pregnancy status is unknown. Reveal this history discreetly and only if elicited from a source who knows it.',
      behavior: `The acquaintance minimizes the pain and can be asked to step out. The patient can answer in short phrases early on, but medical care takes priority. ${TRAFFICKING_HISTORY}`,
    },
    hint: 'Sepsis from pelvic inflammatory disease in a patient with a uterus and adnexa. Initial GCS 15, HR 132, BP 88/54, RR 28, SpO2 97% on room air, temperature 39.3 C and delayed capillary refill if assessed. Lower abdominal tenderness on an appropriate exam; no field pelvic exam or confirmatory labs. Consider other serious causes including pregnancy-related emergencies, support perfusion and transport urgently according to local scope and protocol. HIV status is confidential and is neither proof of exploitation nor a reason to delay care.',
  },
].map(entry => ({
  ...entry,
  age_override: TRAFFICKING_AGES,
  difficulty: 'HARD',
  selection_group: 'sex_trafficking',
}));

const COLLEGE_HAZING = [
  {
    presentation: 'College hazing — delayed call for severe alcohol poisoning',
    safeguarding: {
      history: 'A student who directly witnessed the deterioration reports heavy drinking at a college initiation event. The patient was already difficult to wake over an hour before anyone called. This witness saw no fall or blows. No reliable co-ingestion or medical history is available initially.',
    },
    hint: 'Acute ethanol poisoning with substantial respiratory depression after a prolonged prearrival delay. Initial GCS 7, RR 6 and shallow, definite pulse HR 82, BP 100/62, SpO2 86% on room air, glucose 86 mg/dL and temperature 35.5 C if assessed. Emesis near the mouth may need suction. No authored blunt injury, but assess for other causes and impacts. Support airway and ventilation promptly, keep warm, transport and reassess. Effective support makes a difference.',
  },
  {
    presentation: 'College hazing — delayed call for severe alcohol poisoning and blunt assault',
    category_override: 'trauma',
    safeguarding: {
      history: 'A student who directly witnessed the event reports heavy drinking and blows during a college initiation. The patient struck their head, became difficult to wake over an hour before anyone called, and has worsened since. Describe the injuries and witness account without reenacting the ritual or specifying how to carry it out.',
    },
    hint: 'Severe ethanol intoxication and blunt head trauma with evolving intracranial injury. Initial GCS 6, RR 7 and irregular, definite pulse HR 72, BP 138/84, SpO2 85% on room air and glucose 94 mg/dL if assessed. Focused exam finds an occipital swelling and unequal pupil response. Do not attribute the depressed mental status to alcohol alone. Support airway and ventilation with appropriate trauma precautions, reassess neurologic findings and transport promptly to an appropriate facility. No field imaging confirmation is available. Effective support makes a difference.',
  },
].map(entry => ({
  ...entry,
  age_override: ['young_adult'],
  difficulty: 'HARD',
  selection_group: 'college_hazing',
  trajectory_override: 'rapidly_deteriorating',
  safeguarding: {
    dispatch: 'Campus housing. A caller says a student drank at a gathering and now will not wake up. The caller is unsure whether breathing is normal.',
    opening: 'The patient lies on the floor of a residence common room. There is vomit nearby, and their breathing is slow and ineffective. Several students are watching from the doorway. The patient is already critically ill before EMS arrives.',
    history: entry.safeguarding.history,
    behavior: 'The caller initially says they thought the patient was sleeping it off. While the crew gives immediate care, asking who actually saw the event or when the patient last responded can identify the direct witness and timeline. The witness supplies only the history for the selected variant. Do not front-load the whole story, add assault to the alcohol-only case, or delay ventilation or transport for interviews.',
  },
}));

const FACTITIOUS_DISORDER = [
  {
    // Preserve the earlier factitious-disorder entry’s instructor and replay ID.
    case_id: 'behavioral-32c545d5363db2c1',
    presentation: 'Factitious disorder history — convincing report of repeated vomiting',
    safeguarding: {
      dispatch: 'Patient at home reports repeated vomiting and near-fainting and requests evaluation.',
      opening: 'The patient sits by the door, speaks clearly and appears concerned. They have a written timeline of the episodes and are ready to go to hospital.',
      history: 'Established borderline personality disorder and factitious disorder imposed on self appear in a recent discharge summary if it is actually reviewed. The report describes past episodes of fabricated symptoms, with no detail on methods. No prior proof addresses today’s complaint.',
      behavior: 'The patient gives a precise and consistent account of vomiting, poor intake and lightheadedness, including what usually helps. There is no witnessed vomiting in the field and no corroborating witness. The patient wants the crew to take the report seriously and generally cooperates.',
    },
    hint: 'GCS 15, HR 90, BP 120/76, RR 16, SpO2 99%, glucose 101 mg/dL, temperature 37.0 C and a soft abdomen if assessed. Today’s symptoms are plausible and remain unverified. No hidden collapse or confession. Do a proportionate medical assessment, reassess and offer evaluation. Neither the calm exam nor either psychiatric diagnosis establishes fabrication. Document reported symptoms and measured findings separately.',
  },
  {
    presentation: 'Factitious disorder history — feeding tube, central line and possible line contamination',
    category_override: 'medical',
    safeguarding: {
      dispatch: 'Patient with a feeding tube and central line reports new chills, nausea and lightheadedness at home.',
      opening: 'The patient is awake and gives a detailed history. A feeding tube and covered central line are visible. The patient has been rubbing around the line dressing, and an unfamiliar smear is visible at the lifted edge on closer observation.',
      history: 'A recent discharge summary, if reviewed, documents separate diagnoses of borderline personality disorder and factitious disorder imposed on self. It says the devices were placed during earlier evaluations for severe symptoms later documented as self-induced. The devices are real and in place. No methods or substances are identified in the summary.',
      behavior: 'The patient reports shaking chills and says they rubbed the line area because it was uncomfortable. They are convincing and cooperative, and ask whether it could be infected. The crew can describe the visible residue and the patient’s account. Keep the identity, source and cause of the residue unresolved and give no explanation of how to contaminate access.',
    },
    hint: 'GCS 15, HR 110, BP 108/70, RR 18, SpO2 98%, glucose 102 mg/dL and temperature 37.8 C if measured. The reported symptoms could reflect a real complication, and line infection or contamination cannot be confirmed or excluded in the field. Preserve the device and avoid using the questionable line for routine access. Assess for infection and impaired perfusion, repeat vitals and convey the observed residue, documented history and patient report separately during prompt evaluation. Do not invent a confession, a lab result, an identified contaminant or a definitive diagnosis of fabrication or infection. Borderline personality disorder does not imply dishonesty.',
  },
].map(entry => ({
  ...entry,
  age_override: ['young_adult', 'middle_aged'],
  difficulty: 'HARD',
  selection_group: 'factitious_disorder',
  trajectory_override: 'stable',
}));

module.exports = { SEX_TRAFFICKING, COLLEGE_HAZING, FACTITIOUS_DISORDER };
