'use strict';

// Presentation metadata only: never infer a route from a drug's usual use,
// and never change the administration roll or clinical appropriateness.
function medicationRouteAt(text, start, length) {
  // Normalize dotted route abbreviations without moving the matched drug span.
  text = text.replace(/\b(?:p\.o\.|i\.[nmvo]\.)/gi, value =>
    value.replace(/\./g, '').toUpperCase().padEnd(value.length));
  // Keep the route with its own order. Decimal dose points are not boundaries.
  const boundary = /[;!?,\n]|\.(?!\d)(?![a-z]\.)|\b(?:and|then|also|but)\b/gi;
  let left = 0, right = text.length;
  for (const m of text.matchAll(boundary)) {
    if (m.index + m[0].length <= start) left = m.index + m[0].length;
    else if (m.index >= start + length) { right = m.index; break; }
  }
  const clause = text.slice(left, right);
  const routes = new Set();
  const patterns = [
    ['PO', /\b(?:orally|oral|by\s+mouth|per\s+os|po|swallow(?:ed|ing)?|chew(?:ed|ing|able)?)\b/gi],
    ['IN', /\b(?:intranasal(?:ly)?|intra-nasal(?:ly)?|nasally|MAD(?:\s+(?:device|atomizer))?|(?:into|in|via)\s+(?:(?:the|each|both|left|right)\s+)*(?:nostrils?|nares))\b/gi],
    ['IM', /\b(?:intramuscular(?:ly)?|intra-muscular(?:ly)?|im)\b/gi],
    ['IV', /\b(?:intravenous(?:ly)?|iv)\b/gi],
    ['IO', /\b(?:intraosseous|io)\b/gi],
    // Recognize other explicit routes as conflicts, without inventing an art variant.
    ['OTHER', /\b(?:sublingual(?:ly)?|sl|buccal(?:ly)?|subcutaneous(?:ly)?|sq|sc|rectal(?:ly)?|nebulized|nebulised)\b/gi],
  ];
  for (const [route, pattern] of patterns) {
    for (const m of clause.matchAll(pattern)) {
      const before = clause.slice(0, m.index);
      if (/\b(?:not|no|avoid|rather\s+than|instead\s+of)\s*$/i.test(before)) continue;
      if (route === 'PO' && /^oral$/i.test(m[0]) && /^\s+(?:airway|intubation|cavity|trauma)\b/i.test(clause.slice(m.index + m[0].length))) continue;
      if (route === 'IN' && /^mad$/i.test(m[0]) && m[0] !== 'MAD' && !/\b(?:via|with|using)\s+(?:an?\s+)?$/i.test(before)) continue;
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
    if (/\b(?:not|no|avoid|rather\s+than|instead\s+of)\s*$/i.test(clause.slice(0, m.index))) continue;
    routes.add('IN');
  }
  return routes.size === 1 && !routes.has('OTHER') ? [...routes][0] : null;
}

module.exports = { medicationRouteAt };
