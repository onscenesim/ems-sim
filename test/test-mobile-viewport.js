'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const source = fs.readFileSync(require.resolve('../public/app'), 'utf8');
  const properties = new Map(), frames = [], events = {}, scrollEvents = {};
  let writes = 0, observedResize;
  const terminal = { style: { display: 'flex',
    getPropertyValue: k => properties.get(k) || '',
    setProperty: (k, v) => { writes++; properties.set(k, v); },
    removeProperty: k => properties.delete(k) } };
  const viewport = { height: 620, offsetTop: 0, scale: 1,
    addEventListener: (name, fn) => { events[name] = fn; } };
  let scrollTop = 730;
  const output = { clientHeight: 470, scrollHeight: 1200,
    get scrollTop() { return scrollTop; },
    set scrollTop(value) { scrollTop = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); },
    addEventListener: (name, fn) => { scrollEvents[name] = fn; } };
  const outputViewport = { height: 470, followsLatest: true };
  const userInput = { value: 'Recheck the patient and blood pressure', selectionStart: 37,
    selectionEnd: 37, scrollLeft: 0, scrollWidth: 360, addEventListener() {} };
  const document = { activeElement: userInput };
  const context = vm.createContext({ terminal, output, outputViewport,
    window: { visualViewport: viewport, addEventListener() {} },
    userInput, document,
    ResizeObserver: class { constructor(fn) { observedResize = fn; } observe(el) { assert.equal(el, output); } },
    requestAnimationFrame: fn => { frames.push(fn); return frames.length; } });
  const start = source.indexOf('function adjustForViewport()');
  vm.runInContext(source.slice(start, source.indexOf("document.addEventListener('click', e => {", start)), context);
  const update = () => {
    events.resize(); events.scroll();
    assert.equal(frames.length, 1, 'focus-pan and resize events share a single frame');
    frames.shift()();
  };
  return { context, terminal, viewport, properties, output, outputViewport, userInput,
    update, scroll: () => scrollEvents.scroll(), resize: () => observedResize(), writes: () => writes };
}

test('keyboard opening, native pan and closing keep the entire terminal in the visible rectangle', () => {
  const { context, terminal, viewport, properties, update, writes } = setup();
  context.adjustForViewport();
  assert.equal(properties.get('--terminal-height'), '620px');
  viewport.height = 340;
  update();
  assert.equal(properties.get('--terminal-height'), '340px');
  viewport.offsetTop = 60;
  update();
  const top = parseFloat(properties.get('--terminal-top'));
  const height = parseFloat(properties.get('--terminal-height'));
  assert.equal(top, 60, 'header stays within the panned viewport');
  assert.equal(height, 340, 'pan is not counted as extra usable height');
  assert.equal(top + height, viewport.offsetTop + viewport.height, 'typing row ends at keyboard edge');
  const beforeRepeat = writes();
  update();
  assert.equal(writes(), beforeRepeat, 'unchanged focus notifications do not rewrite layout');
  viewport.height = 620; viewport.offsetTop = 0;
  update();
  assert.equal(properties.get('--terminal-height'), '620px');
  assert.equal(properties.get('--terminal-top'), '0px');
  viewport.scale = 2;
  update();
  assert.equal(properties.size, 0, 'pinch zoom retains native behavior');
  viewport.scale = 1; terminal.style.display = 'none';
  update();
  assert.equal(properties.size, 0, 'returning to setup releases geometry overrides');
});

test('typing keeps the end of a long action visible without moving focus or selection', () => {
  const { context, userInput } = setup();
  userInput.selectionStart = userInput.selectionEnd = userInput.value.length;
  context.adjustForViewport();
  assert.equal(userInput.scrollLeft, userInput.scrollWidth);
  assert.equal(userInput.selectionEnd, userInput.value.length);
  userInput.selectionStart = 10; userInput.selectionEnd = 20; userInput.scrollLeft = 40;
  context.adjustForViewport();
  assert.equal(userInput.scrollLeft, 40, 'editing a selection preserves its visible position');
  userInput.selectionStart = userInput.selectionEnd = 0;
  context.adjustForViewport();
  assert.equal(userInput.scrollLeft, 0, 'the start of the action remains editable');
});

test('keyboard resize retains latest transcript text without pulling readers out of earlier messages', () => {
  const { output, outputViewport, scroll, resize } = setup();
  output.clientHeight = 190;
  scroll(); // Some browsers dispatch this before their resize notification.
  assert.equal(outputViewport.followsLatest, true);
  resize();
  assert.equal(output.scrollTop, output.scrollHeight - output.clientHeight,
    'newest text remains above the typing row after keyboard shrink');
  output.scrollTop = 200;
  scroll();
  assert.equal(outputViewport.followsLatest, false);
  output.clientHeight = 470;
  resize();
  assert.equal(output.scrollTop, 200, 'closing keyboard preserves a deliberate reading position');
});
