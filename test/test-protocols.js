'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-protocol-tests-'));
process.env.EMS_DATA_DIR = temp;
const apiPath = require.resolve('../src/engine/api');
require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: {
  sendTurn: async () => 'Test dispatch. [TIME: 1:00]',
} };
const Protocols = require('../public/protocols');
const { rollScenario } = require('../src/engine/roller');
const { assembleSeedBlock, buildDebriefContext } = require('../src/engine/assembler');
const { buildDebriefPrompt } = require('../src/engine/prompts/debrief');
const { hasCardiacMonitor, unavailableProcedure } = require('../src/engine/equipment');
const { createSession, getSession, restoreSession } = require('../src/server/sessionStore');
const persistence = require('../src/server/persistence');
const router = require('../src/server/routes/scenario');
after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('ALS and BLS defaults match requested capabilities and stay separate', () => {
  const als = Protocols.resolve('ALS', 'SUBURBAN');
  assert.deepEqual(Object.keys(als).filter(id => !als[id]).sort(), ['rsi', 'blood', 'finger_thoracostomy', 'norepinephrine', 'ventilator', 'bipap'].sort());
  const bls = Protocols.resolve('BLS', 'SUBURBAN');
  assert.equal(bls.iv_fluids, false);
  assert.equal(bls.ecg_transmit, false);
  assert.equal(bls.sga_arrest, true);
  assert.equal(bls.sga_alive, false);
  assert.equal(bls.rsi, undefined);
});

test('server ignores unknown, cross-level and non-boolean preferences; locks cannot be bypassed', () => {
  for (const level of ['ALS', 'BLS']) {
    const all = Object.fromEntries(Protocols.catalog(level).map(item => [item.id, true]));
    for (const region of ['CALIFORNIA_Urban', 'INTERNATIONAL_DEVELOPING']) {
      const seed = rollScenario({ provider_level: level, region_id: region, protocols: all });
      for (const item of Protocols.catalog(level)) assert.equal(seed.protocols[item.id], !Protocols.lockReason(item, region));
    }
  }
  const values = Protocols.resolve('ALS', 'SUBURBAN', { rsi: 'true', blood: 1, arbitrary: true, iv_fluids: true, ketamine: false });
  assert.equal(values.rsi, false); assert.equal(values.blood, false);
  assert.equal(values.arbitrary, undefined); assert.equal(values.iv_fluids, undefined); assert.equal(values.ketamine, false);
  for (const malformed of [null, [], 'all', 42]) assert.deepEqual(Protocols.resolve('ALS', 'SUBURBAN', malformed), Protocols.resolve('ALS', 'SUBURBAN'));
});

test('intubation dependencies do not erase independent drug or sedation permissions', () => {
  const choices = { intubation: false, rsi: true, medication_intubation: true, post_intubation_sedation: true, ketamine: true };
  const resolved = Protocols.resolve('ALS', 'SUBURBAN', choices);
  assert.equal(resolved.rsi, false); assert.equal(resolved.medication_intubation, false);
  assert.equal(resolved.post_intubation_sedation, true); assert.equal(resolved.ketamine, true);
  assert.equal(choices.rsi, true);
});

test('simulation and debrief use the same run snapshot without old regional scope or action barriers', () => {
  const seed = rollScenario({ region_id: 'CALIFORNIA_Urban' });
  const scenario = assembleSeedBlock(seed);
  const debrief = buildDebriefContext(seed);
  for (const context of [scenario, debrief]) {
    assert.ok(context.includes(Protocols.describe(seed)));
    assert.match(context, /Never criticize omission of a crossed-off item/);
    assert.match(context, /No separate scope score, automatic failure, extra weighting/);
    assert.match(context, /never block a player action/);
  }
  assert.doesNotMatch(scenario, /ALS scope tag|BLS scope notes|CALIFORNIA BASE HOSPITAL CONTACT/);
  assert.match(buildDebriefPrompt('BLS'), /Included items are eligible for ordinary review only when clinically indicated/);
  for (const enabled of [true, false]) {
    const bls = rollScenario({ provider_level: 'BLS', protocols: { ecg_transmit: enabled, iv_fluids: enabled } });
    assert.equal(hasCardiacMonitor(bls), true);
    assert.equal(unavailableProcedure('twelve_lead', { monitor_available: hasCardiacMonitor(bls) }), null);
    assert.doesNotMatch(assembleSeedBlock(bls), /no 12-lead/);
  }
});

test('request choices reach saved seeds, restore, and replay independently of current choices', async () => {
  const layer = router.stack.find(entry => entry.route?.path === '/new' && entry.route.methods.post);
  let payload, status = 200;
  const res = { status(value) { status = value; return this; }, json(value) { payload = value; return this; }, setHeader() {} };
  await layer.route.stack[0].handle({ body: { provider_level: 'BLS', protocols: { iv_fluids: true, ecg_transmit: true, sga_arrest: false } }, headers: {}, ip: 'test' }, res);
  assert.equal(status, 200);
  const saved = persistence.load(payload.session_id);
  assert.equal(saved.seed.protocols.iv_fluids, true);
  assert.equal(saved.initialSeed.protocols.ecg_transmit, true);
  assert.equal(saved.seed.protocols.sga_arrest, false);
  const restored = restoreSession(saved);
  assert.deepEqual(restored.seed.protocols, saved.seed.protocols);
  const replay = createSession({ replay_seed: saved.initialSeed, protocols: { iv_fluids: false } });
  assert.deepEqual(replay.seed.protocols, saved.initialSeed.protocols);
  replay.seed.protocols.iv_fluids = false;
  assert.equal(saved.initialSeed.protocols.iv_fluids, true);
  assert.equal(getSession(payload.session_id).seed.protocols.ecg_transmit, true);
});
