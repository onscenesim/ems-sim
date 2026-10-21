'use strict';
// Production crew cards with a local roster selector; no model calls or saves.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { CREW } = require('../src/data/crew');
const portraits = require('../public/crew-portraits');
const app = express();
const publicDir = path.resolve(__dirname, '../public');
app.get('/api/auth/me', (_req, res) => res.json({ player: null }));
app.get('/api/scenario/resume', (_req, res) => res.json({ session: null }));
app.get('/analytics-config.js', (_req, res) => res.type('js').send('window.EMS_ANALYTICS_CONFIG = {};'));
app.get('/__preview/crew-data', (_req, res) => res.json(CREW));
app.get('/__preview/crew-controls.js', (_req, res) => res.sendFile(path.join(__dirname, 'preview-crew-portraits-controls.js')));
app.get('/gallery', (_req, res) => res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EMS crew portrait review</title><style>body{background:#1d272f;color:#d3d8d7;font:16px system-ui;margin:20px}a{color:inherit}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:18px}figure{margin:0}img{width:100%;height:auto;display:block}figcaption{padding:8px 0;font-size:13px}small{display:block;color:#aab9bc}</style></head><body><p><a href="/">Review production crew cards</a></p><main>${CREW.map(member => `<figure><img src="${portraits.find(member)}" width="512" height="512" alt="${member.name} in EMS uniform"><figcaption>${member.name}<small>${member.role.startsWith('captain') ? 'White captain shirt · ' : 'Navy shirt · '}${member.role.endsWith('BLS') ? 'White EMT patch' : 'Gold paramedic patch'}</small></figcaption></figure>`).join('')}</main></body></html>`));
app.get('/mobile', (_req, res) => res.type('html').send(`<!doctype html><html><head><title>Mobile crew preview</title></head><body style="margin:0;background:#20282e;display:flex;justify-content:center"><iframe title="Mobile simulator" src="/" style="width:390px;height:844px;border:0;max-width:100vw"></iframe></body></html>`));
app.get('/', (_req, res) => res.type('html').send(fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8').replace('</body>', '<script src="/__preview/crew-controls.js"></script></body>')));
app.use(express.static(publicDir));
const port = Number(process.env.CREW_PREVIEW_PORT || 3052);
app.listen(port, '127.0.0.1', error => {
  if (error) throw error;
  console.log(`Crew portrait preview: http://127.0.0.1:${port}`);
});
