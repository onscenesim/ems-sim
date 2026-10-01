'use strict';
// Local, synthetic signal comparison using the production reducer and renderer.
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { derivePulseOx } = require('../src/engine/pulse-ox');
const app = express();
const base = { TrueSpO2: 98, HR: 104, PulseOxProbe: 'connected', Perfusion: 'poor' };
const cases = {
  poor: derivePulseOx(base),
  low: derivePulseOx({ ...base, PulseOxArtifact: 'false_low' }, null, { complication_type: 'equipment_failure' }),
  high: derivePulseOx({ ...base, TrueSpO2: 84, PulseOxArtifact: 'false_high' }, null, { complication_type: 'clinical_curveball' }),
  recovered: derivePulseOx({ ...base, Perfusion: 'normal', PulseOxArtifact: 'none' }),
  absent: derivePulseOx({ ...base, PulseOxProbe: 'disconnected' }),
};
app.get('/', (_req, res) => res.type('html').send(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pleth signal experiment</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#10151b;color:#e2e8ee;font:15px system-ui;padding:28px;max-width:840px}h1{font-size:24px;margin:0 0 8px}p{color:#a4b1bf;line-height:1.5}button{font:inherit;background:#243140;border:1px solid #536579;color:#e2e8ee;border-radius:7px;padding:9px 12px;cursor:pointer}button[aria-pressed=true]{background:#164864;border-color:#4ab8ff}.controls{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0}.monitor{background:#080d12;border:1px solid #3a4857;border-radius:12px;padding:20px}.reading{display:flex;gap:24px;align-items:center}.number{font:56px monospace;color:#4ab8ff}.label{font:12px monospace;color:#91a9bf}.status{color:#ffd54a;font-size:13px;min-height:20px}.pi{font:24px monospace;color:#4ab8ff}.pi[data-low=true]{color:#ffd54a}#live{width:100%;height:60px;display:block;margin-top:12px}.comparisons{display:grid;gap:14px;margin-top:24px}.comparison{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#080d12;padding:14px;border-radius:7px}.comparison canvas{width:200px;height:30px}.comparison span{font-size:13px}#truth{font-size:13px}footer{font-size:12px;color:#7f8f9e;margin-top:24px}
</style>
<h1>Pleth signal experiment</h1><p>Compare the existing weak pulse with severe artifact, then reseat the probe to recover.</p>
<div class="controls"><button data-case="poor">Weak pleth</button><button data-case="low">Garbage · false low</button><button data-case="high">Garbage · false high</button><button data-case="recovered">Recover signal</button><button data-case="absent">Disconnect</button></div>
<div class="monitor"><div class="reading"><div><div class="label">SpO₂ %</div><div class="number" id="number"></div></div><div><div class="pi" id="pi"></div><p class="status" id="status" aria-live="polite"></p></div></div><canvas id="live" aria-label="Live pulse ox waveform"></canvas></div>
<p id="truth"></p><div class="comparisons"><div class="comparison"><span>Good signal</span><canvas data-quality="good"></canvas></div><div class="comparison"><span>Weak signal · current</span><canvas data-quality="poor"></canvas></div><div class="comparison"><span>Garbage signal · experiment</span><canvas data-quality="unreliable"></canvas></div></div>
<footer>Synthetic preview • production waveform and measurement model • comparison strips shown at monitor size</footer>
<script src="/pleth.js"></script><script>
const cases=${JSON.stringify(cases)};
const strip=PlethWaveform.createStrip(document.getElementById('live'));
const readout=PlethWaveform.createReadout({pi:document.getElementById('pi'),status:document.getElementById('status')});
function select(key){const signal=cases[key];strip.update(signal);document.getElementById('number').textContent=signal.displayedSpO2??'—';readout.update(signal);document.getElementById('truth').textContent='Preview reference only: hidden oxygenation '+signal.trueSpO2+'%. '+(signal.quality==='unreliable'?'The displayed number is false; the trace has no usable pulse cadence.':'');for(const b of document.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.case===key));}
for(const b of document.querySelectorAll('button'))b.onclick=()=>select(b.dataset.case);
for(const c of document.querySelectorAll('[data-quality]')){const dpr=devicePixelRatio||1;c.width=200*dpr;c.height=30*dpr;const ctx=c.getContext('2d');ctx.scale(dpr,dpr);ctx.strokeStyle='#4ab8ff';ctx.lineWidth=1.5;ctx.beginPath();for(let x=0;x<200;x+=.5){const y=30*.82-30*.7*PlethWaveform.sample(x/46,{quality:c.dataset.quality,pulseRate:104});if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();}
select('poor');
</script></html>`));
app.get('/monitor', (_req, res) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  res.type('html').send(html.replace('</body>', `<div style="position:fixed;top:8px;left:8px;z-index:99999;background:#17222c;padding:12px;display:flex;gap:8px;flex-wrap:wrap">${Object.keys(cases).map(key => `<button data-preview-case="${key}">${key}</button>`).join('')}</div><script>
  startScreen.style.display='none';terminal.style.display='flex';
  const previewCases=${JSON.stringify(cases)};
  function previewApply(key){const signal=previewCases[key];applyVitals({HR:104,SpO2:signal.displayedSpO2,PulseOx:signal});selectMonitorWaveform('pleth');}
  document.querySelectorAll('[data-preview-case]').forEach(b=>b.onclick=()=>previewApply(b.dataset.previewCase));
  previewApply('poor');
  </script></body>`));
});
app.get('/api/auth/me', (_req, res) => res.json({player:null}));
app.get('/api/scenario/current', (_req, res) => res.json({session:null}));
app.use(express.static(path.join(__dirname, '../public')));
const server = app.listen(3014, '127.0.0.1', () => console.log('Pleth preview: http://127.0.0.1:3014'));
server.on('error', error => { console.error(error); process.exitCode = 1; });
