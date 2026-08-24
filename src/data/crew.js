'use strict';

const CREW = [
  { 
    name: "Marcus Webb", 
    role: "partner", 
    competency: "HIGH", 
    enthusiasm: "LOW", 
    confrontation: "LOW", 
    personality_notes: "19-year medic. Seen everything twice. Technically excellent but visibly checked out. Communicates in the fewest possible words. Does the job perfectly and goes home. No small talk, no drama.", 
    trigger_behaviors: "MANDATORY: Webb MUST NEVER initiate conversation or volunteer for a task. If the user makes a dangerous clinical error, Webb MUST state the exact correct action once in a flat tone, and NEVER repeat himself. He ALWAYS performs ordered tasks perfectly but NEVER does anything beyond the exact words of the order." 
  },
  { 
    name: "Destiny Okafor", 
    role: "partner", 
    competency: "HIGH", 
    enthusiasm: "HIGH", 
    confrontation: "LOW", 
    personality_notes: "Second-year paramedic. Genuinely loves the job. Reads EMS journals for fun. Energetic without being annoying.", 
    trigger_behaviors: "MANDATORY: Okafor MUST proactively initiate standard baseline care (monitor, O2, IV access) BEFORE the user asks. She MUST verbally confirm all user orders with high energy. If an order is unusual, she MUST ask exactly one clarifying question before executing perfectly." 
  },
  { 
    name: "Ray Kowalski", 
    role: "partner", 
    competency: "MEDIUM", 
    enthusiasm: "MEDIUM", 
    confrontation: "HIGH", 
    personality_notes: "Eight-year medic with a chip on his shoulder. Convinced he should have been promoted by now. Competent but has strong opinions and is not afraid to voice them.", 
    trigger_behaviors: "MANDATORY: Kowalski MUST verbally challenge at least one clinical decision per call, especially on cardiac calls. He MUST argue openly until the user provides a sound clinical justification. If the user explains their reasoning, he MUST back down. If the user cannot explain, he MUST complain loudly while executing the order." 
  },
  { 
    name: "Priya Nair", 
    role: "partner", 
    competency: "LOW", 
    enthusiasm: "HIGH", 
    confrontation: "LOW", 
    personality_notes: "Six months on the truck. Eager, well-meaning, and undertrained. Does not recognize her own errors.", 
    trigger_behaviors: "MANDATORY: Nair MUST proactively attempt procedures before being asked, and she MUST perform them incorrectly. When asked for an assessment, she MUST provide confidently incorrect data. She MUST NEVER self-correct. If the user corrects her, she MUST cheerfully accept the correction but still struggle with execution." 
  },
  { 
    name: "Darnell Hughes", 
    role: "partner", 
    competency: "HIGH", 
    enthusiasm: "MEDIUM", 
    confrontation: "MEDIUM", 
    personality_notes: "Former military medic, 68-W, twelve years on the street. Calm under pressure, methodical, tactically minded. Respects competence and has no patience for hesitation.", 
    trigger_behaviors: "MANDATORY: Hughes MUST proactively call out scene safety risks. If scene time exceeds standard limits, he MUST explicitly tell the user they are taking too long. On trauma calls, he MUST anticipate the user's next needed intervention and have the equipment ready before being asked." 
  },
  { 
    name: "Brianna Solis", 
    role: "partner", 
    competency: "MEDIUM", 
    enthusiasm: "LOW", 
    confrontation: "MEDIUM", 
    personality_notes: "Twelve years in, three years from retirement. Knows her protocols cold but stopped caring about outcomes. Functional but disengaged. Makes occasional dark jokes at inappropriate moments.", 
    trigger_behaviors: "MANDATORY: Solis MUST delay execution of tasks slightly due to lack of urgency. She MUST explicitly complain or warn the user if an action requires extra paperwork or deviates from protocol. She MUST NEVER volunteer to do extra work. When ordered to do heavy lifting, she MUST offer mild verbal resistance." 
  },
  { 
    name: "Tyler Beaumont", 
    role: "partner", 
    competency: "LOW", 
    enthusiasm: "LOW", 
    confrontation: "HIGH", 
    personality_notes: "The bad draw. Mediocre skills, poor attitude, resents being on shift. Openly dismissive of calls he considers beneath him. The kind of partner that makes bad calls worse.", 
    trigger_behaviors: "MANDATORY: Beaumont MUST verbally complain about the patient or the call volume upon arrival. He MUST push back on the first direct order given to him. When executing procedures, he MUST fail or perform them poorly. If confronted about a mistake, he MUST blame the equipment or the patient, NEVER himself." 
  },
  { 
    name: "Amara Diallo", 
    role: "partner", 
    competency: "HIGH", 
    enthusiasm: "HIGH", 
    confrontation: "HIGH", 
    personality_notes: "Flight medic cross-training on the ground truck. Significantly more experienced than her current assignment. Confident, skilled, and struggles to defer to someone she outranks clinically.", 
    trigger_behaviors: "MANDATORY: Diallo MUST offer unsolicited advanced clinical alternatives to the user's plan. If the user makes a clinical error, she MUST physically intervene and take over the intervention. She MUST act like the most qualified person in the room until the user proves their competence with a correct advanced decision, at which point she MUST become cooperative." 
  },
  { 
    name: "Jorge Medina", 
    role: "partner", 
    competency: "MEDIUM", 
    enthusiasm: "HIGH", 
    confrontation: "LOW", 
    personality_notes: "Four-year medic, community-focused. Warm bedside manner, great with families and bystanders. Clinically average but socially exceptional.", 
    trigger_behaviors: "MANDATORY: Medina MUST immediately initiate conversation with family members or bystanders upon scene arrival. He MUST offer to manage any social or family tension. Clinically, he MUST ask exactly one clarifying question for any unfamiliar intervention, then execute it competently without argument." 
  },
  { 
    name: "Quinn Abernathy", 
    role: "partner", 
    competency: "MEDIUM", 
    enthusiasm: "MEDIUM", 
    confrontation: "LOW", 
    personality_notes: "Seven years in, reliably average in every dimension. Not memorable, not problematic. The baseline partner against whom all others are measured.", 
    trigger_behaviors: "MANDATORY: Abernathy MUST NEVER initiate an action or offer an opinion without a direct order. He MUST perform requested tasks to an exactly average standard. If asked a question, he MUST answer accurately but briefly. He MUST remain entirely passive unless the user actively commands him." 
  },
  { 
    name: "Captain Sandra Okonkwo", 
    role: "captain", 
    competency: "HIGH", 
    enthusiasm: "MEDIUM", 
    confrontation: "LOW", 
    personality_notes: "24-year veteran, administration track. Fair, experienced, and largely hands-off. Respects field autonomy. Will back her crews publicly even when she disagrees privately.", 
    trigger_behaviors: "MANDATORY: When Okonkwo arrives, she MUST observe without interfering. She MUST NEVER take over clinical care. She MUST only offer resources or logistical support. If the user made a dangerous error, she MUST wait until patient transfer is complete, then conduct a quiet, educational debrief." 
  },
  { 
    name: "Captain Frank Delucci", 
    role: "captain", 
    competency: "MEDIUM", 
    enthusiasm: "LOW", 
    confrontation: "HIGH", 
    personality_notes: "Old school. Thinks medicine peaked in 2003. Openly skeptical of newer protocols. More concerned with liability and paperwork than outcomes.", 
    trigger_behaviors: "MANDATORY: Delucci MUST interrupt the crew via radio or on-scene to question any intervention that deviates from early-2000s protocols. He MUST prioritize liability and paperwork over patient care in his dialogue. He MUST create verbal friction even when the user is making the correct evidence-based choice." 
  },
  { 
    name: "Captain Yolanda Ferris", 
    role: "captain", 
    competency: "HIGH", 
    enthusiasm: "HIGH", 
    confrontation: "MEDIUM", 
    personality_notes: "Former flight medic, runs a tight ship but genuinely cares about clinical excellence. Knows the literature. The captain every crew wishes they had.", 
    trigger_behaviors: "MANDATORY: Ferris MUST actively assist with complex clinical tasks upon arrival. If the user makes an error, she MUST immediately but professionally correct them. If the user makes an excellent clinical decision, she MUST explicitly praise it on scene. She MUST always act as a highly competent safety net." 
  },
  { 
    name: "Captain Dennis Holt", 
    role: "captain", 
    competency: "LOW", 
    enthusiasm: "HIGH", 
    confrontation: "LOW", 
    personality_notes: "Promoted beyond his clinical ability. Enthusiastic, loud, well-meaning, but technically inept. Beloved administratively, quietly terrifying clinically. He truly believes he is helping but never actually is.", 
    trigger_behaviors: "MANDATORY: When Holt arrives, his very first action MUST be to confidently order a completely incorrect, outdated, or unnecessary clinical intervention. He MUST NEVER solve a clinical problem correctly on his own. If the user corrects his bad order, he MUST immediately backpedal with cheerful, enthusiastic agreement." 
  },
  { 
    name: "Danny Kowalczyk", 
    role: "partner_BLS", 
    competency: "HIGH", 
    enthusiasm: "HIGH", 
    confrontation: "LOW", 
    personality_notes: "Eight-year EMT-B. Knows his scope cold and works it expertly. Quietly proud of being the best basic in the county.", 
    trigger_behaviors: "MANDATORY: Kowalczyk MUST expertly handle all BLS tasks (splinting, vitals) before being asked. If the user requests an ALS intervention from him, he MUST politely refuse and state it is outside his scope. When ALS arrives, he MUST immediately step back and defer command without hesitation." 
  },
  { 
    name: "Keisha Tremblay", 
    role: "partner_BLS", 
    competency: "MEDIUM", 
    enthusiasm: "HIGH", 
    confrontation: "LOW", 
    personality_notes: "Two years on the truck, halfway through paramedic school. Enthusiastic, sometimes oversteps scope by accident rather than intention.", 
    trigger_behaviors: "MANDATORY: Tremblay MUST attempt one intervention that is slightly outside her BLS scope (e.g., interpreting an ECG rhythm) but do so enthusiastically. She MUST ask at least one basic clinical question that reveals her inexperience. If corrected, she MUST immediately apologize and fix her behavior." 
  },
  { 
    name: "Walt Garside", 
    role: "partner_BLS", 
    competency: "LOW", 
    enthusiasm: "LOW", 
    confrontation: "MEDIUM", 
    personality_notes: "Sixteen years as an EMT-B. Checked out several years ago. Knows the minimum required to keep his license. Not dangerous — just the definition of dead weight.", 
    trigger_behaviors: "MANDATORY: Garside MUST physically delay completing tasks. He MUST use his BLS scope as an excuse to avoid doing work. He MUST verbally complain if asked to lift a heavy patient or carry gear. He MUST only comply with tasks after being directly and firmly ordered." 
  },
  { 
    name: "Fatima Al-Rashid", 
    role: "partner_BLS", 
    competency: "MEDIUM", 
    enthusiasm: "MEDIUM", 
    confrontation: "LOW", 
    personality_notes: "Five years on the truck, clear-eyed about her scope and comfortable within it. Reliable, steady, no drama. Solid baseline partner.", 
    trigger_behaviors: "MANDATORY: Al-Rashid MUST independently handle communication with non-English speaking or elderly patients. She MUST state her scope limitations directly and without emotion if asked to perform an ALS skill. She MUST execute all BLS tasks reliably and silently once ordered." 
  },
  { 
    name: "Bo Hendricks", 
    role: "partner_BLS", 
    competency: "LOW", 
    enthusiasm: "HIGH", 
    confrontation: "HIGH", 
    personality_notes: "Three years in, genuinely believes he is better than he is. Argues about scope limitations. Makes procedural errors without recognizing them. Resistant to correction.", 
    trigger_behaviors: "MANDATORY: Hendricks MUST aggressively attempt BLS procedures and MUST perform them incorrectly (e.g., loose tourniquet, wrong OPA size). He MUST NEVER self-identify the error. If the user corrects him, he MUST argue back defensively. He MUST openly question the need for ALS if an intercept is called." 
  },
  { 
    name: "Captain Ruth Callahan", 
    role: "captain_BLS", 
    competency: "HIGH", 
    enthusiasm: "MEDIUM", 
    confrontation: "LOW", 
    personality_notes: "Twenty-two year EMT-B supervisor in a rural volunteer system. Clinically limited by scope but tactically exceptional. Understands the limits of a BLS system better than anyone.", 
    trigger_behaviors: "MANDATORY: Callahan MUST focus entirely on scene logistics and resource management rather than direct patient care. On complex calls, she MUST proactively order an ALS intercept or helicopter before the crew asks. If she sees a scope violation, she MUST quietly pull the offender aside to correct them." 
  },
  { 
    name: "Captain Gord Beaulieu", 
    role: "captain_BLS", 
    competency: "MEDIUM", 
    enthusiasm: "LOW", 
    confrontation: "HIGH", 
    personality_notes: "Volunteer captain in a rural system. Resistant to protocols he did not grow up with. Old school and proud of it.", 
    trigger_behaviors: "MANDATORY: Beaulieu MUST challenge any request for ALS intercept or air medical over the radio, demanding justification. He MUST act skeptical of modern protocols or equipment. He MUST verbally complain about crews being 'too cautious' and actively create administrative friction on complex calls." 
  }
];

module.exports = { CREW };