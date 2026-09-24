'use strict';
// Local-only UI fixture. Uses real routes, persistence, auth, and learning UI;
// model responses are synthetic so verification needs no API or clinical calls.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-practice-preview-'));
const apiPath = require.resolve('../src/engine/api');
require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: {
  sendTurn: async (prompt, messages) => {
    const minute = messages.filter(m => m.role === 'user').length;
    return minute === 1
      ? `DISPATCH: Local preview fixture — simulated patient awaiting your assessment. ${prompt.match(/Season: (.*)/)?.[1] || ''} [TIME: 1:00]`
      : `Local preview fixture: your action is recorded. [VITALS: HR=100 BP=120/80 RR=18 SpO2=97 GCS=15] [TIME: ${minute}:00]`;
  },
  sendDebrief: async () => 'LOCAL PREVIEW FIXTURE. Review the recorded decisions and observations below. This is not clinical guidance.\n[PATIENT_OUTCOME: Discharged home on September 26, 2026]',
} };
const app = require('../src/server/app');
const { randomUUID } = require('node:crypto');
const { rollScenario } = require('../src/engine/roller');
const { evaluateObjectives } = require('../src/engine/learning');
const persistence = require('../src/server/persistence');
const playerStore = require('../src/server/playerStore');
async function main() {
  const { player, token } = await playerStore.signup('Preview Medic', '2468');
  const seed = rollScenario({ category: 'trauma', random_seed: 'library-preview', user_id: `player:${player.id}` });
  seed.special_flags = 'two_patients';
  const first = { id: randomUUID(), playerId: player.id, ownerId: randomUUID(), seed, initialSeed: structuredClone(seed), closed: true, debriefText: 'LOCAL PREVIEW FIXTURE. Review the recorded decisions and intervention branches below. No clinical score has been assigned.', patientOutcome: 'Discharged to skilled nursing on September 28, 2026', turns: [
    { user: 'Check vitals', assistant: 'Preview patient has recorded observations.', sceneMinute: 2, vitals: { HR: 120, BP: '100/60' }, rolls: [{ procedure_id: 'vitals_manual', outcome: 'SUCCESS' }] },
    { user: 'Assess the second patient', assistant: 'The second patient answers questions.', sceneMinute: 2.5, patientFocus: { id: 'patient_2' }, vitals: { HR: 75, BP: '124/78' }, rolls: [] },
    { user: 'Apply direct pressure', assistant: 'The dressing shifts; the bleeding remains visible.', sceneMinute: 3, rolls: [{ procedure_id: 'bleeding_control', outcome: 'FAILURE', roll: 6, dc: 12 }] },
    { user: 'Recheck vitals', assistant: 'Repeat observations recorded.', sceneMinute: 5, vitals: { HR: 110, BP: '110/70' }, rolls: [{ procedure_id: 'reassessment', outcome: 'SUCCESS' }] },
    { user: 'Report the assessment and care to the receiving team', assistant: 'The receiving team acknowledges the report.', sceneMinute: 6, report: true, rolls: [] },
  ], messages: [], meta: {}, crew: {} };
  first.learningReview = evaluateObjectives(seed, first.turns);
  persistence.save(first);
  const secondSeed = rollScenario({ category: 'medical', random_seed: 'library-preview-two', user_id: `player:${player.id}` });
  secondSeed.timestamp_start = new Date(Date.now() - 86400000).toISOString();
  const second = {
    ...structuredClone(first), id: randomUUID(), seed: secondSeed, initialSeed: structuredClone(secondSeed),
    patientOutcome: 'Discharged home on September 25, 2026',
  };
  second.learningReview = evaluateObjectives(secondSeed, second.turns);
  persistence.save(second);
  const wrapper = require('express')();
  wrapper.get('/__preview/player', (_req, res) => {
    res.setHeader('Set-Cookie', `ems_player=${token}; Path=/; HttpOnly; SameSite=Strict`);
    res.redirect('/');
  });
  wrapper.use(app);
  const port = Number(process.env.PREVIEW_PORT || 3010);
  const server = wrapper.listen(port, '127.0.0.1', () => console.log(`Synthetic UI preview: http://127.0.0.1:${port} — fixture player: /__preview/player`));
  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.on('close', resolve);
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
