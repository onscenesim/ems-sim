'use strict';

// Offline preview of the exact evaluator input, with the same ECG renderer as
// the app. No model calls or generated grading claims.
const express = require('express');
const path = require('node:path');
const { evidenceFixture } = require('./fixtures/debrief-evidence');
const { buildDebriefContext } = require('../src/engine/assembler');

const fixture = evidenceFixture();
const app = express();
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'preview-debrief-evidence.html')));
app.use('/public', express.static(path.join(__dirname, '../public')));
app.get('/evidence.json', (_req, res) => res.json({
  ...fixture,
  contexts: fixture.turns.map((_, index) => buildDebriefContext(fixture.seed, fixture.turns.slice(0, index + 1), index >= 2 ? 4 : null)),
}));
app.listen(0, '127.0.0.1', function (error) {
  if (error) throw error;
  console.log(`Debrief evidence preview: http://127.0.0.1:${this.address().port}`);
});
