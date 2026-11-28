'use strict';
// Production monitor and signal reducer; synthetic replay of pulse-only data.
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { applyPulseOx } = require('../src/engine/pulse-ox');
const { visibleVitals } = require('../src/engine/learning');
const disconnected = applyPulseOx({ BP: { value: '134/80', t: 'T+2:40', tMin: 2.6667 },
  TrueSpO2: 98, PulseOxProbe: 'disconnected', Perfusion: 'normal', PulseRate: 82 });
const connected = applyPulseOx({ ...disconnected, TrueSpO2: 98, PulseOxProbe: 'connected', PulseRate: 82 });
const ecg = applyPulseOx({ ...connected, TrueSpO2: 98, PulseOxProbe: 'connected', HR: 96, Rhythm: 'sinus', PulseRate: 82 });
const lost = applyPulseOx({ ...connected, TrueSpO2: 98, PulseOxProbe: 'disconnected' });
const unknown = applyPulseOx({ TrueSpO2: 98, PulseOxProbe: 'connected', Perfusion: 'normal' });
const cases = { disconnected, connected, ecg, lost, unknown };
const app = express();
app.get('/', (_req, res) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  res.type('html').send(html.replace('</body>', `<style>
  #pulse-rate-preview{position:fixed;top:5px;left:5px;right:5px;z-index:99999;background:#182b39;border:1px solid #617988;padding:8px;display:flex;gap:7px;flex-wrap:wrap;align-items:center;color:#e8f0f6;font:14px system-ui}#pulse-rate-preview button{font:inherit;padding:7px;cursor:pointer}#terminal{padding-top:65px}
  </style><nav id="pulse-rate-preview" aria-label="Pulse rate preview"><strong>Pulse-only monitor replay</strong><button data-rate-case="disconnected">Probe off</button><button data-rate-case="connected">Reseat probe · PR 82</button><button data-rate-case="ecg">Add ECG · HR 96</button><button data-rate-case="lost">Lose signal</button><button data-rate-case="unknown">Unknown pulse</button></nav>
  <script>
  startScreen.style.display='none';terminal.style.display='flex';
  const previewRateCases=${JSON.stringify(cases)},previewRateReview=${JSON.stringify(Object.fromEntries(Object.entries(cases).map(([key, value]) => [key, visibleVitals(value)])))};
  const previewRateCaptions={disconnected:'The sat probe is disconnected. No pulse rate or ECG is available.',connected:'The probe is reseated. SpO₂ is 98% and the pulse-ox pulse rate is 82. No ECG leads are attached.',ecg:'ECG leads are now attached: electrical HR 96. The peripheral pulse rate remains 82; it does not overwrite the ECG rate.',lost:'The probe loses its signal. The pulse-only rate and saturation clear together; no ECG trace appears.',unknown:'Saturation is recorded but no pulse rate was supplied. The monitor leaves the rate blank rather than inventing 75.'};
  function previewRateShow(key){applyVitals(previewRateCases[key]);selectMonitorWaveform(key==='ecg'?'ecg':'pleth');document.getElementById('output').textContent=previewRateCaptions[key]+'\\n\\nRecorded review vitals: '+JSON.stringify(previewRateReview[key]);document.querySelectorAll('[data-rate-case]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rateCase===key)));}
  document.querySelectorAll('[data-rate-case]').forEach(b=>b.onclick=()=>previewRateShow(b.dataset.rateCase));previewRateShow('disconnected');
  </script></body>`));
});
app.get('/api/auth/me', (_req, res) => res.json({ player: null }));
app.get('/api/scenario/current', (_req, res) => res.json({ session: null }));
app.use(express.static(path.join(__dirname, '../public')));
const port = Number(process.env.PORT || 3144);
app.listen(port, '127.0.0.1', () => console.log(`Pulse rate preview: http://127.0.0.1:${port}`))
  .on('error', error => { console.error(error); process.exitCode = 1; });
