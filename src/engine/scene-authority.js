'use strict';

const { MEDICATION_ALIASES } = require('../../public/medication-aliases');

const DEPARTURE_NARRATION = /\b(?:ambulance|rig|unit|truck)\b[^.!?\n]{0,30}\b(?:pulls? away|pulled away|pulls? out|rolls? out|begins? (?:the )?(?:drive|transport))\b|\bwheels (?:are )?(?:now )?rolling\b|\b(?:en[ -]?route|heading|departing|transporting) (?:to|for|toward) (?:the )?(?:hospital|er|ed|major|nearest|trauma center)\b/i;
const NEGATIVE = /\b(?:no|not|never|cannot|can't|unable|unavailable|unusable|held|withheld|hold|deferred|pending|without|unadministered|unperformed|declin\w*|refus\w*)\b/i;
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function sceneAuthorityIssues(reply, { departureAllowed, loadingAllowed, destination, routeChangeAllowed, suppressed = [], access = [], rolls = [] }) {
  const issues = [];
  const prose = reply.replace(/\[[^\]]*\]/g, '');
  if (!departureAllowed && (/\[EN_ROUTE\b/i.test(reply)
      || prose.split(/[.!?\n]/).some(sentence => DEPARTURE_NARRATION.test(sentence) && !NEGATIVE.test(sentence)))) {
    issues.push('No departure was ordered. Keep the ambulance parked; do not emit EN_ROUTE or narrate departure.');
  }
  if (!loadingAllowed && /\[LOADING\]/i.test(reply)) issues.push('No patient-loading order occurred. Do not emit LOADING or load the patient.');
  const route = reply.match(/\[EN_ROUTE:\s*(nearest|major)\]/i)?.[1].toLowerCase();
  if (destination && route && route !== destination && !routeChangeAllowed) {
    issues.push(`No reroute was ordered. Retain destination=${destination}; do not narrate or tag a different destination.`);
  }
  for (const held of suppressed.filter(item => item.vascular)) {
    const aliases = [held.medication_name, held.matchedKey, ...(MEDICATION_ALIASES[held.medication_name] || [])].filter(Boolean);
    const medication = new RegExp(`\\b(?:${aliases.map(escape).join('|')})\\b`, 'i');
    for (const sentence of prose.split(/[.!?\n]/)) {
      if ((medication.test(sentence) || /\b(?:medication|fluids?|bolus|infusion)\b[^.!?]{0,35}\b(?:given|administered|delivered|running|flows?|improv\w*|respond\w*)\b/i.test(sentence)) && !NEGATIVE.test(sentence)) {
        issues.push(`${held.reason} Acknowledge the held order; do not narrate its administration or a treatment response.`);
        break;
      }
    }
  }
  const placed = rolls.some(roll => ['peripheral_iv', 'io_access'].includes(roll.procedure_id)
    && ['SUCCESS', 'MARGINAL'].includes(roll.outcome));
  if (!placed && !access.some(line => ['patent', 'marginal'].includes(line.status))) {
    if (prose.split(/[.!?\n]/).some(sentence => !NEGATIVE.test(sentence)
      && /\b(?:iv|io|line|catheter)\b[^.!?]{0,35}\b(?:patent|flushes|established|placed|seated|secured|working)\b/i.test(sentence))) {
      issues.push('No usable vascular access exists. Do not invent a placed, patent or functioning line.');
    }
  }
  return [...new Set(issues)];
}

module.exports = { sceneAuthorityIssues };
