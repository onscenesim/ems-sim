'use strict';
// Presentation-only server. Never loads the simulation server, .env, or player stores.
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { CREW } = require('../../src/data/crew');
const root = path.resolve(__dirname, '../../public');
const app = express();
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/lab/crew', (_req, res) => res.json([...CREW, ...['partner', 'captain'].map(role => ({
  name: `Custom ${role}`, role, custom: true, competency: 'MEDIUM', enthusiasm: 'HIGH', confrontation: 'LOW',
  personality_notes: 'Anonymous custom crew portrait and card example.',
}))]));
app.get('/lab/frame', (_req, res) => {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html.replace(/<script[^>]+src="\/?analytics[^>]*><\/script>/g, '');
  html = html.replace('<head>', '<head><base href="/"><script src="/lab/isolate.js"></script>');
  html = html.replace('</body>', '<script src="/lab/frame.js"></script></body>');
  res.type('html').send(html);
});
app.get('/api/auth/me', (_req, res) => res.json({ player: null }));
app.get('/api/scenario/resume', (_req, res) => res.json({ session: null }));
app.use('/api', (_req, res) => res.status(403).json({ error: 'Game requests are disabled in the test lab.' }));
app.use('/lab', express.static(__dirname));
app.use(express.static(root));
if (require.main === module) {
  const port = Number(process.env.PORT || 3140);
  const server = app.listen(port, '127.0.0.1', () => console.log(`EMS Test Lab → http://127.0.0.1:${port}\nPresentation fixtures only. No API key needed. Ctrl+C to stop.`));
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Open the existing lab or run PORT=3141 npm run lab.` : error.message); process.exitCode = 1; });
}
module.exports = app;
