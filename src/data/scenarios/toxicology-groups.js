'use strict';

// Explicit families, not an automatic text-similarity classifier. These affect
// natural draws only: every variant keeps its own case ID, history and case key.
const TOXICOLOGY_GROUP_LABELS = {
  eye_exposure: 'Chemical eye exposure',
  chemical_skin: 'Chemical skin exposure',
  irritant_fumes: 'Irritant gas / cleaner fumes',
  hydrocarbon_ingestion: 'Fuel ingestion / aspiration',
  toxic_alcohol: 'Toxic alcohol ingestion',
  solvent_inhalation: 'Inhalant / solvent poisoning',
  lead_exposure: 'Lead exposure',
  caustic_ingestion: 'Caustic ingestion',
  carbon_monoxide: 'Carbon monoxide exposure',
  opioids: 'Opioid exposure / reversal',
  ibuprofen: 'Ibuprofen overdose',
  ethanol: 'Alcohol intoxication',
  stimulants: 'Stimulant ingestion / overdose',
  serotonergic: 'Serotonergic toxicity',
  toxic_plants: 'Toxic plant / mushroom ingestion',
  cholinergic: 'Organophosphate / carbamate exposure',
  insulin: 'Insulin overdose',
  chemical_irritants: 'Tear gas / pepper spray',
  frequent_caller_toxicology: 'Frequent caller with disputed ingestion',
};

function toxicologyGroup(entry) {
  const exposure = entry.chemical_exposure;
  if (exposure?.route === 'ocular') return 'eye_exposure';
  if (exposure?.route === 'dermal') return 'chemical_skin';
  if (['intentional_inhalant', 'solvent_inhalation'].includes(exposure?.id)) return 'solvent_inhalation';
  if (['bleach_acid_fumes', 'bleach_ammonia_fumes', 'ammonia_fumes'].includes(exposure?.id)) return 'irritant_fumes';
  if (['gasoline_aspiration', 'kerosene_child'].includes(exposure?.id)) return 'hydrocarbon_ingestion';
  if (exposure?.id === 'methanol_ingestion') return 'toxic_alcohol';
  if (['lead_worker', 'lead_child'].includes(exposure?.id)) return 'lead_exposure';
  if (exposure?.id === 'acid_ingestion') return 'caustic_ingestion';
  if (entry.scene_challenge === 'occult_co_arrest') return 'carbon_monoxide';
  if (entry.frequent_caller?.pair_id === 'frequent-caller-toxicology') return 'frequent_caller_toxicology';
  const title = entry.presentation || '';
  const families = [
    ['Carbon monoxide poisoning', 'carbon_monoxide'],
    ['Prescription opioid overdose', 'opioids'], ['Illicit opioid overdose', 'opioids'], ['Opioid overdose reversed', 'opioids'],
    ['Ibuprofen overdose', 'ibuprofen'],
    ['Alcohol intoxication', 'ethanol'], ['Severe alcohol intoxication', 'ethanol'],
    ['Stimulant overdose', 'stimulants'], ['Police request EMS assessment of a man in the patrol car', 'stimulants'],
    ['SSRI overdose', 'serotonergic'], ['Serotonin syndrome', 'serotonergic'],
    ['Pediatric toxic ingestion', 'toxic_plants'],
    ['Nerve agent exposure', 'cholinergic'], ['Insulin overdose', 'insulin'],
    ['Tear gas exposure', 'chemical_irritants'],
    ['Hydrofluoric acid exposure', 'chemical_skin'],
    ['Chlorine gas exposure', 'irritant_fumes'],
    ['Ethylene glycol ingestion', 'toxic_alcohol'],
    ['Caustic ingestion', 'caustic_ingestion'],
  ];
  return families.find(([prefix]) => title.startsWith(prefix))?.[1] || null;
}

function applyToxicologyGroups(entries) {
  for (const entry of entries) {
    const group = toxicologyGroup(entry);
    if (group) entry.selection_group = group;
  }
}

module.exports = { TOXICOLOGY_GROUP_LABELS, applyToxicologyGroups };
