'use strict';
const { FLUID_MEDICATIONS, BLOOD_PRODUCT_MEDICATIONS } = require('../../public/medication-aliases');
const { bestAccess } = require('./vascular-access');

// Explicit administration and animation defaults are separate metadata.
// Artwork defaults do not prescribe routes. Glucagon has an IM administration
// default by simulator policy; explicit route choices always take precedence.
function medicationClause(text, start, length) {
  // Keep the route with its own order. Decimal dose points are not boundaries.
  const boundary = /[;!?,\n]|\.(?!\d)(?![a-z]\.)|\b(?:and|then|also|but)\b/gi;
  let left = 0, right = text.length;
  for (const m of text.matchAll(boundary)) {
    if (m.index + m[0].length <= start) left = m.index + m[0].length;
    else if (m.index >= start + length) { right = m.index; break; }
  }
  return { clause: text.slice(left, right), left };
}

function medicationRouteInfoAt(text, start, length) {
  // Normalize dotted route abbreviations without moving the matched drug span.
  text = text.replace(/\b(?:p\.o\.|i\.[nmvo]\.)/gi, value =>
    value.replace(/\./g, '').toUpperCase().padEnd(value.length));
  const { clause, left } = medicationClause(text, start, length);
  const routes = new Set();
  let explicit = false;
  const patterns = [
    ['PO', /\b(?:orally|oral|by\s+mouth|per\s+os|po|swallow(?:ed|ing)?|chew(?:ed|ing|able)?)\b/gi],
    ['IN', /\b(?:intranasal(?:ly)?|intra-nasal(?:ly)?|nasally|MAD(?:\s+(?:device|atomizer))?|(?:into|in|via)\s+(?:(?:the|each|both|left|right)\s+)*(?:nostrils?|nares))\b/gi],
    ['IM', /\b(?:intramuscular(?:ly)?|intra-muscular(?:ly)?|im)\b/gi],
    ['IV', /\b(?:intravenous(?:ly)?|ivp?)\b/gi],
    ['IO', /\b(?:intraosseous|io)\b/gi],
    ['SL', /\b(?:sublingual(?:ly)?|sl)\b/gi],
    ['BUCCAL', /\bbuccal(?:ly)?\b/gi],
    ['NEB', /\b(?:nebuliz(?:ed|er|ation|ing)|nebulis(?:ed|er|ation|ing)|nebs?|breathing\s+treatment)\b/gi],
    // Other explicit formulations prevent a drug default from overriding them.
    ['OTHER', /\b(?:subcutaneous(?:ly)?|sq|sc|rectal(?:ly)?|topical(?:ly)?|transdermal|paste|patch|inhaler|mdi)\b/gi],
  ];
  for (const [route, pattern] of patterns) {
    for (const m of clause.matchAll(pattern)) {
      const before = clause.slice(0, m.index);
      if (route === 'PO' && /^oral$/i.test(m[0]) && /^\s+(?:airway|intubation|cavity|trauma)\b/i.test(clause.slice(m.index + m[0].length))) continue;
      if (route === 'IN' && /^mad$/i.test(m[0]) && m[0] !== 'MAD' && !/\b(?:via|with|using)\s+(?:an?\s+)?$/i.test(before)) continue;
      explicit = true;
      if (/\b(?:not|no|avoid|rather\s+than|instead\s+of)\s*$/i.test(before)) continue;
      routes.add(route);
    }
  }
  // "IN" is a route acronym; plain "in the ambulance" is not. Lower-case
  // shorthand is accepted at the end of an order ("naloxone 2 mg in").
  for (const m of clause.matchAll(/\bIN\b|\bin(?=\s*$)/g)) {
    const after = clause.slice(m.index + m[0].length);
    if (m.index >= start - left + length && !/^\s*(?:(?:now|please|route)\s*)?$/i.test(after)
        && !/^\s+or\s+(?:PO|IN|IM|IV|IO|intranasal|intramuscular)\b/i.test(after)) continue;
    if (/^\s+(?:the|an?|minutes?\b|seconds?\b)/i.test(after)) continue;
    explicit = true;
    if (/\b(?:not|no|avoid|rather\s+than|instead\s+of)\s*$/i.test(clause.slice(0, m.index))) continue;
    routes.add('IN');
  }
  if (/\b(?:drip|infusion)\b/i.test(clause)) explicit = true;
  return { route: routes.size === 1 && !routes.has('OTHER') ? [...routes][0] : null, explicit,
    vascularRequired: [...routes].some(route => ['IV', 'IO'].includes(route))
      || (!routes.size && /\b(?:ivp?|io|intravenous|intraosseous|drip|infusion)\b/i.test(clause)) };
}

function medicationRouteAt(text, start, length) {
  return medicationRouteInfoAt(text, start, length).route;
}

const MEDICATION_ANIMATION_DEFAULTS = new Map([
  ['Nitroglycerin', 'PO'], ['Aspirin', 'PO'], ['Naloxone', 'IN'],
  ['Oral Glucose', 'PO'], ['Activated Charcoal', 'PO'], ['Acetaminophen', 'PO'],
  ['Albuterol / DuoNeb', 'NEB'], ['Levalbuterol', 'NEB'],
  ['Midazolam', 'IM'], ['Haloperidol', 'IM'], ['Ketamine', 'IM'],
  ['B52', 'IM'], ['Glucagon', 'IM'],
  ['Olanzapine', 'PO'], ['Risperidone', 'PO'], ['Quetiapine', 'PO'],
  ['Buprenorphine', 'SL'], ['Buprenorphine / Naloxone', 'SL'],
]);

function medicationPresentationAt(text, start, length, medication, matchedKey) {
  const { route, explicit, vascularRequired } = medicationRouteInfoAt(text, start, length);
  const formulationDefault = /^(?:racemic epi|racemic epinephrine)$/i.test(matchedKey || '') ? 'NEB' : null;
  const { clause } = medicationClause(text, start, length);
  const site = clause.match(/\b(left|right)\s+(?:forearm|hand|arm|leg|thigh|tibia|humerus)\b/i);
  return {
    medication_name: medication || null,
    medication_kind: BLOOD_PRODUCT_MEDICATIONS.has(medication) ? 'blood' : FLUID_MEDICATIONS.has(medication) ? 'fluid' : null,
    administration_route: !explicit && medication === 'Glucagon' ? 'IM' : route,
    medication_route_explicit: explicit,
    ...(vascularRequired && !route ? { vascular_required: true } : {}),
    medication_animation_route: explicit ? route
      : formulationDefault || MEDICATION_ANIMATION_DEFAULTS.get(medication) || null,
    ...(site ? { access_target: site[0].toLowerCase().replace(/forearm|hand|humerus/, 'arm').replace(/thigh|tibia/, 'leg') } : {}),
  };
}

// Presentation only: explicit routes/formulations and nonvascular defaults win.
// Use the same patent-before-marginal ranking as the access-state narration.
function applyAccessAnimationRoutes(rolls, access) {
  for (const roll of rolls) {
    if (roll.procedure_id !== 'medication_push' || roll.administration_route
        || roll.medication_animation_route || roll.medication_route_explicit) continue;
    if (roll.access_route) { roll.medication_animation_route = roll.access_route; continue; }
    const best = bestAccess(access || [], /^patient_\d+$/.test(roll.patient) ? roll.patient : 'patient_1', null, roll.access_target);
    if (best) roll.medication_animation_route = roll.access_route || best.kind;
  }
}

module.exports = { medicationRouteAt, medicationPresentationAt, applyAccessAnimationRoutes };
