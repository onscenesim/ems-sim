'use strict';

const fs = require('fs');
const path = require('path');

// Local development keeps data in the repository's ignored sessions folder.
// Production can point EMS_DATA_DIR at a mounted persistent disk.
const DATA_DIR = process.env.EMS_DATA_DIR
  ? path.resolve(process.env.EMS_DATA_DIR)
  : path.join(__dirname, '../../sessions');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

module.exports = { DATA_DIR };
