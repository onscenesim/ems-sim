'use strict';

// Load .env locally — silently skipped in production where env vars are injected
try { require('dotenv').config(); } catch (_) {}

const express = require('express');
const path    = require('path');

const { apiLimiter }   = require('./middleware/rateLimiter');
const scenarioRouter   = require('./routes/scenario');

const app = express();

// Trust first proxy so req.ip reflects the real client IP (AWS ALB / nginx)
app.set('trust proxy', 1);

app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../../public')));

// API — rate-limited
app.use('/api', apiLimiter);
app.use('/api/scenario', scenarioRouter);

// Health check (used by ALB target group)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// SPA fallback — always serve index.html for non-API routes
// Express 5 requires a named wildcard or regex — bare '*' is a syntax error
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

module.exports = app;
