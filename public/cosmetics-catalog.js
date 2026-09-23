'use strict';

// Shared unlock rules: lifetime XP is never spent, and the server validates equips.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CosmeticsCatalog = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const pens = [
    { id: 'navy', name: 'Station blue', color: '#283a57', xp: 0 },
    { id: 'black', name: 'Black ink', color: '#242323', xp: 100 },
    { id: 'red', name: 'Chart red', color: '#a52c37', xp: 200 },
    { id: 'green', name: 'Monitor green', color: '#24623b', xp: 400 },
    { id: 'purple', name: 'Purple top', color: '#71378b', xp: 800 },
    { id: 'teal', name: 'Scrub teal', color: '#006b71', xp: 1200 },
    { id: 'pink', name: 'Hot pink', color: '#ac266c', xp: 1800 },
    { id: 'orange', name: 'Hazmat orange', color: '#9e4815', xp: 2600 },
  ];
  const stickers = [
    { id: 'emt', name: 'EMT patch', xp: 200 },
    { id: 'paramedic', name: 'Paramedic patch', xp: 200 },
    { id: 'glove-balloon', name: 'Glove balloon', xp: 300 },
    { id: 'low-cortisol', name: 'Low Cortisol', xp: 400 },
    { id: 'custom-note', name: 'Your own Post-it', xp: 500 },
    { id: 'freedom-house', name: 'Freedom House Memorial · 1967–1975', xp: 600 },
    { id: 'eight-ball', name: 'Outlook Not So Good', xp: 800 },
    { id: 'fall-risk', name: 'Gomers Go to Ground', xp: 1000 },
    { id: 'narcan', name: 'Narcan / Narshould', xp: 1200 },
    { id: 'dos-epis', name: 'DOS EPIS', xp: 1400 },
    { id: 'stryker', name: 'Team Stryker · LIFEPAK 15', xp: 1600 },
    { id: 'zoll', name: 'Team Zoll · X Series', xp: 1600 },
    { id: 'davita', name: 'DaVita', xp: 2000 },
    { id: 'versed-rock', name: 'Versed 10mg Topical', xp: 2400 },
    { id: 'supreme', name: 'Supreme Mac', xp: 2800 },
    { id: 'firefighter-pride', name: 'Firefighter Pride', xp: 3200 },
    { id: 'house', name: 'House, extremely close', xp: 3600 },
    { id: 'speed', name: 'Speedlaugh', xp: 4000 },
    { id: 'lifepak12', runs: 20, name: 'LIFEPAK 12 · Still running', xp: 4800 },
  ].map(item => ({ ...item, src: `/stickers/${item.id}.${item.id === 'house' ? 'png' : ['davita', 'speed'].includes(item.id) ? 'jpg' : 'svg'}` }));
  const defaults = { pen: 'navy', stickers: [], note: 'Back in service. Probably.' };
  const earnedXP = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  const cleanNote = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim() : defaults.note;

  function normalize(saved = {}, xp = 0, unlockAll = false, completed = 0) {
    const eligible = unlockAll ? Infinity : earnedXP(xp);
    const pen = pens.find(pen => pen.id === saved?.pen && pen.xp <= eligible)?.id || defaults.pen;
    const selected = Array.isArray(saved?.stickers) ? [...new Set(saved.stickers)].filter(id => stickers.some(sticker => sticker.id === id && sticker.xp <= eligible && (unlockAll || completed >= (sticker.runs || 0)))).slice(0, 2) : [];
    return { pen, stickers: selected, note: cleanNote(saved?.note).slice(0, 80) };
  }

  function validate(input, xp, unlockAll = false, completed = 0) {
    const invalid = message => { throw Object.assign(new Error(message), { code: 'invalid_cosmetics' }); };
    if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Choose your pen and up to two stickers.');
    const pen = pens.find(pen => pen.id === input.pen);
    if (!pen) invalid('Choose a pen from the collection.');
    if (!unlockAll && pen.xp > earnedXP(xp)) invalid(`This pen unlocks at ${pen.xp} XP.`);
    if (!Array.isArray(input.stickers) || input.stickers.length > 2 || new Set(input.stickers).size !== input.stickers.length) invalid('Choose up to two different stickers.');
    for (const id of input.stickers) {
      const sticker = stickers.find(sticker => sticker.id === id);
      if (!sticker) invalid('Choose a sticker from the collection.');
      if (!unlockAll && sticker.xp > earnedXP(xp)) invalid(`${sticker.name} unlocks at ${sticker.xp} XP.`);
      if (!unlockAll && completed < (sticker.runs || 0)) invalid(`${sticker.name} also requires ${sticker.runs} completed scenarios.`);
    }
    if (typeof input.note !== 'string' || input.note.length > 80) invalid('Keep your Post-it message to 80 characters.');
    return normalize(input, xp, unlockAll, completed);
  }

  return { pens, stickers, defaults, normalize, validate };
});
