'use strict';

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

function measurementIdFromEnv(env = process.env) {
  const value = String(env.GA_MEASUREMENT_ID || '').trim().toUpperCase();
  return MEASUREMENT_ID_PATTERN.test(value) ? value : null;
}

function analyticsConfig(_req, res) {
  const measurementId = measurementIdFromEnv();
  res.set('Cache-Control', 'no-store, max-age=0');
  res.type('application/javascript');
  res.send(`window.EMS_ANALYTICS_MEASUREMENT_ID = ${JSON.stringify(measurementId)};\n`);
}

module.exports = { analyticsConfig, measurementIdFromEnv };
