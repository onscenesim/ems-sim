'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-sim-players-'));
process.env.EMS_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test('player signup, login, tracking, logout, and reload use durable storage', async () => {
  const modulePath = require.resolve('../src/server/playerStore');
  let players = require(modulePath);

  const created = await players.signup('Station 12', '2468');
  assert.equal(created.player.displayName, 'Station 12');
  assert.equal(created.player.stats.scenariosStarted, 0);
  assert.equal(players.getPlayerByToken(created.token).id, created.player.id);

  await assert.rejects(players.signup('station 12', '1111'), { code: 'player_exists' });
  await assert.rejects(players.login('Station 12', '9999'), { code: 'invalid_login' });

  players.recordScenarioStarted(created.player.id);
  players.recordScenarioCompleted(created.player.id, { category: 'medical' });
  players.recordDebriefGenerated(created.player.id);
  const loggedIn = await players.login('STATION 12', '2468');
  assert.equal(loggedIn.player.stats.scenariosStarted, 1);
  assert.equal(loggedIn.player.stats.scenariosCompleted, 1);
  assert.equal(loggedIn.player.stats.debriefsGenerated, 1);
  assert.equal(loggedIn.player.stats.categoryCompletions.medical, 1);
  assert.deepEqual(loggedIn.player.stats.recentCategories, ['medical']);

  assert.equal(fs.existsSync(path.join(dataDir, 'players.json')), true);
  delete require.cache[modulePath];
  players = require(modulePath);
  assert.equal(players.getPlayerByToken(loggedIn.token).displayName, 'Station 12');

  players.logout(loggedIn.token);
  assert.equal(players.getPlayerByToken(loggedIn.token), null);
});

test('player credentials reject unsuitable names and PINs', async () => {
  const players = require('../src/server/playerStore');
  await assert.rejects(players.signup('A', '1234'), { code: 'invalid_player_name' });
  await assert.rejects(players.signup('Valid Name', '12ab'), { code: 'invalid_pin' });
  await assert.rejects(players.signup('<script>', '1234'), { code: 'invalid_player_name' });
});
