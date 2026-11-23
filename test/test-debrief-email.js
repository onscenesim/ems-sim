'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-email-test-'));
process.env.EMS_DATA_DIR = dataDir;
const { sendDebriefEmail } = require('../src/server/debriefEmail');
const router = require('../src/server/routes/scenario');
const persistence = require('../src/server/persistence');
const { deleteSession } = require('../src/server/sessionStore');
const { rollScenario } = require('../src/engine/roller');
const env = { RESEND_API_KEY: 'test-key', RESEND_FROM: 'Simulator <debug@example.com>', DEBRIEF_EMAIL_TO: 'private-owner@example.com' };
const originalFetch = global.fetch;
const originalKey = process.env.RESEND_API_KEY;
const originalFrom = process.env.RESEND_FROM;
const originalTo = process.env.DEBRIEF_EMAIL_TO;
after(() => {
  global.fetch = originalFetch;
  for (const [key, value] of [['RESEND_API_KEY', originalKey], ['RESEND_FROM', originalFrom], ['DEBRIEF_EMAIL_TO', originalTo]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function route(routePath, { id, cookie = '', body = {} } = {}) {
  const entry = router.stack.find(layer => layer.route?.path === routePath);
  let status = 200, result;
  const res = { status(value) { status = value; return this; }, json(value) { result = value; return this; } };
  // The actual limiter is exercised by the browser fixture; isolate route rules here.
  await entry.route.stack.at(-1).handle({ params: { id }, body, headers: { cookie } }, res);
  return { status, body: result };
}

function savedRun(overrides = {}) {
  const seed = rollScenario({ random_seed: 'email-test' });
  const run = { id: randomUUID(), ownerId: 'email-browser-owner', seed, closed: true,
    debriefText: 'Developer debrief: hidden diagnosis.', turns: [{ user: 'Assess', assistant: 'Findings.', sceneMinute: 1 }],
    messages: [{ role: 'user', content: 'Assess' }], ...overrides };
  persistence.save(run);
  return run;
}

test('email contains the full debug attachment and note, fixed recipient, and stable retry key', async () => {
  const calls = [];
  const fetchImpl = async (url, request) => {
    calls.push({ url, request });
    return { ok: true, json: async () => ({ id: 'receipt-1' }) };
  };
  const transcript = { debriefText: 'Private debrief', turns: [{ user: 'Check glucose', assistant: '110', rolls: [{ roll: 19 }] }],
    seed: { hidden: 'ground truth' }, systemPrompt: 'Injected prompt', messages: ['Full message'],
    learningReview: { timeline: ['Evidence'] }, renderConsole: { entries: ['Diagnostic'] } };
  const input = { id: randomUUID(), transcript, message: 'The glucose display flickered.' };
  assert.deepEqual(await sendDebriefEmail(input, { fetchImpl, env }), { accepted: true });
  await sendDebriefEmail(input, { fetchImpl, env });
  const payload = JSON.parse(calls[0].request.body);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.deepEqual(payload.to, ['private-owner@example.com']);
  assert.match(payload.text, /glucose display flickered/);
  assert.equal(calls[0].request.headers['Idempotency-Key'], calls[1].request.headers['Idempotency-Key']);
  const report = Buffer.from(payload.attachments[0].content, 'base64').toString('utf8');
  for (const expected of ['Private debrief', 'Check glucose', 'ground truth', 'Injected prompt', 'Full message', 'Evidence', 'Diagnostic', '19']) assert.ok(report.includes(expected), expected);
});

test('missing configuration, provider rejection, timeout, and malformed receipts never expose provider details', async () => {
  const input = { id: randomUUID(), transcript: {}, message: '' };
  for (const key of Object.keys(env)) {
    await assert.rejects(sendDebriefEmail(input, { env: { ...env, [key]: '' } }), error => error.code === 'email_unavailable');
  }
  for (const fetchImpl of [
    async () => ({ ok: false, json: async () => ({ message: 'Private recipient and API key' }) }),
    async () => { throw new Error('Private recipient and API key'); },
    async () => ({ ok: true, json: async () => ({}) }),
  ]) {
    await assert.rejects(sendDebriefEmail(input, { fetchImpl, env }), error => {
      assert.equal(error.code, 'email_failed');
      assert.doesNotMatch(error.message, /Private|@|test-key/);
      return true;
    });
  }
});

test('email routes enforce ownership and completed debriefs, validate notes, and persist deduplication', async () => {
  process.env.RESEND_API_KEY = env.RESEND_API_KEY;
  process.env.RESEND_FROM = env.RESEND_FROM;
  process.env.DEBRIEF_EMAIL_TO = env.DEBRIEF_EMAIL_TO;
  let sent = 0;
  global.fetch = async () => { sent++; return { ok: true, json: async () => ({ id: 'receipt' }) }; };
  const run = savedRun();
  const request = { id: run.id, cookie: `ems_owner=${run.ownerId}` };
  assert.equal((await route('/:id/debrief/email', { id: randomUUID() })).status, 404);
  assert.equal((await route('/:id/debrief/email', { id: run.id })).status, 403);
  for (const overrides of [{ closed: false }, { debriefText: null }]) {
    const incomplete = savedRun(overrides);
    assert.equal((await route('/:id/debrief/email', { ...request, id: incomplete.id })).status, 409);
  }
  for (const message of [23, {}, 'a'.repeat(5001)]) {
    assert.equal((await route('/:id/debrief/email', { ...request, body: { message } })).status, 400);
  }
  assert.equal(sent, 0);
  const submit = { ...request, body: { message: ' Review the rhythm. ', to: 'someone-else@example.com' } };
  assert.deepEqual(await route('/:id/debrief/email', submit), { status: 200, body: { accepted: true } });
  deleteSession(run.id);
  assert.deepEqual(await route('/:id/debrief/email', submit), { status: 200, body: { accepted: true } });
  assert.equal(sent, 1);
  assert.equal(persistence.load(run.id).debriefEmails.length, 1);
  const status = await route('/debrief-email/status');
  assert.deepEqual(status.body, { available: true });
  assert.doesNotMatch(JSON.stringify(status), /@|test-key/);
  delete process.env.RESEND_API_KEY;
  assert.deepEqual((await route('/debrief-email/status')).body, { available: false });
  assert.equal((await route('/:id/debrief/email', { ...request, body: { message: 'New report' } })).status, 503);
  process.env.RESEND_API_KEY = env.RESEND_API_KEY;
});

test('oversized reports are rejected before contacting the email provider', async () => {
  let called = false;
  await assert.rejects(sendDebriefEmail({ id: randomUUID(), message: '', transcript: { debriefText: 'x'.repeat(11 * 1024 * 1024) } }, {
    env, fetchImpl: async () => { called = true; },
  }), error => error.code === 'report_too_large');
  assert.equal(called, false);
});

test('failed delivery can be retried, and concurrent sends cannot duplicate a report', async () => {
  const run = savedRun();
  const request = { id: run.id, cookie: `ems_owner=${run.ownerId}`, body: { message: 'Retry this.' } };
  global.fetch = async () => ({ ok: false });
  assert.equal((await route('/:id/debrief/email', request)).status, 502);
  let release;
  global.fetch = async () => new Promise(resolve => { release = () => resolve({ ok: true, json: async () => ({ id: 'receipt' }) }); });
  const sending = route('/:id/debrief/email', request);
  assert.equal((await route('/:id/debrief/email', request)).status, 409);
  release();
  assert.equal((await sending).status, 200);
});

test('browser assets do not contain the recipient or delivery key', () => {
  for (const file of fs.readdirSync(path.join(__dirname, '../public'))) {
    if (!/\.(js|html|css)$/.test(file)) continue;
    const contents = fs.readFileSync(path.join(__dirname, '../public', file), 'utf8');
    assert.doesNotMatch(contents, /RESEND_API_KEY|DEBRIEF_EMAIL_TO|private-owner@example\.com/);
  }
});
