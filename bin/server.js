#!/usr/bin/env node
'use strict';

const app  = require('../src/server/app');

// Keep the process alive on stray async errors. A single unhandled rejection
// (e.g. a fire-and-forget write) would otherwise terminate Node, dropping the
// in-flight request and every request after it until the host restarts — which
// the user sees as repeated "Failed to fetch". Log loudly; do not exit.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`EMS Simulation  →  http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.\n');
});
