'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(reduced = false) {
  let now = 0, serial = 0;
  const timers = new Map(), nodes = new Map();
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const classes = new Set(), handlers = {};
    const value = { open: false, textContent: '', offsetWidth: 48,
      classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)),
        contains: name => classes.has(name), toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } },
      addEventListener: (name, callback) => { handlers[name] = callback; },
      fire: (name, event = {}) => handlers[name]?.(event),
      showModal() { this.open = true; }, close() { this.open = false; handlers.close?.(); },
      focus() { this.focused = true; },
    };
    nodes.set(id, value);
    return value;
  }
  const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  const context = vm.createContext({ document: { getElementById: node }, window: { matchMedia: () => ({ matches: reduced }) },
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(source.slice(source.indexOf('const EIGHT_BALL ='), source.indexOf('// ── Export transcript')), context);
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const entry = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      now = entry[1].at; timers.delete(entry[0]); entry[1].callback();
    }
    now = end;
  }
  return { node, advance, timers, shake: () => context.shakeEightball(), close: () => context.closeEightball() };
}

test('the toolbar shakes before the full-screen entrance, then reveals and automatically dismisses', () => {
  const f = fixture();
  f.shake();
  assert.equal(f.node('eightball').classList.contains('shaking'), true);
  assert.equal(f.node('eightball-dialog').open, false);
  f.advance(280);
  assert.equal(f.node('eightball-dialog').open, true);
  assert.equal(f.node('eightball-response').textContent, '');
  f.advance(1050);
  assert.ok(f.node('eightball-response').textContent);
  assert.equal(f.node('eightball-dialog').classList.contains('is-floating'), true);
  assert.equal(f.node('eightball-dialog').classList.contains('is-settled'), false);
  f.advance(1750);
  assert.equal(f.node('eightball-dialog').classList.contains('is-settled'), true);
  f.advance(4799);
  assert.equal(f.node('eightball-dialog').open, true);
  f.advance(241);
  assert.equal(f.node('eightball-dialog').open, false);
  assert.equal(f.timers.size, 0);
  assert.equal(f.node('eightball').focused, true);
});

test('reroll near the old expiry gets a different answer and a complete new reading period', () => {
  const f = fixture();
  f.shake(); f.advance(3080);
  const first = f.node('eightball-response').textContent;
  f.advance(4700); f.shake();
  assert.equal(f.node('eightball-response').textContent, '');
  f.advance(1050);
  assert.notEqual(f.node('eightball-response').textContent, first);
  assert.equal(f.node('eightball-dialog').open, true);
  f.advance(1750);
  f.advance(4799);
  assert.equal(f.node('eightball-dialog').open, true);
  f.advance(241);
  assert.equal(f.node('eightball-dialog').open, false);
});

test('outside click and Escape dismiss during the shake without a late answer reopening the dialog', () => {
  for (const method of ['outside', 'escape']) {
    const f = fixture(); f.shake(); f.advance(280);
    let prevented = false;
    if (method === 'outside') f.node('eightball-dialog').fire('click', { target: { closest: () => null } });
    else f.node('eightball-dialog').fire('cancel', { preventDefault() { prevented = true; } });
    f.advance(10000);
    assert.equal(f.node('eightball-dialog').open, false);
    assert.equal(f.node('eightball-response').textContent, '');
    assert.equal(f.timers.size, 0);
    if (method === 'escape') assert.equal(prevented, true);
  }
});

test('rapid repeated taps keep only one reveal and reduced motion still reveals and expires', () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced);
    for (let i = 0; i < 6; i++) { f.shake(); f.advance(30); }
    f.advance(3400);
    assert.equal(f.node('eightball-dialog').open, true);
    assert.ok(f.node('eightball-response').textContent);
    assert.equal(f.timers.size, 1);
    f.advance(6000);
    assert.equal(f.node('eightball-dialog').open, false);
  }
});
