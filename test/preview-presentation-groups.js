'use strict';

const { SCENARIO_POOLS } = require('../src/data/scenarios');
const { TOXICOLOGY_GROUP_LABELS } = require('../src/data/scenarios/toxicology-groups');
const { presentationGroups, selectPresentation } = require('../src/engine/presentation-selection');
const { createRandom } = require('../src/engine/random');
const { rollScenario } = require('../src/engine/roller');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

function mountDrawPreview(app) {
  const entries = SCENARIO_POOLS.toxicology;
  const groups = presentationGroups(entries);
  const grouped = groups.filter(g => g.length > 1);
  let nextDraw = 0;
  let sample = 0;
  const history = { presentations: [] };
  const key = entry => entry.selection_group || entry.case_id;
  const name = entry => TOXICOLOGY_GROUP_LABELS[entry.selection_group] || entry.presentation;
  app.get('/draw-preview', (_req, res) => res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Toxicology — two-stage draws</title><style>
body{margin:28px auto;padding:0 24px;max-width:1100px;background:#111e29;color:#e7edf3;font:17px/1.55 system-ui}h1{font-size:29px}p{color:#c5d3df}button,select{font:inherit;background:#24513d;color:white;padding:10px 15px;border:1px solid #769b88;border-radius:6px;margin:8px 8px 8px 0;cursor:pointer}select{max-width:100%}button:disabled{opacity:.5}.card{background:#1c3040;border:1px solid #536f82;border-radius:9px;padding:20px;margin:16px 0}.metric{color:#a9edc2;font-size:23px}h2{font-size:22px;margin-top:0}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{text-align:left;padding:10px 8px;border-bottom:1px solid #3b5365;overflow-wrap:anywhere}th:first-child{width:44%}td:first-child{max-width:610px}th{color:#b5cbdc}summary{cursor:pointer}a{color:#aad7f9}#result{white-space:pre-wrap}caption{text-align:left;padding-bottom:12px}.eye{background:#244a40}@media(max-width:600px){body{padding:0 16px;font-size:16px}.card{padding:15px}table{font-size:13px}td,th{padding:9px 4px}}</style></head><body>
<h1>Toxicology: family first, variant second</h1><p>${entries.length} distinct calls now share ${groups.length} parent choices. Each family and each standalone case gets one parent ticket. After a family wins, a second seeded roll picks an eligible variant. Category weights are unchanged.</p>
<section class="card"><h2>Eye exposures</h2><div class="metric">12 separate calls → 1 parent ticket</div><p>With no repeat exclusions: ${(12 / entries.length * 100).toFixed(1)}% of toxicology draws before → ${(100 / groups.length).toFixed(1)}% now. All 12 eye cases remain available in instructor mode.</p>
<button id="draw">Draw one toxicology call</button><select aria-label="Family" id="family">${grouped.map(g => `<option value="${escape(g[0].selection_group)}">${escape(name(g[0]))} (${g.length} variants)</option>`).join('')}</select><button id="variant">Roll within selected family</button><div id="result" aria-live="polite">No draw yet.</div></section>
<section class="card"><h2>Check the distribution</h2><p>Sample independent calls using the real scenario generator, with empty history for each draw. Normal gameplay still filters recent exact cases and incompatible settings before either roll.</p><button id="sample">Draw 5,000 calls</button><p id="status">No sample yet.</p><table><thead><tr><th>Family / standalone case</th><th>Variants</th><th>Expected</th><th>Observed</th></tr></thead><tbody id="counts">${groups.map(g => `<tr data-group="${escape(key(g[0]))}" class="${g[0].selection_group === 'eye_exposure' ? 'eye' : ''}"><td>${escape(name(g[0]))}</td><td>${g.length}</td><td>${(100 / groups.length).toFixed(2)}%</td><td class="observed">—</td></tr>`).join('')}</tbody></table></section>
<details><summary>All twelve distinct eye exposures</summary><ul>${entries.filter(e => e.selection_group === 'eye_exposure').map(e => `<li>${escape(e.presentation)}</li>`).join('')}</ul></details><p><a href="/chemical-preview">Open clinical scene checks for the 27 new calls</a></p>
<script>
async function draw(mode){const d=await(await fetch('/draw-preview/one',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,family:document.querySelector('#family').value})})).json();document.querySelector('#result').textContent=['Toxicology → '+d.family+' → variant',d.presentation,'Case ID: '+d.case_id].join(String.fromCharCode(10));}
document.querySelector('#draw').onclick=()=>draw('natural');document.querySelector('#variant').onclick=()=>draw('family');document.querySelector('#sample').onclick=async()=>{const b=document.querySelector('#sample');b.disabled=true;document.querySelector('#status').textContent='Drawing 5,000 calls…';try{const d=await(await fetch('/draw-preview/sample',{method:'POST'})).json();document.querySelectorAll('[data-group]').forEach(row=>row.querySelector('.observed').textContent=((d.counts[row.dataset.group]||0)/d.total*100).toFixed(2)+'%');document.querySelector('#status').textContent=d.total.toLocaleString()+' calls drawn; '+d.eyeVariants+' of 12 eye variants appeared.';}finally{b.disabled=false;}};
</script></body></html>`));

  app.post('/draw-preview/one', (req, res) => {
    let entry;
    if (req.body.mode === 'family') {
      const variants = entries.filter(e => e.selection_group === req.body.family);
      if (!variants.length) return res.status(400).end();
      entry = selectPresentation(variants, createRandom(`family-preview-${nextDraw++}`));
    } else {
      const seed = rollScenario({ category: 'toxicology', random_seed: `natural-preview-${nextDraw++}`, history });
      entry = entries.find(e => e.case_id === seed.case_id);
      history.presentations.push(seed.presentation);
    }
    res.json({ family: name(entry), presentation: entry.presentation, case_id: entry.case_id });
  });
  app.post('/draw-preview/sample', (_req, res) => {
    const counts = {}, eyes = new Set(), total = 5000, run = sample++;
    for (let i = 0; i < total; i++) {
      const seed = rollScenario({ category: 'toxicology', random_seed: `distribution-${run}-${i}` });
      const entry = entries.find(e => e.case_id === seed.case_id);
      counts[key(entry)] = (counts[key(entry)] || 0) + 1;
      if (entry.selection_group === 'eye_exposure') eyes.add(entry.case_id);
    }
    res.json({ total, counts, eyeVariants: eyes.size });
  });
}

module.exports = { mountDrawPreview };
