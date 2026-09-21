'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-sim-storage-'));
process.env.EMS_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test('session snapshots use the configured durable data directory', () => {
  const persistence = require('../src/server/persistence');
  persistence.save({ id: 'persist-test', value: 42 });
  assert.equal(persistence.load('persist-test').value, 42);
  assert.equal(fs.existsSync(path.join(dataDir, 'persist-test.json')), true);
});

test('completed admin runs and debriefs survive a module restart', () => {
  const modulePath = require.resolve('../src/server/adminLogger');
  let logger = require(modulePath);
  logger.logRun('run-1', {
    scenario_id: 'scenario-1', timestamp_start: '2026-01-01T00:00:00.000Z',
    category: 'medical', presentation: 'test', difficulty: 'NORMAL',
    provider_level: 'ALS', region: 'SUBURBAN', patient_name: 'Test Patient',
    patient_age: 50, sex: 'female', age_group: 'middle_aged', events: [],
  }, [{ role: 'user', content: 'begin' }]);
  logger.updateRunDebrief('run-1', 'Durable debrief');

  delete require.cache[modulePath];
  logger = require(modulePath);
  assert.equal(logger.getRunById('run-1').debrief, 'Durable debrief');
  assert.equal(logger.getRuns().length, 1);
});

test('health check fails closed when Gemini is not configured', () => {
  const app = require('../src/server/app');
  const layer = app.router.stack.find(entry => entry.route?.path === '/health');
  const handler = layer.route.stack[0].handle;
  const originalKey = process.env.GEMINI_API_KEY;
  let status = 200;
  let payload;
  const res = {
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
  };

  delete process.env.GEMINI_API_KEY;
  handler({}, res);
  assert.equal(status, 503);
  assert.deepEqual(payload, { status: 'not_ready', missing: ['GEMINI_API_KEY'] });

  process.env.GEMINI_API_KEY = 'test-key';
  status = 200;
  handler({}, res);
  assert.equal(status, 200);
  assert.deepEqual(payload, { status: 'ok' });
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
});
