'use strict';

const rateLimit = require('express-rate-limit');

// Free-tier limiter: 60 requests per 15 minutes per IP
// (generous enough to play a full scenario; prevents scraping)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limit', message: 'Too many requests. Please wait before trying again.' },
});

module.exports = { apiLimiter };
