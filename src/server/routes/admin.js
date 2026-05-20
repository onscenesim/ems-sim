'use strict';

const express = require('express');
const router  = express.Router();
const { getRuns, getRunById } = require('../adminLogger');

// ---------------------------------------------------------------------------
// Admin authentication middleware.
// Set ADMIN_TOKEN in Railway / Render environment variables.
// Request: Authorization: Bearer <ADMIN_TOKEN>
// ---------------------------------------------------------------------------
function adminAuth(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'admin_disabled', message: 'ADMIN_TOKEN env var not set.' });
  }
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || auth.slice(7).trim() !== token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid or missing admin token.' });
  }
  next();
}

// ---------------------------------------------------------------------------
// GET /admin/runs
// Returns all completed runs (newest first), with full conversation and events.
//
// Optional query params:
//   ?category=toxicology      filter by scenario category
//   ?limit=20                 max results (default 50)
// ---------------------------------------------------------------------------
router.get('/runs', adminAuth, (req, res) => {
  let results = getRuns();

  if (req.query.category) {
    results = results.filter(r => r.category === req.query.category);
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  results = results.slice(0, limit);

  res.json({
    count:   results.length,
    runs:    results,
  });
});

// ---------------------------------------------------------------------------
// GET /admin/runs/:id
// Returns a single run by session ID.
// ---------------------------------------------------------------------------
router.get('/runs/:id', adminAuth, (req, res) => {
  const run = getRunById(req.params.id);
  if (!run) {
    return res.status(404).json({ error: 'not_found', message: 'Run not found (may have been evicted or server restarted).' });
  }
  res.json(run);
});

// ---------------------------------------------------------------------------
// GET /admin/summary
// Quick stats — no full conversation data.
// ---------------------------------------------------------------------------
router.get('/summary', adminAuth, (req, res) => {
  const runs = getRuns();
  const byCategory = {};
  let withDebrief = 0;
  let totalMins = 0;
  let totalRolls = 0;

  for (const r of runs) {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    if (r.debrief) withDebrief++;
    if (r.total_scene_minutes) totalMins += r.total_scene_minutes;
    totalRolls += r.events.filter(e => e.event_type === 'procedure' && e.outcome !== 'NO_ROLL').length;
  }

  res.json({
    total_runs:      runs.length,
    with_debrief:    withDebrief,
    avg_scene_mins:  runs.length ? Math.round(totalMins / runs.length) : null,
    avg_rolls:       runs.length ? Math.round(totalRolls / runs.length) : null,
    by_category:     byCategory,
    note:            'In-memory only — resets on server restart.',
  });
});

module.exports = router;
