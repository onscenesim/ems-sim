'use strict';
// Local QA: production detection, Session tag parsing, roll log and monitor UI.
// Measurements are synthetic fixtures; this preview never calls a model.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const fixtures = {
  before: 'No advanced airway placed. [VITALS: HR=90 Rhythm=sinus GCS=3] [TIME: 0:30]',
  igel: 'i-gel placed; inline capnography reads 38 mmHg. [VITALS: HR=90 Rhythm=sinus EtCO2=38 RR=10 GCS=3] [TIME: 1:00]',
  ett: 'ET tube confirmed; inline capnography reads 42 mmHg. [VITALS: HR=90 Rhythm=sinus ETCO₂=42 RR=10 GCS=3] [TIME: 2:00]',
  flat: 'Flat capnography trace: measured zero. [VITALS: HR=90 Rhythm=sinus etco2=0 RR=0 GCS=3] [TIME: 3:00]',
  disconnected: 'Capnography sensor disconnected. [VITALS: HR=90 Rhythm=sinus EtCO2=not_placed GCS=3] [TIME: 4:00]',
};
require.cache[require.resolve('../src/engine/api')] = { exports: {
  sendTurn: async (_prompt, messages) => fixtures[messages.at(-1).content.split('\n')[0]],
  sendDebrief: async () => '',
} };
require.cache[require.resolve('../src/server/adminLogger')] = { exports: { logRun() {}, updateRunDebrief() {} } };
const { Session } = require('../src/engine/session');
const { detectWithConfirmation } = require('../src/engine/dice');
const seed = { scenario_id: 'airway-order-preview', difficulty: 'NORMAL', provider_level: 'ALS',
  region: 'SUBURBAN', category: 'medical', patient_age: 45, age_group: 'middle_aged', sex: 'male',
  patient_name: 'Preview Patient', presentation: 'Respiratory failure', trajectory: 'stable',
  decompensation_clock: null, complication_type: 'none', events: [] };
const app = express();
app.use(express.json());
app.post('/detect', (req, res) => res.json(detectWithConfirmation(String(req.body.text || ''))));
app.post('/measure', async (req, res) => {
  if (!Object.hasOwn(fixtures, req.body.state)) return res.sendStatus(400);
  const session = new Session({ ...seed, events: [] });
  res.json(await session.send(req.body.state, true));
});
app.get('/api/auth/me', (_req, res) => res.json({ player: null }));
app.get('/', (_req, res) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  res.type('html').send(html.replace('</body>', `<div id="qa-panel" style="position:fixed;top:4px;left:4px;right:4px;z-index:99999;background:#17222c;color:#e2edf4;padding:10px;font:14px sans-serif">
    <strong>Airway and order regression preview</strong> · Synthetic measurements; production parser and UI; no model calls.
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">
      <button data-case="before">Before airway</button><button data-case="igel">i-gel · EtCO2=38</button>
      <button data-case="ett">ET tube · ETCO₂=42</button><button data-case="flat">Flat trace · 0</button>
      <button data-case="disconnected">Disconnect sensor</button>
    </div>
    <label>Order <input id="qa-order" value="Bilateral NCDs"></label><button id="qa-detect">Test order</button>
    <button id="qa-reference">Bicarbonate reference</button><output id="qa-result" style="display:block;margin-top:8px">Ready</output>
  </div><script>
    startScreen.style.display='none';terminal.style.display='flex';
    terminal.style.paddingTop='155px';
    async function measure(state) {
      const response=await fetch('/measure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state})});
      const result=await response.json();applyVitals(result.vitals);printReply(result.reply);
      document.getElementById('qa-result').textContent='Monitor ETCO₂: '+(result.vitals?.ETCO2 ?? '——');
    }
    document.querySelectorAll('[data-case]').forEach(b=>b.onclick=()=>measure(b.dataset.case));
    document.getElementById('qa-detect').onclick=async()=>{
      const text=document.getElementById('qa-order').value;
      const response=await fetch('/detect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
      const result=await response.json();print(text,'user');result.rolls.forEach(printRoll);
      document.getElementById('qa-result').textContent=result.rolls.length ? result.rolls.map(r=>[r.medication_name||r.procedure_id,r.target,r.no_roll?'NO ROLL':'d20='+r.roll].filter(Boolean).join(' · ')).join(' | ') : 'No procedures detected';
    };
    document.getElementById('qa-reference').onclick=()=>showDrugPanel('bicarbonate');
    measure('before');
  </script></body>`));
});
app.use(express.static(path.join(__dirname, '../public')));
app.listen(Number(process.env.PREVIEW_PORT || 3017), '127.0.0.1', () => console.log('Airway/order preview: http://127.0.0.1:' + (process.env.PREVIEW_PORT || 3017)));
