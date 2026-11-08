'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('keyboard viewport changes keep the composer at the visible bottom without moving the terminal', () => {
  const source = fs.readFileSync(require.resolve('../public/app'), 'utf8');
  const properties = new Map(), frames = [], events = {};
  const terminal = { style: { display: 'flex', setProperty: (k, v) => properties.set(k, v), removeProperty: k => properties.delete(k) } };
  const viewport = { height: 620, offsetTop: 0, scale: 1, addEventListener: (name, fn) => { events[name] = fn; } };
  const context = vm.createContext({ terminal, window: { visualViewport: viewport, addEventListener() {} },
    userInput: { addEventListener() {} }, requestAnimationFrame: fn => { frames.push(fn); return frames.length; } });
  vm.runInContext(source.slice(source.indexOf('function adjustForViewport()'), source.indexOf("document.addEventListener('click', e => {", source.indexOf('function adjustForViewport()'))), context);
  const update = () => { events.resize(); events.scroll(); assert.equal(frames.length, 1, 'coalesce keyboard animation events'); frames.shift()(); };
  context.adjustForViewport();
  assert.equal(properties.get('--terminal-height'), '620px');
  viewport.height = 340;
  update();
  assert.equal(properties.get('--terminal-height'), '340px', 'keyboard shrinks usable height even when CSS dvh stays tall');
  viewport.offsetTop = 60;
  update();
  assert.equal(properties.get('--terminal-height'), '400px', 'native focus pan is included exactly once');
  assert.equal(terminal.style.top, undefined, 'never move the terminal during native pan');
  viewport.height = 620; viewport.offsetTop = 0;
  update();
  assert.equal(properties.get('--terminal-height'), '620px', 'closing keyboard restores the composer');
  viewport.scale = 2;
  update();
  assert.equal(properties.has('--terminal-height'), false, 'pinch zoom retains browser behavior');
  viewport.scale = 1; terminal.style.display = 'none';
  update();
  assert.equal(properties.has('--terminal-height'), false, 'returning to setup releases the override');
});
