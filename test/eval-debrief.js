'use strict';

// Opt-in live-model evaluation (uses GEMINI_API_KEY; makes four API calls):
// node test/eval-debrief.js
// Open the printed URL to review actual generated debriefs in the production UI.
// Human acceptance: the first three cases receive credit for the same care;
// correct suspicion earns additional praise. Only the last case warrants
// criticism for delayed care, tied to visible shock rather than the hidden label.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { sendDebrief } = require('../src/engine/api');
const { buildDebriefContext } = require('../src/engine/assembler');
const { parseDebriefResponse } = require('../src/engine/prompts/debrief');
const { evaluateObjectives } = require('../src/engine/learning');

const seed = {
  scenario_id: 'debrief-care-first-evaluation', timestamp_start: '2026-10-05T12:00:00Z',
  category: 'medical', difficulty: 'HARD', provider_level: 'BLS', region: 'urban',
  presentation: 'Abdominal pain with shock from a ruptured abdominal aortic aneurysm',
  true_diagnosis: 'Ruptured abdominal aortic aneurysm with internal hemorrhage',
  hint: 'Internal hemorrhage requires prompt surgical care. Support ABCs, minimize scene time, and transport to a facility with emergency vascular surgery. Definitive confirmation requires hospital evaluation.',
  patient_age: 72, sex: 'male', trajectory: 'progressive shock',
  complication_type: 'traffic delay', total_scene_minutes: 18,
};
const initial = {
  user: 'Check scene safety, ABCs, vitals, blood glucose, and a focused exam and history.',
  assistant: 'Scene safe. Awake, patent airway, adequate breathing, pale and clammy with weak radial pulses. Sudden diffuse abdominal pain and lightheadedness. No external bleeding or trauma. No medications, allergies, fever, or known aortic disease reported. Abdomen diffusely tender; no palpable mass. The nearby receiving hospital has emergency vascular surgery. ALS cannot intercept sooner than arrival there.',
  sceneMinute: 2, vitals: { HR: 124, BP: '82/50', RR: 24, SpO2: 96, Glucose: 112, GCS: 15 },
};
function caseTurns(impression, delayed) {
  return [initial, {
    user: `${impression} ${delayed
      ? 'Keep the patient here for 20 minutes to see whether the pain resolves before deciding about transport.'
      : 'Recognize shock. Keep warm, position as tolerated, monitor ABCs, and load now for the receiving facility with emergency vascular surgery. Pre-notify with shock, vitals, pain, and uncertain cause; request immediate resuscitation assessment.'}`,
    assistant: delayed
      ? 'After 20 minutes on scene, the patient is more confused, still pale, with increasingly weak pulses.'
      : 'Patient secured, warm, and departing at T+4. Receiving team acknowledges the shock report. Traffic adds three unavoidable minutes.',
    sceneMinute: delayed ? 22 : 4, vitals: { HR: 128, BP: delayed ? '66/40' : '80/48', RR: 24, SpO2: 96, GCS: delayed ? 13 : 15 },
  }, {
    user: delayed
      ? 'Now recognize shock, keep warm, load, and transport to the hospital with emergency vascular surgery. Pre-notify. Reassess ABCs and perfusion en route.'
      : 'Continue transport. Reassess airway, breathing, mental status, and perfusion repeatedly; update the receiving team with the trend. Keep warm and prepare assisted ventilation if breathing becomes inadequate.',
    assistant: 'Airway remains patent and ventilation adequate. Pulses remain weak despite supportive care. Transport continues to the notified facility.',
    sceneMinute: delayed ? 26 : 10, vitals: { HR: 132, BP: '76/46', RR: 26, SpO2: 96, GCS: 14 },
  }, {
    user: 'Transfer care with onset, exam, vital trends, working impression and uncertainty, interventions and response.',
    assistant: 'Hospital team accepts care and initiates emergency evaluation.',
    sceneMinute: delayed ? 38 : 18, report: true,
  }];
}
const cases = [
  ['Uncertain cause, sound care', 'Shock of uncertain cause; I cannot establish a definitive diagnosis here.', false],
  ['Incorrect diagnosis, sound care', 'My leading suspicion is sepsis, though the cause remains uncertain.', false],
  ['Correct suspicion, sound care', 'I suspect internal hemorrhage, possibly a ruptured abdominal aortic aneurysm.', false],
  ['Anchoring with harmful delay', 'I think this is benign gastritis; the low pressure does not concern me.', true],
];

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for the live evaluation.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-debrief-eval-'));
  const reviews = [];
  for (const [label, impression, delayed] of cases) {
    const turns = caseTurns(impression, delayed);
    const caseSeed = { ...seed, total_scene_minutes: delayed ? 38 : 18 };
    const context = buildDebriefContext(caseSeed, turns, delayed ? 24 : 4);
    const raw = await sendDebrief(context, seed.provider_level);
    const { debrief, patientOutcome } = parseDebriefResponse(raw, seed.timestamp_start);
    reviews.push({ label, review: { ...evaluateObjectives(caseSeed, turns), debriefText: debrief }, patientOutcome });
    fs.writeFileSync(path.join(directory, 'reviews.json'), JSON.stringify(reviews, null, 2));
    console.log(`Generated: ${label}`);
  }
  const app = express();
  app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'preview-debrief.html')));
  app.use('/public', express.static(path.join(__dirname, '../public')));
  app.get('/reviews.json', (_req, res) => res.sendFile(path.join(directory, 'reviews.json')));
  app.listen(0, '127.0.0.1', function () {
    console.log(`Live evaluation preview: http://127.0.0.1:${this.address().port}`);
    console.log(`Generated results: ${directory}/reviews.json`);
  });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
