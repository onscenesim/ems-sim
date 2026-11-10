'use strict';
// Focused preview of the production SVG and CSS. No API keys or patient data.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const app = express();
app.get('/', (_req, res) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const scene = html.slice(html.indexOf('<div id="laryngoscope-overlay"'), html.indexOf('<div id="npa-overlay"'));
  res.send(`<!doctype html><html><head><title>Adult male intubation preview</title><link rel="stylesheet" href="/style.css"><style>
  body{margin:0;background:#111a23;color:#dde6eb;font:14px system-ui}#laryngoscope-overlay{transition:none;bottom:100px;padding:8px;gap:4px}#laryngoscope-svg{width:min(850px,98vw,90vh);max-height:calc(100vh - 155px)}
  #controls{position:fixed;bottom:0;padding:10px;z-index:9999;background:#1b2935;width:100%;box-sizing:border-box}button,select{font:inherit;padding:5px;margin:2px}#time{width:min(450px,60vw)}#report{font:11px monospace;max-height:45px;overflow:auto;white-space:pre-wrap}
  </style></head><body>${scene}<div id="controls"><button id="play">Play / pause</button><button data-frame="0">Start</button><button data-frame="1440">Entering</button><button data-frame="2160">Seated</button><button data-frame="3456">Lifted</button><button data-frame="7199">End</button><button id="audit">Check clearance</button><select id="outcome"><option>SUCCESS</option><option>MARGINAL</option><option>FAILURE</option><option>COMPLICATION</option></select><br><input id="time" type="range" min="0" max="7199" value="0" step="1"><output id="stamp">0 ms</output><pre id="report">Adult male · production anatomy and animation</pre></div><script src="/preview-intubation-controls.js"></script></body></html>`);
});
app.get('/preview-intubation-controls.js', (_req, res) => res.sendFile(path.join(__dirname, 'preview-intubation-controls.js')));
app.use(express.static(path.join(__dirname, '../public')));
app.listen(process.env.PORT || 3000, '127.0.0.1', () => console.log('Intubation preview: http://localhost:' + (process.env.PORT || 3000)));
