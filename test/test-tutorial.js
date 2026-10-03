'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the lesson controller without a browser or any live scenario API.
function lesson() {
  const nodes = new Map(), stored = new Map(), sounds = [], rolls = [];
  let starts = 0, review;
  class Node {
    constructor() {
      this.handlers = {}; this.children = []; this.disabled = false; this.inert = false;
      this.style = { setProperty() {}, removeProperty() {} };
      this.classList = { add() {}, remove() {} };
      this.firstChild = { textContent: '' };
    }
    set id(id) { this._id = id; nodes.set(id, this); }
    get id() { return this._id; }
    set innerHTML(html) {
      for (const match of html.matchAll(/id="([^"]+)"/g)) get(match[1]);
      this.queries = new Map();
    }
    querySelector(selector) {
      this.queries ||= new Map();
      if (!this.queries.has(selector)) this.queries.set(selector, new Node());
      return this.queries.get(selector);
    }
    addEventListener(name, cb) { (this.handlers[name] ||= []).push(cb); }
    async fire(name, extra = {}) { for (const cb of this.handlers[name] || []) await cb({ target: this, ...extra }); }
    async click() { if (!this.disabled && !this.inert) await this.fire('click'); }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute() {}
    getBoundingClientRect() { return { height: 250 }; }
    focus() {}
    remove() { nodes.delete(this.id); }
    showModal() { this.open = true; }
    close() { this.open = false; this.fire('close'); }
  }
  function get(id) { if (!nodes.has(id)) { const n = new Node(); n.id = id; } return nodes.get(id); }
  const document = { body: new Node(), createElement: () => new Node(), getElementById: get,
    querySelectorAll: () => [], querySelector: () => new Node(), addEventListener() {} };
  const ctx = {
    window: {}, document, currentPlayer: null, localStorage: { getItem: k => stored.get(k), setItem: (k,v) => stored.set(k,v) },
    initialPlayerReady: Promise.resolve(), ResizeObserver: class { observe() {} disconnect() {} },
    startBtn: get('start-btn'), startScreen: get('start-screen'), terminal: get('terminal'),
    userInput: get('user-input'), skipBtn: get('skip-btn'), output: get('output'),
    playSound: name => sounds.push(name), startScenario: () => { starts++; },
    resetToStart() {}, hideCrewPanel() {}, setVitalsPanelOpen() {}, showCrewPanel() {},
    setInputEnabled() {}, scrollBottom() {}, print() {}, printReply() {}, printRoll() {},
    applyVitals() {}, applyPatientRecords() {}, populateCrewPanel() {}, applyCrewStatus() {},
    clearVitalsScratch() {}, focusActionInput() {}, showProcConfirm() { get('proc-confirm'); },
    animateDiceRoll: async (...args) => { rolls.push(args); }, currentSceneMinute: 0, isClosed: false,
    PracticeUI: { learning: data => { review = data; return new Node(); } },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/tutorial.js'), 'utf8'), ctx);
  const api = ctx.window.EMSTutorial;
  return { ctx, api, get, stored, sounds, rolls, starts: () => starts, review: () => review,
    next: () => get('tutorial-note').querySelector('.tutorial-next').click(),
    leave: () => get('tutorial-note').querySelector('.tutorial-leave').click(),
    heading: () => get('tutorial-heading').textContent,
    begin: async () => { await api.offer(); await get('tutorial-start').click(); },
  };
}

test('BEGIN offers before starting a scenario; skip opts out and starts once', async () => {
  const l = lesson();
  await l.api.offer(); assert.equal(l.starts(), 0);
  await l.api.offer(); assert.equal(l.starts(), 0);
  await l.get('tutorial-skip').click();
  assert.equal(l.starts(), 1);
  assert.equal(l.stored.get('ems_tutorial_v1_guest'), 'off');
  await l.api.offer(); assert.equal(l.starts(), 2);
});

test('scripted lesson requires interactions, handles rejected orders, and ends in a debrief without starting a run', async () => {
  const l = lesson(); await l.begin();
  assert.equal(l.api.active, true);
  await l.next(); await l.next();
  await l.next(); assert.equal(l.heading(), 'Your pocket notebook');
  await l.get('vitals-expand').click(); await l.next();
  await l.get('crew-btn').click(); await l.next(); await l.next();
  await l.api.send('hello'); assert.equal(l.heading(), 'Say what you want to do');
  await l.api.send('I place an IV.');
  await l.api.send('I place an IV.', { resolved: true, procAllow: [] });
  assert.equal(l.rolls.length, 0);
  assert.equal(l.heading(), 'Say what you want to do');
  await l.api.send('I place an IV.');
  await l.api.send('I place an IV.', { resolved: true, procAllow: ['tutorial-iv'] });
  assert.deepEqual(l.rolls[0], ['peripheral_iv', 14, 10, 'SUCCESS']);
  assert.equal(l.ctx.currentSceneMinute, 2);
  await l.next(); await l.api.send('I monitor.');
  assert.equal(l.ctx.currentSceneMinute, 8);
  l.api.endCall();
  assert.match(l.review().debriefText, /Patient outcome/);
  assert.deepEqual(Array.from(l.review().timeline, t => t.minute), [0, 2, 8]);
  assert.equal(l.review().timeline[1].procedures[0].intervention, true);
  await l.next(); assert.equal(l.ctx.startScreen.inert, true);
  await l.next();
  assert.equal(l.api.active, false);
  assert.equal(l.ctx.startScreen.inert, false);
  assert.equal(l.stored.get('ems_tutorial_v1_guest'), 'off');
  assert.equal(l.starts(), 0);
  assert.ok(l.sounds.length > 8 && l.sounds.every(name => name === 'paper'));
});

test('leaving keeps the tutorial available; options re-enable it and player preferences are isolated', async () => {
  const l = lesson(); await l.begin(); await l.leave();
  assert.equal(l.api.active, false);
  assert.notEqual(l.stored.get('ems_tutorial_v1_guest'), 'off');
  l.get('tutorial-toggle').checked = false; await l.get('tutorial-toggle').fire('change');
  l.ctx.currentPlayer = { id: 'new-player' }; l.api.renderPreference();
  assert.equal(l.get('tutorial-toggle').checked, true);
  l.ctx.currentPlayer = null; l.api.renderPreference();
  assert.equal(l.get('tutorial-toggle').checked, false);
  l.get('tutorial-toggle').checked = true; await l.get('tutorial-toggle').fire('change');
  await l.begin(); assert.equal(l.api.active, true); assert.equal(l.starts(), 0);
});

test('real turn and end-call paths hand off to the tutorial before session/API work', () => {
  const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  assert.match(app, /async function sendTurn\(msg, opts = \{\}\) \{\s*if \(window\.EMSTutorial\?\.active\) return window\.EMSTutorial\.send/);
  assert.match(app, /skipBtn\.addEventListener\('click', \(\) => \{\s*if \(window\.EMSTutorial\?\.active\) return window\.EMSTutorial\.endCall/);
});
