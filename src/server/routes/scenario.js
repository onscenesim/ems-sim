'use strict';

const express = require('express');
const router  = express.Router();

const { createSession, getSession } = require('../sessionStore');
const { CREW } = require('../../data/crew');

function crewRecord(name) {
  if (!name) return null;
  return CREW.find(c => c.name === name) || null;
}
const {
  detectTier,
  getClientIP,
  checkFreeLimit,
  incrementFreeUsage,
  getFreeUsageCount,
  FREE_DAILY_LIMIT,
} = require('../middleware/authStub');

// ---------------------------------------------------------------------------
// GET /api/scenario/status
// Returns the caller's tier and free usage count. Used to prime the start screen.
// ---------------------------------------------------------------------------
router.get('/status', (req, res) => {
  const tier = detectTier(req);
  const ip   = getClientIP(req);
  res.json({
    tier,
    scenarios_used:      tier === 'free' ? getFreeUsageCount(ip) : null,
    scenarios_remaining: tier === 'free' ? Math.max(0, FREE_DAILY_LIMIT - getFreeUsageCount(ip)) : null,
    free_daily_limit:    FREE_DAILY_LIMIT,
  });
});

// ---------------------------------------------------------------------------
// POST /api/scenario/new
// Rolls a scenario, creates a session, fires the dispatch turn, returns it all.
// ---------------------------------------------------------------------------
router.post('/new', async (req, res) => {
  const tier = detectTier(req);
  const ip   = getClientIP(req);

  if (tier === 'free' && !checkFreeLimit(ip)) {
    return res.status(429).json({
      error: 'free_limit_reached',
      message: `Free tier allows ${FREE_DAILY_LIMIT} scenarios per day. Upgrade for unlimited access.`,
    });
  }

  if (tier === 'free') incrementFreeUsage(ip);

  const { difficulty = 'NORMAL', provider_level = 'ALS', region_id = 'SUBURBAN', unit_name } = req.body;

  // Sanitize unit name — strip control chars, cap at 16, fall back to default.
  const cleanUnitName = (typeof unit_name === 'string'
    ? unit_name.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 16)
    : '') || 'Medic 1';

  try {
    const { id, seed } = createSession({ difficulty, provider_level, region_id, unit_name: cleanUnitName }, ip, tier);
    const session = getSession(id);

    // Fire the dispatch turn
    const result = await session.send('begin');

    return res.json({
      session_id:          id,
      scenario_id:         seed.scenario_id,
      category:            seed.category,
      difficulty:          seed.difficulty,
      provider_level:      seed.provider_level,
      region:              seed.region,
      patient:             seed.patient || null,
      unit_name:           seed.unit_name,
      crew: {
        partner: crewRecord(seed.crew_partner),
        captain: crewRecord(seed.crew_captain),
      },
      tier,
      scenarios_used:      tier === 'free' ? getFreeUsageCount(ip) : null,
      scenarios_remaining: tier === 'free' ? Math.max(0, FREE_DAILY_LIMIT - getFreeUsageCount(ip)) : null,
      reply:               result.reply,
      rolls:               result.rolls || [],
      vitals:              result.vitals || null,
      scene_minute:        session.sceneMinute,
      closed:              result.closed,
    });
  } catch (err) {
    console.error('[scenario/new]', err.message);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scenario/:id/turn
// ---------------------------------------------------------------------------
router.post('/:id/turn', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found', message: 'Session not found or expired (30 min timeout).' });
  }

  const { message } = req.body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'invalid_input', message: '`message` is required.' });
  }

  try {
    const result = await session.send(message.trim());
    return res.json({
      reply:          result.reply,
      rolls:          result.rolls || [],
      vitals:         result.vitals || null,
      closed:         result.closed,
      scene_minute:   session.sceneMinute,
      decompensating: session.seed.decompensation_clock !== null &&
                      session.sceneMinute >= session.seed.decompensation_clock,
    });
  } catch (err) {
    console.error('[scenario/turn]', err.message);
    return res.status(500).json({ error: 'api_error', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scenario/:id/debrief
// ---------------------------------------------------------------------------
router.post('/:id/debrief', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found', message: 'Session not found or expired.' });
  }

  if (!session.closed) {
    return res.status(400).json({
      error: 'scenario_not_closed',
      message: 'Scenario is still active. Use "end scenario" or transfer of care first.',
    });
  }

  try {
    const debrief = await session.debrief();
    return res.json({ debrief });
  } catch (err) {
    console.error('[scenario/debrief]', err.message);
    return res.status(500).json({ error: 'api_error', message: err.message });
  }
});


// ---------------------------------------------------------------------------
// GET /api/scenario/:id/transcript
// Returns the full session data (seed, messages, debrief) for export.
// ---------------------------------------------------------------------------
router.get('/:id/transcript', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found', message: 'Session not found or expired.' });
  }
  return res.json(session.getTranscriptData());
});

module.exports = router;
