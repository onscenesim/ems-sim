/* Shared by the settings UI and server. These are simulator presets, not legal scopes. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EMSProtocols = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // id, label, default, California skill restriction, International resource restriction
  const ALS = [
    ['intubation', 'Intubation (any technique)', true, true, false],
    ['rsi', 'RSI (paralytics)', false, true, true],
    ['medication_intubation', 'Medication facilitated intubation (without paralytics)', true, true, false],
    ['cricothyrotomy', 'Cricothyrotomy (surgical or needle)', true, true, false],
    ['finger_thoracostomy', 'Finger thoracostomy', false, true, false],
    ['blood', 'Blood administration', false, true, true],
    ['procedural_sedation', 'Procedural sedation', true, true, false],
    ['post_intubation_sedation', 'Post intubation sedation', true, true, false],
    ['agitation_sedation', 'Sedation of agitated patients', true, true, false],
    ['ketamine', 'Ketamine', true, true, false],
    ['norepinephrine', 'Levophed / norepinephrine (pressor)', false, true, true],
    ['epinephrine_pressor', 'Epinephrine (pressor, not cardiac arrest doses)', true, true, true],
    ['lucas', 'LUCAS / mechanical CPR device', true, false, true],
    ['ventilator', 'Transport ventilator', false, true, true],
    ['bipap', 'BiPAP (separate from CPAP)', false, true, true],
  ];
  const BLS = [
    ['iv_fluids', 'Start IVs and give crystalloid fluids', false, true, true],
    ['ecg_transmit', 'Obtain and transmit a 12-lead ECG', false, true, true],
    ['sga_arrest', 'Supraglottic airway in cardiac arrest', true, true, true],
    ['sga_alive', 'Supraglottic airway with a pulse', false, true, true],
    ['glucose_check', 'Blood glucose measurement', true, true, true],
    ['cpap', 'CPAP', true, true, true],
    ['albuterol', 'Albuterol (nebulizer or MDI)', true, true, true],
    ['epinephrine_autoinjector', 'Epinephrine auto-injector for anaphylaxis', true, true, true],
    ['naloxone', 'Naloxone (intranasal or intramuscular)', true, true, true],
    ['nitroglycerin_assist', 'Assist with prescribed nitroglycerin', true, true, true],
  ];
  function catalog(level) {
    return (level === 'BLS' ? BLS : ALS).map(([id, label, enabled, california, international]) => ({ id, label, enabled, california, international }));
  }
  function lockReason(item, region) {
    if (region === 'CALIFORNIA_Urban' && item.california) return 'Locked off: California skill preset';
    if (region === 'INTERNATIONAL_DEVELOPING' && item.international) return 'Locked off: International resource preset';
    return '';
  }
  function resolve(level, region, preferences = {}) {
    const input = preferences && typeof preferences === 'object' && !Array.isArray(preferences) ? preferences : {};
    const values = Object.fromEntries(catalog(level).map(item => [item.id,
      !lockReason(item, region) && (typeof input[item.id] === 'boolean' ? input[item.id] : item.enabled)]));
    if (level !== 'BLS' && !values.intubation) {
      values.rsi = false;
      values.medication_intubation = false;
    }
    return values;
  }
  function describe(seed) {
    const values = resolve(seed.provider_level, seed.region, seed.protocols);
    const items = catalog(seed.provider_level);
    return [
      '--- RUN PROTOCOL CHECKLIST (debrief eligibility, not an action gate) ---',
      `Selected / in protocols: ${items.filter(item => values[item.id]).map(item => item.label).join('; ') || 'none of the optional items'}.`,
      `Crossed off / excluded from omission criticism: ${items.filter(item => !values[item.id]).map(item => item.label).join('; ') || 'none'}.`,
      'This run snapshot is authoritative over region stereotypes and generic provider-level assumptions for the listed items. Region locks are simulator presets, not statements about real-world laws. Unlisted care retains the baseline provider level.',
      'Never criticize omission of a crossed-off item, even when a case hint recommends it. Assess available alternatives, basic care and appropriate escalation instead. Selecting an item only makes it eligible for ordinary clinical review when the revealed findings indicate it; it is never a requirement to use every option.',
      'No separate scope score, automatic failure, extra weighting, or repeated deductions across sections. Mention a relevant protocol issue once, proportionate to its actual clinical consequence. If a crossed-off action was performed, assess clinical safety normally; do not automatically fail or punish merely crossing the checklist boundary.',
      'These settings never block a player action, remove its supplies, cancel its roll, or make a crew member refuse it solely for protocol reasons. They do not override real contraindications, physiology, access patency, or procedural dice results.',
      'Distinguish epinephrine pressor use from arrest epinephrine and anaphylaxis auto-injectors; BiPAP from CPAP; paralytic RSI from medication facilitated intubation; and BLS SGA during arrest from SGA with a pulse. Drug permission does not imply permission for every use (ketamine and each sedation indication are separate). Post intubation sedation can apply to an already-intubated patient even if intubation is excluded.',
    ].join('\n');
  }
  return { catalog, lockReason, resolve, describe };
});
