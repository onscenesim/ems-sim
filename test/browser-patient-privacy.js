'use strict';
// Run with the same PLAYWRIGHT_MODULE / CHROME_EXECUTABLE overrides as the
// procedure animation browser regression. Uses production files without a server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../public');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://ems.test/**', route => {
      const file = path.join(root, new URL(route.request().url()).pathname.replace(/^\//, '') || 'index.html');
      return route.fulfill(fs.existsSync(file) && fs.statSync(file).isFile() ? { path: file } : { status: 404, body: '' });
    });
    await page.goto('http://ems.test/');
    await page.evaluate(() => {
      document.getElementById('start-screen').style.display = 'none';
      document.getElementById('terminal').style.display = 'flex';
    });
    const mosaic = page.locator('.city-face-mosaic');
    assert.ok(await mosaic.locator('rect').count() > 40, 'opaque blocks are ready before loading');
    const face = () => page.evaluate(() => {
      const mosaic = document.querySelector('.city-face-mosaic');
      const head = document.querySelector('#loading-patient use[href="#procedure-patient-head"]').getBoundingClientRect();
      const point = new DOMPoint(44, 70).matrixTransform(mosaic.getScreenCTM());
      return { x: point.x, y: point.y, left: head.left, right: head.right, top: head.top, bottom: head.bottom };
    });
    const begin = () => page.evaluate(() => {
      window.loadingComplete = false;
      animateLoading().then(() => { window.loadingComplete = true; });
    });
    for (const [width, height] of [[390,844],[844,390]]) {
      await page.setViewportSize({ width, height });
      await begin();
      const before = await face();
      const initial = await mosaic.getAttribute('data-frame');
      await page.waitForFunction(frame => document.querySelector('.city-face-mosaic').dataset.frame !== frame, initial);
      await page.waitForFunction(left => document.querySelector('#loading-patient use[href="#procedure-patient-head"]').getBoundingClientRect().left > left + 4, before.left);
      const after = await face();
      assert.ok(after.x >= after.left && after.x <= after.right && after.y >= after.top && after.y <= after.bottom, 'mosaic covers the face');
      assert.ok(Math.abs((after.x - before.x) - (after.left - before.left)) < 2, 'mosaic moves with the head');
      assert.equal(await page.locator('#loading-label').textContent(), 'PACKAGING');
      await page.waitForFunction(() => window.loadingComplete);
      assert.equal(await page.locator('#loading-overlay').getAttribute('class'), '');
      const ended = await mosaic.getAttribute('data-frame');
      await page.waitForTimeout(200);
      assert.equal(await mosaic.getAttribute('data-frame'), ended, 'privacy clock stops after fade');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await begin();
    assert.equal(await mosaic.getAttribute('data-frame'), '0');
    await page.waitForFunction(() => window.loadingComplete);
    assert.equal(await mosaic.getAttribute('data-frame'), '0', 'reduced motion keeps the mosaic still');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('http://ems.test/transport-preview.html');
    await page.locator('#loading-overlay.visible').waitFor();
    await page.getByRole('button', { name: 'Loading end', exact: true }).click();
    const held = await mosaic.getAttribute('data-frame');
    await page.waitForFunction(frame => document.querySelector('.city-face-mosaic').dataset.frame !== frame, held);
    await page.locator('#loading-svg').screenshot({ path: '/tmp/ems-patient-privacy.png' });
    await page.getByRole('button', { name: 'Play loading', exact: true }).click();
    await page.locator('#loading-overlay.is-fading').waitFor();
    await page.getByRole('button', { name: 'Transport end', exact: true }).click();
    assert.equal(await page.locator('#depart-overlay.visible').count(), 1);
    assert.deepEqual(errors, []);
    console.log('PASS: patient privacy tracks the stretcher, animates, replays, stops after fade, respects reduced motion, and works in the transport preview.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
