'use strict';
// Local regression preview: real routes, Session, persistence and animation.
// Synthetic model replies deliberately reproduce the short-footer arrival bug.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-transport-continuation-'));
require.cache[require.resolve('../src/engine/api')] = { exports: {
  sendTurn: async (_prompt, messages) => {
    const action = messages.at(-1).content.split('\n')[0];
    const history = messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n');
    const frame = (text, time, tags = '', gcs = 14) => text + '\n' + tags
      + '\n[PATIENT_FOCUS: patient_1 | Preview patient]'
      + `\n[VITALS: HR=${gcs === 14 ? 128 : 146} RR=38 GCS=${gcs} TrueSpO2=99 ETCO2=12]\n[TIME: ${time}]`;
    if (/^begin$/i.test(action)) return frame('Dispatch: "Local transport regression preview. Simulated salicylate poisoning, patient breathing deeply and rapidly."', '0:30');
    if (/load/i.test(action)) return frame('The crew loads the patient into the parked ambulance.', '2:15', '[LOADING]\n[CREW_STATUS: partner=on_scene captain=not_on_scene]');
    if (/^transport to|^go to/i.test(action)) return frame('The ambulance departs for University Medical Center.', '5:45', '[EN_ROUTE:major]\n[CREW_STATUS: partner=driving captain=not_on_scene]');
    if (/^continue|^keep/i.test(action) && !history.includes('new clinical change')) {
      return frame('A new clinical change occurs during transport: the patient becomes confused and restless. The crew awaits your next decision.',
        '14:15', '[TRANSPORT_EVENT]\n[CREW_STATUS: partner=driving captain=not_on_scene]', 10);
    }
    if (/^continue|^keep/i.test(action)) {
      return frame('Medic 96 makes the final turn into the emergency department ambulance bay at University Medical Center, coming to a halt. The receiving team awaits your report.',
        '22:30', '[CREW_STATUS: partner=on_scene captain=not_on_scene]', 10);
    }
    return frame('The receiving team acknowledges your report.', '31:15', '[CREW_STATUS: partner=on_scene captain=not_on_scene]', 10);
  },
  sendDebrief: async () => 'Local transport regression preview. No clinical evaluation was generated.',
} };
const express = require('express');
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  if (req.method === 'POST' && req.path === '/api/scenario/new') {
    Object.assign(req.body, { region_id: 'SUBURBAN', category: 'toxicology',
      instructor: { case_id: 'toxicology-f1f38427b5099d67',
        seed: { weather_id: 'clear', complication_type: 'none', backup_present_on_arrival: false } } });
  }
  next();
});
app.use(require('../src/server/app'));
const port = Number(process.env.PREVIEW_PORT || 3192);
app.listen(port, '127.0.0.1', error => {
  if (error) throw error;
  console.log(`Transport continuation preview: http://127.0.0.1:${port}/`);
});
