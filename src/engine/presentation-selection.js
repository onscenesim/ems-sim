'use strict';

// Each family receives one parent ticket regardless of its number of variants.
// Ungrouped cases each retain a ticket of their own. Callers filter eligibility
// and recent exact presentations before this step, including on fallback.
function presentationGroups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.selection_group || entry;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.values()];
}

function selectPresentation(entries, random) {
  const groups = presentationGroups(entries);
  if (!groups.length) return null;
  const variants = groups[Math.floor(random() * groups.length)];
  return variants.length === 1 ? variants[0] : variants[Math.floor(random() * variants.length)];
}

module.exports = { presentationGroups, selectPresentation };
