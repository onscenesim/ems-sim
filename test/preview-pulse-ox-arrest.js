'use strict';
// Reproduce the missing Perfusion tag using production measurement + monitor UI.
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { applyPulseOx } = require('../src/engine/pulse-ox');
const before = applyPulseOx({ HR: 142, TrueSpO2: 91, PulseOxProbe: 'connected', Perfusion: 'poor',
  PulseRate: 142, Rhythm: 'sinus_tach', BP: '68/40', ETCO2: 18 });
const arrest = applyPulseOx({ HR: 138, Rhythm: 'sinus_tach', ETCO2: 12 }, before, {},
  'Palpation at the carotid and femoral sites reveals no palpable pulse, despite the organized rhythm continuing on the monitor screen.');
const continued = applyPulseOx({ HR: 42, Rhythm: 'idioventricular', ETCO2: 13 }, arrest, {});
const recovery = applyPulseOx({ HR: 90, Rhythm: 'sinus', TrueSpO2: 96, Perfusion: 'poor', PulseRate: 90, BP: '92/60', ETCO2: 38 }, continued, {});
const snapshots = { before, arrest, continued, recovery };
const app = express();
app.get('/', (_req, res) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  res.type('html').send(html.replace('</body>', `<div style="position:fixed;top:5px;left:5px;z-index:99999;background:#17222c;padding:8px;display:flex;gap:8px;flex-wrap:wrap">
  <button data-case="before">Before arrest · 4:15</button><button data-case="arrest">Pulse lost · 5:30</button><button data-case="continued">Continued arrest · 14:30</button><button data-case="recovery">ROSC</button></div>
  <script>
  startScreen.style.display='none';terminal.style.display='flex';
  const snapshots=${JSON.stringify(snapshots)};
  const captions={before:'Before arrest: weak perfusion, SpO₂ 91%.',arrest:'Explicit central pulse loss with the Perfusion tag omitted. ECG continues; SpO₂, PI and pleth clear.',continued:'Later organized rhythm: the omitted saturation stays cleared.',recovery:'Explicit ROSC: pulse ox and BP return with poor perfusion.'};
  function show(key){applyVitals(snapshots[key]);selectMonitorWaveform('pleth');document.getElementById('output').textContent=captions[key];}
  document.querySelectorAll('[data-case]').forEach(b=>b.onclick=()=>show(b.dataset.case));show('before');
  </script></body>`));
});
app.get('/api/auth/me', (_req, res) => res.json({ player: null }));
app.get('/api/scenario/current', (_req, res) => res.json({ session: null }));
app.use(express.static(path.join(__dirname, '../public')));
app.listen(3016, '127.0.0.1').on('listening', () => console.log('Arrest preview: http://127.0.0.1:3016'))
  .on('error', error => { console.error(error); process.exitCode = 1; });
