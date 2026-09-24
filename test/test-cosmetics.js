'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-cosmetics-'));
process.env.EMS_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
const catalog = require('../public/cosmetics-catalog');
// Give this isolated test store its own credential; never commit the real PIN.
const testAdminPin = '87654321';
const seed = require('../src/server/adminPlayerSeed.json');
seed.pinHash = crypto.scryptSync(testAdminPin, Buffer.from(seed.pinSalt, 'base64url'), 32).toString('base64url');
const { router } = require('../src/server/routes/auth');
async function route(method, url, body = {}, cookie = '') {
  const layer = router.stack.find(entry => entry.route?.path === url && entry.route.methods[method]);
  let status = 200, payload;
  const headers = {};
  await layer.route.stack[0].handle({ body, headers: { cookie } }, {
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
    setHeader(key, value) { headers[key.toLowerCase()] = value; },
  });
  return { status, body: payload, headers };
}

test('all requested stickers have local artwork and are available at zero XP', () => {
  assert.equal(catalog.stickers.length, 19);
  assert.equal(catalog.pens.length, 8);
  for (const item of [...catalog.stickers, ...catalog.pens]) assert.ok(Number.isInteger(item.xp) && item.xp >= 0);
  for (const sticker of catalog.stickers) {
    assert.ok(fs.existsSync(path.join(__dirname, '../public', sticker.src)));
    const input = { pen: 'navy', stickers: [sticker.id], note: '' };
    assert.deepEqual(catalog.validate(input, 0, false, 0).stickers, [sticker.id]);
  }
  for (const pen of catalog.pens.filter(pen => pen.xp > 0)) {
    assert.equal(catalog.validate({ pen: pen.id, stickers: [], note: '' }, 0).pen, pen.id);
  }
  assert.deepEqual(catalog.normalize(null, 0), catalog.defaults);
});

test('validation rejects unknown, duplicate, excess, and oversized cosmetic input', () => {
  const valid = { pen: 'navy', stickers: [], note: '' };
  for (const change of [
    { pen: '#ff0000' }, { stickers: ['missing'] }, { stickers: ['emt', 'emt'] },
    { stickers: ['emt', 'paramedic', 'glove-balloon'] }, { stickers: 'emt' },
    { note: 'a'.repeat(81) }, { note: { text: 'x' } },
  ]) assert.throws(() => catalog.validate({ ...valid, ...change }, 9999), { code: 'invalid_cosmetics' });
  assert.deepEqual(catalog.normalize({ pen: 'red', stickers: ['emt', 'house'], note: 'hello\nworld' }, 200), { pen: 'red', stickers: ['emt', 'house'], note: 'hello world' });
});

test('account equip saves durably without spending XP or overwriting briefing preferences', async () => {
  assert.equal((await route('post', '/cosmetics', catalog.defaults)).status, 401);
  const signup = await route('post', '/signup', { displayName: 'Sticker Medic', pin: '2468' });
  const cookie = signup.headers['set-cookie'].split(';')[0];
  assert.deepEqual(signup.body.player.cosmetics, catalog.defaults, 'older profiles start with defaults');
  const equipped = { pen: 'purple', stickers: ['custom-note', 'house'], note: 'Ask me about my stickers.' };
  assert.equal(signup.body.player.cosmeticsUnlocked, true);
  await route('post', '/preferences', { showFieldBriefing: false }, cookie);
  const result = await route('post', '/cosmetics', equipped, cookie);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.player.cosmetics, equipped);
  assert.equal(result.body.player.stats.xp, 0);
  assert.equal(result.body.player.preferences.showFieldBriefing, false);
  await route('post', '/preferences', { showFieldBriefing: true }, cookie);
  assert.deepEqual((await route('get', '/me', {}, cookie)).body.player.cosmetics, equipped);
  const publicPath = require.resolve('../src/server/playerStore');
  delete require.cache[publicPath];
  const reloaded = require(publicPath);
  const login = await reloaded.login('Sticker Medic', '2468');
  assert.deepEqual(login.player.cosmetics, equipped);
  assert.equal(login.player.stats.xp, 0);
  const other = await reloaded.signup('Other Medic', '1357');
  assert.deepEqual(other.player.cosmetics, catalog.defaults, 'cosmetics are account-specific');
});

test('ADMIN is permanently unlocked at zero XP and ordinary clients cannot grant themselves that role', async () => {
  const login = await route('post', '/login', { displayName: 'ADMIN', pin: testAdminPin });
  assert.equal(login.status, 200);
  const cookie = login.headers['set-cookie'].split(';')[0];
  assert.equal(login.body.player.role, 'admin');
  assert.equal(login.body.player.cosmeticsUnlocked, true);
  assert.equal(login.body.player.stats.xp, 0);
  const cosmetics = { pen: 'orange', stickers: ['lifepak12', 'speed'], note: 'All access.' };
  const saved = await route('post', '/cosmetics', cosmetics, cookie);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.player.cosmetics, cosmetics);
  assert.equal(saved.body.player.stats.xp, 0);
  const ordinary = await route('post', '/signup', { displayName: 'Regular Player', pin: '1234', role: 'admin', cosmeticsUnlocked: true });
  assert.equal(ordinary.body.player.role, 'player');
  assert.equal(ordinary.body.player.cosmeticsUnlocked, true);
  const ordinarySave = await route('post', '/cosmetics', cosmetics, ordinary.headers['set-cookie'].split(';')[0]);
  assert.equal(ordinarySave.status, 200);
  const modulePath = require.resolve('../src/server/playerStore');
  delete require.cache[modulePath];
  const restarted = require(modulePath);
  const again = await restarted.login('ADMIN', testAdminPin);
  assert.equal(again.player.cosmeticsUnlocked, true);
  assert.deepEqual(again.player.cosmetics, cosmetics);
  // New future entries use the same unlock-all path, regardless of their cost.
  catalog.stickers.push({ id: 'future-sticker', xp: 999999 });
  try { assert.deepEqual(catalog.validate({ ...cosmetics, stickers: ['future-sticker'] }, 0, true).stickers, ['future-sticker']); }
  finally { catalog.stickers.pop(); }
});

test('full collection is available to guests without XP or completed calls', () => {
  const input = { pen: 'orange', stickers: ['lifepak12'], note: '' };
  assert.deepEqual(catalog.validate(input, 0, false, 0), input);
  assert.deepEqual(catalog.normalize(input, 0, false, 0), input);
});

const penKit = require('../public/pen-kit');
test('fountain pen is the final pen unlock and Crossout red retains saved red selections', () => {
  const green = catalog.pens.find(pen => pen.id === 'green');
  assert.equal(catalog.pens.at(-1), green);
  assert.ok(catalog.pens.filter(pen => pen !== green).every(pen => pen.xp < green.xp));
  assert.equal(catalog.pens.find(pen => pen.id === 'red').name, 'Crossout red');
  assert.equal(catalog.normalize({ pen: 'red' }, 0).pen, 'red');
});

test('AG7 latches when pressed and only its side release retracts it', () => {
  let state = penKit.initial('teal');
  state = penKit.transition('teal', state, 'body');
  assert.equal(state.extended, true, 'pressing an extended AG7 must not retract it');
  state = penKit.transition('teal', state, 'release');
  assert.equal(state.extended, false);
  state = penKit.transition('teal', state, 'body');
  assert.equal(state.extended, true);
});

test('back buttons, sliding clip, spring button, and cap have distinct activation targets', () => {
  for (const [id, action] of [['black', 'back'], ['red', 'back'], ['purple', 'body'], ['pink', 'body'], ['green', 'cap']]) {
    const start = penKit.initial(id);
    assert.deepEqual(penKit.transition(id, start, 'wrong-target'), start);
    const activated = penKit.transition(id, start, action);
    assert.equal(activated.extended, !start.extended, id);
    assert.deepEqual(penKit.transition(id, activated, action), start);
  }
  for (const id of ['navy', 'orange']) assert.equal(penKit.transition(id, penKit.initial(id), 'body').extended, true);
});

test('retracted and capped pens do not mark the scratchpad; extending resumes drawing', () => {
  const vm = require('node:vm');
  const listeners = {};
  let marks = 0, ready = false, lastInk;
  const context = {
    clearRect() {}, beginPath() {}, arc() {}, fill() { marks++; }, moveTo() {}, lineTo() {}, stroke() { marks++; },
    set strokeStyle(ink) { lastInk = ink; },
  };
  const canvas = {
    width: 800, height: 300, getContext: () => context,
    addEventListener(name, listener) { listeners[name] = listener; },
    setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 300 }),
  };
  const scope = vm.createContext({
    document: { getElementById: id => id === 'vitals-scratch' ? canvas : { addEventListener() {} } },
    window: { EMSCosmetics: { canWrite: () => ready, ink: () => '#a52c37' } },
  });
  const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  vm.runInContext(app.slice(app.indexOf('const vitalsScratch ='), app.indexOf('// The terminal uses 100dvh')), scope);
  const event = { isPrimary: true, button: 0, pointerId: 1, clientX: 10, clientY: 10, preventDefault() {} };
  listeners.pointerdown(event); listeners.pointermove(event);
  assert.equal(marks, 0);
  ready = true;
  listeners.pointerdown(event); listeners.pointermove(event); listeners.pointerup(event);
  assert.equal(marks, 2);
  assert.equal(lastInk, '#a52c37');
});

function penMotionFixture(id, reduced = false) {
  const vm = require('node:vm');
  const animations = [], timers = [];
  class Element {
    constructor() {
      this.dataset = {}; this.children = []; this.handlers = {}; this.attributes = {};
      this.classList = { add() {}, toggle() {} };
    }
    get offsetWidth() { throw new Error('Pen input must not force layout'); }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, fn) { this.handlers[name] = fn; }
    querySelectorAll(selector) { return Array.from({ length: selector === '.pen-bubble-cluster' ? 3 : 1 }, () => new Element()); }
    animate(frames, options) {
      const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } };
      animations.push(animation); return animation;
    }
  }
  const scope = vm.createContext({ document: { createElement: () => new Element() }, window: { matchMedia: () => ({ matches: reduced }) }, setTimeout: fn => timers.push(fn) });
  vm.runInContext(fs.readFileSync(require.resolve('../public/pen-kit'), 'utf8'), scope);
  const host = new Element();
  scope.PenKit.mount(host, id, { soundEnabled: () => false });
  const click = () => host.children[0].children[0].handlers.click();
  return { host, animations, timers, click };
}

test('repeated bubble and spring clicks replace motion instead of accumulating animations or forcing layout', () => {
  for (const id of ['orange', 'pink']) {
    const fixture = penMotionFixture(id);
    fixture.click();
    const first = fixture.animations.slice();
    assert.ok(first.length > 0);
    fixture.click();
    assert.ok(first.every(animation => animation.cancelled));
    assert.equal(fixture.animations.filter(animation => !animation.cancelled).length, first.length);
  }
});

test('MYU locks only during its cap movement and returns to the capped state', () => {
  const fixture = penMotionFixture('green');
  fixture.click();
  assert.equal(fixture.host.dataset.ready, 'true');
  fixture.click();
  assert.equal(fixture.animations.length, 1, 'rapid second tap cannot interrupt cap travel');
  fixture.timers.shift()();
  fixture.click();
  assert.equal(fixture.host.dataset.ready, 'false');
  assert.equal(fixture.animations.length, 2);
});

test('reduced motion keeps pen controls immediate without scheduling animations', () => {
  for (const id of ['green', 'pink', 'orange']) {
    const fixture = penMotionFixture(id, true);
    fixture.click(); fixture.click();
    assert.equal(fixture.animations.length, 0);
    assert.equal(fixture.timers.length, 0);
    assert.equal(fixture.host.dataset.ready, String(penKit.initial(id).extended));
  }
});
