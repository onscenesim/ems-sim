'use strict';

// Shared exact medication aliases for engine detection and reference cards.
// Keep formulations separate; these keys select references, never doses.
const MEDICATION_ALIASES = {
  "Normal Saline (0.9%)": ["normal saline", "normal salin", "normal salene", "NS bolus", "saline bolus", "0.9% saline", "0.9 saline", "0.9% sodium chloride", "sodium chloride 0.9%", "0.9% NaCl", "isotonic saline", "saline", "NS"],
  "Hypertonic Saline (3%)": ["3% hypertonic saline", "3% saline", "3 percent saline", "three percent saline", "hypertonic saline", "hypertonic salin", "hypertonic", "HTS", "3% sodium chloride", "sodium chloride 3%", "3% NaCl"],
  "Dextrose 5% in Water (D5W)": ["D5W", "D5 W", "D5 water", "dextrose 5% in water", "5% dextrose in water", "5 percent dextrose in water", "5% dextrose", "dextrose 5%", "D5"],
  "Plasma-Lyte": ["plasmalyte", "plasma-lyte", "plasma lyte", "plasmalyte A", "plasma-lyte A", "plasma lyte 148", "plasmalyte 148", "plasmalyght", "plasmalyte bolus"],
  "Lactated Ringer’s / Hartmann’s": ["lactated ringers", "lactated ringer's", "lactated ringer’s", "lactated ringer", "lactated ringers solution", "lactated ringers/hartmans solution", "lactated ringers hartmans solution", "lactated ringer's solution", "lactated ringer solution", "lactated ringers bolus", "ringer lactate", "ringers lactate", "ringer's lactate", "ringer’s lactate", "LR", "LR bolus", "hartmanns", "hartmann's", "hartmann’s", "hartmans", "hartman's", "hartman’s", "hartmann solution", "hartmans solution", "lactated ringors"],
  "IV Fluids (specify solution)": ["IV fluids", "intravenous fluids", "IV fluid", "fluid bolus", "fluids bolus", "crystalloid bolus", "crystalloid", "crystalloids", "run fluids", "give fluids", "administer fluids", "infuse fluids", "bolus fluids", "start fluids", "hang fluids", "hang a bag", "hang a fluid bag", "run in a liter", "run in a litre", "500ml bolus", "250ml bolus"],
  "Whole Blood": ["whole blood", "wholeblood", "whole blud", "low titer O whole blood", "low titre O whole blood", "low titer group O whole blood", "low-titer group O whole blood", "low-titre group O whole blood", "LTOWB", "fresh whole blood", "O negative whole blood", "O positive whole blood", "O neg whole blood", "O pos whole blood"],
  "Packed Red Blood Cells": ["packed red blood cells", "packed red cells", "packed RBCs", "packed RBC", "pack red blood cells", "packed red blood cell", "red blood cells", "red cells", "red cell concentrate", "red blood cell concentrate", "PRBC", "PRBCs", "pRBC", "pRBCs", "RBCs", "RBC transfusion", "PRBC transfusion", "O negative packed cells", "O neg packed cells", "O negative blood", "O neg blood", "O positive blood", "O pos blood", "leukoreduced red cells", "leucoreduced red cells"],
  "Fresh Frozen Plasma": ["fresh frozen plasma", "fresh-frozen plasma", "fresh frozen plazma", "FFP", "thawed plasma", "frozen plasma", "fresh plasma", "thawed FFP"],
  "Plasma (specify product)": ["plasma transfusion", "liquid plasma", "freeze dried plasma", "freeze-dried plasma", "lyophilized plasma", "plasma", "plazma"],
  "Platelets": ["platelets", "platelet", "platlets", "plateletes", "platelet concentrate", "pooled platelets", "apheresis platelets", "single donor platelets", "platelet transfusion", "PLTs", "PLT"],
  "Cryoprecipitate": ["cryoprecipitate", "cryoprecip", "cryoprecipitat", "cryo precipitate", "cryo", "pooled cryo", "cryoprecipitated antihemophilic factor"],
  "Albumin": ["albumin", "human albumin", "albumen", "5% albumin", "25% albumin", "albumin 5%", "albumin 25%", "albuminar", "albutein"],
  "Prothrombin Complex Concentrate": ["prothrombin complex concentrate", "prothrombin complex", "4 factor PCC", "four factor PCC", "4-factor PCC", "4F-PCC", "4FPCC", "PCC", "Kcentra", "Beriplex", "Octaplex"],
  "Fibrinogen Concentrate": ["fibrinogen concentrate", "fibrinogen", "RiaSTAP", "Fibryga", "Haemocomplettan"],
  "Granulocytes": ["granulocyte transfusion", "granulocytes", "granulocyte concentrate", "white blood cell transfusion", "white cell transfusion"],
  "Blood Products (specify component)": ["blood", "unit of blood", "units of blood", "blood transfusion", "blood products", "blood product", "transfuse blood", "give blood", "administer blood", "hang blood", "infuse blood", "blood components", "blood component"],

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

const FLUID_MEDICATIONS = new Set(["Normal Saline (0.9%)", "Hypertonic Saline (3%)", "Dextrose 5% in Water (D5W)", "Plasma-Lyte", "Lactated Ringer’s / Hartmann’s", "IV Fluids (specify solution)", "Whole Blood", "Packed Red Blood Cells", "Fresh Frozen Plasma", "Plasma (specify product)", "Platelets", "Cryoprecipitate", "Albumin", "Prothrombin Complex Concentrate", "Fibrinogen Concentrate", "Granulocytes", "Blood Products (specify component)"]);
const BLOOD_PRODUCT_MEDICATIONS = new Set(["Whole Blood", "Packed Red Blood Cells", "Fresh Frozen Plasma", "Plasma (specify product)", "Platelets", "Cryoprecipitate", "Albumin", "Prothrombin Complex Concentrate", "Fibrinogen Concentrate", "Granulocytes", "Blood Products (specify component)"]);

if (typeof module !== 'undefined') module.exports = { MEDICATION_ALIASES, FLUID_MEDICATIONS, BLOOD_PRODUCT_MEDICATIONS };
