'use strict';

const express = require('express');
const playerStore = require('../playerStore');

const router = express.Router();

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1 || part.slice(0, eq).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(eq + 1).trim()); } catch { return null; }
  }
  return null;
}

function authCookie(token, maxAgeSeconds = Math.floor(playerStore.SESSION_MAX_AGE_MS / 1000)) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${playerStore.COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

function currentPlayer(req) {
  return playerStore.getPlayerByToken(getCookie(req, playerStore.COOKIE_NAME));
}

router.get('/me', (req, res) => {
  const player = currentPlayer(req);
  res.json({ player: player ? playerStore.publicPlayer(player) : null });
});

router.post('/signup', async (req, res) => {
  try {
    const result = await playerStore.signup(req.body?.displayName, req.body?.pin);
    res.setHeader('Set-Cookie', authCookie(result.token));
    return res.status(201).json({ player: result.player });
  } catch (err) {
    const status = err.code === 'player_exists' ? 409
      : ['invalid_player_name', 'invalid_pin'].includes(err.code) ? 400 : 500;
    const message = status === 500 ? 'Player signup is temporarily unavailable.' : err.message;
    return res.status(status).json({ error: err.code || 'signup_failed', message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const result = await playerStore.login(req.body?.displayName, req.body?.pin);
    res.setHeader('Set-Cookie', authCookie(result.token));
    return res.json({ player: result.player });
  } catch (err) {
    const status = err.code === 'invalid_login' ? 401
      : ['invalid_player_name', 'invalid_pin'].includes(err.code) ? 400 : 500;
    const message = status === 500 ? 'Player login is temporarily unavailable.' : err.message;
    return res.status(status).json({ error: err.code || 'login_failed', message });
  }
});

router.post('/logout', (req, res) => {
  playerStore.logout(getCookie(req, playerStore.COOKIE_NAME));
  res.setHeader('Set-Cookie', authCookie('', 0));
  res.json({ ok: true });
});

router.post('/preferences', (req, res) => {
  const player = currentPlayer(req);
  if (!player) return res.status(401).json({ error: 'login_required', message: 'Log in to save account preferences.' });
  try {
    return res.json({ player: playerStore.updatePreferences(player, req.body) });
  } catch (err) {
    const status = err.code === 'invalid_preferences' ? 400 : 500;
    return res.status(status).json({
      error: err.code || 'preferences_failed',
      message: status === 400 ? err.message : 'Could not save preferences. Please try again.',
    });
  }
});

router.post('/cosmetics', (req, res) => {
  const player = currentPlayer(req);
  if (!player) return res.status(401).json({ error: 'login_required', message: 'Log in to save cosmetics to your account.' });
  try {
    return res.json({ player: playerStore.updateCosmetics(player, req.body) });
  } catch (error) {
    const status = error.code === 'invalid_cosmetics' ? 400 : 500;
    return res.status(status).json({ error: error.code || 'cosmetics_failed', message: status === 400 ? error.message : 'Could not save your cosmetics. Please try again.' });
  }
});

module.exports = { router, currentPlayer };
