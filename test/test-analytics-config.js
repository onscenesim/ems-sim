'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { measurementIdFromEnv } = require('../src/server/analytics');

test('GA4 measurement IDs are normalized and invalid values disable analytics', () => {
  assert.equal(measurementIdFromEnv({ GA_MEASUREMENT_ID: ' g-abc123 ' }), 'G-ABC123');
  assert.equal(measurementIdFromEnv({ GA_MEASUREMENT_ID: 'UA-12345-1' }), null);
  assert.equal(measurementIdFromEnv({ GA_MEASUREMENT_ID: '<script>' }), null);
  assert.equal(measurementIdFromEnv({}), null);
});
