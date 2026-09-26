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

test('scene cues stop the action before the result, cancel on hiding, and fade before the next scene', () => {
  let now=0;
  const timers=[],events=[],listeners=new Map();
  const context=vm.createContext({
    document:{hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
    setTimeout:(fn,ms)=>{const timer={fn,at:now+ms};timers.push(timer);return timer;},
    clearTimeout:timer=>{const i=timers.indexOf(timer);if(i>=0)timers.splice(i,1);},
    playSound:name=>{events.push([name,'play',now]);return {volume:1,paused:false,ended:false,pause(){this.paused=true;events.push([name,'pause',now]);}};},
  });
  vm.runInContext(source.slice(source.indexOf('function scheduleSceneAudio('),source.indexOf('function animateProcedureScene(')),context);
  const advance=ms=>{const end=now+ms;while(true){timers.sort((a,b)=>a.at-b.at);if(!timers.length||timers[0].at>end)break;const t=timers.shift();now=t.at;t.fn();}now=end;};
  const finish=context.scheduleSceneAudio({action:'suction',resultSound:'success',resultAt:2880});
  advance(100);assert.deepEqual(events,[['suction','play',100]]);
  advance(2780);assert.deepEqual(events.slice(-2),[['suction','pause',2880],['success','play',2880]]);
  advance(720);finish();advance(200);assert.deepEqual(events.at(-1),['success','pause',3800]);assert.equal(timers.length,0);assert.equal(listeners.size,0);
  events.length=0;
  context.scheduleSceneAudio({action:'intubation',resultSound:'fail',resultAt:6480});
  advance(100);context.document.hidden=true;listeners.get('visibilitychange')();context.document.hidden=false;advance(7000);
  assert.deepEqual(events.map(e=>e.slice(0,2)),[['intubation','play'],['intubation','pause']]);assert.equal(timers.length,0);
});
