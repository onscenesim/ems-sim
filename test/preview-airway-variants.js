'use strict';
// node test/preview-airway-variants.js — production SVG/CSS, no account or model calls.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const app = express();
const root = path.join(__dirname, '../public');
function extractDiv(html, id) {
  const start = new RegExp('<div\\b[^>]*\\bid="' + id + '"[^>]*>').exec(html);
  if (!start) throw new Error('Missing preview scene: ' + id);
  const tags = /<\/?div\b[^>]*>/g; tags.lastIndex = start.index;
  let depth = 0, match;
  while ((match = tags.exec(html))) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (!depth) return html.slice(start.index, tags.lastIndex);
  }
  throw new Error('Unclosed preview scene: ' + id);
}
app.get('/', (req, res) => {
  const names = ['laryngoscope','sga','opa','npa','suction','obstruction'];
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const defsStart=html.indexOf('<svg class="procedure-defs"');
  const definitions=html.slice(defsStart,html.indexOf('</svg>',defsStart)+6);
  const scenes = definitions + names.map(id => extractDiv(html, id + '-overlay')).join('\n');
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const timing = Object.fromEntries(names.map(id => {
    const m = source.match(new RegExp('\\b' + id + ': Object.freeze\\(\\{ hold: (\\d+)[^\\n]*?result: (\\d+)'));
    return [id, { hold: +m[1], result: +m[2] }];
  }));
  res.send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Airway animation variants</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/airway-scenes.css"><link rel="stylesheet" href="/qa.css"></head><body>${scenes}<div id="controls"><label>Procedure <select id="scene"><option value="laryngoscope">Intubation</option><option value="sga">i-gel</option><option value="opa">OPA</option><option value="npa">NPA</option><option value="suction">Suction</option><option value="obstruction">Remove obstruction</option></select></label> <label>Patient <select id="profile"><option value="male">Adult male</option><option value="female">Adult female</option><option value="child-male">Child male</option><option value="child-female">Child female</option><option value="baby">Baby</option></select></label> <label>Outcome <select id="outcome"><option>SUCCESS</option><option>MARGINAL</option><option>FAILURE</option><option>COMPLICATION</option></select></label><br><button id="play">Play / pause</button><button data-percent="0">Start</button><button data-percent="35">Entering</button><button data-percent="62">Working</button><button data-percent="99.99">End</button><button id="audit">Audit all variants</button><button id="compare">Compare patients</button><br><input id="time" type="range" min="0" max="100" step=".1" value="0" aria-label="Animation progress"><output id="stamp">0%</output><pre id="report">Production airway animation review</pre></div><script>window.airwayPreviewTiming=${JSON.stringify(timing)};</script><script src="/airway-scenes.js"></script><script src="/qa.js"></script></body></html>`);
});
app.get('/qa.css', (_req,res)=>res.type('css').send(`
body{margin:0;background:#111a23;color:#dde6eb;font:13px system-ui}#controls{position:fixed;bottom:0;padding:8px;z-index:9999;background:#1b2935;width:100%;box-sizing:border-box}button,select{font:inherit;padding:4px;margin:2px}#time{width:min(450px,65vw)}#report{font:10px monospace;max-height:46px;overflow:auto;white-space:pre-wrap;margin:4px 0 0}
:is(#laryngoscope-overlay,[data-refined-procedure],[data-reference-airway]){transition:none;bottom:150px;padding:8px;gap:3px}:is(#laryngoscope-svg,.ra-svg,[data-reference-airway]>svg:not(.outcome-mark)){width:min(850px,98vw,90vh)!important;max-height:calc(100vh - 210px)}
body.mini #controls{display:none}body.mini :is(#laryngoscope-overlay,[data-refined-procedure],[data-reference-airway]){bottom:0;gap:0;padding:2px}body.mini :is(#laryngoscope-svg,.ra-svg,[data-reference-airway]>svg:not(.outcome-mark)){width:100%!important;max-height:calc(100vh - 22px)}body.mini .outcome-mark,body.mini [id$="-label"]{display:none}body.mini [id$="-header"]{font:10px system-ui;letter-spacing:0;color:#d0dbe1}
body.gallery{overflow:auto;padding:12px;box-sizing:border-box}.gallery #controls{position:sticky;top:0;bottom:auto}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.card{background:#17212b;border:1px solid #44545f;border-radius:6px;overflow:hidden}.card h2{font:14px system-ui;padding:7px;margin:0}.card iframe{display:block;border:0;width:100%;height:280px}.gallery a{color:#bcdfea}@media(max-width:560px){.cards{grid-template-columns:1fr}}
`));
app.get('/qa.js', (_req,res)=>res.sendFile(path.join(__dirname,'preview-airway-variants-controls.js')));
app.use(express.static(root));
app.listen(process.env.PORT || 3001, '127.0.0.1', () => console.log('Airway variants: http://localhost:'+(process.env.PORT || 3001)));
