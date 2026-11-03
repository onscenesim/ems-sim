'use strict';
// Local QA with real Session/detection/logging and the production transcript UI.
// Dice and model replies are synthetic; no model calls or patient files are used.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
require.cache[require.resolve('../src/engine/api')] = { exports: {
  sendTurn: async (_prompt, messages) => {
    const message = messages.at(-1).content;
    if (message.startsWith('Give')) {
      return (/IV #\d+: (?:PATENT|MARGINAL)/.test(message)
        ? 'Fentanyl 50 mcg is administered through the forearm IV.'
        : 'No usable vascular access exists. Fentanyl cannot be administered.') + ' [TIME: 7:30]';
    }
    return (message.includes('— COMPLICATION')
      ? 'The IV attempt causes infiltration and a hematoma. No usable line is established.'
      : 'The catheter advances into the vein. The line flushes smoothly with saline without infiltration. The lock is taped securely in place.') + ' [TIME: 5:30]';
  },
  sendDebrief: async () => '',
} };
require.cache[require.resolve('../src/server/adminLogger')] = { exports: { logRun() {}, updateRunDebrief() {} } };
const { Session } = require('../src/engine/session');
const { rollScenario } = require('../src/engine/roller');
let session;
const app = express();
app.use(express.json());
app.get('/api/auth/me', (_req, res) => res.json({ player: null }));
app.post('/qa/access', async (req, res, next) => {
  const die = { patent: 20, marginal: 6, complication: 1, medication: 14 }[req.body.action];
  if (!die) return res.sendStatus(400);
  if (req.body.action !== 'medication') {
    session = new Session(rollScenario({ provider_level: 'ALS', difficulty: 'NORMAL' }));
    session.contextFlags = {};
  }
  if (!session) return res.sendStatus(409);
  const originalRandom = Math.random;
  Math.random = () => (die - 0.5) / 20;
  try {
    const order = req.body.action === 'medication' ? 'Give fentanyl 50mcg IVP.' : 'Obtain IV access.';
    const result = await session.send(order);
    res.json({ ...result, order, access: session._accessSummary(), events: session.seed.events });
  } catch (err) { next(err); } finally { Math.random = originalRandom; }
});
app.get('/', (_req, res) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  res.type('html').send(html.replace('</body>', `<aside style="position:fixed;top:4px;left:4px;right:4px;z-index:99999;background:#17222c;color:#e2edf4;padding:12px;font:14px sans-serif">
    <strong>IV access regression preview</strong> · Synthetic replies and dice; real access tracker and transcript UI.
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">
      <button data-case="patent">Place patent IV</button><button data-case="marginal">Place marginal IV</button>
      <button data-case="complication">Placement complication</button><button data-case="medication">Give IV fentanyl</button>
    </div>
    <output id="qa-access" style="display:block">No access placed.</output>
    <output id="qa-med" style="display:block;margin-top:6px">Ready</output>
  </aside><script>
    startScreen.style.display='none';terminal.style.display='flex';terminal.style.paddingTop='155px';
    document.querySelectorAll('[data-case]').forEach(button=>button.onclick=async()=>{
      const buttons=[...document.querySelectorAll('[data-case]')];buttons.forEach(b=>b.disabled=true);
      try {
        const response=await fetch('/qa/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:button.dataset.case})});
        if(!response.ok) throw new Error('Place an IV first.');
        const result=await response.json();print(result.order,'user');result.rolls.forEach(printRoll);printReply(result.reply);
        document.getElementById('qa-access').textContent=result.access||'No usable access';
        document.getElementById('qa-med').textContent=button.dataset.case==='medication'
          ? (result.rolls.some(r=>r.procedure_id==='medication_push')?'Medication delivered and logged':'Medication withheld; no medication roll logged')
          : 'Placement logged. Check access, then give IV fentanyl.';
      } catch(error) { document.getElementById('qa-med').textContent=error.message; }
      finally { buttons.forEach(b=>b.disabled=false); }
    });
  </script></body>`));
});
app.use(express.static(path.join(__dirname, '../public')));
const port = Number(process.env.PREVIEW_PORT || 3018);
app.listen(port, '127.0.0.1', error => {
  if (error) throw error;
  console.log(`IV access preview: http://127.0.0.1:${port}`);
});
