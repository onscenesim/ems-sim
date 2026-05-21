'use strict';

/**
 * EMS Medication Reference
 * Triggered when a medication_push dice roll fires.
 * Doses reflect ACLS/AHA guidelines — always follow your local protocol.
 *
 * Each entry:
 *   name        — display name
 *   synonyms    — matched against roll.matched_drug (lowercase)
 *   doses[]     — { indication, dose, route, notes? }
 *   packaging?  — how it comes in the drug box
 */
const DRUG_CARDS = [

  // ── Epinephrine ────────────────────────────────────────────────────────
  {
    name: 'Epinephrine',
    drugClass: 'cardiac',
    synonyms: [
      'epinephrine', '1mg epinephrine', 'give epi', 'push the epi',
      'push dose epi', 'push dose epinephrine', 'epinephrine drip', 'epipen', 'racemic epi', 'racemic epinephrine',
      'epi drip', 'epi infusion',
    ],
    doses: [
      {
        indication: 'Cardiac arrest (VF / pVT / PEA / Asystole)',
        dose: '1 mg',
        route: 'IV/IO',
        notes: 'q3–5 min. Use 1:10,000 (0.1 mg/mL). Pediatric: 0.01 mg/kg IV/IO (max 1 mg).',
      },
      {
        indication: 'Anaphylaxis / severe allergic reaction',
        dose: '0.3 mg adult  |  0.15 mg peds (<30 kg)',
        route: 'IM — lateral thigh',
        notes: 'Use 1:1,000 (1 mg/mL). EpiPen / draw up. Repeat q5–15 min PRN. Do NOT give IV 1:1,000.',
      },
      {
        indication: 'Push-dose epi — peri-intubation / post-ROSC hypotension',
        dose: '10–20 mcg per push',
        route: 'IV slow push — q2–5 min PRN',
        notes: 'DILUTION METHOD A: Draw 1 mL of 1:10,000 (0.1 mg/mL) → add 9 mL NS → 10 mcg/mL. Give 1–2 mL per dose.\nDILUTION METHOD B: Draw 0.1 mL of 1:1,000 (1 mg/mL) → add 9.9 mL NS → 10 mcg/mL. Give 1–2 mL per dose.\nTitrate to effect. Onset ~1 min IV.',
      },
      {
        indication: 'Epinephrine infusion (refractory shock)',
        dose: '0.1–0.5 mcg/kg/min',
        route: 'IV infusion',
        notes: 'Mix: 1 mg in 250 mL NS → 4 mcg/mL. Titrate to MAP >65. Use when dopamine/norepi failing.',
      },
      {
        indication: 'Racemic epinephrine — croup / upper airway edema',
        dose: '0.5 mL of 2.25% solution in 3 mL NS',
        route: 'Nebulized',
        notes: 'Rebound effect possible — observe ≥2h post-treatment. Also used for post-extubation stridor and anaphylaxis with stridor.',
      },
      {
        indication: 'Severe asthma / bronchospasm (if neb albuterol inadequate)',
        dose: '0.3 mg',
        route: 'IM — lateral thigh',
        notes: '1:1,000 (1 mg/mL). Reserve for impending respiratory failure.',
      },
    ],
    packaging: '1 mg/mL (1:1,000 amp) — IM / racemic use\n0.1 mg/mL (1:10,000 syringe) — cardiac arrest\nRacemic: 2.25% solution (S&S Healthcare)',
  },

  // ── Amiodarone ────────────────────────────────────────────────────────
  {
    name: 'Amiodarone',
    drugClass: 'cardiac',
    synonyms: ['amiodarone', 'amio', 'give amiodarone', '300mg amiodarone'],
    doses: [
      { indication: 'Cardiac arrest (VF/pVT)', dose: '300 mg', route: 'IV/IO bolus', notes: '2nd dose 150 mg if refractory' },
      { indication: 'Stable VT (with pulse)', dose: '150 mg', route: 'IV over 10 min', notes: 'Followed by 1 mg/min drip x6h' },
    ],
    packaging: '50 mg/mL — draw 6 mL for 300 mg arrest dose',
  },

  // ── Adenosine ────────────────────────────────────────────────────────
  {
    name: 'Adenosine',
    drugClass: 'cardiac',
    synonyms: ['adenosine', '6mg adenosine'],
    doses: [
      { indication: 'SVT (narrow complex, regular)', dose: '6 mg rapid IVP', route: 'IV — antecubital or above', notes: '2nd dose 12 mg; flush immediately with 20 mL NS; must be fast push' },
    ],
    packaging: '3 mg/mL — 2 mL vial (6 mg)',
  },

  // ── Atropine ────────────────────────────────────────────────────────
  {
    name: 'Atropine',
    drugClass: 'cardiac',
    synonyms: ['atropine', '0.5mg atropine'],
    doses: [
      { indication: 'Symptomatic bradycardia', dose: '0.5 mg', route: 'IV/IO', notes: 'q3–5 min; max 3 mg total' },
      { indication: 'Organophosphate / nerve agent', dose: '2–4 mg', route: 'IV/IO/IM', notes: 'Titrate to secretion control (drying); no max in toxidrome' },
    ],
    packaging: '0.1 mg/mL (0.5 mg/5 mL) or 1 mg/mL vials',
  },

  // ── Dopamine ─────────────────────────────────────────────────────────
  {
    name: 'Dopamine',
    drugClass: 'vasopressor',
    synonyms: ['dopamine', 'dopamine drip'],
    doses: [
      {
        indication: 'Symptomatic bradycardia (refractory to atropine)',
        dose: '5–20 mcg/kg/min',
        route: 'IV infusion',
        notes: 'Chronotropic and inotropic. Bridge to pacing. Titrate up q5 min.',
      },
      {
        indication: 'Cardiogenic shock / hypotension',
        dose: '5–15 mcg/kg/min',
        route: 'IV infusion',
        notes: 'Inotropic range. If >10 mcg/kg/min needed, consider adding norepi.',
      },
      {
        indication: 'High-dose vasopressor (last resort)',
        dose: '15–20 mcg/kg/min',
        route: 'IV infusion',
        notes: 'Alpha-dominant vasoconstriction. Increases arrhythmia risk significantly at this range.',
      },
    ],
    packaging: '40 mg/mL — standard mix: 400 mg in 250 mL NS → 1,600 mcg/mL\nAlternate: 200 mg in 250 mL → 800 mcg/mL',
  },

  // ── Norepinephrine (Levophed) ─────────────────────────────────────────
  {
    name: 'Norepinephrine (Levophed)',
    drugClass: 'vasopressor',
    synonyms: ['norepinephrine', 'levophed', 'norepi', 'norepinephrine drip', 'levophed drip', 'norepi drip'],
    doses: [
      {
        indication: 'Septic / distributive shock',
        dose: '0.1–0.5 mcg/kg/min — titrate to MAP >65',
        route: 'IV infusion (central preferred; peripheral acceptable short-term)',
        notes: 'First-line vasopressor for septic shock. Start 0.1–0.2 mcg/kg/min, up-titrate q5–10 min. Potent vasoconstrictor — monitor for limb ischemia on peripheral line.',
      },
      {
        indication: 'Neurogenic shock (spinal cord injury)',
        dose: '0.1–0.3 mcg/kg/min',
        route: 'IV infusion',
        notes: 'Provides both vasopressor and some inotropic effect. Target MAP 85–90 for cord perfusion per many protocols.',
      },
      {
        indication: 'Post-ROSC hypotension',
        dose: '0.1–0.5 mcg/kg/min',
        route: 'IV infusion',
        notes: 'Preferred vasopressor post-cardiac arrest. Avoid dopamine if tachyarrhythmia present.',
      },
    ],
    packaging: '1 mg/mL — standard mix: 4 mg in 250 mL D5W or NS → 16 mcg/mL\nAlternate: 8 mg in 250 mL → 32 mcg/mL (fluid-restricted patient)',
  },

  // ── Phenylephrine ────────────────────────────────────────────────────
  {
    name: 'Phenylephrine',
    drugClass: 'vasopressor',
    synonyms: ['phenylephrine'],
    doses: [
      { indication: 'Hypotension (pure vasoconstriction)', dose: '100–200 mcg bolus', route: 'IV', notes: 'No chronotropy — preferred when tachycardia is present' },
    ],
    packaging: '10 mg/mL — dilute before use',
  },

  // ── Vasopressin ────────────────────────────────────────────────────────
  {
    name: 'Vasopressin',
    drugClass: 'vasopressor',
    synonyms: ['vasopressin'],
    doses: [
      { indication: 'Cardiac arrest (VF/PEA/Asystole)', dose: '40 units', route: 'IV/IO bolus (one-time)', notes: 'May replace 1st or 2nd epi dose per protocol' },
    ],
    packaging: '20 units/mL — 2 mL (40 units)',
  },

  // ── Lidocaine ────────────────────────────────────────────────────────
  {
    name: 'Lidocaine',
    drugClass: 'cardiac',
    synonyms: ['lidocaine'],
    doses: [
      { indication: 'VF/pVT (if amiodarone unavailable)', dose: '1–1.5 mg/kg', route: 'IV/IO', notes: 'Max 3 mg/kg; then 0.5–0.75 mg/kg q5–10 min' },
      { indication: 'Maintenance (post-conversion)', dose: '1–4 mg/min', route: 'IV infusion', notes: '' },
      { indication: 'RSI (laryngospasm / ICP protection)', dose: '1.5 mg/kg', route: 'IV 3 min before intubation', notes: 'Protocol-dependent' },
    ],
    packaging: '10 mg/mL (1%) or 20 mg/mL (2%)',
  },

  // ── Magnesium Sulfate ────────────────────────────────────────────────
  {
    name: 'Magnesium Sulfate',
    drugClass: 'cardiac',
    synonyms: ['magnesium', 'mag sulfate'],
    doses: [
      { indication: 'Torsades de pointes', dose: '1–2 g', route: 'IV over 5–20 min', notes: 'Can push in arrest' },
      { indication: 'Eclampsia / severe pre-eclampsia', dose: '4–6 g loading', route: 'IV over 15–20 min', notes: 'Maintenance 1–2 g/hr; monitor DTRs' },
      { indication: 'Severe asthma (refractory)', dose: '2 g', route: 'IV over 20 min', notes: '' },
    ],
    packaging: '500 mg/mL (50%) — dilute to max 20% for IV use',
  },

  // ── Sodium Bicarbonate ────────────────────────────────────────────────
  {
    name: 'Sodium Bicarbonate',
    drugClass: 'reversal',
    synonyms: ['sodium bicarb'],
    doses: [
      { indication: 'Metabolic acidosis / TCA OD / hyperkalemia', dose: '1 mEq/kg', route: 'IV/IO', notes: 'TCA: titrate to QRS <100ms and hemodynamic stability; push for arrest' },
    ],
    packaging: '1 mEq/mL — 50 mEq (50 mL) prefilled syringe',
  },

  // ── Calcium Chloride ────────────────────────────────────────────────
  {
    name: 'Calcium Chloride',
    drugClass: 'reversal',
    synonyms: ['calcium chloride'],
    doses: [
      { indication: 'Hyperkalemia / calcium-channel blocker OD / hypocalcemia', dose: '500 mg–1 g', route: 'IV slow push over 5–10 min', notes: 'Vesicant — confirm IV patency; causes pain in peripheral line' },
    ],
    packaging: '100 mg/mL (10%) — 10 mL (1 g)',
  },

  // ── Dextrose ────────────────────────────────────────────────────────
  {
    name: 'Dextrose',
    drugClass: 'reversal',
    synonyms: ['dextrose', 'd50', 'd10'],
    doses: [
      { indication: 'Symptomatic hypoglycemia', dose: '25 g (D50) or 10 g (D10)', route: 'IV/IO', notes: 'D10 preferred — less tissue damage if extravasation; repeat BGL in 5 min' },
    ],
    packaging: 'D50: 500 mg/mL (50%) — 50 mL\nD10: 100 mg/mL (10%) — 100 mL',
  },

  // ── Naloxone ────────────────────────────────────────────────────────
  {
    name: 'Naloxone',
    drugClass: 'reversal',
    synonyms: ['naloxone', 'narcan', 'intranasal narcan'],
    doses: [
      { indication: 'Opioid OD (respiratory depression)', dose: '0.4–2 mg', route: 'IV/IO/IM/IN/SQ', notes: 'IN: 4 mg (2 mg per nare); titrate to ventilation — NOT full reversal; repeat q2–3 min PRN' },
    ],
    packaging: '0.4 mg/mL vials; 2 mg/2 mL intranasal device; 4 mg/0.1 mL nasal spray',
  },

  // ── Nitroglycerin ────────────────────────────────────────────────────
  {
    name: 'Nitroglycerin',
    drugClass: 'cardiac',
    synonyms: ['nitroglycerin', 'nitro', 'sl nitro'],
    doses: [
      { indication: 'ACS / chest pain / acute pulmonary edema', dose: '0.4 mg', route: 'SL (tablet or spray)', notes: 'q5 min × 3; hold if SBP <90 or inferior STEMI with RVI suspicion; hold if PDE-5 inhibitor in last 24–48h' },
    ],
    packaging: '0.4 mg tablet or metered spray',
  },

  // ── Aspirin ────────────────────────────────────────────────────────
  {
    name: 'Aspirin',
    drugClass: 'cardiac',
    synonyms: ['aspirin', '324mg aspirin'],
    doses: [
      { indication: 'ACS (STEMI/NSTEMI suspicion)', dose: '324 mg', route: 'PO — chewed', notes: 'Chewing achieves faster absorption than swallowing whole' },
    ],
    packaging: '81 mg baby aspirin × 4, or 325 mg tablet',
  },

  // ── Furosemide ────────────────────────────────────────────────────────
  {
    name: 'Furosemide',
    drugClass: 'cardiac',
    synonyms: ['furosemide', 'lasix'],
    doses: [
      { indication: 'Acute pulmonary edema (CHF exacerbation)', dose: '40–80 mg (or match home dose)', route: 'IV slow push', notes: 'Venodilation precedes diuresis — onset 5–15 min IV' },
    ],
    packaging: '10 mg/mL — 4 mL (40 mg)',
  },

  // ── Morphine ────────────────────────────────────────────────────────
  {
    name: 'Morphine',
    drugClass: 'sedation',
    synonyms: ['morphine'],
    doses: [
      { indication: 'Moderate-severe pain', dose: '2–4 mg', route: 'IV (slow) / IM', notes: 'q5–10 min PRN; monitor for hypotension and respiratory depression' },
    ],
    packaging: '10 mg/mL — titrate from small doses',
  },

  // ── Fentanyl ────────────────────────────────────────────────────────
  {
    name: 'Fentanyl',
    drugClass: 'sedation',
    synonyms: ['fentanyl'],
    doses: [
      { indication: 'Pain management / RSI adjunct', dose: '1–2 mcg/kg', route: 'IV/IM/IN', notes: 'Max 200 mcg single dose; IN: 2 mcg/kg (1 mcg/kg per nare); rapid onset — monitor resp' },
      { indication: 'Procedural sedation', dose: '1–2 mcg/kg', route: 'IV (slow)', notes: 'Often combined with ketamine or midazolam' },
    ],
    packaging: '50 mcg/mL — 2 mL (100 mcg) or 10 mL (500 mcg)',
  },

  // ── Ketamine ────────────────────────────────────────────────────────
  {
    name: 'Ketamine',
    drugClass: 'sedation',
    synonyms: ['ketamine'],
    doses: [
      { indication: 'Dissociative sedation / RSI', dose: '1–2 mg/kg', route: 'IV (over 1 min)', notes: 'Onset <1 min; maintain airway reflexes; dysphoria possible' },
      { indication: 'IM sedation (combative patient)', dose: '4–5 mg/kg', route: 'IM', notes: 'Onset 3–5 min; good for pre-hospital chemical restraint' },
      { indication: 'Sub-dissociative analgesia', dose: '0.1–0.3 mg/kg', route: 'IV (slow push)', notes: 'Effective for pain without full dissociation' },
    ],
    packaging: '500 mg/10 mL (50 mg/mL) or 200 mg/20 mL (10 mg/mL)',
  },

  // ── Midazolam ────────────────────────────────────────────────────────
  {
    name: 'Midazolam',
    drugClass: 'sedation',
    synonyms: ['midazolam', 'versed'],
    doses: [
      { indication: 'Seizures / sedation / RSI adjunct', dose: '0.1 mg/kg (IV) / 0.2 mg/kg (IM/IN)', route: 'IV/IM/IN', notes: 'Max 5 mg single dose; IN: divide between nares; monitor resp' },
    ],
    packaging: '1 mg/mL or 5 mg/mL vials',
  },

  // ── Lorazepam ────────────────────────────────────────────────────────
  {
    name: 'Lorazepam',
    drugClass: 'sedation',
    synonyms: ['ativan', 'benzo'],
    doses: [
      { indication: 'Seizures / anxiety / sedation', dose: '1–2 mg', route: 'IV/IM', notes: 'q5–15 min PRN; monitor respiratory status; slower onset IM vs IV' },
    ],
    packaging: '2 mg/mL or 4 mg/mL',
  },

  // ── Ondansetron ────────────────────────────────────────────────────────
  {
    name: 'Ondansetron',
    drugClass: 'gi',
    synonyms: ['ondansetron', 'zofran'],
    doses: [
      { indication: 'Nausea / vomiting', dose: '4 mg', route: 'IV (over 2–5 min) / IM / ODT', notes: 'May repeat × 1 after 15 min; QT prolongation risk — avoid if QTc >500ms' },
    ],
    packaging: '2 mg/mL — 2 mL (4 mg); 4 mg ODT tablet',
  },

  // ── Albuterol / DuoNeb ───────────────────────────────────────────────
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
        indication: 'Bronchospasm — standard (asthma / COPD)',
        dose: '2.5 mg albuterol in 3 mL NS',
        route: 'Nebulizer — 6–8 L/min O₂',
        notes: 'May repeat q20 min × 3. Back-to-back or continuous for severe attacks.',
      },
      {
        indication: 'DuoNeb — moderate to severe bronchospasm',
        dose: 'Albuterol 2.5 mg + Ipratropium 0.5 mg',
        route: 'Nebulizer',
        notes: 'Combo unit-dose vial — albuterol for immediate bronchodilation, ipratropium (anticholinergic) for sustained effect. Preferred for COPD exacerbation.',
      },
      {
        indication: 'Continuous nebulization — severe / near-fatal asthma',
        dose: '10–20 mg/hr (4–8 vials/hr)',
        route: 'Continuous nebulizer',
        notes: 'Use in-line with BVM or CPAP if needed. Silent chest = near-complete obstruction — consider epi IM if continuous neb not breaking it.',
      },
      {
        indication: 'MDI (metered-dose inhaler)',
        dose: '4–8 puffs',
        route: 'MDI with spacer',
        notes: 'Each puff = 90 mcg. Spacer is required for effective delivery.',
      },
    ],
    packaging: 'Albuterol: 0.083% (2.5 mg/3 mL) unit-dose vials\nDuoNeb: albuterol 2.5 mg + ipratropium 0.5 mg/3 mL unit-dose\nMDI: 90 mcg/actuation',
  },

  // ── Glucagon ────────────────────────────────────────────────────────
  {
    name: 'Glucagon',
    drugClass: 'reversal',
    synonyms: ['glucagon', 'im glucagon'],
    doses: [
      { indication: 'Hypoglycemia (no IV access)', dose: '1 mg', route: 'IM / SQ', notes: 'Onset 5–15 min; may not work in chronic alcoholism or starvation (depleted glycogen stores)' },
      { indication: 'Beta-blocker OD', dose: '3–5 mg IV bolus', route: 'IV', notes: 'Then 1–5 mg/hr infusion; causes vomiting — have airway ready' },
    ],
    packaging: '1 mg lyophilized powder — reconstitute with provided diluent',
  },

  // ── Oral Glucose ────────────────────────────────────────────────────
  {
    name: 'Oral Glucose',
    drugClass: 'reversal',
    synonyms: ['oral glucose'],
    doses: [
      { indication: 'Mild-moderate hypoglycemia (conscious, intact gag)', dose: '15–24 g', route: 'PO', notes: 'Instaglucose gel (15g tube); recheck BGL in 15 min; must be able to swallow' },
    ],
    packaging: '15 g glucose gel tube',
  },

  // ── Thiamine ────────────────────────────────────────────────────────
  {
    name: 'Thiamine (B1)',
    drugClass: 'reversal',
    synonyms: ['thiamine'],
    doses: [
      { indication: 'Wernicke encephalopathy prophylaxis / suspected thiamine deficiency', dose: '100 mg', route: 'IV/IM', notes: 'Give BEFORE dextrose in malnourished / alcoholic patients to prevent precipitating Wernicke encephalopathy' },
    ],
    packaging: '100 mg/mL — 1 mL vial',
  },

  // ── Activated Charcoal ────────────────────────────────────────────────
  {
    name: 'Activated Charcoal',
    drugClass: 'gi',
    synonyms: ['activated charcoal', 'charcoal', 'ac charcoal', 'actidose', 'charcoal slurry', '50g charcoal', '25g charcoal', 'give charcoal'],
    doses: [
      { indication: 'Oral toxic ingestion (within 2h, conscious, intact gag)', dose: 'Adult: 50 g / Peds: 1 g/kg (max 50 g)', route: 'PO', notes: 'CONTRAINDICATED: caustics, hydrocarbons, alcohols, unconscious/seizing, absent gag — partner must verbally confirm before administering' },
    ],
    packaging: '25 g or 50 g premixed aqueous suspension',
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
