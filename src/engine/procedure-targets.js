'use strict';

// Only procedures performed independently at anatomical sites get site rolls.
// A bilateral exam, medication route, or CPR order is still one action.
const SITE_PROCEDURES = new Set([
  'peripheral_iv', 'io_access', 'tourniquet', 'bleeding_control',
  'needle_decompression', 'chest_seal', 'chest_tube_insertion', 'finger_thoracostomy',
]);

function procedureTargets(text, start, length, id) {
  if (!SITE_PROCEDURES.has(id)) return [];
  // Keep limb lists together, but stop at the next action clause. This prevents
  // "bilateral IVs and apply a tourniquet" from doubling the tourniquet.
  const actionStart = '(?:(?:bilateral|bilat)\\s+)?(?:give|push|apply|place|start|attempt|try|perform|obtain|establish|check|assess|insert|do|drill|tourniquets?|tqs?|ivs?|ios?|needle\\s+decompression|chest\\s+seals?)\\b';
  const boundaries = new RegExp(`[;.!?\\n]|,?\\s*\\b(?:and|then|also|but)\\s+(?=${actionStart})|,\\s*(?=${actionStart})`, 'gi');
  let lo = 0, hi = text.length;
  for (const m of text.matchAll(boundaries)) {
    if (m.index + m[0].length <= start) lo = m.index + m[0].length;
    else if (m.index >= start + length) { hi = m.index; break; }
  }
  const clause = text.slice(lo, hi).toLowerCase();
  const sites = new Set();
  const excluded = new Set();
  const thoracic = ['needle_decompression', 'chest_seal', 'chest_tube_insertion', 'finger_thoracostomy'].includes(id);
  const add = (side, part) => sites.add(`${side} ${part}`);
  const family = part => /arm|hand|forearm|humer|upper|ue/.test(part) ? 'arm' : /leg|thigh|tibia|lower|le/.test(part) ? 'leg' : 'side';
  for (const m of clause.matchAll(/\b(left|right|lt|rt)\s+(?:proximal\s+|distal\s+)?(arm|hand|forearm|leg|thigh|tibia\w*|humer\w*|upper extremit\w*|lower extremit\w*|chest|side)\b|\b(lue|rue|lle|rle)\b/g)) {
    const side = m[3] ? (m[3][0] === 'l' ? 'left' : 'right') : /^(left|lt)$/.test(m[1]) ? 'left' : 'right';
    const part = m[3] || m[2];
    const target = `${side} ${thoracic ? 'chest' : family(part)}`;
    if (/\b(?:not|no|avoid|skip)\s+(?:the\s+)?$/.test(clause.slice(0, m.index))) excluded.add(target);
    else sites.add(target);
  }
  const paired = /\b(?:bilateral(?:ly)?|bilat\.?|both)\b/.test(clause);
  for (const m of clause.matchAll(/\b(?:bilateral(?:ly)?|bilat\.?|both|each)\s+(?:(?:upper|lower)\s+)?(?:arms?|legs?|hands?|extremit(?:y|ies)|limbs?)\b/g)) {
    const part = /upper|arm|hand/.test(m[0]) ? 'arm' : /lower|leg/.test(m[0]) ? 'leg' : 'limb';
    add('left', part); add('right', part);
  }
  if (/\bboth\s+(?:arms?\s+and\s+legs?|upper\s+and\s+lower\s+extremities)\b/.test(clause)) {
    sites.clear();
    for (const part of ['arm', 'leg']) { add('left', part); add('right', part); }
  }
  if (/\ball\s+(?:(?:four|4)\s+)?(?:limbs|extremities)\b/.test(clause)) {
    for (const part of ['arm', 'leg']) { add('left', part); add('right', part); }
  }
  if (paired && sites.size < 2) {
    const part = thoracic ? 'chest' : /tibia|leg|lower/.test(clause) ? 'leg' : /humer|arm|upper/.test(clause) ? 'arm' : 'side';
    add('left', part); add('right', part);
  }
  // Shared noun: "left and right legs".
  if (/\b(?:left\s+(?:and|&)\s+right|right\s+(?:and|&)\s+left)\b/.test(clause)) {
    const part = thoracic ? 'chest' : /legs?|lower|tibia/.test(clause) ? 'leg' : 'arm';
    add('left', part); add('right', part);
  }
  if (!sites.size && ['peripheral_iv', 'io_access'].includes(id)
      && /\b(?:two|2)\s+(?:large[ -]bore\s+)?(?:ivs?|ios?|lines|iv access|io access)\b/.test(clause)) {
    sites.add('site 1'); sites.add('site 2');
  }
  if (!sites.size && id === 'tourniquet') {
    const count = /\b(two|three|four|[234])\s+(?:tourniquets?|tqs?|limbs|extremities)\b/.exec(clause);
    if (count) {
      const n = { two: 2, three: 3, four: 4 }[count[1]] || Number(count[1]);
      for (let i = 1; i <= n; i++) sites.add(`limb ${i}`);
    }
  }
  return [...sites].filter(site => !excluded.has(site)).slice(0, 4);
}

function rollEntry(entry, context, difficulty, rollProcedure) {
  const targets = entry.targets?.length ? entry.targets : [null];
  return targets.map(target => ({ ...rollProcedure(entry.proc, context, difficulty), ...(target ? { target } : {}) }));
}

module.exports = { SITE_PROCEDURES, procedureTargets, rollEntry };
