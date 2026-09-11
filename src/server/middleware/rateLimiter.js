'use strict';

const rateLimit = require('express-rate-limit');
const { getClientIP } = require('./authStub');

// Request throttling remains in place for all users; there is no scenario cap.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  keyGenerator: req => rateLimit.ipKeyGenerator(getClientIP(req)),
  // A saturated request limit must never prevent STOP from reaching the queue.
  skip: req => req.method === 'POST' && /^\/scenario\/[^/]+\/operations\/[^/]+\/cancel$/.test(req.path),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limit', message: 'Too many requests. Please wait before trying again.' },
});

module.exports = { apiLimiter };
