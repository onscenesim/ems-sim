'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const audioSource = source.slice(0, source.indexOf('const SURGICAL_PROCS'));

function soundFixture() {
  const voices = [];
  class FakeAudio {
    constructor(src = '') {
      this.src = src;
      this.paused = true;
      this.ended = false;
      this.currentTime = 0;
      this.preload = '';
      this.muted = false;
      this.playCount = 0;
      voices.push(this);
    }
    cloneNode() { return new FakeAudio(this.src); }
    play() {
      this.paused = false;
      this.ended = false;
      this.playCount++;
      return Promise.resolve();
    }
    pause() { this.paused = true; }
  }
  const context = vm.createContext({
    Audio: FakeAudio,
    document: { hidden: false },
    soundEnabled: true,
    console: { log() {}, warn() {} },
  });
  vm.runInContext(audioSource + '\nthis.playSound = playSound; this.stopSound = stopSound; this.voicesFor = name => SOUND_VOICE_POOLS.get(name);', context);
  return { context, voices };
}

test('sound playback uses independent preloaded voices instead of rewinding an active cue', async () => {
  const { context } = soundFixture();
  const pool = context.voicesFor('lucas');
  assert.equal(pool.length, 2);
  assert.ok(pool.every(voice => voice.preload === 'auto'));

  context.playSound('lucas');
  context.playSound('lucas');
  assert.equal(pool[0].playCount, 1);
  assert.equal(pool[1].playCount, 1);
  assert.equal(pool[0].paused, false);
  assert.equal(pool[1].paused, false);

  // A third simultaneous trigger must get a fresh voice, never interrupting
  // either active LUCAS cue.
  context.playSound('lucas');
  const expanded = context.voicesFor('lucas');
  assert.equal(expanded.length, 3);
  assert.ok(expanded.every(voice => voice.playCount === 1 && !voice.paused));

  context.stopSound('lucas');
  assert.ok(expanded.every(voice => voice.paused && voice.currentTime === 0));
});

test('sound playback stays silent when disabled or backgrounded', () => {
  const { context } = soundFixture();
  const pool = context.voicesFor('lucas');
  context.soundEnabled = false;
  context.playSound('lucas');
  assert.ok(pool.every(voice => voice.playCount === 0));
  context.soundEnabled = true;
  context.document.hidden = true;
  context.playSound('lucas');
  assert.ok(pool.every(voice => voice.playCount === 0));
});
