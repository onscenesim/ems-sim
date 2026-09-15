'use strict';
// Optional visual regression check with an existing Playwright installation:
// PLAYWRIGHT_MODULE=/path/to/playwright CHROME_EXECUTABLE=/path/to/chrome node test/browser-procedure-animations.js
// No server, API credentials, real-time sleeps, or additional app dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../public');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-procedures-'));

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://ems.test/**', async route => {
      const file = path.join(root, new URL(route.request().url()).pathname.replace(/^\//, '') || 'index.html');
      await route.fulfill(fs.existsSync(file) && fs.statSync(file).isFile() ? { path: file } : { status: 404, body: '' });
    });
    await page.goto('http://ems.test/');
    await page.evaluate(() => {
      playSound = () => {}; // Sound selection/timing is covered by the unit suite.
      window.setTimeout = () => 0; // Hold the scene while CSS animations are sought explicitly.
      document.getElementById('start-screen').style.display = 'none';
      document.getElementById('terminal').style.display = 'flex';
    });
    async function sample(id, outcome, time) {
      return page.evaluate(({ id, outcome, time }) => {
        document.querySelectorAll('[id$="-overlay"]').forEach(e => { e.classList.remove('visible'); e.style.display = 'none'; });
        const overlay = document.getElementById(`${id}-overlay`);
        overlay.style.display = 'flex';
        animateProcedureScene(id, id === 'scalpel' ? 'resuscitative_thoracotomy' : id, outcome);
        const animations = overlay.getAnimations({ subtree: true });
        animations.forEach(animation => { animation.pause(); animation.currentTime = time; });
        const css = target => getComputedStyle(document.getElementById(target));
        const matrix = target => new DOMMatrix(css(target).transform);
        const scene = document.getElementById(`${id}-svg`);
        const rect = scene.getBoundingClientRect();
        const children = [...overlay.children].map(e => {
          const r = e.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        });
        return {
          children, width: rect.width, pointerEvents: getComputedStyle(overlay).pointerEvents,
          animationCount: animations.length,
          labelOpacity: Number(css(`${id}-label`).opacity),
          strokeOffset: getComputedStyle(overlay.querySelector(outcome === 'SUCCESS' || outcome === 'MARGINAL' ? '.om-check' : '.om-x1')).strokeDashoffset,
          ...(id === 'bvm' ? { chest: matrix('bvm-chest').d, bag: matrix('bvm-bag').d, leak: Number(css('bvm-leak').opacity), air: Number(css('bvm-air').opacity) } : {}),
          ...(id === 'lucas' ? { chest: matrix('lucas-chest').d, piston: matrix('lucas-piston').f, frame: css('lucas-frame').transform } : {}),
          ...(id === 'scalpel' ? { blade: matrix('scalpel-blade').a, impact: Number(css('scalpel-impact').opacity), trail: Number(css('scalpel-trail').opacity) } : {}),
        };
      }, { id, outcome, time });
    }
    // Every outcome fits, including the longest labels in short landscape.
    let layouts = 0;
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(viewport);
      for (const reduced of [false, true]) {
        await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
        for (const id of ['bvm', 'lucas', 'scalpel']) {
          for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
            const state = await sample(id, outcome, 2300);
            assert.equal(state.pointerEvents, 'none');
            assert.ok(state.width >= 240, `${id} remains legible`);
            for (const box of state.children) {
              assert.ok(box.left >= 0 && box.right <= viewport.width + 1 && box.top >= 0 && box.bottom <= viewport.height + 1, `${id} ${outcome} fits ${JSON.stringify(viewport)}`);
            }
            assert.equal(state.labelOpacity, 1);
            assert.equal(state.strokeOffset, '0px');
            if (reduced) assert.equal(state.animationCount, 0, 'reduced motion is a still result');
            layouts++;
          }
        }
      }
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 320, height: 568 });
    const rest = await sample('bvm', 'SUCCESS', 350);
    const squeeze = await sample('bvm', 'SUCCESS', 1100);
    assert.equal(rest.bag, 1); assert.equal(rest.chest, 1);
    assert.ok(squeeze.bag < 0.6 && squeeze.chest > 1.17);
    const marginal = await sample('bvm', 'MARGINAL', 1100);
    assert.ok(marginal.chest > 1 && marginal.chest < squeeze.chest);
    for (const outcome of ['FAILURE', 'COMPLICATION']) {
      const failed = await sample('bvm', outcome, 1100);
      assert.equal(failed.chest, 1); assert.equal(failed.air, 0); assert.equal(failed.leak, 1);
    }
    const refill = await sample('bvm', 'SUCCESS', 1850);
    assert.equal(refill.bag, 1); assert.equal(refill.chest, 1);
    for (const cycle of [0, 600, 1200]) {
      const pressed = await sample('lucas', 'SUCCESS', 370 + cycle);
      const released = await sample('lucas', 'SUCCESS', 680 + cycle);
      assert.equal(pressed.piston, 9); assert.equal(pressed.chest, 0.8125);
      assert.equal(released.piston, 0); assert.equal(released.chest, 1);
      assert.equal(pressed.frame, 'none');
    }
    const anticipation = await sample('scalpel', 'SUCCESS', 280);
    const impact = await sample('scalpel', 'SUCCESS', 460);
    const recovery = await sample('scalpel', 'SUCCESS', 1000);
    assert.equal(anticipation.trail, 0); assert.equal(impact.trail, 1); assert.equal(impact.impact, 1);
    assert.equal(recovery.trail, 0); assert.notEqual(anticipation.blade, recovery.blade);
    // Save reviewable fixed frames. Screenshots don't require a live scenario.
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 800 });
      for (const [id, time] of [['bvm', 1100], ['lucas', 370], ['scalpel', 460]]) {
        await sample(id, 'SUCCESS', time);
        await page.screenshot({ path: path.join(output, `${id}-${width}.png`) });
      }
    }
    // Shared <use> anatomy must also render in the three original upright scenes.
    const anatomy = await page.evaluate(() => ['inmed', 'nebmed', 'niv'].map(id => {
      document.getElementById(`${id}-overlay`).style.display = 'flex';
      return document.querySelector(`#${id}-overlay use[href="#patient-face-profile"]`).getBBox().width;
    }));
    anatomy.forEach(width => assert.ok(width > 50));
    assert.deepEqual(errors, []);
    console.log(`${layouts} layout/outcome/motion checks passed; ventilation, all three compression cycles, surgical phases and shared anatomy verified. Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
