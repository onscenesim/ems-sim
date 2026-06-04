'use strict';

const INTERVENTIONS = [
  { id: "peripheral_iv", synonyms: ["start a line", "get a line", "establish access", "IV access", "peripheral IV", "start an IV", "grab a line", "large bore IV", "18 gauge", "16 gauge", "14 gauge", "20 gauge", "18g", "16g", "14g", "20g", "22g", "antecubital", "AC line", "forearm IV", "hand IV", "EJ access", "external jugular", "get access", "establish IV", "two large bore", "PIV", "peripheral access", "vascular access", "place an IV", "try a line", "try IV", "attempt IV", "get the IV", "run a line", "stick em", "obtain IV", "obtain an IV", "obtain a line", "get IV", "get an IV", "another IV", "second IV", "IV start", "IV line", "drop a line", "pop a line", "set a line", "try for a line", "try for IV", "try for access", "go for a line", "go for IV", "one more IV", "one more line", "retry IV", "retry the line", "reattempt IV", "reattempt the line", "another line", "second line", "bilateral IVs", "two IVs", "bilateral access", "saline lock", "hep lock", "venous access", "foot IV", "EJ", "jugular IV", "neck IV", "neck line", "neck access", "neck vein", "neck stick", "try the neck", "go for the neck", "get a neck line", "stick the neck", "try the jugular", "get a jugular line", "try for a jugular", "jugular line", "jugular access", "external jug", "ext jugular", "one more IV attempt", "last IV attempt", "final IV attempt", "one last stick", "one more stick", "one last IV", "last line attempt", "final line attempt", "one more poke", "one more try"], dc: [8,14], no_roll: false, dc_notes: "DC 8 normal patient. DC 14 hypotensive, obese, collapsed veins, pediatric, or dehydrated. Failure: no flash, positional. Complication: infiltration, hematoma.", scope: "ALS", notes: null },
  { id: "io_access", synonyms: ["intraosseous", "drill", "EZ-IO", "FAST1", "sternal IO", "tibial IO", "humeral IO", "bone drill", "get IO access", "IO access", "intraosseous access", "drill the tibia", "go IO", "do IO", "do an IO", "do the IO", "IO line", "establish IO", "place IO", "BIG", "bone injection gun", "humeral head IO", "humoral head IO", "humoral IO", "humoral", "proximal humerus IO", "humerus IO", "proximal tibia IO", "proximal tibial IO", "distal tibia IO", "tibial plateau IO"], dc: [7], no_roll: false, dc_notes: "DC 7. Failure: incorrect placement, inadequate depth. Complication: through-and-through, growth plate injury in pediatric. Always lower DC than peripheral IV — faster and more reliable in collapse.", scope: "ALS", notes: null },
  { id: "intubation", synonyms: ["intubate", "tube the patient", "get a tube", "oral intubation", "orotracheal intubation", "ETT", "endotracheal tube", "direct laryngoscopy", "video laryngoscopy", "glidescope", "macintosh blade", "miller blade", "definitive airway", "secure the airway", "place a tube", "place an airway", "advanced airway", "definitive airway management"], dc: [10,16], no_roll: false, dc_notes: "DC 10 normal airway. DC 16 difficult airway — trauma, obesity, blood, burns, angioedema, small mouth, short neck. Failure: describe resistance, poor view. Complication: esophageal placement — flat capnography waveform.", scope: "ALS - not available in urban california", notes: null },
  { id: "supraglottic_airway", synonyms: ["igel", "iGel", "igel airway", "i-gel", "king airway", "king LT", "LMA", "laryngeal mask airway", "supraglottic airway", "SGA", "blind insertion airway device", "BIAD", "combitube", "esophageal tracheal combitube", "place a supraglottic", "insert a supraglottic", "supraglottic device", "place a king", "insert a king", "place an LMA", "insert an LMA", "place a combitube", "rescue airway device", "place an igel", "insert an igel", "drop an igel", "throw in an igel", "place a LMA", "BLS airway"], dc: [6, 10], no_roll: false, dc_notes: "DC 6 normal airway. DC 10 difficult airway (trauma, limited mouth opening, blood, vomit, obesity). Failure: poor seal, air leak, inadequate ventilation. Complication: aspiration risk — narrate decreased SpO2 and gurgling.", scope: "BLS", notes: null },
  { id: "bvm", synonyms: ["bag the patient", "bag mask ventilation", "BVM", "bag valve mask", "assist ventilations", "ventilate", "positive pressure ventilation", "PPV", "assist breathing", "two hand technique", "bag em", "bagging", "I bag", "support respirations", "assist resps", "ventilatory support", "manual ventilation"], dc: [7], no_roll: false, dc_notes: "DC 7. Failure: poor mask seal, inadequate tidal volume — chest rise absent. Complication: gastric insufflation, vomiting and aspiration. Two-hand technique lowers effective DC by 2.", scope: "BLS", notes: null },
  { id: "suction", synonyms: ["suction the airway", "clear the airway", "suction the patient", "suction him", "suction her", "suction them", "let me suction", "need to suction", "go ahead and suction", "yankauer", "bulb suction", "tonsil tip", "suction catheter", "clear secretions", "suction the mouth", "suction the throat", "clear the mouth", "remove secretions", "airway clearance"], dc: [5], no_roll: false, dc_notes: "DC 5. Rarely fails. Failure: device malfunction, catheter too small for material. Complication: vagal response causing bradycardia, mucosal trauma.", scope: "BLS", notes: null },
  { id: "oxygen", synonyms: ["apply oxygen", "O2", "give oxygen", "supplemental oxygen", "non-rebreather", "NRB", "nasal cannula", "NC", "high flow O2", "blow by oxygen", "15 liters", "4 liters", "2 liters", "oxygen therapy", "start oxygen", "put them on O2", "face mask oxygen", "partial rebreather", "venturi mask", "high flow", "low flow oxygen", "oxygen via NRB", "put on a mask", "oxygen mask", "apply a mask"], dc: null, no_roll: true, dc_notes: "No dice roll. Oxygen application is a deterministic action. Log as a timed event only.", scope: "BLS", notes: null },
  { id: "cardiac_monitor", synonyms: ["put them on the monitor", "cardiac monitor", "apply leads", "three lead", "four lead", "4 lead", "4-lead", "4 lead ECG", "4-lead ECG", "4L ECG", "4L monitor", "4 lead monitor", "monitoring", "continuous monitoring", "attach monitor", "hook up the monitor", "get a rhythm", "check the rhythm", "monitor the patient", "apply electrodes", "place leads", "get them on the monitor", "ECG monitoring", "continuous ECG", "apply patches", "defib pads"], dc: null, no_roll: true, dc_notes: "No dice roll — deterministic. Equipment failure possible via complication engine only. Log as timed event.", scope: "BLS", notes: null },
  { id: "twelve_lead", synonyms: ["12 lead", "twelve lead", "ECG", "EKG", "12-lead ECG", "get a 12 lead", "run a 12 lead", "acquire 12 lead", "pull a 12 lead", "grab a 12 lead", "STEMI workup", "get an EKG", "run an EKG", "12 lead acquisition", "obtain ECG", "obtain 12 lead", "diagnostic ECG"], dc: [6], no_roll: false, dc_notes: "DC 6. Failure: poor lead contact, artifact, patient movement. Complication: leads misplaced producing misleading trace. Complication engine may introduce monitor failure during critical rhythm.", scope: "ALS", notes: null },
  { id: "vitals_manual", synonyms: ["manual vitals", "blood pressure", "BP", "manual BP", "auscultate BP", "palpate BP", "get a blood pressure", "check BP", "manual cuff", "aneroid", "check vitals", "full set of vitals", "baseline vitals", "manual set", "radial pulse", "carotid pulse", "check the pulse", "respiratory rate", "respirations", "count resps", "skin signs", "skin color", "skin temperature", "capillary refill", "manual pulse ox", "pulse check"], dc: null, no_roll: true, dc_notes: "No dice roll — deterministic. Log as timed event. Findings are determined by hidden patient card.", scope: "BLS", notes: null },
  { id: "vitals_monitor", synonyms: ["monitor vitals", "SpO2", "pulse ox", "sat probe", "oxygen saturation", "EtCO2", "capnography", "waveform capnography", "capnometry", "ETCO2", "end tidal", "end tidal CO2", "continuous vitals", "monitor sat", "apply pulse ox", "attach capnography", "inline capnography", "sidestream", "monitor glucose", "BGL", "blood glucose", "blood sugar", "glucometer", "finger stick", "check the glucose", "check the sugar", "glucose check", "accucheck", "accu-chek"], dc: null, no_roll: true, dc_notes: "No dice roll — deterministic. SpO2 probe may fail via complication engine. Findings determined by hidden patient card.", scope: "BLS", notes: null },
  { id: "needle_decompression", synonyms: ["needle D", "needle decompression", "decompress the chest", "chest decompression", "tension pneumo treatment", "14 gauge needle", "second intercostal space", "midclavicular line", "anterior axillary line", "fifth intercostal", "needle thoracostomy", "thoracic decompression", "decompress", "chest needle", "needle the chest", "release the tension", "decomp the chest"], dc: [9], no_roll: false, dc_notes: "DC 9. Failure: incorrect intercostal space, inadequate depth, no air rush. Complication: iatrogenic pneumothorax if no tension present, vascular injury. DC rises to 13 in obese patient.", scope: "ALS", notes: null },
  { id: "chest_seal", synonyms: ["chest seal", "occlusive dressing", "vented chest seal", "three sided dressing", "seal the wound", "treat the sucking chest wound", "flutter valve", "hyfin", "bolin", "asherman", "occlude the wound", "chest wound dressing", "seal chest wound"], dc: [6], no_roll: false, dc_notes: "DC 6. Failure: poor adhesion, seal not occlusive. Complication: seal converts open pneumo to tension — monitor closely after application.", scope: "BLS", notes: null },
  { id: "cardioversion", synonyms: ["cardiovert", "synchronized cardioversion", "sync cardioversion", "shock the patient", "electrical cardioversion", "DCCV", "sedate and cardiovert", "cardioversion", "synchronized shock", "attempt cardioversion", "electric shock for rhythm"], dc: [6,12], no_roll: false, dc_notes: "DC 6 equipment — pads apply and charge correctly. DC 12 clinical response — rhythm converts. Roll both separately. Failure of equipment: pad contact issue. Failure of response: rhythm does not convert, consider underlying cause.", scope: "ALS - requires auth in some regions", notes: null },
  { id: "defibrillation", synonyms: ["defibrillate", "unsynchronized shock", "shock", "deliver shock", "AED shock", "defib", "defibrillation", "shock the patient", "CPR shock", "VF shock", "clear and shock", "charge the defib", "deliver the charge", "200 joules", "360 joules", "biphasic shock", "monophasic", "analyze rhythm", "AED analyze", "shock advised"], dc: [5,11], no_roll: false, dc_notes: "DC 5 equipment delivery. DC 11 clinical response — return of organized rhythm. Roll both. Failure of response does not mean failure of procedure — continue CPR and retry. Complication: skin burns, accidental shock to crew if clear not called.", scope: "ALS", notes: null },
  { id: "pacing", synonyms: [
    // Device + procedure names
    "pacer", "pacing", "TCP", "transcutaneous pacing", "transcutaneous cardiac pacing",
    "external pacing", "electrical pacing", "external pacer",
    // Start / activate
    "pace the patient", "initiate pacing", "start pacing", "begin pacing",
    "activate the pacer", "turn on the pacer", "fire the pacer",
    "pacer on", "pacing on", "run the pacer", "get the pacer going",
    "pace him", "pace her", "pace them",
    // Setup
    "apply pacer pads", "place pacer pads", "attach pacer pads",
    // Rate / output adjustments (still a roll — new capture attempt)
    "set the rate", "set the output", "set the pacer",
    "increase the output", "increase output", "turn up the output", "bump the output",
    "set pacing rate", "adjust the pacer",
    // Capture confirmation (player is checking their work)
    "capture", "check for capture", "confirm capture", "looking for capture",
  ], dc: [8,13], no_roll: false, dc_notes: "DC 8 mechanical capture — pacing spike followed by QRS. DC 13 hemodynamic capture — BP improves with pacing. Both must succeed. Failure of mechanical capture: increase output. Failure of hemodynamic capture: underlying cause must be treated.", scope: "ALS - requires auth in some regions", notes: null },
  { id: "cpr", synonyms: [
    // Active orders — verb + CPR
    "start CPR", "begin CPR", "do CPR", "initiate CPR", "perform CPR",
    "starting CPR", "beginning CPR", "initiating CPR", "performing CPR",
    // Active orders — verb + compressions
    "begin compressions", "start compressions", "do compressions", "perform compressions",
    "initiate compressions", "chest compressions",
    // Physical action phrases
    "compress the chest", "pump the chest",
    "get on the chest", "get on his chest", "get on her chest",
    "jump on the chest", "jump on him", "jump on her",
    "hop on the chest", "hop on him", "hop on her",
    "hands on the chest",
    // Code slang
    "work the code", "run the code", "work em", "run em",
    // Rate / quality descriptors (player is ordering technique, not narrating)
    "two inch compressions", "push hard and fast", "100 per minute", "30 to 2",
    // Type
    "compression only CPR", "continuous compressions", "hands only CPR",
    "cardiopulmonary resuscitation",
    // Mechanical CPR
    "mechanical CPR",
    // Continuing / maintaining
    "continue CPR", "continue compressions", "continuing compressions",
    "maintain CPR", "maintain compressions", "maintaining compressions",
    "keep doing CPR", "keep up compressions", "keep the compressions going",
    "don't stop compressions", "don't stop CPR",
    // Resuming after pause
    "resume CPR", "resume compressions", "back on the chest", "back to compressions",
    "back to work", "get back on the chest",
    // Taking over from someone else
    "take over CPR", "take over compressions", "taking over CPR", "taking over compressions",
    "switch out", "switch out CPR", "switch out compressions", "I'll take over", "let me take over"
  ], dc: [6, 15], no_roll: false,
  dc_notes: "DC 12 on scene / stationary — fatiguing over time, quality degrades. DC 17 in a moving ambulance — provider cannot brace, compressions shallow and irregular. FAILURE: narrate poor depth, wrong rate, or provider fatigue. COMPLICATION: rib fracture, vomiting with aspiration risk, provider loses balance in moving unit. SUCCESS: good depth and rate confirmed by partner or ETCO2 rise. Always explain to the player why moving-ambulance CPR rolled a higher DC.", scope: "BLS", notes: null },
  { id: "medication_push", synonyms: [
    // Epinephrine (all forms)
    "push the epi", "give epi", "epinephrine", "1mg epinephrine", "epipen",
    "push dose epi", "push dose epinephrine", "epinephrine drip", "epi drip", "epi infusion",
    "bump of epi", "give a bump", "bump of epinephrine", "bump of pressors", "bump of push dose",
    "racemic epi", "racemic epinephrine", "epi 1:1000", "epi 1:10000",
    // Amiodarone
    "amiodarone", "give amiodarone", "amio", "300mg amiodarone", "cordarone",
    "amiodarone drip", "amio drip", "amiodarone infusion", "amio infusion", "amio maintenance",
    // Adenosine
    "adenosine", "6mg adenosine", "adenocard",
    // Atropine
    "atropine", "atropine sulfate", "0.5mg atropine",
    // Atropine + Pralidoxime (DuoDote)
    "duodote", "atropine pralidoxime", "auto-injector antidote",
    // Dopamine
    "dopamine", "dopamine drip", "dopamine infusion", "intropin", "intropin drip",
    // Norepinephrine
    "norepinephrine", "levophed", "norepi", "norepinephrine drip", "levophed drip", "norepi drip",
    "norepi infusion", "levophed infusion", "norepinephrine infusion",
    // Phenylephrine / Vasopressin / Dobutamine
    "phenylephrine", "phenylephrine drip", "phenylephrine infusion",
    "vasopressin", "pitressin", "vasopressin drip", "vasopressin infusion",
    "dobutamine", "dobutrex", "dobutamine drip", "dobutamine infusion",
    // Lidocaine
    "lidocaine", "xylocaine", "lido", "lidocaine drip", "lidocaine infusion", "lido drip",
    // Procainamide
    "procainamide", "procan", "procainamide drip", "procainamide infusion",
    // Propranolol
    "propranolol", "inderal",
    // Metoprolol
    "metoprolol", "lopressor",
    // Diltiazem
    "diltiazem", "cardizem", "diltiazem drip", "diltiazem infusion", "cardizem drip",
    // Magnesium
    "magnesium", "mag sulfate", "magnesium sulfate", "mag drip", "mag infusion", "magnesium infusion",
    // Sodium Bicarbonate
    "sodium bicarb", "sodium bicarbonate", "bicarb",
    // Calcium
    "calcium", "calcium chloride", "calcium gluconate", "cal gluconate",
    // Dextrose
    "dextrose", "D50", "D10", "D25", "D5W", "dextrose 50", "dextrose 25", "dextrose 10",
    // Naloxone
    "narcan", "naloxone", "intranasal narcan",
    // Flumazenil
    "flumazenil", "romazicon",
    // Nitroglycerin
    "nitroglycerin", "nitro", "SL nitro", "nitroglycerin paste", "nitro paste", "nitrobid",
    // Aspirin
    "aspirin", "324mg aspirin", "asa",
    // Heparin
    "heparin", "high dose heparin", "heparin drip", "heparin infusion",
    // Furosemide
    "lasix", "furosemide",
    // Morphine
    "morphine", "morphine sulfate", "ms contin",
    // Fentanyl
    "fentanyl", "fentanyl citrate", "sublimaze",
    // Ketamine
    "ketamine", "ketalar", "ketamine drip", "ketamine infusion",
    // Midazolam
    "versed", "midazolam", "versed drip", "midazolam drip", "midazolam infusion",
    // Lorazepam
    "ativan", "lorazepam", "benzo",
    // Diazepam
    "diazepam", "valium",
    // Etomidate
    "etomidate", "amidate",
    // Nalbuphine
    "nalbuphine", "nubain",
    // Ondansetron
    "ondansetron", "zofran",
    // Prochlorperazine
    "prochlorperazine", "compazine",
    // Albuterol / DuoNeb / Levalbuterol / Terbutaline
    "albuterol", "albuterol neb", "continuous albuterol", "salbutamol",
    "duoneb", "ipratropium", "atrovent",
    "neb treatment", "breathing treatment",
    "levalbuterol", "xopenex",
    "terbutaline", "brethine",
    // Methylprednisolone
    "methylprednisolone", "solu-medrol",
    // Glucagon
    "glucagon", "IM glucagon",
    // Oral Glucose
    "oral glucose",
    // Thiamine / Pyridoxine
    "thiamine", "thiamine b1", "pyridoxine", "vitamin b6",
    // Activated Charcoal
    "activated charcoal", "charcoal", "AC charcoal", "actidose", "charcoal slurry",
    "50g charcoal", "25g charcoal", "give charcoal", "administer charcoal",
    // Diphenhydramine
    "diphenhydramine", "benadryl",
    // Acetaminophen
    "acetaminophen", "tylenol", "apap",
    // Ibuprofen
    "ibuprofen", "motrin",
    // Hydroxocobalamin
    "hydroxocobalamin", "cyanokit",
    // Methylene Blue
    "methylene blue",
    // Amyl Nitrite
    "amyl nitrite",
    // Sodium Nitrite / Sodium Thiosulfate
    "sodium nitrite", "sodium thiosulfate",
    // Pralidoxime
    "pralidoxime", "2-pam",
    // Rocuronium / Succinylcholine / Vecuronium
    "rocuronium", "zemuron", "roc",
    "succinylcholine", "succs", "sux",
    "vecuronium", "norcuron", "vec",
    // Phenobarbital
    "phenobarbital",
    // Ziprasidone
    "ziprasidone", "geodon",
    // Nitrous Oxide
    "nitrous oxide", "nitronox", "n2o",
    // Oxytocin
    "oxytocin", "pitocin", "pitocin drip", "oxytocin infusion", "pitocin infusion",
    // Oxymetazoline
    "oxymetazoline", "afrin",
    // Proparacaine
    "proparacaine", "alcaine",
    // Methylene Blue (alias)
    // Labetalol
    "labetalol",
    // Furosemide already above
    // Hydrocobalamin already above
    // Acetaminophen already above
    // Broad-spectrum antibiotics
    "antibiotics", "ceftriaxone", "rocephin", "zosyn", "vancomycin", "metronidazole", "flagyl",
    // Tranexamic Acid
    "txa", "tranexamic acid", "tranexamic", "txa drip", "txa infusion", "tranexamic acid infusion",
    // Alteplase (tPA) / Tenecteplase (TNK) / Thrombolytics
    "alteplase", "tpa", "t-pa", "activase",
    "tenecteplase", "tnk", "tnkase",
    "thrombolytics", "thrombolytic", "lytics", "give lytics",
    "tissue plasminogen activator", "100mg tpa", "50mg tpa", "tpa in arrest",
    "alteplase for pe", "tpa for pe", "tnk for stemi"
  ], dc: [4], no_roll: false, dc_notes: "DC 4 for administration. Success on most rolls — medication administration is a practiced, routine skill. Clinical response varies by drug and is narrated based on expected pharmacology and the patient card. COMPLICATION (nat-1 only): scale severity strictly to the drug's real risk profile. Aspirin, zofran, ativan, morphine — minor and manageable (mild nausea, transient hypotension, local irritation). High-risk drugs only (adenosine, epi, thrombolytics, succinylcholine, RSI agents) — a nat-1 may produce a clinically significant adverse effect. Do NOT narrate rare side effects for routine safe medications. Extravasation only if IO access was not confirmed. AI evaluates clinical appropriateness of drug choice independently of dice result. ACTIVATED CHARCOAL: appropriate only within 2 hours of ingestion, patient must be conscious and cooperative with intact gag reflex, contraindicated in caustic ingestion, hydrocarbon ingestion, or absent airway protective reflexes — partner flags if any contraindication is present.", scope: "VARIABLE", notes: null },
  { id: "fluid_bolus", synonyms: ["normal saline", "NS bolus", "saline bolus", "fluid bolus", "run in a liter", "open the line", "wide open", "500ml bolus", "250ml bolus", "pressure bag", "lactated ringers", "LR bolus", "blood products", "packed red blood cells", "pRBC", "whole blood", "permissive hypotension", "restrict fluids", "run fluids", "hang a bag", "squeeze the bag", "rapid infuser", "level one", "pressure infuser"], dc: null, no_roll: true, dc_notes: "No dice roll — deterministic if IV/IO confirmed. Physiological response determined by patient card trajectory. Complication engine may introduce fluid overload in CHF or pulmonary edema worsening.", scope: "ALS", notes: null },
  { id: "splinting", synonyms: ["splint the fracture", "immobilize the fracture", "traction splint", "sager", "hare traction", "femur splint", "vacuum splint", "air splint", "SAM splint", "extremity immobilization", "buddy tape", "long bone splint", "splint the leg", "splint the arm", "splint the ankle", "splint the wrist"], dc: [6], no_roll: false, dc_notes: "DC 6. Failure: inadequate immobilization, traction splint not achieving traction. Complication: neurovascular compromise from improper application — check CSM before and after.", scope: "BLS", notes: null },
  { id: "bleeding_control", synonyms: ["tourniquet", "CAT tourniquet", "apply tourniquet", "control the bleeding", "direct pressure", "wound packing", "pack the wound", "hemostatic gauze", "quikclot", "celox", "combat gauze", "junctional tourniquet", "wound closure", "pressure dressing", "pressure bandage", "Israeli bandage", "emergency bandage"], dc: [7,12], no_roll: false, dc_notes: "DC 7 tourniquet application. DC 12 hemorrhage control achieved. Junctional hemorrhage DC 14 — difficult anatomy. Failure: tourniquet not tight enough, continued bleeding. Complication: tourniquet applied over joint, delayed time documentation.", scope: "BLS", notes: null },
  { id: "txa_topical", synonyms: ["topical TXA", "TXA spray", "spray TXA", "TXA gauze", "TXA-soaked gauze", "irrigate with TXA", "TXA wound spray", "tranexamic spray", "topical tranexamic acid", "pour TXA on", "apply TXA to the wound", "soak gauze in TXA"], dc: [6], no_roll: false, dc_notes: "DC 6 for wound preparation and application. Topical TXA is applied directly to a wound via soaked gauze or spray — it is NOT administered IV from this vial. Failure: inadequate wound exposure before application, TXA displaced by active hemorrhage before absorption. No systemic absorption concern at topical doses. Most effective in conjunction with wound packing for penetrating hemorrhage. Document application time.", scope: "BLS", notes: "Topical application only — use the vial from trauma bag. Not for IV push." },
  { id: "epistaxis_control", synonyms: ["afrin", "oxymetazoline", "neosynephrine nasal", "phenylephrine nasal", "nasal spray vasoconstrictors", "epistaxis control", "nasal packing", "anterior nasal packing", "posterior nasal packing", "bayonet forceps nasal", "rhino rocket", "rapid rhino", "nosebleed treatment", "pinch the nose", "pinch and lean forward", "direct pressure nose", "epistaxis treatment", "control the nosebleed", "nasal tampon"], dc: [7], no_roll: false, dc_notes: "DC 7 for controlled epistaxis. Afrin/oxymetazoline applied intranasally causes vasoconstriction and reduces bleeding within 2-3 minutes. Failure: inadequate pressure duration, posterior source (uncontrollable by anterior methods), coagulopathy. Posterior epistaxis requires ENT — pack and transport. Lean the patient forward to prevent blood aspiration. Do not tilt head back. Apply pressure for 10-15 minutes without peeking.", scope: "BLS", notes: "Afrin available from drug bag. Nasal packing materials may be limited prehospital — use gauze if Rhino Rocket not stocked." },
  { id: "glucometry", synonyms: ["check glucose", "finger stick", "blood glucose", "BGL", "blood sugar", "glucometer", "accucheck", "glucose check", "check the sugar", "point of care glucose", "POCT glucose"], dc: null, no_roll: true, dc_notes: "No dice roll — deterministic. Result determined by hidden patient card. Complication engine may introduce glucometer failure at a clinically inconvenient moment.", scope: "BLS - not available for BLS in urban california", notes: null },
  { id: "radio_contact", synonyms: ["call medical direction", "contact base", "radio MD", "call the hospital", "patch to the hospital", "medical direction contact", "base hospital contact", "radio report", "call in the patient", "give a report", "contact receiving", "notify receiving", "call ahead", "patch through", "get on the radio", "radio contact", "call dispatch", "contact dispatch", "update dispatch"], dc: null, no_roll: true, dc_notes: "No dice roll. Timed event — 30 seconds per contact. Radio quality may be poor in rural regions per regional profile. MD response quality determined by regional profile.", scope: "BLS", notes: null },
  { id: "reassessment", synonyms: ["reassess", "repeat vitals", "recheck", "follow up", "trending vitals", "repeat assessment", "check again", "how are they doing", "reassess the patient", "repeat BP", "repeat sat", "repeat GCS", "ongoing assessment", "serial assessment"], dc: null, no_roll: true, dc_notes: "No dice roll — deterministic. Timed event. Findings reflect patient card trajectory. Reassessment is how physiological changes are revealed to the user.", scope: "BLS", notes: null },
  { id: "packaging", synonyms: ["package the patient", "load and go", "scoop and run", "load em up", "get them to the truck", "move to the unit", "prepare for transport", "ready for transport", "backboard", "stair chair", "scoop stretcher", "move the patient", "extricate", "extrication", "get them out", "move to the ambulance"], dc: null, no_roll: true, dc_notes: "No dice roll — timed event. 2 minutes standard. Triggers transition to transport phase. Physiological clock continues during packaging.", scope: "BLS", notes: null },
  { id: "cricothyrotomy", synonyms: ["cric", "surgical cric", "surgical airway", "cricothyrotomy", "needle cric", "needle cricothyrotomy", "surgical cricothyrotomy", "front of neck access", "FONA", "emergency airway", "rescue airway", "cut the neck", "scalpel bougie tube", "percutaneous airway", "transtracheal", "14 gauge angiocath cric", "can't intubate can't oxygenate", "CICO rescue"], dc: [14], no_roll: false, dc_notes: "DC 14. Always high — last resort procedure under extreme pressure, rarely practiced. Failure: false passage, hemorrhage, inadequate airway. Complication: posterior tracheal wall perforation, subcutaneous emphysema. DC rises to 17 in chemically burned or distorted airway.", scope: "ALS - not available in all regions, requires auth in some regions", notes: null },
  { id: "finger_thoracostomy", synonyms: ["finger thoracostomy", "finger thorac", "blunt dissection", "thoracostomy", "open thoracostomy", "finger sweep", "open the chest", "blunt chest entry", "fourth intercostal space", "fifth intercostal space", "anterior axillary line thoracostomy", "bilateral thoracostomies", "release the tension", "decompress with finger", "blunt dissection thoracostomy", "crack the chest", "chest entry", "open decompression", "convert to finger thoracostomy", "thoracic entry"], dc: [12], no_roll: false, dc_notes: "DC 12. Harder than needle decompression — requires deliberate technique and courage. Failure: incorrect intercostal space, inadequate entry, failure to sweep. Complication: intercostal vessel injury, iatrogenic injury. Scope-limited procedure.", scope: "ALS - not available in all regions", notes: null },
  { id: "oropharyngeal_airway", synonyms: ["OPA", "oral airway", "guedel airway", "oropharyngeal airway", "insert an oral airway", "insert an OPA", "oral adjunct", "size the airway", "measure the airway", "place an OPA"], dc: [5], no_roll: false, dc_notes: "DC 5. Failure: wrong size causing obstruction, gag reflex causing vomiting. Size correctly — corner of mouth to earlobe. Do not use in conscious patient.", scope: "BLS", notes: null },
  { id: "nasopharyngeal_airway", synonyms: ["NPA", "nasal airway", "nasal adjunct", "nasopharyngeal airway", "trumpet airway", "nasal trumpet", "insert NPA", "place an NPA", "nasal adjunct airway"], dc: [5], no_roll: false, dc_notes: "DC 5. Failure: wrong size, epistaxis on insertion. Complication: intracranial placement if basilar skull fracture present — contraindicated in facial trauma.", scope: "BLS", notes: null },
  { id: "cpap", synonyms: ["CPAP", "continuous positive airway pressure", "non-invasive positive pressure", "NIPPV", "BiPAP", "CPAP mask", "apply CPAP", "CPAP therapy", "positive pressure mask", "PEEP valve", "high flow CPAP", "CPAP for pulmonary edema", "CPAP for COPD", "respiratory support"], dc: [7], no_roll: false, dc_notes: "DC 7. Failure: poor mask seal, patient intolerance, claustrophobia preventing compliance. Complication: gastric insufflation, pneumothorax in air-trapping conditions — reassess if deterioration after CPAP application.", scope: "BLS ", notes: null },
  { id: "manual_cpr_quality_check", synonyms: ["check compression depth", "check compression rate", "switch compressors", "rotate compressors", "check CPR quality", "minimize interruptions", "compression fraction", "two minute cycles", "check the CPR", "swap out", "take over compressions", "rotate off compressions"], dc: null, no_roll: true, dc_notes: "No dice roll — timed logging event. Documents compression quality assessment and crew rotation. Triggers two-minute cycle marker in scenario log.", scope: "BLS", notes: null },
  { id: "resuscitative_thoracotomy", synonyms: ["open the chest", "thoracotomy", "EDT", "emergency department thoracotomy", "resuscitative thoracotomy", "crack the chest open", "open cardiac massage", "internal cardiac massage", "clamp the aorta", "cross clamp", "aortic cross clamp"], dc: [15], no_roll: false, dc_notes: "DC 15. Physician-level procedure only. Extremely high DC — field conditions, limited equipment, high stress. Failure: inadequate incision, inability to locate cardiac structures. Complication: injury to thoracic vessels. Rarely indicated prehospital.", scope: "Physician ", notes: null },
  { id: "wound_packing_junctional", synonyms: ["junctional tourniquet", "XStat", "wound packing groin", "pelvic wound packing", "axillary packing", "junctional hemorrhage control", "neck packing", "zone one hemorrhage", "zone three hemorrhage"], dc: [11], no_roll: false, dc_notes: "DC 11. Difficult anatomy — groin, axilla, neck. Failure: inadequate packing depth, hemorrhage not controlled. Complication: displaced packing, pressure on adjacent neurovascular structures.", scope: "BLS", notes: null },
  { id: "physical_exam", synonyms: ["primary survey", "secondary survey", "head to toe", "rapid trauma assessment", "rapid medical assessment", "focused assessment", "DCAP-BTLS", "assess the patient", "look listen feel", "assess breath sounds", "auscultate the chest", "auscultate lung sounds", "equal air entry", "assess the abdomen", "palpate the abdomen", "assess the pelvis", "pelvic rock", "assess extremities", "pupils", "PERRL", "pupil check", "assess pupils", "check the pupils", "GCS assessment", "Glasgow coma scale", "neurological assessment", "stroke assessment", "Cincinnati stroke scale", "FAST exam", "BE-FAST", "assess for stroke", "grip strength", "facial droop", "speech assessment", "assess mental status", "AVPU", "alert and oriented", "orientation times four"], dc: null, no_roll: true, dc_notes: "No dice roll — deterministic. Findings determined by hidden patient card. Timed event — 3 minutes full head to toe. Findings are only revealed for components the user specifically requests.", scope: "BLS", notes: null },
  { id: "fetal_assessment", patient: "secondary", synonyms: ["fetal heart tones", "assess the fetus", "fetal heart rate", "doppler", "fetal assessment", "crowning", "check for crowning", "assess for delivery", "imminent delivery", "obstetric assessment", "fundal height", "contractions", "time contractions", "assess labor progress"], dc: null, no_roll: true, dc_notes: "No dice roll — deterministic. Findings determined by patient card. Fetal distress signs surface if decompensation clock is crossed.", scope: "BLS", notes: null },
  { id: "scene_safety", synonyms: ["scene safe", "is the scene safe", "size up the scene", "scene size up", "safe to enter", "hazard assessment", "BSI", "PPE", "gloves on", "body substance isolation", "standard precautions", "assess for hazards", "secure the scene", "is it safe"], dc: null, no_roll: true, dc_notes: "No dice roll — logged event only. Skipping scene safety means hazards manifest without warning per zero-guidance policy. Timed event marker in scenario log.", scope: "BLS", notes: null },
  { id: "blood_glucose_management", synonyms: ["treat the hypoglycemia", "correct the glucose", "give glucose", "oral glucose", "glucose gel", "dextrose", "D50 push", "D10 infusion", "sugar under the tongue", "instant glucose", "glucagon injection", "IM glucagon", "glucose correction", "treat the low sugar"], dc: [6], no_roll: false, dc_notes: "DC 6 for administration. Clinical response determined by patient card. Failure: patient cannot swallow safely, IV access not established for dextrose. Complication: rebound hypoglycemia in sulfonylurea overdose.", scope: "VARIABLE", notes: null },
  { id: "perimortem_csection", synonyms: [
    "perimortem c-section", "perimortem cesarean", "perimortem caesarean",
    "perimortem cesarean section", "postmortem c-section", "postmortem cesarean",
    "resuscitative hysterotomy", "emergency hysterotomy",
    "PMCS", "PMCD",
    "crash c-section", "field c-section", "emergency c-section",
    "surgical delivery", "deliver surgically",
    "cut the baby out", "open the uterus"
  ], dc: [15], no_roll: false,
  dc_notes: "DC 15. Perimortem or postmortem cesarean section. Must be performed within 4–5 minutes of maternal cardiac arrest for any chance of fetal viability. Failure: inadequate incision, delay to delivery, inability to locate structures in field conditions. COMPLICATION: catastrophic maternal hemorrhage, fetal injury, uterine injury. SUCCESS: viable neonate delivered — begin neonatal resuscitation immediately. Always narrate the extreme urgency of the time window and require medical direction prehospital.", scope: "Physician / Advanced Provider — requires medical direction prehospital", notes: null },

  { id: "precordial_thump", synonyms: [
    "precordial thump", "sternal thump", "chest thump",
    "thump the chest", "thump his chest", "thump her chest", "thump their chest",
    "give a precordial thump", "give him a thump", "give her a thump", "give them a thump",
    "precordial strike", "sternal strike", "precordial punch"
  ], dc: [15], no_roll: false,
  dc_notes: "DC 15. Controversial, rarely recommended in modern ACLS. Most effective within the first 30 seconds of witnessed arrest before a defibrillator is available. Risk: can worsen stable VT. FAILURE: no rhythm change, patient remains in arrest. SUCCESS: rhythm converts — narrate a palpable pulse and monitor change.",
  scope: "ALS", notes: "Rarely used in modern protocols. Document clearly." },

  { id: "emergency_delivery", synonyms: ["deliver the baby", "assist delivery", "obstetric delivery", "catch the baby", "deliver", "imminent delivery", "crowning delivery", "precipitous delivery", "deliver the infant", "manage the delivery", "obstetric emergency", "deliver on scene", "prepare for delivery", "OB kit", "delivery kit"], dc: [8,14], no_roll: false, dc_notes: "DC 8 normal vertex delivery. DC 14 complicated delivery — breech, shoulder dystocia, cord prolapse. Failure: describe complications emerging. Complication: perineal laceration, cord around neck, postpartum hemorrhage.", scope: "BLS", notes: null },
  { id: "shoulder_dystocia_maneuvers", synonyms: ["McRoberts maneuver", "suprapubic pressure", "shoulder dystocia", "Rubin maneuver", "Woods screw maneuver", "Gaskin maneuver", "all fours position", "dystocia maneuvers", "release the shoulder", "free the shoulder"], dc: [10], no_roll: false, dc_notes: "DC 10 McRoberts plus suprapubic pressure. DC 13 if requiring all fours or internal maneuvers. Failure: shoulders remain impacted, time clock running. Complication: brachial plexus injury, fetal hypoxia. Time-critical — brain injury begins at 4-5 minutes.", scope: "ALS", notes: null },
  { id: "cord_prolapse_management", synonyms: ["elevate the presenting part", "cord prolapse", "push the head up", "relieve cord compression", "prolapsed cord management", "Trendelenburg", "knee chest position", "cord management"], dc: [9], no_roll: false, dc_notes: "DC 9 manual elevation of presenting part. Failure: inadequate elevation, hand fatigue. Complication: cord compression resumes, fetal bradycardia. Hand must stay in place — this is a sustained procedure, not a one-time action.", scope: "BLS", notes: null },
  { id: "fundal_massage", synonyms: ["fundal massage", "uterine massage", "massage the uterus", "massage the fundus", "uterine fundal massage", "bimanual uterine compression", "bimanual compression", "massage the uterine fundus", "stimulate uterine contraction", "uterine atony management", "manage uterine atony", "atony massage", "postpartum uterine massage"], dc: null, no_roll: true, dc_notes: "No dice roll — deterministic. Effective if performed in postpartum hemorrhage with uterine atony. Uterus should firm to grapefruit consistency. Failure to respond after sustained massage indicates need for oxytocin or bimanual compression.", scope: "BLS", notes: "First-line intervention for postpartum hemorrhage from uterine atony. Firm circular massage over the fundus. Assess tone — soft and boggy means atony. Bimanual compression (one hand inside vagina, one on abdomen) if external massage fails. Do not confuse with suprapubic pressure used in shoulder dystocia." },
  { id: "newborn_resuscitation", patient: "secondary", synonyms: ["dry and stimulate", "warm the infant", "newborn resuscitation", "NRP", "neonatal resuscitation", "stimulate the newborn", "suction the newborn", "apgar score", "assess the newborn", "dry and warm", "newborn airway", "infant BVM", "pediatric BVM", "neonatal airway management"], dc: [7,12], no_roll: false, dc_notes: "DC 7 initial steps — dry, warm, stimulate, suction. DC 12 resuscitative steps — PPV, compressions, medications. Weight-based dosing critical. Preterm infant DC rises by 3 for all steps.", scope: "BLS", notes: null },
  { id: "spinal_motion_restriction", synonyms: ["SMR", "spinal motion restriction", "spinal precautions", "manual stabilization", "hold the head", "in-line stabilization", "neutral alignment", "maintain alignment", "spinal immobilization", "long spine board", "c-collar", "cervical collar", "extrication collar", "KED", "kendrick extrication device", "vacuum mattress", "rapid extrication", "maintain spinal precautions"], dc: [6], no_roll: false, dc_notes: "DC 6. Failure: inadequate immobilization, c-collar wrong size. Complication: airway compromise from collar in unconscious patient, worsening of injury during application. Reassess airway after collar application.", scope: "BLS", notes: null },
  { id: "pelvic_binder", synonyms: ["pelvic binder", "SAM pelvic sling", "T-POD", "pelvic stabilization", "bind the pelvis", "pelvic fracture management", "circumferential compression", "wrap the pelvis", "pelvic wrap"], dc: [7], no_roll: false, dc_notes: "DC 7. Failure: binder placed on iliac crests instead of greater trochanters — ineffective. Complication: excessive compression causing neurovascular compromise. One assessment of pelvis only — rocking to check stability is explicitly contraindicated.", scope: "BLS", notes: null },
  { id: "tourniquet_time", synonyms: ["note the tourniquet time", "mark the tourniquet", "write the time", "TK time", "document tourniquet", "tourniquet application time", "mark and time"], dc: null, no_roll: true, dc_notes: "No dice roll — documentation action. Logging event only. Failure to document time is flagged in debrief.", scope: "BLS", notes: null },
  { id: "decontamination", synonyms: ["decon", "decontaminate", "remove clothing", "brush and brush", "water decontamination", "hazmat decon", "remove the patient from exposure", "move to fresh air", "remove from environment", "irrigation", "eye irrigation", "skin irrigation", "flush the eyes", "copious irrigation"], dc: [7], no_roll: false, dc_notes: "DC 7. Failure: inadequate decontamination, wrong technique for agent. Complication: secondary contamination of crew, off-gassing in ambulance if decon incomplete. Agent identification improves DC by 2.", scope: "BLS", notes: null },
  { id: "active_rewarming", synonyms: ["rewarm the patient", "active rewarming", "warm blankets", "heat packs", "warming measures", "prevent heat loss", "passive rewarming", "remove wet clothing", "insulate the patient", "warm IV fluids", "heated humidified oxygen", "hypothermia management", "rewarm"], dc: [6], no_roll: false, dc_notes: "DC 6. Failure: inadequate warming, patient still losing heat to environment. Complication: afterdrop — core temperature continues falling briefly after rewarming begins. Aggressive rewarming causes cardiovascular collapse — passive and gentle external rewarming only in the field.", scope: "BLS", notes: null },
  { id: "active_cooling", synonyms: ["cool the patient", "active cooling", "ice packs", "cold packs", "cooling measures", "remove clothing", "cool the patient down", "evaporative cooling", "mist and fan", "axillary cooling", "groin cooling", "cold water immersion", "heat stroke cooling", "lower the temperature", "cooling protocol"], dc: [7], no_roll: false, dc_notes: "DC 7. Failure: inadequate cooling rate, equipment unavailable. Cold water immersion lowers effective DC to 4 — most effective method. Complication: shivering counteracting cooling efforts, overcooling.", scope: "BLS", notes: null },
  { id: "handoff_report", synonyms: ["give a report", "verbal report", "handoff", "SBAR", "MIST report", "ATMIST", "radio report", "patch report", "transfer of care report", "patient report", "give the ED a heads up", "notify the hospital", "call ahead report", "pre-arrival notification", "STEMI alert", "stroke alert", "trauma alert", "cath lab activation", "activate the cath lab", "call a STEMI", "notify trauma surgery"], dc: null, no_roll: true, dc_notes: "No dice roll — logged event. Quality of report is evaluated in debrief. Timed event. STEMI and stroke alerts generate separate logged timestamps.", scope: "BLS", notes: null },
  { id: "family_notification", synonyms: ["notify the family", "inform the family", "death notification", "talk to the family", "speak with family", "family update", "notify next of kin", "inform bystanders", "speak with bystanders"], dc: null, no_roll: true, dc_notes: "No dice roll — logged event. Quality and timing evaluated in debrief for DOA scenarios. Family response is determined by complication engine and caller behavior modifier.", scope: "BLS", notes: null },
  { id: "reboa", synonyms: ["REBOA", "resuscitative endovascular balloon occlusion", "balloon occlusion of the aorta", "aortic balloon", "zone one REBOA", "zone three REBOA", "endovascular hemorrhage control", "place the REBOA", "REBOA catheter", "aortic occlusion", "ER-REBOA", "Prytime REBOA", "resuscitative balloon", "aortic balloon occlusion", "junctional hemorrhage REBOA", "pelvic REBOA", "thoracic aorta occlusion", "inflate the balloon", "REBOA placement", "deploy the REBOA"], dc: [16], no_roll: false, dc_notes: "DC 16. Extremely high — rare prehospital procedure, specialized training required. Failure: incorrect zone placement, failure to advance catheter. Complication: vascular injury, limb ischemia from prolonged inflation, aortic rupture. Scope: flight medic and specialized ALS only.", scope: "BLS", notes: null },
  { id: "lucas", synonyms: ["LUCAS", "mechanical CPR device", "autopulse", "mechanical chest compressions", "compression device", "apply the LUCAS", "deploy the LUCAS", "attach the LUCAS", "mechanical compressor", "load the LUCAS", "LUCAS device placement", "AutoPulse placement", "mechanical CPR", "hands free CPR", "automated compressions", "compression assist device", "place the device", "switch to mechanical CPR", "apply mechanical CPR"], dc: [7], no_roll: false, dc_notes: "DC 7. Failure: incorrect sizing, poor seal, patient too large or small. Complication: device displacement during transport reducing compression quality. Marginal success: compressions running but depth or rate suboptimal.", scope: "BLS", notes: null },
  { id: "rsi", synonyms: ["RSI", "rapid sequence intubation", "rapid sequence induction", "push and pull", "drug assisted intubation", "DAI", "pharmacologically assisted intubation", "PAI", "sedate and intubate", "paralyze and intubate", "ketamine and succinylcholine", "ketamine and roc", "rocuronium", "succinylcholine", "sux", "anectine", "vecuronium", "paralytic", "neuromuscular blockade", "NMB", "etomidate", "ketamine induction", "propofol induction", "midazolam induction", "sedation for intubation", "defasciculating dose", "preoxygenate", "preoxygenation", "flush denitrogenate", "8 breaths preoxygenation", "apneic oxygenation", "nasal cannula during RSI", "high flow nasal cannula RSI", "THRIVE", "cricoid pressure", "sellick maneuver", "bimanual laryngoscopy", "BURP maneuver", "delayed sequence intubation", "DSI", "ketamine dissociation intubation"], dc: [8,10,16], no_roll: false, dc_notes: "Three sequential rolls. DC 8 medication administration — correct drug, dose, sequence. DC 10 intubation — normal airway. DC 16 intubation — difficult airway. Failure of medications: wrong sequence or dose causes paralysis without sedation — narrate agitation. Failure of intubation in paralyzed patient: patient is apneic, SpO2 drops immediately.", scope: "ALS - Not available in all regions", notes: null },
  { id: "manual_decompression_asthma", synonyms: ["manual decompression", "chest squeeze", "thoracic compression", "manual exhalation assist", "break the breath stack", "decompress the chest manually", "assist exhalation", "expiratory assist", "relieve auto-PEEP", "disconnect from BVM", "allow passive exhalation", "break the circuit", "take off the mask", "remove the BVM", "allow exhalation", "release the breath stack", "manual PEEP relief", "thoracic decompression asthma", "chest compression exhalation", "bilateral chest compression", "squeeze the chest", "manually decompress", "air trapping relief", "disconnect and compress", "BVM disconnect", "expiratory phase extension", "prolong exhalation", "auto-PEEP recognition", "intrinsic PEEP", "dynamic hyperinflation", "dynamic hyperinflation management", "tension physiology asthma", "permissive hypercapnia", "low rate ventilation", "slow ventilation rate", "reduce ventilation rate"], dc: [6], no_roll: false, dc_notes: "DC 6. Low DC — technique is simple, recognition is the challenge. Failure: premature BVM reconnection before complete exhalation. Complication: iatrogenic pneumothorax from excessive compression force — rare. Marginal: partial exhalation, incomplete auto-PEEP relief.", scope: "ALS", notes: null },
  { id: "pulse_check", synonyms: ["pulse check", "check for a pulse", "feel for a pulse", "check the carotid", "carotid pulse check", "check the femoral", "femoral pulse check", "check the radial", "radial pulse check", "do they have a pulse", "is there a pulse", "check for signs of circulation", "feel the neck", "check the brachial", "brachial pulse check", "two second pulse check", "brief pulse check", "organized rhythm with pulse", "confirm pulse", "verify pulse", "no pulse", "pulseless", "pulse check now", "pause for pulse check", "stop for pulse check", "pulse check at two minutes", "rhythm and pulse check"], dc: null, no_roll: true, dc_notes: "No dice roll — logged timing event. Two-second maximum for CPR pulse checks. Findings determined by patient card. Extended pulse check is flagged in debrief.", scope: "BLS", notes: null },
  { id: "rhythm_check", synonyms: ["rhythm check", "check the rhythm", "analyze the rhythm", "look at the monitor", "what does the monitor show", "check the ECG", "read the rhythm", "interpret the rhythm", "shockable or non-shockable", "is it shockable", "VF or VT", "check for VF", "organized rhythm", "disorganized rhythm", "analyze", "AED analyze", "stop and analyze", "pause compressions for rhythm check", "two minute cycle check", "check the leads", "is there a rhythm", "what rhythm are they in", "identify the rhythm", "call the rhythm", "name the rhythm", "PEA check", "asystole check", "flat line", "coarse VF", "fine VF", "rhythm interpretation"], dc: null, no_roll: true, dc_notes: "No dice roll — logged event. Rhythm determined by patient card. Triggers shockable/non-shockable decision point. Timed interruption to CPR.", scope: "ALS", notes: null },
  { id: "capnography_confirmation", synonyms: ["confirm tube placement", "waveform confirmation", "check the capnography", "waveform capnography", "EtCO2 confirmation", "end tidal confirmation", "confirm with capnography", "colorimetric confirmation", "check the waveform", "do I have waveform", "confirm the tube", "tube confirmation", "is the tube in", "verify tube placement", "check tube position", "confirm endotracheal placement", "bilateral breath sounds", "auscultate for placement", "auscultate the epigastrium", "no epigastric sounds", "equal bilateral", "confirm bilateral entry", "chest rise confirmation", "visualize chest rise", "colorimetric CO2", "easy cap", "color change confirmation", "waveform present", "waveform absent", "flat waveform", "good waveform", "EtCO2 reading", "35 to 45", "confirm and secure", "secure the tube", "note the depth", "depth at the lip", "cm at teeth", "centimeters at the lip", "mark the tube", "tape the tube", "secure with tape", "thomas tube holder"], dc: null, no_roll: true, dc_notes: "No dice roll — deterministic result from intubation roll. If intubation result was COMPLICATION (esophageal placement), waveform is flat regardless of user confidence. Non-negotiable. Logged as separate timed event.", scope: "BLS", notes: "absence of waveform after intubation attempt  triggers esophageal intubation consequence  regardless of user confidence in placement.  This is non-negotiable and the AI narrates  the consequence through clinical findings only —  falling SpO2, gastric sounds, no chest rise.  Never labels it as esophageal intubation explicitly" },
  { id: "valsalva_maneuver", synonyms: [
    // Standard phrases
    "valsalva", "valsalva maneuver", "vagal maneuver", "vagal stimulation",
    "increase vagal tone", "try vagal first", "valsalva for SVT", "vagal for SVT",
    "non-pharmacological SVT management", "conservative SVT management",
    // Patient instructions
    "bear down", "have them bear down", "ask them to strain", "instruct patient to strain",
    "strain", "straining maneuver", "strain against a closed glottis",
    // Syringe / blow technique (modified)
    "blow through a straw", "blow into a syringe", "blow into syringe",
    "10ml syringe valsalva", "syringe strain technique",
    // Action phrases
    "valsalva attempt", "perform valsalva", "try valsalva", "coach valsalva",
    "valsalva technique", "perform modified valsalva",
    // Modified / REVERT technique
    "modified valsalva", "modified valsalva technique", "modified vagal maneuver",
    "REVERT maneuver", "REVERT trial", "REVERT protocol", "try the REVERT",
    "supine valsalva", "leg raise valsalva", "valsalva with leg raise",
    "postural modification valsalva", "passive leg raise valsalva",
    "strain then supine", "strain and lay flat", "semi recumbent strain",
    "45 degree strain", "evidence based valsalva", "current standard valsalva",
    "standardized valsalva", "enhanced valsalva", "modified valsalva protocol"
  ], dc: [6], no_roll: false,
  dc_notes: "DC 6. Reflects modified (REVERT) technique — blow hard into a 10ml syringe at 45 degrees, then immediately supine with passive leg raise. Higher conversion rate than strain-only valsalva. FAILURE: inadequate effort or non-cooperative patient. No complication tier — no adverse outcomes in appropriate conscious patient.",
  scope: "ALS", notes: null },
  { id: "carotid_massage", synonyms: ["carotid massage", "carotid sinus massage", "carotid stimulation", "massage the carotid", "vagal maneuver carotid", "carotid sinus stimulation", "apply carotid pressure", "carotid technique", "one sided carotid", "unilateral carotid massage", "right carotid massage", "left carotid massage", "carotid for SVT", "vagal via carotid", "carotid pressure", "gentle carotid pressure", "carotid sinus pressure", "carotid reflex"], dc: [10], no_roll: false, dc_notes: "DC 10. Contraindicated bilaterally — partner flags immediately if bilateral attempted regardless of confrontation level. Contraindicated in known carotid disease, bruit, recent stroke, elderly. Complication: carotid plaque dislodgement causing acute stroke symptoms.", scope: "ALS", notes: null },
  { id: "cath_lab_activation", synonyms: ["activate the cath lab", "cath lab activation", "STEMI alert", "call a STEMI", "STEMI notification", "activate STEMI protocol", "STEMI team activation", "call the cath lab", "notify the cath lab", "cardiac catheterization activation", "PCI activation", "activate PCI", "primary PCI notification", "STEMI alert to hospital", "notify cardiology", "page cardiology", "cardiac alert", "heart alert", "code STEMI", "activate cardiac team", "notify receiving of STEMI", "STEMI pre-alert", "12 lead transmission", "transmit the 12 lead", "send the ECG", "transmit ECG to hospital", "wireless transmission", "electronic transmission", "door to balloon notification", "D2B alert", "bypass the ED", "cath lab bypass", "direct to cath lab", "skip the ED", "straight to cath", "direct cath activation", "field activation", "prehospital STEMI activation", "field STEMI call", "paramedic STEMI activation"], dc: null, no_roll: true, dc_notes: "No dice roll — logged timestamp event. Critical for STEMI debrief — time from 12-lead acquisition to activation is measured against AHA targets. Premature activation without confirmed 12-lead is flagged. Transport to non-PCI facility with STEMI is flagged as protocol deviation.", scope: "ALS — requires confirmed STEMI on 12-lead. Not applicable to BLS providers independently though BLS can relay information to receiving hospital.", notes: null },
  { id: "abdominal_thrusts", synonyms: ["abdominal thrusts", "heimlich", "heimlich maneuver", "heimlich manuever", "heimlich manoeuvre", "heimlick", "heimlick maneuver", "hiemlich", "hiemlich maneuver", "hemlich", "hemlich maneuver", "himlich", "himlich maneuver", "helmich", "heamlich", "heimlitch", "hiemlick", "do the heimlich", "perform heimlich", "try the heimlich", "give abdominal thrusts", "perform abdominal thrusts", "abdominal compression", "subdiaphragmatic thrusts", "subdiaphragmatic abdominal thrusts", "manual abdominal thrust", "upward abdominal thrust", "inward and upward thrust", "bear hug from behind", "standing heimlich", "standing abdominal thrusts", "thrust on the abdomen", "abdominal thrust maneuver", "clear the airway obstruction", "dislodge the obstruction", "dislodge the foreign body", "clear the choking", "choking maneuver", "anti-choking maneuver", "fbao maneuver", "foreign body airway obstruction maneuver", "give thrusts", "five abdominal thrusts", "cycle of thrusts", "thrusts and back blows"], dc: [8], no_roll: false, dc_notes: "DC 8 for conscious adult with complete FBAO. Success clears obstruction and patient can speak/breathe. Failure: obstruction not dislodged — cycle back blows and thrusts. Complication: rib fracture, liver laceration, aortic injury — rare but narrate in debrief if repeated forceful thrusts. Unconscious patient: procedure transitions to CPR with foreign body look before each ventilation attempt. Pediatric: abdominal thrusts contraindicated under age 1 — use 5 back blows and 5 chest thrusts alternating. Infant technique failure is flagged in debrief.", scope: "BLS", notes: "If patient becomes unconscious during procedure, AI transitions to CPR protocol with look-in-the-mouth before each ventilation. Infant patients trigger a debrief flag if abdominal thrusts were attempted rather than back blow/chest thrust sequence." },
];

module.exports = { INTERVENTIONS };
