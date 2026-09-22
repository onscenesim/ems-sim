'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-glovebox-state-'));
process.env.EMS_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
const { createGlovebox, gloveboxView, sortItem, CALL_XP } = require('../src/engine/glovebox');
const { items, resolve, notes, noteColors } = require('../public/glovebox-catalog');

test('each call retains unique finds and its Post-it variant across serialization', () => {
  const signatures = new Set();
  const seenNotes = new Set();
  const colors = new Set();
  for (let i = 0; i < 1000; i++) {
    const state = createGlovebox(`call-${i}`);
    assert.deepEqual(state, createGlovebox(`call-${i}`));
    const view = gloveboxView(state);
    assert.ok([2, 3].includes(view.active.length));
    assert.equal(new Set(state.order).size, 40);
    assert.deepEqual(view, gloveboxView(JSON.parse(JSON.stringify(state))));
    signatures.add(view.active.join(','));
    seenNotes.add(state.note.message);
    colors.add(state.note.color);
  }
  assert.ok(signatures.size > 150);
  assert.equal(seenNotes.size, notes.length);
  assert.equal(colors.size, noteColors.length);
  assert.equal(items.filter(item => item.id === 'callahan-note').length, 1);
  for (const item of items) {
    const resolved = resolve(item.id, { message: 2, color: 1 });
    assert.ok(resolved.art.length > 100 && resolved.lore.length > 20);
  }
});

test('sorting validates destinations, only reveals after two removals, and cannot farm XP', () => {
  const state = createGlovebox('sorting');
  state.order = ['shears', 'aux', 'callahan-note', ...state.order.filter(id => !['shears', 'aux', 'callahan-note'].includes(id))];
  state.initialCount = 2;
  assert.throws(() => sortItem(state, 'shears', 'trash'), { code: 'wrong_destination' });
  assert.throws(() => sortItem(state, 'callahan-note', 'pocket'), { code: 'item_unavailable' });
  assert.throws(() => sortItem(state, '__proto__', 'pocket'), { code: 'invalid_sort' });
  assert.equal(sortItem(state, 'shears', 'pocket').awarded, 5);
  assert.deepEqual(gloveboxView(state).active, ['aux']);
  assert.equal(sortItem(state, 'shears', 'pocket').awarded, 0);
  assert.equal(gloveboxView(state).removed, 1);
  sortItem(state, 'aux', 'trash');
  assert.deepEqual(gloveboxView(state).active, ['callahan-note']);
  sortItem(state, 'callahan-note', 'pocket');
  assert.deepEqual(gloveboxView(state).active, []);
  assert.equal(gloveboxView(state).xp, 15);
});

test('player XP survives reload and duplicate call/item rewards are ignored', async () => {
  let players = require('../src/server/playerStore');
  const { player, token } = await players.signup('Rummager', '1234');
  for (const [difficulty, xp] of Object.entries(CALL_XP)) {
    const before = players.publicPlayer(players.getPlayerByToken(token)).stats.xp;
    players.recordScenarioCompleted(player.id, { difficulty, category: 'medical' }, `call-${difficulty}`);
    players.recordScenarioCompleted(player.id, { difficulty, category: 'medical' }, `call-${difficulty}`);
    assert.equal(players.publicPlayer(players.getPlayerByToken(token)).stats.xp - before, xp);
  }
  players.recordGloveboxSorted(player.id, 'call-EASY', 'shears', 'pocket');
  players.recordGloveboxSorted(player.id, 'call-EASY', 'shears', 'pocket');
  players.recordGloveboxSorted(player.id, 'call-EASY', 'aux', 'trash');
  delete require.cache[require.resolve('../src/server/playerStore')];
  players = require('../src/server/playerStore');
  players.recordGloveboxSorted(player.id, 'call-EASY', 'aux', 'trash');
  const saved = players.publicPlayer(players.getPlayerByToken(token));
  assert.equal(saved.stats.xp, 510);
  assert.equal(saved.stats.scenariosCompleted, 4);
  assert.equal(saved.stats.itemsRecovered, 1);
  assert.equal(saved.stats.itemsDiscarded, 1);
  assert.equal(saved.xpEvents, undefined, 'internal award ledger is not exposed');
});

test('a pending clinical turn cannot overwrite concurrent rummaging', async () => {
  const { Session } = require('../src/engine/session');
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const session = Object.assign(Object.create({ async _send() { await pending; this.sceneMinute++; return { reply: 'done' }; } }), {
    glovebox: createGlovebox('concurrent'), sceneMinute: 0,
  });
  const turn = Session.prototype.send.call(session, 'test');
  const id = gloveboxView(session.glovebox).active[0];
  sortItem(session.glovebox, id, resolve(id).destination);
  release();
  await turn;
  assert.equal(session.sceneMinute, 1);
  assert.equal(gloveboxView(session.glovebox).xp, 5);
});

test('real glovebox routes check browser ownership, persist sorting, and recover on restart', async () => {
  const sessions = require('../src/server/sessionStore');
  const persistence = require('../src/server/persistence');
  const router = require('../src/server/routes/scenario');
  const created = sessions.createSession({ difficulty: 'EASY' }, 'glovebox-test');
  const session = sessions.getSession(created.id);
  session.ownerId = 'the-owning-browser';
  const players = require('../src/server/playerStore');
  const account = await players.signup('Pocket Tester', '4321');
  session.playerId = account.player.id;
  persistence.save({ id: created.id, seed: session.seed, ownerId: session.ownerId, playerId: session.playerId });
  async function route(method, body = {}, cookie = `ems_owner=${session.ownerId}; ems_player=${account.token}`) {
    const layer = router.stack.find(entry => entry.route?.path === '/:id/glovebox' && entry.route.methods[method]);
    let status = 200, payload;
    await layer.route.stack[0].handle({ params: { id: created.id }, headers: { cookie }, body }, {
      status(value) { status = value; return this; }, json(value) { payload = value; return this; },
    });
    return { status, body: payload };
  }
  assert.equal((await route('get', {}, '')).status, 403);
  const initial = await route('get');
  assert.deepEqual((await route('get')).body.glovebox, initial.body.glovebox);
  const id = initial.body.glovebox.active[0];
  const destination = resolve(id).destination;
  const result = await route('post', { item: id, destination, xp: 9000 });
  assert.equal(result.body.awarded, 5);
  assert.equal(result.body.player.stats.xp, 5);
  assert.equal((await route('post', { item: id, destination })).body.awarded, 0);
  sessions.deleteSession(created.id);
  const restored = await route('get');
  assert.equal(restored.body.glovebox.xp, 5);
  assert.ok(!restored.body.glovebox.active.includes(id));
  assert.equal(restored.body.player.stats.xp, 5);
  const closeLayer = router.stack.find(entry => entry.route?.path === '/:id/turn' && entry.route.methods.post);
  for (const operation_id of ['complete-this-call-0001', 'complete-this-call-0001', 'complete-this-call-0002']) {
    let response;
    await closeLayer.route.stack[0].handle({ params: { id: created.id }, headers: { cookie: `ems_owner=${session.ownerId}; ems_player=${account.token}` }, body: { message: 'end scenario', operation_id } }, {
      status() { return this; }, json(value) { response = value; return this; },
    });
    assert.equal(response.completionXP, 50);
  }
  const finalStats = (await route('get')).body.player.stats;
  assert.equal(finalStats.xp, 55, 'completion rewards do not repeat on retries or repeated close commands');
  assert.equal(finalStats.scenariosCompleted, 1);
  sessions.deleteSession(created.id);
});
