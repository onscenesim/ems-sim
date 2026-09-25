'use strict';

// Shared exact medication aliases for engine detection and reference cards.
// Keep formulations separate; these keys select references, never doses.
const MEDICATION_ALIASES = {
  "Epinephrine": [
    "push the epi",
    "give epi",
    "epinephrine",
    "1mg epinephrine",
    "epipen",
    "push dose epi",
    "push dose epinephrine",
    "epinephrine drip",
    "epi drip",
    "epi infusion",
    "bump of epi",
    "give a bump",
    "bump of epinephrine",
    "bump of pressors",
    "bump of push dose",
    "racemic epi",
    "racemic epinephrine",
    "epi 1:1000",
    "epi 1:10000",
    "epi"
  ],
  "Amiodarone": [
    "amiodarone",
    "give amiodarone",
    "amio",
    "300mg amiodarone",
    "cordarone",
    "amiodarone drip",
    "amio drip",
    "amiodarone infusion",
    "amio infusion",
    "amio maintenance"
  ],
  "Adenosine": [
    "adenosine",
    "6mg adenosine",
    "adenocard",
    "adesonine"
  ],
  "Atropine Sulfate": [
    "atropine",
    "atropine sulfate",
    "0.5mg atropine",
    "atropine auto-injector"
  ],
  "Atropine + Pralidoxime (DuoDote)": [
    "duodote",
    "atropine pralidoxime",
    "auto-injector antidote"
  ],
  "Pralidoxime (2-PAM)": [
    "2pam",
    "pralidoxime",
    "2-pam",
    "pralidoxime auto-injector",
    "pralidoxime",
    "2-pam"
  ],
  "Dopamine": [
    "dopamine",
    "dopamine drip",
    "dopamine infusion",
    "intropin",
    "intropin drip"
  ],
  "Norepinephrine (Levophed)": [
    "norepinephrine",
    "levophed",
    "norepi",
    "norepinephrine drip",
    "levophed drip",
    "norepi drip",
    "norepi infusion",
    "levophed infusion",
    "norepinephrine infusion"
  ],
  "Phenylephrine": [
    "phenylephrine",
    "phenylephrine drip",
    "phenylephrine infusion"
  ],
  "Vasopressin": [
    "vasopressin",
    "pitressin",
    "vasopressin drip",
    "vasopressin infusion"
  ],
  "Dobutamine": [
    "dobutamine",
    "dobutrex",
    "dobutamine drip",
    "dobutamine infusion"
  ],
  "Lidocaine": [
    "lidocaine",
    "xylocaine",
    "lido",
    "lidocaine drip",
    "lidocaine infusion",
    "lido drip"
  ],
  "Procainamide": [
    "procainamide",
    "procan",
    "procainamide drip",
    "procainamide infusion"
  ],
  "Propranolol": [
    "propranolol",
    "inderal"
  ],
  "Metoprolol": [
    "metoprolol",
    "lopressor"
  ],
  "Diltiazem": [
    "diltiazem",
    "cardizem",
    "diltiazem drip",
    "diltiazem infusion",
    "cardizem drip"
  ],
  "Magnesium Sulfate": [
    "magnesium",
    "mag sulfate",
    "magnesium sulfate",
    "mag drip",
    "mag infusion",
    "magnesium infusion"
  ],
  "Sodium Bicarbonate": [
    "sodium bicarb",
    "sodium bicarbonate",
    "bicarb"
  ],
  "Calcium (specify formulation)": [
    "calcium"
  ],
  "Calcium Chloride": [
    "calcium chloride"
  ],
  "Calcium Gluconate": [
    "calcium gluconate",
    "cal gluconate"
  ],
  "Dextrose": [
    "dextrose",
    "D50",
    "D10",
    "D25",
    "D5W",
    "dextrose 50",
    "dextrose 25",
    "dextrose 10"
  ],
  "Naloxone": [
    "narcan",
    "naloxone",
    "intranasal narcan"
  ],
  "Flumazenil": [
    "flumazenil",
    "romazicon"
  ],
  "Nitroglycerin": [
    "nitroglycerin",
    "nitro",
    "SL nitro"
  ],
  "Nitroglycerin Paste": [
    "nitroglycerin paste",
    "nitro paste",
    "nitrobid"
  ],
  "Aspirin": [
    "aspirin",
    "324mg aspirin",
    "asa"
  ],
  "Heparin (High Dose)": [
    "heparin",
    "high dose heparin",
    "heparin drip",
    "heparin infusion"
  ],
  "Furosemide": [
    "lasix",
    "furosemide"
  ],
  "Morphine Sulfate": [
    "morphine",
    "morphine sulfate",
    "ms contin",
    "mso4"
  ],
  "Fentanyl Citrate": [
    "fentanyl",
    "fentanyl citrate",
    "sublimaze"
  ],
  "Ketamine": [
    "ketamine",
    "ketalar",
    "ketamine drip",
    "ketamine infusion"
  ],
  "Haloperidol": [
    "haldol",
    "haloperidol"
  ],
  "B52": [
    "b52",
    "b-52",
    "b 52",
    "b52 cocktail",
    "b-52 cocktail"
  ],
  "Midazolam": [
    "versed",
    "midazolam",
    "versed drip",
    "midazolam drip",
    "midazolam infusion"
  ],
  "Lorazepam": [
    "ativan",
    "lorazepam",
    "benzo"
  ],
  "Diazepam": [
    "diazepam",
    "valium"
  ],
  "Etomidate": [
    "etomidate",
    "amidate"
  ],
  "Nalbuphine": [
    "nalbuphine",
    "nubain"
  ],
  "Ondansetron": [
    "ondansetron",
    "zofran"
  ],
  "Prochlorperazine": [
    "prochlorperazine",
    "compazine"
  ],
  "Albuterol / DuoNeb": [
    "albuterol",
    "albuterol neb",
    "continuous albuterol",
    "salbutamol",
    "duoneb",
    "ipratropium",
    "atrovent",
    "neb treatment",
    "breathing treatment"
  ],
  "Levalbuterol": [
    "levalbuterol",
    "xopenex"
  ],
  "Terbutaline Sulfate": [
    "terbutaline",
    "brethine"
  ],
  "Methylprednisolone": [
    "methylprednisolone",
    "solu-medrol"
  ],
  "Glucagon": [
    "glucagon",
    "IM glucagon"
  ],
  "Oral Glucose": [
    "oral glucose"
  ],
  "Thiamine (B1)": [
    "thiamine",
    "thiamine b1"
  ],
  "Pyridoxine (B6)": [
    "pyridoxine",
    "vitamin b6"
  ],
  "Activated Charcoal": [
    "activated charcoal",
    "charcoal",
    "AC charcoal",
    "actidose",
    "charcoal slurry",
    "50g charcoal",
    "25g charcoal",
    "give charcoal",
    "administer charcoal"
  ],
  "Diphenhydramine": [
    "diphenhydramine",
    "benadryl"
  ],
  "Acetaminophen": [
    "acetaminophen",
    "tylenol",
    "apap"
  ],
  "Ibuprofen": [
    "ibuprofen",
    "motrin"
  ],
  "Hydroxocobalamin": [
    "hydroxocobalamin",
    "cyanokit"
  ],
  "Methylene Blue": [
    "methylene blue"
  ],
  "Amyl Nitrite": [
    "amyl nitrite"
  ],
  "Sodium Nitrite": [
    "sodium nitrite"
  ],
  "Sodium Thiosulfate": [
    "sodium thiosulfate"
  ],
  "Rocuronium": [
    "rocuronium",
    "zemuron",
    "roc"
  ],
  "Succinylcholine": [
    "succinylcholine",
    "succs",
    "sux",
    "anectine"
  ],
  "Vecuronium": [
    "vecuronium",
    "norcuron",
    "vec"
  ],
  "Propofol": [
    "propofol",
    "diprivan"
  ],
  "Phenobarbital": [
    "phenobarbital"
  ],
  "Ziprasidone": [
    "ziprasidone",
    "geodon"
  ],
  "Nitrous Oxide": [
    "nitrous oxide",
    "nitronox",
    "n2o"
  ],
  "Oxytocin": [
    "oxytocin",
    "pitocin",
    "pitocin drip",
    "oxytocin infusion",
    "pitocin infusion"
  ],
  "Oxymetazoline": [
    "oxymetazoline",
    "afrin"
  ],
  "Proparacaine": [
    "proparacaine",
    "alcaine"
  ],
  "Labetalol": [
    "labetalol"
  ],
  "Antibiotics (specify agent)": [
    "antibiotics"
  ],
  "Ceftriaxone": [
    "ceftriaxone",
    "rocephin"
  ],
  "Piperacillin / Tazobactam": [
    "zosyn"
  ],
  "Vancomycin": [
    "vancomycin"
  ],
  "Metronidazole": [
    "metronidazole",
    "flagyl"
  ],
  "Tranexamic Acid (TXA)": [
    "txa",
    "tranexamic acid",
    "tranexamic",
    "txa drip",
    "txa infusion",
    "tranexamic acid infusion"
  ],
  "Alteplase (tPA)": [
    "alteplase",
    "tpa",
    "t-pa",
    "activase",
    "tissue plasminogen activator",
    "100mg tpa",
    "50mg tpa",
    "tpa in arrest",
    "alteplase for pe",
    "tpa for pe"
  ],
  "Tenecteplase (TNK)": [
    "tenecteplase",
    "tnk",
    "tnkase",
    "tnk for stemi"
  ],
  "Thrombolytics (specify agent)": [
    "thrombolytics",
    "thrombolytic",
    "lytics",
    "give lytics"
  ]
};

if (typeof module !== 'undefined') module.exports = { MEDICATION_ALIASES };
