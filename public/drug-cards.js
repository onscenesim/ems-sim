'use strict';

/**
 * EMS Medication Reference — drug-cards.js
 * Triggered when a medication_push dice roll fires.
 * Doses sourced from: ALS Pre-Hospital Pharmacology Reference Guide (on-file),
 * ACLS 2020, RAMPART trial, and NAEMSP guidelines.
 * ALWAYS follow your local protocol.
 *
 * PEDS doses are noted in the `notes` field, prefixed with PEDS:.
 * "Not routinely indicated" = not commonly used in this population pre-hospital.
 */

const DRUG_CARDS = [

  // ═══════════════════════════════════════════════════════════
  // CARDIAC / ANTIARRHYTHMIC
  // ═══════════════════════════════════════════════════════════

  {
    name: 'Epinephrine',
    drugClass: 'cardiac',
    synonyms: [
      'epinephrine', '1mg epinephrine', 'give epi', 'push the epi', 'epipen',
      'push dose epi', 'push dose epinephrine', 'epinephrine drip',
      'epi drip', 'epi infusion', 'racemic epi', 'racemic epinephrine',
      'epi 1:1000', 'epi 1:10000',
    ],
    doses: [
      {
        indication: 'Cardiac Arrest (VF / pVT / PEA / Asystole)',
        dose: '1 mg IV/IO q3–5 min',
        route: 'IV/IO push',
        notes: 'Use 1:10,000 (0.1 mg/mL) prefilled syringe.\nPEDS: 0.01 mg/kg (0.1 mL/kg of 1:10,000) IV/IO q3–5 min.',
      },
      {
        indication: 'Anaphylaxis / Severe Allergic Reaction',
        dose: '0.3–0.5 mg IM q5–15 min',
        route: 'IM — lateral thigh',
        notes: 'Use 1:1,000 (1 mg/mL). EpiPen delivers 0.3 mg. Do NOT give 1:1,000 IV.\nPEDS: 0.01 mg/kg IM (Max 0.3 mg). EpiPen Jr 0.15 mg for 15–30 kg.',
      },
      {
        indication: 'Push-Dose Epi — peri-intubation / post-ROSC hypotension',
        dose: '5–20 mcg IV q2–5 min',
        route: 'IV slow push',
        notes: 'METHOD A: 1 mL of 1:10,000 + 9 mL NS → 10 mcg/mL · Give 0.5–2 mL per push.\nMETHOD B: 0.1 mL of 1:1,000 + 9.9 mL NS → 10 mcg/mL · Give 0.5–2 mL per push.\nPEDS: Not typically used — use full weight-based epi dosing.',
      },
      {
        indication: 'Epi Infusion — refractory shock / post-ROSC',
        dose: 'Adult: 2–10 mcg/min IV drip',
        route: 'IV infusion',
        notes: 'Mix: 1 mg in 250 mL NS → 4 mcg/mL. Titrate to MAP >65.\nPEDS: 0.1–1 mcg/kg/min IV infusion.',
      },
      {
        indication: 'Racemic Epi — croup / upper airway edema',
        dose: '0.5 mL of 2.25% in 3 mL NS',
        route: 'Nebulized',
        notes: 'Rebound edema possible — observe ≥2h. Monitor closely.\nPEDS: Same dose. Alternatively: 5 mL of 1:1,000 standard epi nebulized.',
      },
      {
        indication: 'Severe Asthma (neb albuterol inadequate)',
        dose: '0.3–0.5 mg IM',
        route: 'IM — lateral thigh',
        notes: 'Use 1:1,000 (1 mg/mL). Reserve for impending respiratory failure.\nPEDS: 0.01 mg/kg IM (Max 0.3 mg).',
      },
    ],
    packaging: '1 mg/mL (1:1,000) amp — IM/racemic\n0.1 mg/mL (1:10,000) prefilled — cardiac arrest\nRacemic: 2.25% solution',
  },

  {
    name: 'Amiodarone',
    drugClass: 'cardiac',
    synonyms: ['amiodarone', 'amio', 'give amiodarone', '300mg amiodarone', 'cordarone'],
    doses: [
      {
        indication: 'Cardiac Arrest (VF/pVT)',
        dose: '300 mg IV/IO push · 2nd dose 150 mg',
        route: 'IV/IO bolus',
        notes: 'Follow with 1 mg/min drip × 6h post-ROSC.\nPEDS: 5 mg/kg IV/IO (Max 300 mg). May repeat up to 15 mg/kg total.',
      },
      {
        indication: 'Stable VT (with pulse)',
        dose: '150 mg over 10 min (15 mg/min)',
        route: 'IV drip',
        notes: 'Maintenance: 1 mg/min × 6h, then 0.5 mg/min.\nPEDS: Specialist guidance — rarely used pre-hospital.',
      },
    ],
    packaging: '50 mg/mL — 3 mL (150 mg) vials; draw 6 mL for 300 mg arrest dose',
  },

  {
    name: 'Adenosine',
    drugClass: 'cardiac',
    synonyms: ['adenosine', '6mg adenosine', 'adenocard'],
    doses: [
      {
        indication: 'SVT (narrow complex, regular)',
        dose: '6 mg rapid IVP — 2nd dose 12 mg — 3rd dose 12 mg (per protocol)',
        route: 'IV — antecubital or above (t½ ~10 sec)',
        notes: 'CRITICAL: push followed INSTANTLY by 20 mL NS rapid flush simultaneously. Use antecubital or more proximal site. NOT effective for A-fib/flutter. NOT for pre-excited (irregular wide-complex) tachycardias.\nPEDS: 0.1 mg/kg rapid IVP (Max 6 mg). 2nd dose 0.2 mg/kg (Max 12 mg).',
      },
    ],
    packaging: '3 mg/mL — 2 mL vials (6 mg)',
  },

  {
    name: 'Atropine Sulfate',
    drugClass: 'cardiac',
    synonyms: ['atropine', 'atropine sulfate', '0.5mg atropine'],
    doses: [
      {
        indication: 'Symptomatic Bradycardia',
        dose: '1 mg IV/IO q3–5 min (Max 3 mg)',
        route: 'IV/IO',
        notes: 'NEVER give <0.5 mg — paradoxical worsening of bradycardia. In Type II 2nd-degree or 3rd-degree (complete) AV block: atropine is often ineffective — go directly to transcutaneous pacing. Effective for Type I (Wenckebach) and sinus bradycardia.\nPEDS: 0.02 mg/kg (Min 0.1 mg, Max 0.5 mg). Repeat q3–5 min. Max total 1 mg peds.',
      },
      {
        indication: 'Organophosphate / Nerve Agent / SLUDGE Toxidrome',
        dose: '2–4 mg IV/IM q5 min until secretions dry',
        route: 'IV/IO/IM',
        notes: 'No max in toxidrome. Titrate to drying of secretions — NOT heart rate. Repeat aggressively. You may need 10–20+ mg in severe poisoning.\nPEDS: 0.05 mg/kg IV/IM q10–20 min.',
      },
    ],
    packaging: '0.1 mg/mL (1 mg/10 mL) prefilled or 0.4 mg/mL, 1 mg/mL vials',
  },

  {
    name: 'Diltiazem',
    drugClass: 'cardiac',
    synonyms: ['diltiazem', 'cardizem'],
    doses: [
      {
        indication: 'Rate Control — A-Fib / A-Flutter with RVR / SVT',
        dose: '0.25 mg/kg (usually 15–20 mg) over 2 min',
        route: 'IV push',
        notes: '2nd dose 0.35 mg/kg if needed after 15 min. Infusion: 5–15 mg/hr. CONTRAINDICATED: WPW, accessory pathway, acute decompensated HF, hypotension, wide-complex tachycardia of unknown origin.\nPEDS: Not routinely recommended pre-hospital.',
      },
    ],
    packaging: '5 mg/mL — 5 mL (25 mg) or 10 mL (50 mg) vials',
  },

  {
    name: 'Metoprolol',
    drugClass: 'cardiac',
    synonyms: ['metoprolol', 'lopressor'],
    doses: [
      {
        indication: 'Rate Control — A-Fib / SVT / ACS (medical control)',
        dose: '5 mg IV over 2–5 min — repeat q5 min (Max 15 mg)',
        route: 'IV slow push',
        notes: 'Hold if: HR <60, SBP <100, signs of decompensated HF, active bronchospasm.\nPEDS: Not recommended pre-hospital.',
      },
    ],
    packaging: '1 mg/mL — 5 mL (5 mg) vials',
  },

  {
    name: 'Procainamide',
    drugClass: 'cardiac',
    synonyms: ['procainamide', 'procan'],
    doses: [
      {
        indication: 'Stable Wide-Complex Tachycardia / WPW A-Fib',
        dose: '20–50 mg/min infusion (Max 17 mg/kg total)',
        route: 'IV drip',
        notes: 'STOP if: hypotension, QRS widens >50%, arrhythmia resolves, or max dose reached. Maintenance: 1–4 mg/min.\nPEDS: 15 mg/kg over 30–60 min IV.',
      },
    ],
    packaging: '100 mg/mL or 500 mg/mL — dilute before use',
  },

  {
    name: 'Propranolol',
    drugClass: 'cardiac',
    synonyms: ['propranolol', 'inderal'],
    doses: [
      {
        indication: 'SVT / Rate Control / Thyroid Storm',
        dose: '1–3 mg slow push (1 mg/min)',
        route: 'IV',
        notes: 'May repeat q2 min. AVOID in asthma/COPD (non-selective β-blockade → bronchospasm). CONTRAINDICATED: decompensated HF, bradycardia, WPW.\nPEDS: 0.01–0.1 mg/kg slow IV push.',
      },
    ],
    packaging: '1 mg/mL — 1 mL vials',
  },

  {
    name: 'Labetalol',
    drugClass: 'cardiac',
    synonyms: ['labetalol'],
    doses: [
      {
        indication: 'Hypertensive Emergency / Aortic Dissection / Ischemic Stroke BP Control',
        dose: '10–20 mg IV over 2 min — may double dose q10 min (Max 300 mg)',
        route: 'IV push',
        notes: 'Combined α/β blockade — reduces BP without reflex tachycardia. Avoid in acute decompensated HF, bradycardia, asthma.\nPEDS: Not routinely indicated pre-hospital.',
      },
    ],
    packaging: '5 mg/mL — 4 mL (20 mg) or 20 mL (100 mg) vials',
  },

  {
    name: 'Lidocaine',
    drugClass: 'cardiac',
    synonyms: ['lidocaine', 'xylocaine', 'lido'],
    doses: [
      {
        indication: 'VF/pVT (if amiodarone unavailable)',
        dose: '1–1.5 mg/kg IV/IO — repeat 0.5–0.75 mg/kg q5–10 min (Max 3 mg/kg)',
        route: 'IV/IO',
        notes: 'Maintenance post-ROSC: 1–4 mg/min infusion.\nPEDS: 1 mg/kg IV/IO.',
      },
      {
        indication: 'IO Insertion Pain Management',
        dose: '40 mg slow IO push (2% solution)',
        route: 'IO (before fluids)',
        notes: 'Administer before flushing IO with NS — significantly reduces burning pain.\nPEDS: 0.5 mg/kg slow IO push.',
      },
      {
        indication: 'RSI Pretreatment (ICP / laryngospasm blunting)',
        dose: '1.5 mg/kg IV 3 min before intubation',
        route: 'IV',
        notes: 'Protocol-dependent. Blunts ICP spike and laryngospasm reflex during laryngoscopy.',
      },
    ],
    packaging: '10 mg/mL (1%) or 20 mg/mL (2%) vials',
  },

  {
    name: 'Magnesium Sulfate',
    drugClass: 'cardiac',
    synonyms: ['magnesium', 'mag sulfate', 'magnesium sulfate'],
    doses: [
      {
        indication: 'Torsades de Pointes / Arrest',
        dose: '1–2 g IV push',
        route: 'IV (can push in arrest; slow over 5–20 min if pulse present)',
        notes: 'Corrects Mg deficiency driving TdP.\nPEDS: 25–50 mg/kg IV (Max 2 g) over 10–20 min.',
      },
      {
        indication: 'Eclampsia / Pre-eclampsia with Severe Features',
        dose: '4 g IV over 10 min (loading)',
        route: 'IV',
        notes: 'Maintenance: 1–2 g/hr. Monitor patellar DTRs, RR, UO. Calcium gluconate reverses toxicity. 4 g = 8 mL of 50% solution.\nPEDS: Not routinely indicated.',
      },
      {
        indication: 'Severe Refractory Asthma',
        dose: '2 g in 50 mL NS over 10–20 min',
        route: 'IV infusion',
        notes: 'Adjunct when bronchodilators insufficient. Smooth muscle relaxation.\nPEDS: 25–50 mg/kg (Max 2 g) over 10–20 min.',
      },
    ],
    packaging: '500 mg/mL (50%) — dilute to ≤20% for IV; 4 g = 8 mL of 50%',
  },

  {
    name: 'Nitroglycerin',
    drugClass: 'cardiac',
    synonyms: ['nitroglycerin', 'nitro', 'sl nitro'],
    doses: [
      {
        indication: 'ACS / Chest Pain / Acute Pulmonary Edema',
        dose: '0.4 mg SL q5 min (Max 3 doses)',
        route: 'SL tablet or spray',
        notes: 'HOLD if: SBP <100, inferior STEMI with suspected RVI (check RV leads), PDE-5 inhibitor in past 24h (sildenafil) or 48h (tadalafil).\nPEDS: Not indicated.',
      },
    ],
    packaging: '0.4 mg tablets (Nitrostat) or metered spray (0.4 mg/actuation)',
  },

  {
    name: 'Nitroglycerin Paste',
    drugClass: 'cardiac',
    synonyms: ['nitroglycerin paste', 'nitro paste', 'nitrobid'],
    doses: [
      {
        indication: 'ACS / Angina / Pulmonary Edema (SL not tolerated)',
        dose: '½ to 1 inch (1.25–2.5 cm)',
        route: 'Topical — chest wall or upper arm',
        notes: 'Use measuring applicator strip. Wear gloves. Onset 30–60 min — slower than SL. Same hold criteria as SL nitro. Wipe off immediately if hypotension develops.\nPEDS: Not indicated.',
      },
    ],
    packaging: 'Nitro-Bid 2% ointment — 15 mg/inch applied',
  },

  {
    name: 'Aspirin',
    drugClass: 'cardiac',
    synonyms: ['aspirin', '324mg aspirin', 'asa'],
    doses: [
      {
        indication: 'Suspected ACS / STEMI / NSTEMI',
        dose: '162–324 mg PO — chewed immediately',
        route: 'PO (chewed)',
        notes: 'Chewing achieves faster absorption. Hold in hemorrhagic stroke or true allergy. Lower dose (162 mg = 2 baby aspirin) acceptable per some protocols.\nPEDS: Not routinely indicated pre-hospital.',
      },
    ],
    packaging: '81 mg baby aspirin × 2–4, or 325 mg tablet',
  },

  {
    name: 'Furosemide',
    drugClass: 'cardiac',
    synonyms: ['furosemide', 'lasix'],
    doses: [
      {
        indication: 'Acute Pulmonary Edema / CHF Exacerbation',
        dose: '0.5–1 mg/kg IV (typically 40–80 mg)',
        route: 'IV slow push',
        notes: 'Venodilation precedes diuresis — onset 5–15 min IV. Use with caution if BP borderline. Match or double the patient\'s home oral dose if known.\nPEDS: 1 mg/kg IV.',
      },
    ],
    packaging: '10 mg/mL — 4 mL (40 mg) vials',
  },

  {
    name: 'Heparin (High Dose)',
    drugClass: 'cardiac',
    synonyms: ['heparin', 'high dose heparin'],
    doses: [
      {
        indication: 'STEMI (facilitated PCI) / Massive PE (interfacility)',
        dose: '60 units/kg IV bolus (Max 4,000 units)',
        route: 'IV bolus',
        notes: 'Maintenance drip: 12 units/kg/hr (Max 1,000 units/hr). Requires direct medical control order. Document time administered.\nPEDS: Rarely used pre-hospital.',
      },
    ],
    packaging: '1,000 or 5,000 units/mL vials — dilute per protocol',
  },

  // ═══════════════════════════════════════════════════════════
  // VASOPRESSORS / INOTROPES
  // ═══════════════════════════════════════════════════════════

  {
    name: 'Dopamine',
    drugClass: 'vasopressor',
    synonyms: ['dopamine', 'dopamine drip', 'intropin'],
    doses: [
      {
        indication: 'Cardiogenic Shock / Distributive Shock / Bradycardia (refractory to atropine)',
        dose: '2–20 mcg/kg/min — titrate to MAP >65',
        route: 'IV infusion',
        notes: 'Start at 5 mcg/kg/min. Inotropic range 5–10; vasopressor range >10. Bridge to pacing if using for bradycardia. Increased arrhythmia risk at higher doses.\nPEDS: 2–20 mcg/kg/min IV infusion (same as adult weight-based).',
      },
    ],
    packaging: '40 mg/mL — standard mix: 400 mg in 250 mL NS → 1,600 mcg/mL',
  },

  {
    name: 'Norepinephrine (Levophed)',
    drugClass: 'vasopressor',
    synonyms: ['norepinephrine', 'levophed', 'norepi', 'norepinephrine drip', 'levophed drip', 'norepi drip'],
    doses: [
      {
        indication: 'Septic / Distributive Shock / Post-ROSC Hypotension',
        dose: '0.1–0.5 mcg/kg/min — titrate to MAP >65',
        route: 'IV infusion (central preferred; peripheral short-term OK)',
        notes: 'First-line vasopressor for septic shock. Start 0.1–0.2, up-titrate q5–10 min. For spinal/neurogenic shock: target MAP 85–90.\nPEDS: 0.05–0.1 mcg/kg/min IV infusion.',
      },
    ],
    packaging: '1 mg/mL — standard mix: 4 mg in 250 mL D5W or NS → 16 mcg/mL',
  },

  {
    name: 'Phenylephrine',
    drugClass: 'vasopressor',
    synonyms: ['phenylephrine'],
    doses: [
      {
        indication: 'Hypotension (pure vasopressor — no chronotropy)',
        dose: '100–200 mcg bolus · infusion 0.5–6 mcg/kg/min',
        route: 'IV push or infusion',
        notes: 'Preferred when tachycardia is present (no HR effect). May cause reflex bradycardia.\nPEDS: Specialist guidance — not commonly used pre-hospital.',
      },
    ],
    packaging: '10 mg/mL — dilute before use; 100 mcg/mL working solution common',
  },

  {
    name: 'Vasopressin',
    drugClass: 'vasopressor',
    synonyms: ['vasopressin', 'pitressin'],
    doses: [
      {
        indication: 'Cardiac Arrest (VF/PEA/Asystole) — alternative to epi',
        dose: '40 units IV/IO push (one-time dose)',
        route: 'IV/IO bolus',
        notes: 'May replace 1st or 2nd epi dose per protocol. Infusion for vasodilatory shock: 0.03–0.04 units/min.\nPEDS: 0.4–1 unit/kg IV/IO (rarely used).',
      },
    ],
    packaging: '20 units/mL — 1 mL (20 units) or 2 mL (40 units) vials',
  },

  {
    name: 'Dobutamine',
    drugClass: 'vasopressor',
    synonyms: ['dobutamine', 'dobutrex', 'dobutamine drip'],
    doses: [
      {
        indication: 'Cardiogenic Shock / Decompensated HF with Low Output',
        dose: '2–20 mcg/kg/min — titrate to BP/effect',
        route: 'IV infusion',
        notes: 'Positive inotrope (beta-1). Low pressor effect — use when CO is low but MAP is maintained. May cause tachycardia. Add norepi if BP inadequate.\nPEDS: 2–20 mcg/kg/min (same weight-based dosing).',
      },
    ],
    packaging: '12.5 mg/mL — 20 mL (250 mg) vial; mix: 250 mg in 250 mL NS → 1,000 mcg/mL',
  },

  // ═══════════════════════════════════════════════════════════
  // SEDATION / ANALGESIA / ANXIOLYTICS
  // ═══════════════════════════════════════════════════════════

  {
    name: 'Morphine Sulfate',
    drugClass: 'sedation',
    synonyms: ['morphine', 'morphine sulfate'],
    doses: [
      {
        indication: 'Moderate–Severe Pain / ACS Adjunct',
        dose: '2–10 mg IV/IO/IM initial — titrate to effect',
        route: 'IV slow push / IM',
        notes: 'Start 2–4 mg and reassess q5–10 min. Monitor for hypotension and respiratory depression. Consider fentanyl if hemodynamically unstable.\nPEDS: 0.1 mg/kg IV/IO/IM (Max 5 mg/dose).',
      },
    ],
    packaging: '10 mg/mL — 1 mL (10 mg) vials',
  },

  {
    name: 'Fentanyl Citrate',
    drugClass: 'sedation',
    synonyms: ['fentanyl', 'fentanyl citrate', 'sublimaze'],
    doses: [
      {
        indication: 'Severe Pain / RSI Adjunct',
        dose: '1–2 mcg/kg (typically 50–100 mcg) q5–10 min',
        route: 'IV/IM/IN',
        notes: 'IN: 2 mcg/kg total (1 mcg/kg per nare using MAD). Rapid onset — monitor respirations. Preferred over morphine if hemodynamically unstable.\nPEDS: 1–2 mcg/kg IV/IM/IN (Max 50 mcg/dose).',
      },
    ],
    packaging: '50 mcg/mL — 2 mL (100 mcg) or 10 mL (500 mcg)',
  },

  {
    name: 'Ketamine',
    drugClass: 'sedation',
    synonyms: ['ketamine', 'ketalar'],
    doses: [
      {
        indication: 'Sub-Dissociative Analgesia / Pain',
        dose: '0.1–0.3 mg/kg IV/IN',
        route: 'IV slow push or IN',
        notes: 'Excellent pain control without full dissociation.\nPEDS: 0.1–0.2 mg/kg IV.',
      },
      {
        indication: 'RSI Induction',
        dose: '1.5–2 mg/kg IV',
        route: 'IV over 60 sec',
        notes: 'Onset <60 sec. Maintains airway reflexes and BP. Preferred induction in bronchospasm and hemodynamic instability.\nPEDS: 1–2 mg/kg IV.',
      },
      {
        indication: 'Chemical Restraint / Agitated Delirium',
        dose: '4 mg/kg IM  ·  1 mg/kg IV',
        route: 'IM preferred / IV',
        notes: 'IM onset 3–5 min. Monitor airway closely. Use with caution in stimulant toxidrome.\nPEDS: Same weight-based dosing.',
      },
    ],
    packaging: '500 mg/10 mL (50 mg/mL) or 200 mg/20 mL (10 mg/mL)',
  },

  {
    name: 'Midazolam',
    drugClass: 'sedation',
    synonyms: ['midazolam', 'versed'],
    doses: [
      {
        indication: 'Seizures / Status Epilepticus',
        dose: 'IM: 10 mg (≥40 kg)  ·  5 mg (13–40 kg)\nIV/IO: 2–5 mg',
        route: 'IM / IV / IN',
        notes: 'IM is first-line pre-hospital — no IV required (RAMPART trial). IN: 0.2 mg/kg split between nares with MAD. Monitor resp rate and SpO2 closely.\nPEDS IV/IO: 0.1 mg/kg (Max 5 mg). PEDS IN/IM: 0.2 mg/kg.',
      },
      {
        indication: 'Procedural Sedation / RSI Adjunct',
        dose: '2–5 mg IV/IO slow push',
        route: 'IV/IO',
        notes: 'Titrate to effect. Reversal: flumazenil (with caution).\nPEDS: 0.1 mg/kg IV/IO (Max 5 mg).',
      },
    ],
    packaging: '1 mg/mL (5 mg/5 mL) or 5 mg/mL vials',
  },

  {
    name: 'Lorazepam',
    drugClass: 'sedation',
    synonyms: ['ativan', 'lorazepam', 'benzo'],
    doses: [
      {
        indication: 'Seizures / Status Epilepticus / Sedation',
        dose: '2–4 mg slow push',
        route: 'IV/IM/IN',
        notes: 'q5–15 min PRN. Respiratory depression risk — monitor. IM/IN onset slower than IV.\nPEDS: 0.05–0.1 mg/kg (Max 2 mg/dose).',
      },
    ],
    packaging: '2 mg/mL or 4 mg/mL vials — requires refrigeration',
  },

  {
    name: 'Diazepam',
    drugClass: 'sedation',
    synonyms: ['diazepam', 'valium'],
    doses: [
      {
        indication: 'Seizures / Status Epilepticus / Nerve Agent Seizure',
        dose: 'IV/IO: 5–10 mg slow push (≤2 mg/min)\nIM: 5–10 mg\nPR: 10–20 mg (adult)',
        route: 'IV/IM/PR',
        notes: 'IV: push slowly — precipitates in tubing, flush line with NS. Diastat rectal gel useful when no IV. Respiratory depression risk at all routes.\nPEDS IV/IO: 0.1–0.2 mg/kg slow push. PEDS PR: 0.5 mg/kg (Diastat).',
      },
    ],
    packaging: '5 mg/mL — 2 mL (10 mg) vials; Diastat rectal gel: 2.5 mg, 10 mg, 20 mg',
  },

  {
    name: 'Etomidate',
    drugClass: 'sedation',
    synonyms: ['etomidate', 'amidate'],
    doses: [
      {
        indication: 'RSI Induction Agent',
        dose: '0.3 mg/kg IV over 30–60 sec (typical 20 mg)',
        route: 'IV rapid push',
        notes: 'Onset 10–15 sec. Duration 3–5 min. Hemodynamically neutral — preferred in hypotensive patients. Myoclonic jerks common (not a seizure). Single-dose adrenal suppression rarely clinically significant.\nPEDS: 0.3 mg/kg IV/IO over 30–60 sec (same weight-based dosing).',
      },
    ],
    packaging: '2 mg/mL — 10 mL (20 mg) vial',
  },

  {
    name: 'Nalbuphine',
    drugClass: 'sedation',
    synonyms: ['nalbuphine', 'nubain'],
    doses: [
      {
        indication: 'Moderate–Severe Pain (OLMC typically required)',
        dose: '10–20 mg IV/IM/SQ',
        route: 'IV/IM/SQ',
        notes: 'Mixed agonist-antagonist — analgesic ceiling effect. May precipitate withdrawal in opioid-dependent patients. OLMC authorization typically required.\nPEDS: 0.1–0.2 mg/kg IV/IM/SQ.',
      },
    ],
    packaging: '10 mg/mL — 1 mL (10 mg) or 2 mL (20 mg) vials',
  },

  {
    name: 'Nitrous Oxide',
    drugClass: 'sedation',
    synonyms: ['nitrous oxide', 'nitronox', 'n2o'],
    doses: [
      {
        indication: 'Moderate Pain / Anxiolysis (self-administered)',
        dose: '50/50 N₂O/O₂ blend — self-administered via demand valve',
        route: 'Inhaled',
        notes: 'Patient holds mask — drops it if over-sedated (built-in safety). Onset 30–60 sec, offset ~5 min. CONTRAINDICATED: pneumothorax, bowel obstruction, SCUBA within 24h, altered LOC, severe COPD.\nPEDS: Self-administered if patient is capable of holding the mask.',
      },
    ],
    packaging: 'Premixed 50% N₂O / 50% O₂ cylinders (Nitronox/Entonox)',
  },

  {
    name: 'Ziprasidone',
    drugClass: 'sedation',
    synonyms: ['ziprasidone', 'geodon'],
    doses: [
      {
        indication: 'Acute Agitated Delirium / Severe Behavioral Emergency',
        dose: '10–20 mg IM (Max 40 mg/day)',
        route: 'IM',
        notes: 'Onset 15–30 min. QTc prolongation risk — avoid with other QT-prolonging agents. Not commonly first-line pre-hospital.\nPEDS: Not recommended pre-hospital.',
      },
    ],
    packaging: '20 mg/mL IM formulation (single-dose vials)',
  },

  {
    name: 'Phenobarbital',
    drugClass: 'sedation',
    synonyms: ['phenobarbital'],
    doses: [
      {
        indication: 'Refractory Status Epilepticus (after benzos fail)',
        dose: '10–20 mg/kg IV slow push (max 60 mg/min)',
        route: 'IV (rarely pre-hospital)',
        notes: 'Significant respiratory depression — be ready to intubate. Onset 5–30 min. Long duration (hours–days).\nPEDS: 15–20 mg/kg slow IV (same max infusion rate).',
      },
    ],
    packaging: '65 mg/mL or 130 mg/mL — dilute before IV use',
  },

  {
    name: 'Proparacaine',
    drugClass: 'sedation',
    synonyms: ['proparacaine', 'alcaine'],
    doses: [
      {
        indication: 'Topical Ophthalmic Anesthesia (eye injury / FB)',
        dose: '1–2 drops per affected eye',
        route: 'Ophthalmic (topical)',
        notes: 'Onset 20 sec, duration 15–20 min. Allows painless exam. Do NOT give the bottle to the patient — chronic misuse causes corneal damage. Document time administered.\nPEDS: 1–2 drops per eye (same as adult).',
      },
    ],
    packaging: '0.5% ophthalmic solution — single-use droppers',
  },

  // ═══════════════════════════════════════════════════════════
  // PARALYTICS (RSI)
  // ═══════════════════════════════════════════════════════════

  {
    name: 'Succinylcholine',
    drugClass: 'sedation',
    synonyms: ['succinylcholine', 'succs', 'sux'],
    doses: [
      {
        indication: 'RSI — Depolarizing Paralytic (ultra-short acting)',
        dose: '1–2 mg/kg IV/IO rapid push',
        route: 'IV/IO',
        notes: 'Onset IV 30–60 sec (full effect ~60 sec). Duration 8–12 min. Cannot be reversed. AVOID: hyperkalemia, burns >24h, crush injury >72h, denervation injury, malignant hyperthermia Hx, pseudocholinesterase deficiency.\nPEDS: 1–2 mg/kg IV/IO. INFANTS (<1 yr): 2 mg/kg (higher dose due to larger Vd).',
      },
    ],
    packaging: '20 mg/mL — 10 mL (200 mg) vials; requires refrigeration',
  },

  {
    name: 'Rocuronium',
    drugClass: 'sedation',
    synonyms: ['rocuronium', 'zemuron', 'roc'],
    doses: [
      {
        indication: 'RSI — Non-Depolarizing Paralytic',
        dose: '1 mg/kg IV/IO (0.6–1.2 mg/kg range)',
        route: 'IV/IO',
        notes: 'Onset 60–90 sec at 1.2 mg/kg. Duration 60–90 min at RSI dose. REVERSIBLE with sugammadex: 16 mg/kg for immediate CICV reversal; 4 mg/kg for standard reversal. Safe when succinylcholine is contraindicated.\nPEDS: 1 mg/kg IV/IO (same dosing).',
      },
    ],
    packaging: '10 mg/mL — 5 mL (50 mg) or 10 mL (100 mg) vials; requires refrigeration',
  },

  {
    name: 'Vecuronium',
    drugClass: 'sedation',
    synonyms: ['vecuronium', 'norcuron', 'vec'],
    doses: [
      {
        indication: 'RSI / Continued Paralysis Post-Intubation',
        dose: '0.1 mg/kg IV/IO',
        route: 'IV/IO',
        notes: 'Onset 3–5 min (slower than rocuronium at standard dose). Duration 25–40 min. Non-depolarizing — no succinylcholine contraindications apply. Maintenance: 0.01–0.02 mg/kg q15–20 min.\nPEDS: 0.1 mg/kg IV/IO (same as adult).',
      },
    ],
    packaging: '1 mg/mL — 10 mL (10 mg) after reconstitution',
  },

  // ═══════════════════════════════════════════════════════════
  // RESPIRATORY
  // ═══════════════════════════════════════════════════════════

  {
    name: 'Albuterol / DuoNeb',
    drugClass: 'respiratory',
    synonyms: [
      'albuterol', 'albuterol neb', 'continuous albuterol', 'salbutamol',
      'duoneb', 'ipratropium', 'atrovent',
      'neb treatment', 'breathing treatment',
    ],
    doses: [
      {
        indication: 'Bronchospasm — Standard (Asthma / COPD / Hyperkalemia)',
        dose: '2.5–5.0 mg albuterol in 3 mL NS over 5–15 min',
        route: 'Nebulizer @ 6–8 L/min O₂',
        notes: 'Repeat q20 min × 3 or continuously for severe attacks.\nPEDS: 0.15 mg/kg (Min 2.5 mg) over 5–15 min.',
      },
      {
        indication: 'DuoNeb — Moderate–Severe Bronchospasm',
        dose: 'Albuterol 2.5 mg + Ipratropium 0.5 mg',
        route: 'Nebulizer (combo unit-dose vial)',
        notes: 'Preferred for COPD exacerbation. Ipratropium adds anticholinergic bronchodilation for sustained effect.\nPEDS Ipratropium: 0.25–0.5 mg added to albuterol neb.',
      },
      {
        indication: 'Continuous Nebulization — Severe / Near-Fatal Asthma',
        dose: '10–20 mg/hr (4–8 unit-dose vials/hr)',
        route: 'Continuous nebulizer',
        notes: 'Use in-line with BVM or CPAP. Silent chest = near-complete obstruction — consider IM epi if no response.\nPEDS: Same weight-based approach — discuss with medical direction.',
      },
    ],
    packaging: 'Albuterol: 0.083% (2.5 mg/3 mL) unit-dose vials\nDuoNeb: albuterol 2.5 mg + ipratropium 0.5 mg / 3 mL\nMDI: 90 mcg/actuation (4–8 puffs with spacer)',
  },

  {
    name: 'Levalbuterol',
    drugClass: 'respiratory',
    synonyms: ['levalbuterol', 'xopenex'],
    doses: [
      {
        indication: 'Bronchospasm (R-isomer albuterol — fewer side effects)',
        dose: '1.25 mg in 3 mL NS',
        route: 'Nebulizer',
        notes: 'Fewer tachycardia/tremor side effects than racemic albuterol. Same mechanism — pure R-isomer. Repeat q20 min PRN.\nPEDS: 0.63–1.25 mg nebulized.',
      },
    ],
    packaging: '0.63 mg/3 mL or 1.25 mg/3 mL unit-dose vials',
  },

  {
    name: 'Terbutaline Sulfate',
    drugClass: 'respiratory',
    synonyms: ['terbutaline', 'brethine'],
    doses: [
      {
        indication: 'Severe Asthma (SQ beta-2 agonist) / Preterm Labor (tocolytic)',
        dose: '0.25 mg SQ q15–30 min (Max 0.5 mg in 4h)',
        route: 'SQ',
        notes: 'For preterm labor: delays delivery to facilitate transport — not definitive. Monitor maternal and fetal HR.\nPEDS: 0.01 mg/kg SQ (Max 0.25 mg/dose).',
      },
    ],
    packaging: '1 mg/mL — 1 mL (1 mg) vials',
  },

  {
    name: 'Methylprednisolone',
    drugClass: 'respiratory',
    synonyms: ['methylprednisolone', 'solu-medrol'],
    doses: [
      {
        indication: 'Severe Asthma / COPD Exacerbation / Anaphylaxis Adjunct',
        dose: '125 mg IV/IM',
        route: 'IV or IM',
        notes: 'Anti-inflammatory onset 4–6h — benefits extend beyond pre-hospital phase. Give early.\nPEDS: 2 mg/kg IV/IM (Max 125 mg).',
      },
    ],
    packaging: '40 mg/mL, 125 mg/2 mL, or 500 mg/8 mL (Act-O-Vial)',
  },

  {
    name: 'Oxymetazoline',
    drugClass: 'respiratory',
    synonyms: ['oxymetazoline', 'afrin'],
    doses: [
      {
        indication: 'Epistaxis (nosebleed) / Nasal Intubation Prep',
        dose: '1–2 sprays per bleeding nostril',
        route: 'Intranasal',
        notes: 'Vasoconstriction onset 5–10 min, duration ~6h. Apply to nasal packing or gauze for tamponade. Also used before nasotracheal intubation to improve visualization.\nPEDS: 1–2 sprays per bleeding nostril (same as adult).',
      },
    ],
    packaging: '0.05% nasal spray — 15 mL or 30 mL bottles',
  },

  // ═══════════════════════════════════════════════════════════
  // REVERSAL / ANTIDOTES
  // ═══════════════════════════════════════════════════════════

  {
    name: 'Naloxone',
    drugClass: 'reversal',
    synonyms: ['naloxone', 'narcan', 'intranasal narcan'],
    doses: [
      {
        indication: 'Opioid OD / Respiratory Depression',
        dose: 'IN: 2–4 mg  ·  IV/IM: 0.4–2 mg (titrate to respiratory drive)',
        route: 'IN / IV / IM / IO / SQ',
        notes: 'IN: 2 mg per nare using MAD (4 mg total). Titrate to adequate ventilation — NOT full reversal (avoids withdrawal/combativeness). Duration shorter than most opioids — watch for re-sedation.\nPEDS: 0.1 mg/kg IN/IV/IM (Max 2 mg/dose).',
      },
    ],
    packaging: '0.4 mg/mL vials; 2 mg/2 mL MAD device; 4 mg/0.1 mL nasal spray (Narcan)',
  },

  {
    name: 'Flumazenil',
    drugClass: 'reversal',
    synonyms: ['flumazenil', 'romazicon'],
    doses: [
      {
        indication: '⚠ Benzodiazepine Reversal — USE WITH EXTREME CAUTION',
        dose: '0.2 mg IV over 15 sec — may repeat 0.3 mg (Max 3 mg total)',
        route: 'IV',
        notes: '⚠ NOT IN STANDARD EMS DRUG BOX in most systems. DANGEROUS in benzo-dependent patients (precipitates seizures). CONTRAINDICATED: seizure Hx, TCA co-ingestion, chronic benzo use. Ventilation is usually safer.\nPEDS: 0.01 mg/kg IV (Max 0.2 mg/dose).',
      },
    ],
    packaging: '0.1 mg/mL — 5 mL (0.5 mg) or 10 mL (1 mg) vials',
  },

  {
    name: 'Dextrose',
    drugClass: 'reversal',
    synonyms: ['dextrose', 'd50', 'd10', 'd25', 'd5w', 'dextrose 50', 'dextrose 25', 'dextrose 10'],
    doses: [
      {
        indication: 'Hypoglycemia — D50 (adult, confirmed IV)',
        dose: '12.5–25 g (25–50 mL) slow push',
        route: 'IV/IO',
        notes: 'Vesicant — confirm IV patency before administration. High osmolarity — not ideal for peds or peripheral lines.\nPEDS: Not recommended for young pediatrics — use D10 or D25.',
      },
      {
        indication: 'Hypoglycemia — D10 (preferred — lower osmolarity)',
        dose: '10–25 g (100–250 mL) infusion',
        route: 'IV/IO',
        notes: 'Preferred over D50: less tissue damage on extravasation, safer for peripheral lines. Preferred for neonates/infants.\nPEDS: 0.5–1 g/kg (5–10 mL/kg of D10) infusion.',
      },
      {
        indication: 'Hypoglycemia — D25 (pediatric standard)',
        dose: '0.5–1 g/kg (2–4 mL/kg) slow push',
        route: 'IV/IO',
        notes: 'Standard peds hypoglycemia concentration. Recheck BGL in 5 min after any dextrose.\nPEDS: D25 is the pediatric standard for ages >1 yr. D10 preferred for neonates/infants.',
      },
    ],
    packaging: 'D50: 500 mg/mL — 50 mL\nD25: 250 mg/mL — 10 mL (peds)\nD10: 100 mg/mL — 100 mL or 250 mL bags',
  },

  {
    name: 'Glucagon',
    drugClass: 'reversal',
    synonyms: ['glucagon', 'im glucagon'],
    doses: [
      {
        indication: 'Hypoglycemia (no IV/IO access)',
        dose: '1 mg IM or IN',
        route: 'IM / IN',
        notes: 'Onset 5–15 min. Will NOT work if glycogen stores depleted (starvation, chronic alcoholism). Position to prevent aspiration — nausea common.\nPEDS: 0.5 mg IM (<20 kg)  ·  1 mg IM (>20 kg).',
      },
      {
        indication: 'Beta-Blocker Overdose',
        dose: '3–10 mg IV push',
        route: 'IV',
        notes: 'Infusion: 1–5 mg/hr. High nausea/vomiting risk — have airway ready.\nPEDS: Specialist guidance — weight-based via OLMC.',
      },
    ],
    packaging: '1 mg lyophilized powder — reconstitute with supplied diluent (1 mL)',
  },

  {
    name: 'Oral Glucose',
    drugClass: 'reversal',
    synonyms: ['oral glucose'],
    doses: [
      {
        indication: 'Mild–Moderate Hypoglycemia (conscious, intact gag)',
        dose: '15–30 g (1–2 tubes)',
        route: 'PO',
        notes: 'Must be able to swallow — NEVER in altered LOC. Recheck BGL in 15 min.\nPEDS: 7.5–15 g PO (if intact gag reflex and able to swallow).',
      },
    ],
    packaging: '15 g glucose gel tube (Instaglucose)',
  },

  {
    name: 'Thiamine (B1)',
    drugClass: 'reversal',
    synonyms: ['thiamine', 'thiamine b1'],
    doses: [
      {
        indication: "Wernicke's Encephalopathy / Alcoholism / Malnutrition with Hypoglycemia",
        dose: '100 mg IV/IM',
        route: 'IV/IM',
        notes: 'Give BEFORE dextrose in suspected thiamine deficiency. Rapid IV can cause hypotension — infuse slowly or give IM.\nPEDS: Rarely indicated pre-hospital.',
      },
    ],
    packaging: '100 mg/mL — 1 mL (100 mg) vials',
  },

  {
    name: 'Pyridoxine (B6)',
    drugClass: 'reversal',
    synonyms: ['pyridoxine', 'vitamin b6'],
    doses: [
      {
        indication: 'INH (Isoniazid) Overdose / Seizures / Gyromitra Mushroom Poisoning',
        dose: '5 g IV (or mg-for-mg of ingested INH) over 15–30 min',
        route: 'IV infusion',
        notes: 'INH seizures are refractory to standard benzos — pyridoxine is the antidote. Repeat if seizures persist. Requires large quantities — may need multiple vials.\nPEDS: 70 mg/kg IV (Max 5 g).',
      },
    ],
    packaging: '100 mg/mL — multi-dose vials',
  },

  {
    name: 'Calcium Chloride',
    drugClass: 'reversal',
    synonyms: ['calcium chloride'],
    doses: [
      {
        indication: 'Hyperkalemia / CCB Overdose / Hypocalcemia',
        dose: '500–1,000 mg (5–10 mL of 10%) slow push',
        route: 'IV/IO over 5–10 min',
        notes: 'Vesicant — pain and tissue necrosis on extravasation. Confirm IV patency. Contains 3× more elemental calcium than gluconate at same volume.\nPEDS: 20 mg/kg (0.2 mL/kg of 10% solution) slow push.',
      },
    ],
    packaging: '100 mg/mL (10%) — 10 mL (1 g)',
  },

  {
    name: 'Calcium Gluconate',
    drugClass: 'reversal',
    synonyms: ['calcium gluconate', 'cal gluconate'],
    doses: [
      {
        indication: 'Hyperkalemia / CCB Overdose / Magnesium Toxicity / HF Burns',
        dose: '1–3 g (10–30 mL of 10%) slow push',
        route: 'IV/IO over 5–10 min',
        notes: 'Safer than CaCl₂ peripherally — less vesicant. Antidote for magnesium toxicity (respiratory arrest from Mg overdose). For HF acid burns: apply topically first, then IV.\nPEDS: 60–100 mg/kg (0.6–1 mL/kg of 10% solution) slow push.',
      },
    ],
    packaging: '100 mg/mL (10%) — 10 mL (1 g) vials',
  },

  {
    name: 'Sodium Bicarbonate',
    drugClass: 'reversal',
    synonyms: ['sodium bicarb', 'sodium bicarbonate', 'bicarb'],
    doses: [
      {
        indication: 'TCA Overdose / Sodium Channel Blocker Toxicity / Severe Acidosis / Prolonged Arrest',
        dose: '1 mEq/kg IV/IO push',
        route: 'IV/IO',
        notes: 'For TCA: repeat until QRS <100ms and hemodynamic stability. Target pH 7.45–7.55. For hyperkalemia: temporizing — drives K+ intracellularly.\nPEDS: 1 mEq/kg IV/IO push. Use 4.2% solution in neonates (less hyperosmolar).',
      },
    ],
    packaging: '1 mEq/mL — 50 mEq (50 mL) prefilled syringe',
  },

  {
    name: 'Hydroxocobalamin',
    drugClass: 'reversal',
    synonyms: ['hydroxocobalamin', 'cyanokit'],
    doses: [
      {
        indication: 'Cyanide Poisoning / Smoke Inhalation with CN exposure',
        dose: '5 g IV/IO over 15 min',
        route: 'IV/IO infusion',
        notes: 'First-line cyanide antidote. Mix with 200 mL NS. Turns urine/skin red — expected and harmless. Do NOT delay for elevated COHgb — treat CN simultaneously with O₂.\nPEDS: 70 mg/kg IV/IO over 15 min (Max 5 g).',
      },
    ],
    packaging: 'CyanoKit: 5 g lyophilized powder — reconstitute with 200 mL NS',
  },

  {
    name: 'Amyl Nitrite',
    drugClass: 'reversal',
    synonyms: ['amyl nitrite'],
    doses: [
      {
        indication: 'Cyanide Poisoning (older antidote kit — hydroxocobalamin preferred)',
        dose: '1 ampule (0.3 mL) — inhale for 30 sec of every minute',
        route: 'Inhaled',
        notes: 'Forms methemoglobin to sequester cyanide. Do NOT use if CO poisoning is present (already reduced O₂-carrying capacity).\nPEDS: Same as adult.',
      },
    ],
    packaging: '0.3 mL crushable ampules',
  },

  {
    name: 'Sodium Nitrite',
    drugClass: 'reversal',
    synonyms: ['sodium nitrite'],
    doses: [
      {
        indication: 'Cyanide Poisoning (cyanide antidote kit)',
        dose: '300 mg (10 mL of 3% solution) IV over 5 min',
        route: 'IV',
        notes: 'Creates methemoglobin — CN binds preferentially. CAUTION in smoke inhalation (already elevated COHgb). Follow with sodium thiosulfate. Hydroxocobalamin preferred when available.\nPEDS: 0.15–0.33 mL/kg of 3% solution — REQUIRES hemoglobin levels to avoid fatal methemoglobinemia. Specialist guidance.',
      },
    ],
    packaging: '30 mg/mL (3%) — 10 mL (300 mg) vial',
  },

  {
    name: 'Sodium Thiosulfate',
    drugClass: 'reversal',
    synonyms: ['sodium thiosulfate'],
    doses: [
      {
        indication: 'Cyanide Poisoning (follows sodium nitrite)',
        dose: '12.5 g (50 mL of 25% solution) IV over 10 min',
        route: 'IV',
        notes: 'Converts CN-methemoglobin complex to thiocyanate (renally excreted). Safe even if CN exposure uncertain.\nPEDS: 1.65 mL/kg of 25% solution IV (Max 12.5 g).',
      },
    ],
    packaging: '250 mg/mL (25%) — 50 mL (12.5 g) vials',
  },

  {
    name: 'Methylene Blue',
    drugClass: 'reversal',
    synonyms: ['methylene blue'],
    doses: [
      {
        indication: 'Symptomatic Methemoglobinemia',
        dose: '1–2 mg/kg (1% solution) IV over 5 min',
        route: 'IV',
        notes: 'SpO₂ unreliable in methemoglobinemia — use co-oximetry. CONTRAINDICATED in G6PD deficiency (causes hemolytic anemia). Repeat 1 mg/kg in 1h if no response.\nPEDS: 1–2 mg/kg IV over 5 min (same as adult).',
      },
    ],
    packaging: '10 mg/mL (1%) — 10 mL (100 mg) vials',
  },

  {
    name: 'Pralidoxime (2-PAM)',
    drugClass: 'reversal',
    synonyms: ['pralidoxime', '2-pam'],
    doses: [
      {
        indication: 'Organophosphate / Nerve Agent Poisoning',
        dose: '1–2 g IV over 15–30 min',
        route: 'IV/IM infusion',
        notes: 'Reactivates acetylcholinesterase — must give EARLY before enzyme "aging." Administer alongside atropine. Often given via DuoDote in mass-casualty setting.\nPEDS: 20–50 mg/kg IV/IM (Max 2 g).',
      },
    ],
    packaging: '1 g lyophilized vial — reconstitute with 20 mL sterile water → 50 mg/mL',
  },

  {
    name: 'Atropine + Pralidoxime (DuoDote)',
    drugClass: 'reversal',
    synonyms: ['duodote', 'atropine pralidoxime', 'auto-injector antidote'],
    doses: [
      {
        indication: 'Nerve Agent / Organophosphate Exposure (auto-injector)',
        dose: '1–3 auto-injectors IM based on severity',
        route: 'IM — outer thigh, through clothing',
        notes: 'Each injector = Atropine 2.1 mg + Pralidoxime 600 mg. Mild symptoms: 1 injector. Severe/incapacitated: 3 injectors rapidly. Monitor atropinization (dry secretions), not HR.\nPEDS: Weight-based — typically 1 injector if >30 kg.',
      },
    ],
    packaging: 'DuoDote Auto-Injector: 2.1 mg atropine + 600 mg pralidoxime per unit',
  },

  // ═══════════════════════════════════════════════════════════
  // GI / ANTI-EMETICS / NON-OPIOID ANALGESICS
  // ═══════════════════════════════════════════════════════════

  {
    name: 'Ondansetron',
    drugClass: 'gi',
    synonyms: ['ondansetron', 'zofran'],
    doses: [
      {
        indication: 'Nausea / Vomiting',
        dose: '4–8 mg IV/IM/PO/ODT',
        route: 'IV over 2–5 min / IM / ODT',
        notes: 'Repeat × 1 after 15 min PRN. QT prolongation risk — avoid if QTc >500ms or concurrent QT-prolonging drugs.\nPEDS: 0.15 mg/kg IV/PO (Max 4 mg).',
      },
    ],
    packaging: '2 mg/mL — 2 mL (4 mg) vials; 4 mg ODT tablet',
  },

  {
    name: 'Prochlorperazine',
    drugClass: 'gi',
    synonyms: ['prochlorperazine', 'compazine'],
    doses: [
      {
        indication: 'Severe Nausea / Vomiting / Migraine Headache',
        dose: 'IV: 2.5–10 mg slow push  ·  IM: 5–10 mg',
        route: 'IV / IM',
        notes: 'Extrapyramidal reactions (akathisia, dystonia) — diphenhydramine 25 mg IV for prophylaxis or treatment. May cause orthostatic hypotension.\nPEDS: 0.13 mg/kg IV/IM (Not recommended <2 yr).',
      },
    ],
    packaging: '5 mg/mL — 2 mL (10 mg) vials',
  },

  {
    name: 'Diphenhydramine',
    drugClass: 'gi',
    synonyms: ['diphenhydramine', 'benadryl'],
    doses: [
      {
        indication: 'Allergic Reaction Adjunct / Dystonic Reaction (EPS)',
        dose: '25–50 mg IV/IM/PO',
        route: 'IV / IM / PO',
        notes: 'For anaphylaxis: adjunct to epinephrine — not primary treatment. For acute dystonia: first-line, dramatic response within minutes. Sedation expected.\nPEDS: 1 mg/kg IV/IM/PO (Max 50 mg).',
      },
    ],
    packaging: '50 mg/mL — 1 mL (50 mg) vials',
  },

  {
    name: 'Acetaminophen',
    drugClass: 'gi',
    synonyms: ['acetaminophen', 'tylenol', 'apap'],
    doses: [
      {
        indication: 'Mild–Moderate Pain / Fever',
        dose: '650–1,000 mg PO or IV q4–6h (Max 4 g/day)',
        route: 'PO or IV over 15 min',
        notes: 'Reduce max to 3 g/day in hepatic disease or heavy alcohol use. IV (Ofirmev) increasingly available pre-hospital — effective opioid-sparing adjunct.\nPEDS: 15 mg/kg PO/IV/PR q4–6h (Max 75 mg/kg/day).',
      },
    ],
    packaging: 'PO: 325 mg or 500 mg tablets\nIV: Ofirmev 10 mg/mL — 100 mL (1 g) bags',
  },

  {
    name: 'Ibuprofen',
    drugClass: 'gi',
    synonyms: ['ibuprofen', 'motrin'],
    doses: [
      {
        indication: 'Mild–Moderate Pain / Fever / Anti-Inflammatory',
        dose: '400–800 mg PO q6–8h',
        route: 'PO with food',
        notes: 'NSAID — avoid in renal impairment, GI bleed, dehydration, anticoagulation, third trimester pregnancy.\nPEDS: 10 mg/kg PO q6–8h.',
      },
    ],
    packaging: '200 mg or 400 mg tablets (PO only in most EMS systems)',
  },

  {
    name: 'Activated Charcoal',
    drugClass: 'gi',
    synonyms: ['activated charcoal', 'charcoal', 'ac charcoal', 'actidose', 'charcoal slurry',
               '50g charcoal', '25g charcoal', 'give charcoal', 'administer charcoal'],
    doses: [
      {
        indication: 'Oral Toxic Ingestion (within 1 hr, conscious, intact gag)',
        dose: '1–2 g/kg PO (typically 50–100 g adult)',
        route: 'PO or NG',
        notes: 'CONTRAINDICATED: caustics, hydrocarbons, alcohols, unconscious/seizing, absent gag, GI obstruction. Partner must verbally confirm airway protective reflexes before administering.\nPEDS: 1–2 g/kg PO (10–25 g for <1 yr; 25–50 g for 1–12 yr).',
      },
    ],
    packaging: '25 g or 50 g premixed aqueous suspension',
  },

  // ═══════════════════════════════════════════════════════════
  // OB / SPECIALTY
  // ═══════════════════════════════════════════════════════════

  {
    name: 'Oxytocin',
    drugClass: 'gi',
    synonyms: ['oxytocin', 'pitocin'],
    doses: [
      {
        indication: 'Postpartum Hemorrhage (PPH)',
        dose: 'IV Drip: 10–40 units in 1,000 mL NS — titrate to uterine response\nIM: 10 units (no IV available)',
        route: 'IV infusion or IM',
        notes: 'IV BOLUS NOT recommended — risk of hypotension/cardiac arrest. IM onset 3–5 min. Uterine massage simultaneously. Contact OLMC if refractory PPH.\nPEDS: Not indicated.',
      },
    ],
    packaging: '10 units/mL — 1 mL (10 units) or larger vials',
  },

  {
    name: 'Tranexamic Acid (TXA)',
    drugClass: 'reversal',
    synonyms: ['txa', 'tranexamic acid', 'tranexamic'],
    doses: [
      {
        indication: 'Traumatic Hemorrhage (within 3 hrs of injury)',
        dose: '1 g IV over 10 min (loading)',
        route: 'IV infusion',
        notes: 'Maintenance: 1 g IV over 8h (if available/transport time allows). MUST be given within 3 hours of injury — mortality benefit disappears and may increase mortality if given after 3h. Antifibrinolytic — preserves clot integrity. Safe in TBI with hemorrhage.',
      },
      {
        indication: 'Postpartum Hemorrhage',
        dose: '1 g IV over 10 min',
        route: 'IV infusion',
        notes: 'May repeat once within 30 min if hemorrhage continues. Administer as soon as PPH diagnosed — benefit decreases with delay. Safe with oxytocin. PEDS: 15 mg/kg IV (Max 1 g) loading dose.',
      },
    ],
    packaging: '100 mg/mL — 10 mL (1 g) vials; dilute in 100 mL NS for infusion',
  },

];

/**
 * Look up a drug card by matched synonym (lowercase string from roll.matched_drug).
 * Returns the matching DRUG_CARDS entry or null.
 */
function lookupDrug(matchedKey) {
  if (!matchedKey) return null;
  const key = matchedKey.toLowerCase().trim();
  return DRUG_CARDS.find(card =>
    card.synonyms.some(s => s.toLowerCase() === key)
  ) || null;
}
