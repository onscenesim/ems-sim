'use strict';

const rateLimit = require('express-rate-limit');

// Free-tier limiter: 120 requests per 15 minutes per real client IP.
// Uses X-Forwarded-For directly so Railway's multi-hop proxy doesn't
// collapse all users onto the same internal IP and lock them out together.
function realIP(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || 'unknown';
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  keyGenerator: realIP,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limit', message: 'Too many requests. Please wait before trying again.' },
});

module.exports = { apiLimiter };
