'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-sim-auth-routes-'));
process.env.EMS_DATA_DIR = dataDir;
const { router } = require('../src/server/routes/auth');

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function route(pathname, method = 'get', body = {}, headers = {}) {
  const layer = router.stack.find(entry => entry.route?.path === pathname && entry.route.methods[method]);
  let status = 200;
  let payload;
  const responseHeaders = {};
  const res = {
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
    setHeader(name, value) { responseHeaders[name.toLowerCase()] = value; },
  };
  await layer.route.stack[0].handle({ body, headers }, res);
  return { status, body: payload, headers: responseHeaders };
}

test('auth routes create, restore, reject duplicates, and clear a player session', async () => {
  const signup = await route('/signup', 'post', { displayName: 'Medic Tester', pin: '4321' });
  assert.equal(signup.status, 201);
  const cookie = signup.headers['set-cookie'].split(';')[0];
  assert.equal(signup.body.player.displayName, 'Medic Tester');

  const me = await route('/me', 'get', {}, { cookie });
  assert.equal(me.body.player.displayName, 'Medic Tester');

  const duplicate = await route('/signup', 'post', { displayName: 'medic tester', pin: '9999' });
  assert.equal(duplicate.status, 409);

  const logout = await route('/logout', 'post', {}, { cookie });
  assert.equal(logout.status, 200);

  const signedOut = await route('/me', 'get', {}, { cookie });
  assert.deepEqual(signedOut.body, { player: null });
});

test('briefing preferences require a player, validate booleans, and stay with that account', async () => {
  const guest = await route('/preferences', 'post', { showFieldBriefing: false });
  assert.equal(guest.status, 401);
  const signup = await route('/signup', 'post', { displayName: 'Quiet Briefing', pin: '2468' });
  const cookie = signup.headers['set-cookie'].split(';')[0];
  assert.equal(signup.body.player.preferences.showFieldBriefing, true);
  for (const value of ['false', null, 0]) {
    const invalid = await route('/preferences', 'post', { showFieldBriefing: value }, { cookie });
    assert.equal(invalid.status, 400);
  }
  const saved = await route('/preferences', 'post', { showFieldBriefing: false }, { cookie });
  assert.equal(saved.body.player.preferences.showFieldBriefing, false);
  await route('/logout', 'post', {}, { cookie });
  const login = await route('/login', 'post', { displayName: 'Quiet Briefing', pin: '2468' });
  assert.equal(login.body.player.preferences.showFieldBriefing, false);
  const other = await route('/signup', 'post', { displayName: 'New Briefing', pin: '1357' });
  assert.equal(other.body.player.preferences.showFieldBriefing, true);
  const restoredCookie = login.headers['set-cookie'].split(';')[0];
  const enabled = await route('/preferences', 'post', { showFieldBriefing: true }, { cookie: restoredCookie });
  assert.equal(enabled.body.player.preferences.showFieldBriefing, true);
});
