'use strict';
const { createHash } = require('node:crypto');
// Seeded Mulberry32 stream for initial case generation only. Each call has its
// own closure; concurrent users never mutate a process-global random source.
function createRandom(seed) {
  let state = createHash('sha256').update(String(seed)).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
module.exports = { createRandom };
