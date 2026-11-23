'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { build } = require('../bin/export-eightball');
const { files } = build();

function browser() {
  const registry = new Map(), listeners = new Set(), timers = new Map();
  let serial = 0, now = 0, fonts = 0;
  function element() {
    const classes = new Set(), events = new Map();
    return { open: false, offsetWidth: 48, textContent: '',
      classList: { add: (...names) => names.forEach(n => classes.add(n)),
        remove: (...names) => names.forEach(n => classes.delete(n)),
        toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } },
      addEventListener: (type, handler) => events.set(type, handler),
      focus() {}, showModal() { this.open = true; },
      close() { this.open = false; events.get('close')?.(); },
    };
  }
  class HTMLElement {
    attachShadow() {
      const nodes = new Map();
      this.shadowRoot = { getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, element());
        return nodes.get(id);
      } };
      Object.defineProperty(this.shadowRoot, 'innerHTML', { set() { nodes.clear(); } });
    }
  }
  const context = vm.createContext({
    HTMLElement, customElements: { get: name => registry.get(name), define: (name, cls) => registry.set(name, cls) },
    FontFace: class { load() { fonts++; return Promise.resolve(this); } },
    document: { fonts: { add() {}, ready: Promise.resolve() },
      getElementById() { throw new Error('Widget reached into the host document.'); } },
    matchMedia: () => ({ matches: false }),
    addEventListener: (_type, callback) => listeners.add(callback),
    removeEventListener: (_type, callback) => listeners.delete(callback),
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  function load() { vm.runInContext(files['ems-eightball.js'], context); }
  load();
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].callback();
    }
    now = end;
  }
  return { Widget: registry.get('ems-eight-ball'), listeners, timers, advance, load, fontCount: () => fonts };
}

test('the downloadable widget has embedded artwork and font, and requires no network or simulator API', () => {
  const script = files['ems-eightball.js'];
  assert.ok(script.includes('data:image/svg+xml;base64,'));
  assert.ok(script.includes('data:font/ttf;base64,'));
  assert.doesNotMatch(script, /fetch\s*\(|\/api\/|GEMINI_API_KEY|RESEND_API_KEY/);
  assert.doesNotMatch(script, /src=\\?"eightball\.svg/);
  assert.ok(files['ems-eightball-standalone.html'].includes(script.trim().slice(0,80)));
  assert.ok(files['add-to-checklist.html'].includes('<ems-eight-ball floating>'));
  new vm.Script(script);
});

test('multiple widgets use separate shadow roots and release their own modal, timers, and listeners on removal', () => {
  const b = browser(), first = new b.Widget(), second = new b.Widget();
  first.connectedCallback(); second.connectedCallback();
  first.connectedCallback(); // Frameworks may reconnect or re-run setup.
  assert.equal(b.listeners.size, 2);
  first.open(); b.advance(280);
  const firstDialog = first.shadowRoot.getElementById('eightball-dialog');
  const secondDialog = second.shadowRoot.getElementById('eightball-dialog');
  assert.equal(firstDialog.open, true);
  assert.equal(secondDialog.open, false);
  second.open(); b.advance(280);
  first.disconnectedCallback();
  assert.equal(firstDialog.open, false);
  assert.equal(secondDialog.open, true);
  assert.equal(b.listeners.size, 1);
  b.advance(2800);
  assert.ok(second.shadowRoot.getElementById('eightball-response').textContent);
  second.disconnectedCallback();
  assert.equal(b.listeners.size, 0);
  assert.equal(b.timers.size, 0);
  first.connectedCallback(); first.open(); b.advance(280);
  assert.equal(first.shadowRoot.getElementById('eightball-dialog').open, true);
  first.disconnectedCallback();
});

test('loading the script twice does not redefine the element or reload its font', () => {
  const b = browser();
  assert.equal(b.fontCount(), 1);
  b.load();
  assert.equal(b.fontCount(), 1);
});
