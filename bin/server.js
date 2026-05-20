#!/usr/bin/env node
'use strict';

const app  = require('../src/server/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`EMS Simulation  →  http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.\n');
});
