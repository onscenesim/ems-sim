'use strict';

const { createHash } = require('node:crypto');
const { items, notes, noteColors } = require('../../public/glovebox-catalog');
const SORT_XP = 5;
const CALL_XP = { EASY: 50, NORMAL: 100, HARD: 150, BLACK_CLOUD: 200 };

function createGlovebox(callId) {
  // Stable across lazy initialization, retries, resumes, and server restarts.
  const score = value => createHash('sha256').update(`${callId}:glovebox:${value}`).digest('hex');
  const order = items.map(item => item.id).sort((a, b) => score(a).localeCompare(score(b)));
  const value = parseInt(score('variant').slice(0, 8), 16);
  return { order, initialCount: 2 + value % 2, sorted: {}, note: { message: value % notes.length, color: Math.floor(value / notes.length) % noteColors.length } };
}

function gloveboxView(state) {
  const sorted = Object.keys(state.sorted).length;
  const revealed = Math.min(state.order.length, state.initialCount + Math.floor(sorted / 2));
  return {
    active: state.order.slice(0, revealed).filter(id => !state.sorted[id]),
    pocket: state.order.filter(id => state.sorted[id] === 'pocket'),
    trash: state.order.filter(id => state.sorted[id] === 'trash'),
    note: state.note,
    xp: sorted * SORT_XP,
    removed: sorted,
  };
}

function sortItem(state, itemId, destination) {
  const item = items.find(candidate => candidate.id === itemId);
  if (!item || !['pocket', 'trash'].includes(destination)) {
    throw Object.assign(new Error('Choose an item and either your pocket or the trash.'), { code: 'invalid_sort', status: 400 });
  }
  if (state.sorted[itemId]) return { awarded: 0, duplicate: true };
  if (!gloveboxView(state).active.includes(itemId)) {
    throw Object.assign(new Error('That item has not been found in this call.'), { code: 'item_unavailable', status: 409 });
  }
  if (item.destination !== destination) {
    const message = destination === 'trash' ? 'Someone might want that back. Try your pocket.' : 'That one is clearly garbage. Try the trash.';
    throw Object.assign(new Error(message), { code: 'wrong_destination', status: 400 });
  }
  state.sorted[itemId] = destination;
  return { awarded: SORT_XP, duplicate: false };
}

module.exports = { createGlovebox, gloveboxView, sortItem, SORT_XP, CALL_XP };
