'use strict';
// Isolated artwork fixture using the production dialog, renderer and interactions.
// No accounts, clinical requests, saved player data, or model calls.
let sessionId = 'art-study';
let currentPlayer = null;
let studyView;
function playSound() {}
function recordGuestProgress() {}
function renderPlayer() {}
function apiGet() { return Promise.resolve({ glovebox: structuredClone(studyView) }); }
function apiPost(_url, { item, destination }) {
  if (!studyView.active.includes(item)) return Promise.reject(new Error('Item already sorted.'));
  studyView.active = studyView.active.filter(id => id !== item);
  studyView[destination].push(item);
  const found = GloveboxCatalog.resolve(item);
  const awarded = [found.destination, found.alternateDestination].includes(destination) ? 5 : 0;
  studyView.xp += awarded;
  return Promise.resolve({ glovebox: structuredClone(studyView), awarded });
}
(async () => {
  const source = new DOMParser().parseFromString(await (await fetch('index.html')).text(), 'text/html');
  document.body.append(source.getElementById('glovebox-btn'), source.getElementById('glovebox-dialog'));
  const script = document.createElement('script');
  script.src = 'glovebox.js';
  await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; document.body.append(script); });
  function choose(id) {
    sessionId = `art-study-${id}`;
    studyView = { active: [id, ...['shears', 'aux', 'callahan-note'].filter(other => other !== id)].slice(0, 3), pocket: [], trash: [], xp: 0, note: { message: 0, color: 0 } };
    document.getElementById('glovebox-btn').click();
  }
  // A focused review can keep several revised objects together on one screen.
  const requested = new URLSearchParams(location.search).get('items');
  const focused = requested ? [...new Set(requested.split(','))]
    .map(id => GloveboxCatalog.items.find(item => item.id === id)).filter(Boolean) : [];
  const entries = focused.length ? focused : GloveboxCatalog.items;
  if (focused.length) document.querySelector('.study-header p').textContent =
    `${entries.length} revised glovebox items. Select an item to inspect, move, pocket, or toss it in the glovebox.`;
  for (const entry of entries) {
    const item = GloveboxCatalog.resolve(entry.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'study-item';
    button.dataset.item = item.id;
    button.innerHTML = `<svg viewBox="0 0 96 80" aria-hidden="true">${GloveboxCatalog.renderArt(item.art, 'study')}</svg>`;
    const name = document.createElement('span');
    name.textContent = item.name;
    button.append(name);
    button.addEventListener('click', () => choose(item.id));
    document.getElementById('study-grid').append(button);
  }
  studyView = { active: ['shears', 'aux', 'callahan-note'], pocket: [], trash: [], xp: 0, note: { message: 0, color: 0 } };
})();
