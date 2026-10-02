'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const audioSource = source.slice(0, source.indexOf('const SURGICAL_PROCS'));
const flush = () => new Promise(resolve => setImmediate(resolve));

function soundFixture({ delayed = false } = {}) {
  const nodes = [], gains = [], requests = [];
  let releaseFetch;
  const ctx = {
    state: 'running', currentTime: 0, destination: {}, sampleRate: 44100,
    createBuffer: () => ({ duration: 1 / 44100, silent: true }),
    decodeAudioData: async () => ({ duration: 4 }),
    createBufferSource() {
      const node = { connect() { return gains.at(-1); }, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } };
      nodes.push(node); return node;
    },
    createGain() {
      const gain = { gain: { value: 1 }, connect() {}, disconnect() {} };
      gains.push(gain); return gain;
    },
    resume() { this.state = 'running'; return Promise.resolve(); },
    suspend() { this.state = 'suspended'; return Promise.resolve(); },
  };
  const context = vm.createContext({
    window: { AudioContext: function () { return ctx; } }, EventTarget, Event,
    setTimeout, clearTimeout, btoa,
    Audio: class {
      constructor(src) { this.src = src; }
      setAttribute() {}
      play() { return Promise.resolve(); }
      pause() {}
    },
    document: { hidden: false }, soundEnabled: true,
    fetch: async url => { requests.push(url); if (delayed) await new Promise(resolve => { releaseFetch = resolve; }); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; },
    console: { log() {}, warn() {} },
  });
  vm.runInContext(audioSource + '\nthis.activeCount = () => ACTIVE_SOUND_VOICES.size;', context);
  return { context, ctx, nodes, gains, requests, release: () => releaseFetch() };
}

test('shared mixer plays every overlapping cue with one decode and releases ended voices', async () => {
  const f = soundFixture();
  assert.equal(f.requests.length, 0, 'lazy load; no media decoder library on page load');
  const voices = Array.from({ length: 4 }, () => f.context.playSound('healing'));
  await flush();
  assert.equal(f.requests.length, 1);
  assert.equal(f.nodes.length, 4, 'no two-voice cap silently dropping the third cue');
  assert.ok(f.nodes.every(node => node.started && !node.stopped));
  assert.ok(f.gains.every(gain => gain.gain.value === 1));
  f.nodes.forEach(node => node.onended());
  assert.ok(voices.every(voice => voice.ended));
  assert.equal(f.context.activeCount(), 0);
  f.context.playSound('healing'); await flush();
  assert.equal(f.requests.length, 1, 'reuses decoded audio');
});

test('mute, backgrounding and explicit stop cancel pending decodes without a later burst', async () => {
  for (const mode of ['stop', 'mute', 'hidden']) {
    const f = soundFixture({ delayed: true });
    const voice = f.context.playSound('healing');
    if (mode === 'stop') f.context.stopAllSounds();
    if (mode === 'mute') f.context.soundEnabled = false;
    if (mode === 'hidden') f.context.document.hidden = true;
    f.release(); await flush();
    assert.equal(f.nodes.length, 0, mode);
    assert.equal(voice.paused, true);
    assert.equal(f.context.activeCount(), 0);
  }
});

test('suspended sessions do not queue stale cues; a gesture resumes playback', async () => {
  const f = soundFixture();
  f.ctx.state = 'suspended';
  f.context.playSound('fail'); await flush();
  assert.equal(f.nodes.length, 0);
  vm.runInContext(source.slice(source.indexOf('function unlockAudio()'), source.indexOf('// Capture runs')), f.context);
  f.context.unlockAudio(); await flush();
  f.context.playSound('success'); await flush();
  assert.equal(f.nodes.filter(node => !node.buffer.silent).length, 1);
  assert.equal(f.ctx.state, 'running');
});

test('disabled and hidden pages never request sounds; stop targets only the named effect', async () => {
  const f = soundFixture();
  f.context.soundEnabled = false; f.context.playSound('lucas');
  f.context.soundEnabled = true; f.context.document.hidden = true; f.context.playSound('lucas');
  assert.equal(f.requests.length, 0);
  f.context.document.hidden = false;
  const lucas = f.context.playSound('lucas'), healing = f.context.playSound('healing'); await flush();
  f.context.stopSound('lucas');
  assert.equal(lucas.paused, true); assert.equal(healing.paused, false);
  f.context.stopAllSounds(); assert.equal(f.context.activeCount(), 0);
});

test('scene completion never truncates an action; hidden scenes cancel unstarted cues', () => {
  const timers = [], played = [], listeners = new Map();
  const context = vm.createContext({
    document: { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
    setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
    clearTimeout: timer => { const i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1); },
    playSound: name => { const voice = { name, paused: false, pause() { this.paused = true; } }; played.push(voice); return voice; },
  });
  vm.runInContext(source.slice(source.indexOf('function scheduleSceneAudio('), source.indexOf('function animateProcedureScene(')), context);
  const finish = context.scheduleSceneAudio({ action: 'healing', resultSound: 'success', resultAt: 1800 });
  assert.equal(timers[0].ms, 100); timers.shift().fn();
  finish();
  assert.deepEqual(played.map(v => v.name), ['healing']);
  assert.equal(played[0].paused, false, 'full recording survives overlay cleanup');
  assert.equal(timers.length, 0);
  context.scheduleSceneAudio({ action: 'healing', resultAt: 1800 });
  context.document.hidden = true; listeners.get('visibilitychange')();
  assert.equal(timers.length, 0); assert.equal(listeners.size, 0);
});

test('dice feedback plays on the landing frame for all four outcomes', async () => {
  for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
    let tick, now = 0; const timers = [], played = [];
    const el = () => ({ textContent: '', className: '', classList: { add() {}, remove() {} }, setAttribute() {}, getBoundingClientRect() {} });
    const context = vm.createContext({
      OBSTRUCTION_PROCS: new Set(), loadSoundBuffer: async () => {},
      getOutcomeSound: o => ['SUCCESS', 'MARGINAL'].includes(o) ? 'success' : 'fail',
      diceProcEl: el(), diceDCEl: el(), diceOutcomeEl: el(), diceNumberEl: el(), diceSvgEl: el(), diceOverlay: el(),
      playSound: name => played.push({ name, now }),
      setInterval: fn => { tick = fn; }, clearInterval() {},
      setTimeout: fn => timers.push(fn),
    });
    vm.runInContext(source.slice(source.indexOf('function animateDiceRoll('), source.indexOf('// ── Magic 8-ball')), context);
    const done = context.animateDiceRoll('medication_push', 18, 12, outcome);
    for (let i = 1; i <= 12; i++) { now = i * 48; tick(); }
    assert.equal(played.length, 0);
    now = 624; tick();
    assert.deepEqual(played, [{ name: ['SUCCESS', 'MARGINAL'].includes(outcome) ? 'success' : 'fail', now: 624 }]);
    while (timers.length) timers.shift()();
    await done;
    assert.equal(played.length, 1);
  }
});

test('every registered recording exists, including restored medication foley', () => {
  const paths = [...audioSource.matchAll(/: '(\/sounds\/[^']+)'/g)].map(match => match[1]);
  for (const path of paths) assert.ok(fs.statSync(require('node:path').join(__dirname, '../public', path)).size > 44, path);
});

test('failed downloads release voices and retry instead of caching a permanent silence', async () => {
  const f = soundFixture();
  f.context.fetch = async () => ({ ok: false, status: 503 });
  f.context.playSound('healing'); await flush();
  assert.equal(f.context.activeCount(), 0);
  f.context.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
  f.context.playSound('healing'); await flush();
  assert.equal(f.nodes.length, 1);
});

test('HTML fallback retains overlap and releases surplus decoders after stop', () => {
  const voices = [];
  class Audio extends EventTarget {
    constructor(src) { super(); this.src = src; this.paused = true; voices.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute() { this.src = ''; }
    load() {}
  }
  const context = vm.createContext({ window: {}, Audio, document: { hidden: false }, soundEnabled: true, console: { log() {}, warn() {} } });
  vm.runInContext(audioSource, context);
  for (let i = 0; i < 3; i++) assert.ok(context.playSound('lucas'));
  assert.equal(voices.length, 3);
  assert.ok(voices.every(v => !v.paused));
  context.stopSound('lucas');
  assert.ok(voices.every(v => v.paused));
  assert.equal(voices.filter(v => v.src).length, 2);
});

test('first normal gesture primes both outputs synchronously, before asynchronous effects', async () => {
  const f = soundFixture(), events = [], listeners = new Map();
  let primed = false;
  f.context.Audio = class {
    constructor(src) { this.src = src; events.push('create media'); }
    setAttribute() {}
    play() { events.push('media play'); primed = true; return Promise.resolve(); }
  };
  f.ctx.state = 'suspended';
  f.ctx.resume = () => { events.push('resume'); assert.equal(primed, true); f.ctx.state = 'running'; return Promise.resolve(); };
  f.context.document.addEventListener = (name, handler, options) => listeners.set(name, { handler, options });
  vm.runInContext(source.slice(source.indexOf('function unlockAudio()'), source.indexOf('// Stop all sounds when')), f.context);
  for (const event of ['pointerup', 'touchend', 'click', 'keydown']) {
    assert.equal(listeners.get(event).options.capture, true, `${event} activates before the action handler`);
  }
  listeners.get('touchend').handler();
  assert.deepEqual(events, ['create media', 'media play', 'resume']);
  assert.equal(f.nodes[0].buffer.silent, true);
  assert.equal(f.nodes[0].started, true, 'starts a silent source inside the gesture, not after resume resolves');
  f.context.playSound('success'); await flush();
  assert.equal(f.nodes.filter(node => !node.buffer.silent).length, 1);
  listeners.get('click').handler(); await flush();
  assert.equal(events.filter(event => event === 'media play').length, 1, 'reuses the unlocked session');
});

test('first cue waits for an in-flight gesture resume without losing playback', async () => {
  const f = soundFixture(); let finishResume;
  f.ctx.state = 'suspended';
  f.ctx.resume = () => new Promise(resolve => { finishResume = () => { f.ctx.state = 'running'; resolve(); }; });
  vm.runInContext(source.slice(source.indexOf('function unlockAudio()'), source.indexOf('// Capture runs')), f.context);
  f.context.unlockAudio();
  const voice = f.context.playSound('healing'); await flush();
  assert.equal(voice.paused, false, 'do not drop the first cue while resume is settling');
  assert.equal(f.nodes.filter(node => !node.buffer.silent).length, 0);
  finishResume(); await flush();
  assert.equal(f.nodes.filter(node => !node.buffer.silent).length, 1);
});

test('muting during gesture activation still cancels the pending first cue', async () => {
  const f = soundFixture(); let finishResume;
  f.ctx.state = 'suspended';
  f.ctx.resume = () => new Promise(resolve => { finishResume = () => { f.ctx.state = 'running'; resolve(); }; });
  vm.runInContext(source.slice(source.indexOf('function unlockAudio()'), source.indexOf('// Capture runs')), f.context);
  f.context.unlockAudio(); f.context.playSound('healing'); await flush();
  f.context.stopAllSounds(); finishResume(); await flush();
  assert.equal(f.nodes.filter(node => !node.buffer.silent).length, 0);
  assert.equal(f.context.activeCount(), 0);
});

test('a blocked resume expires; later activation cannot replay the abandoned cue', async () => {
  const f = soundFixture(); let expire, finishResume;
  f.context.setTimeout = fn => { expire = fn; return 1; };
  f.context.clearTimeout = () => {};
  f.ctx.state = 'suspended';
  f.ctx.resume = () => new Promise(resolve => { finishResume = () => { f.ctx.state = 'running'; resolve(); }; });
  vm.runInContext(source.slice(source.indexOf('function unlockAudio()'), source.indexOf('// Capture runs')), f.context);
  f.context.unlockAudio();
  const voice = f.context.playSound('healing'); await flush();
  expire(); await flush();
  assert.equal(voice.paused, true);
  finishResume(); await flush();
  assert.equal(f.nodes.filter(node => !node.buffer.silent).length, 0);
  assert.equal(f.context.activeCount(), 0);
});

test('returning from the background re-primes output on the next normal gesture', async () => {
  const f = soundFixture(), listeners = new Map(); let mediaStarts = 0, mediaPauses = 0;
  f.context.Audio = class {
    setAttribute() {}
    play() { mediaStarts++; return Promise.resolve(); }
    pause() { mediaPauses++; }
  };
  f.context.document.addEventListener = (name, handler) => listeners.set(name, handler);
  vm.runInContext(source.slice(source.indexOf('function unlockAudio()'), source.indexOf('const startScreen')), f.context);
  listeners.get('click')(); await flush();
  assert.equal(mediaStarts, 1);
  f.context.document.hidden = true; listeners.get('visibilitychange')();
  assert.equal(mediaPauses, 1);
  f.context.document.hidden = false; listeners.get('visibilitychange')(); await flush();
  listeners.get('touchend')(); await flush();
  assert.equal(mediaStarts, 2);
  assert.equal(f.nodes.filter(node => node.buffer.silent).length, 2);
});
