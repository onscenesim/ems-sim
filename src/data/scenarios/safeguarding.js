'use strict';

const SAFEGUARDING_CONTRACT = `SAFEGUARDING SCENE — PRIVATE PORTRAYAL:
Use the supplied dispatch as the only caller information at dispatch. On arrival, use the supplied first impression and any immediate observations from actual crew actions. For scene fidelity, the supplied witness accounts and conditions for disclosure take precedence over generic presentation text. The characters know only what they observed or say they observed. Reveal clinical findings through assessment and source-specific history through relevant questions. Never give away the private case key through a narrator, partner, confession or unsolicited diagnosis.
For sensitive patient history, wait until the medically able patient has agreed to speak and any accompanying person is actually out of earshot. Allow a safe, routine request for privacy and address the patient directly. If privacy is unavailable or declined, respect that boundary and leave a later opportunity at a safe handoff when feasible. Use a qualified interpreter if needed. Preserve the authored social facts and patient choices at every difficulty. Never invent physical threats, definitive corroboration or a second victim as a dramatic escalation.
Keep medical assessment, stabilization and transport decisions moving alongside safeguarding. Credit neutral, trauma-informed questions, an objective record distinguishing direct observations from attributed statements, and a discreet handoff. Follow applicable safeguarding and reporting procedures without assuming a universal reporting rule or promising secrecy. A safety concern does not by itself establish incapacity or authorize detention. Leave decisions about assessment, transport, consultation and escalation to the player within their scope.`;

const INFANT_HEAD_TRAUMA = {
  // Keep the catalog ID of the earlier infant head-trauma entry.
  case_id: 'pediatric-8d5292d719b82fd2',
  presentation: 'Abusive head trauma — infant with unexplained lethargy and vomiting',
  age_override: ['pediatric — infant'],
  difficulty: 'HARD',
  trajectory_override: 'slowly_deteriorating',
  safeguarding: {
    dispatch: 'Infant at a residence, unusually hard to wake after a nap. Caller says the baby is breathing and has vomited.',
    opening: 'One caregiver holds the quiet, unusually limp infant and asks if this could be a stomach bug. A second caregiver is nearby. There is no obvious external head injury on first look.',
    history: 'Previously healthy infant with no daily medicines or known allergies. Caregivers report no recent fever or diarrhea when asked.',
    behavior: 'The caregiver holding the baby initially says the baby was fine at the last feed and became sleepy after vomiting. When asked individually about last known well and what each person actually saw, the second caregiver reports the baby was already unusually quiet and hard to rouse before the offered feed. The first caregiver then clarifies they did not see how much was taken and were repeating what they assumed. Neither reports witnessing an injury. Both answer some questions and stay concerned about the baby. Do not supply a confession, identify a perpetrator, or reenact the injury.',
  },
  hint: 'The infant has an intracranial injury due to abusive head trauma in the private case key. The mechanism and intent are unavailable to EMS. Focused assessment finds reduced tone and responsiveness, with a brief response to stimulation, then sleepiness again. No obvious scalp injury, temperature 36.8 C, glucose 96 mg/dL, HR 148, RR 32 initially, SpO2 97% on room air if measured. With deterioration, alertness decreases and respirations become irregular. Let timely supportive care matter. Consider medical and traumatic causes of altered responsiveness, support airway and ventilation as indicated, reassess and transport promptly to an appropriate pediatric-capable destination per protocol. Convey why the history and exam raise concern and use the local child-protection reporting pathway for suspected abuse. No field retinal, imaging or forensic findings are available.',
};

const ELDER_ABUSE = {
  presentation: 'Suspected elder abuse — wrist injury after a reported fall at home',
  age_override: ['elderly'],
  difficulty: 'HARD',
  trajectory_override: 'stable',
  safeguarding: {
    dispatch: 'Older adult at home with wrist pain after a reported slip. The caller says the patient is awake and breathing normally.',
    opening: 'The patient sits near a walker, holding one wrist close to their body. An adult relative who helps with daily care meets the crew and describes a slip during a transfer.',
    history: 'Osteoarthritis and gait limitation at baseline. Uses a walker and relies on the relative for shopping and some transfers. Takes acetaminophen as needed and reports no anticoagulants when asked directly.',
    behavior: 'The relative answers the first history question for the patient, then lets the patient speak if redirected. They step away for a routine private assessment when asked calmly. Only once out of earshot, if asked what happened or whether they feel safe, the patient says the relative grabbed their wrist hard during an argument, denies falling to the floor, and worries who will help them if they speak up. If offered evaluation and a private handoff, the patient is willing to go and speak with hospital staff. No spontaneous disclosure in front of the relative.',
  },
  hint: 'The wrist injury occurred during rough handling by the caregiver. Exam reveals focal wrist tenderness and mild swelling with intact distal sensation and perfusion, no obvious deformity, and no evidence of an acute head injury on assessment. GCS 15, HR 84, BP 138/78, RR 16, SpO2 98% on room air if assessed. Keep physiology stable. Assess the reported fall and the injury, evaluate capacity and immediate safety directly, treat and offer transport. Attribute the separate accounts accurately and convey the concern privately to the receiving team. Use the locally applicable vulnerable-adult reporting or adult protective services pathway. Dependency on the relative does not establish incapacity, and the field record cannot prove a fracture or legal conclusion.',
};

const POSSIBLE_TRAFFICKING = {
  // Keep the catalog ID of the earlier trafficking entry.
  case_id: 'behavioral-dd406c8740832314',
  presentation: 'Possible labor trafficking — adult with lightheadedness after a work shift',
  age_override: ['young_adult'],
  difficulty: 'HARD',
  trajectory_override: 'stable',
  safeguarding: {
    dispatch: 'Adult reports feeling faint after work in the parking lot of an extended-stay hotel. Patient is awake. No collapse was reported.',
    opening: 'The patient is seated near the entrance with a bottle of water. A coworker is beside them, holding both of their work bags and checking when their ride will arrive. The patient says they feel lightheaded when standing.',
    history: 'The patient reports a long shift doing commercial cleaning with little food or water, no actual loss of consciousness, no chest pain and no significant medical history when asked. They can converse and make decisions about their care.',
    behavior: 'The coworker initially jumps in to give the work schedule, then agrees to wait out of earshot for a routine assessment. In private, use open questions to elicit that the employer arranges lodging and transport and that the patient worries missing a shift could cost them their room. If asked directly and sensitively, the patient has their own phone and ID, reports no explicit threat, and is unsure what alternatives they have. They may ask what will be shared and decline further questions. They are open to a private conversation with receiving staff if offered. These details support more than one interpretation. Keep the situation unresolved, even if the player asks every relevant question.',
  },
  hint: 'Decreased intake plausibly contributes to lightheadedness. GCS 15, HR 96, BP 112/72 seated, RR 16, SpO2 99% on room air, glucose 88 mg/dL if assessed. Symptoms improve at rest and the patient remains medically stable. Continue appropriate evaluation for presyncope and offer transport. Work-linked lodging and reliance on a ride raise a possible safety concern, and the available facts leave exploitation and trafficking unconfirmed. Do not invent a confession, document confiscation, threats, hidden injuries or definitive confirmation in the field or debrief. Explore immediate safety and offer a private, consent-based connection to support. Explain confidentiality limits and follow applicable reporting requirements while respecting adult autonomy. Do not grade the player on labeling trafficking or obtaining disclosure.',
};

module.exports = { SAFEGUARDING_CONTRACT, INFANT_HEAD_TRAUMA, ELDER_ABUSE, POSSIBLE_TRAFFICKING };
