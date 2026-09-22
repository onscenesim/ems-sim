'use strict';

const fs = require('fs');
const path = require('path');

// Local development keeps data in the repository's ignored sessions folder.
// Production MUST point EMS_DATA_DIR at an already-mounted persistent disk.
// Refusing to create a missing production directory prevents a Render service
// from silently creating /var/data on its disposable root filesystem.
const configuredDataDir = process.env.EMS_DATA_DIR;
if (process.env.NODE_ENV === 'production' && !configuredDataDir) {
  throw new Error('EMS_DATA_DIR is required in production and must point to a persistent disk.');
}

const DATA_DIR = configuredDataDir
  ? path.resolve(configuredDataDir)
  : path.join(__dirname, '../../sessions');

if (!fs.existsSync(DATA_DIR)) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Persistent data directory does not exist: ${DATA_DIR}. Attach the Render disk before deploying.`);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

fs.accessSync(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);

module.exports = { DATA_DIR };
