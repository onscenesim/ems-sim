'use strict';

// Load .env locally — silently skipped in production where env vars are injected
try { require('dotenv').config(); } catch (_) {}

const express = require('express');
const path    = require('path');

const { apiLimiter }   = require('./middleware/rateLimiter');
const { analyticsConfig } = require('./analytics');
const scenarioRouter   = require('./routes/scenario');
const adminRouter      = require('./routes/admin');
const { router: authRouter } = require('./routes/auth');

const app = express();

// Trust first proxy so req.ip reflects the real client IP (AWS ALB / nginx)
app.set('trust proxy', 1);

app.use(express.json());

// The measurement ID is deployment configuration, not a source-code constant.
// This response is intentionally uncached so a disabled/rotated ID takes effect
// without a frontend rebuild.
app.get('/analytics-config.js', analyticsConfig);

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../../public')));

// API — rate-limited
app.use('/api', apiLimiter);
app.use('/api/auth', authRouter);
app.use('/api/scenario', scenarioRouter);

// Admin — no rate limit (internal use only, guarded by ADMIN_TOKEN)
app.use('/admin', adminRouter);

// Readiness check (used by the hosting target group). Do not advertise a green
// deployment that can serve the shell but cannot start a simulation.
app.get('/health', (_req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ status: 'not_ready', missing: ['GEMINI_API_KEY'] });
  }
  return res.json({ status: 'ok' });
});

// SPA fallback — always serve index.html for non-API routes
// Express 5 requires a named wildcard or regex — bare '*' is a syntax error
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// Catch-all error handler. Express 5 forwards rejected async handlers here, so
// any route error returns a clean JSON 500 instead of leaving the socket to
// hang or close — which is what surfaces in the browser as "Failed to fetch".
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[unhandled route error]', err && err.stack ? err.stack : err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal_error', message: 'The server hit an unexpected error — please retry.' });
});

module.exports = app;
