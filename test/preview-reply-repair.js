'use strict';

// Focused browser preview for the out-of-scene reply repair. Uses the real
// Session path with a scripted model; no API key or patient data is needed.
const path = require('node:path');
const express = require('express');
const { rollScenario } = require('../src/engine/roller');
let mode, calls;
const apiPath = require.resolve('../src/engine/api');
require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: {
  sendTurn: async () => {
    calls++;
    if (calls === 1 || mode === 'repeat') return "She's stable. Call a report to the hospital";
    return 'Alice looks toward you and nods under the blankets.\nPatient: "Thank you. It still hurts, but I feel safer now."\n[CREW_STATUS: partner=driving captain=not_on_scene]\n[VITALS: HR=100 BP=108/70 RR=18 GCS=15]\n[TIME: 13:30]';
  },
  sendDebrief: async () => '',
} };
const { Session } = require('../src/engine/session');
const app = express();
app.use('/public', express.static(path.join(__dirname, '../public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'preview-reply-repair.html')));
app.post('/simulate/:mode', async (req, res) => {
  mode = req.params.mode;
  calls = 0;
  const seed = rollScenario({ random_seed: 'reply-repair-preview', category: 'ob' });
  const session = new Session(seed, 'reply-repair-preview');
  session.sceneMinute = 13;
  session.moving = true;
  try {
    const result = await session.send('I know. No one deserves to go through this.');
    res.json({ reply: result.reply, calls, turns: session.turns.length, minute: session.sceneMinute,
      storedReply: session.messages.at(-1)?.content });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, calls,
      turns: session.turns.length, minute: session.sceneMinute });
  }
});
const port = process.env.PORT || 3107;
app.listen(port, '127.0.0.1', () => console.log(`Reply repair preview: http://127.0.0.1:${port}`));
