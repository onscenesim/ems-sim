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
        overlay.style.display = ''; // Use the scene's responsive flex/grid layout.
        animateProcedureScene(id, id === 'scalpel' ? 'resuscitative_thoracotomy' : id === 'laryngoscope' ? 'intubation' : id, outcome);
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
          ...(id === 'laryngoscope' ? {
            tubes: ['tracheal', 'esophageal', 'failed'].map(route => ({ route, display: css(`lx-tube-${route}`).display, opacity: css(`lx-tube-${route}`).opacity, pathOpacity: Number(getComputedStyle(document.querySelector(`#lx-tube-${route} use`)).opacity), offset: Number.parseFloat(getComputedStyle(document.querySelector(`#lx-tube-${route} use`)).strokeDashoffset) })),
            cuffs: ['tracheal', 'esophageal'].map(route => ({ route, display: css(`lx-${route}-cuff`).display, opacity: Number(css(`lx-${route}-cuff`).opacity) })),
            ring: Number(css('lx-success-ring').opacity),
            macOpacity: Number(css('lx-mac').opacity),
            connector: Number(css('lx-tube-connector').opacity),
          } : {}),
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
        for (const id of ['bvm', 'lucas', 'scalpel', 'laryngoscope']) {
          for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
            const state = await sample(id, outcome, 3000);
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
    const airwayView = await sample('laryngoscope', 'SUCCESS', 980);
    assert.equal(airwayView.macOpacity, 1);
    assert.equal(airwayView.tubes[0].offset, 100, 'blade lift precedes tube pass');
    assert.equal(airwayView.tubes[0].pathOpacity, 0, 'no floating tube endcaps before entry');
    const airwayPass = await sample('laryngoscope', 'SUCCESS', 1500);
    assert.ok(airwayPass.tubes[0].offset > 0 && airwayPass.tubes[0].offset < 100);
    const airwaySuccess = await sample('laryngoscope', 'SUCCESS', 2350);
    assert.equal(airwaySuccess.tubes[0].display, 'block');
    assert.equal(airwaySuccess.tubes[0].offset, 0);
    assert.equal(airwaySuccess.tubes[1].display, 'none');
    assert.equal(airwaySuccess.cuffs[0].opacity, 1);
    assert.ok(airwaySuccess.ring > 0);
    const airwayMarginal = await sample('laryngoscope', 'MARGINAL', 2350);
    assert.equal(airwayMarginal.tubes[0].offset, 0);
    assert.equal(airwayMarginal.ring, 0, 'marginal does not get the success celebration');
    const failedAttempt = await sample('laryngoscope', 'FAILURE', 1700);
    const withdrawing = await sample('laryngoscope', 'FAILURE', 2000);
    const withdrawn = await sample('laryngoscope', 'FAILURE', 2300);
    assert.equal(failedAttempt.tubes[2].offset, 0);
    assert.ok(withdrawing.tubes[2].offset > 0 && withdrawing.tubes[2].offset < 100);
    assert.equal(withdrawn.tubes[2].offset, 100);
    assert.equal(withdrawn.tubes[2].pathOpacity, 0, 'withdrawal leaves no tube tip or endcaps behind');
    assert.equal(withdrawn.connector, 0);
    assert.equal(withdrawn.cuffs[0].display, 'none');
    const misplaced = await sample('laryngoscope', 'COMPLICATION', 3000);
    assert.equal(misplaced.tubes[0].display, 'none');
    assert.equal(misplaced.tubes[1].offset, 0);
    assert.equal(misplaced.cuffs[1].opacity, 1);
    assert.equal(misplaced.ring, 0);
    // Endpoints stay in separate lumens; the failed path stops above the cords.
    const ends = await page.evaluate(() => ['tracheal', 'esophageal', 'failed'].map(route => {
      const path = document.getElementById(`lx-${route}-route`);
      const point = path.getPointAtLength(path.getTotalLength());
      return { x: point.x, y: point.y };
    }));
    assert.ok(ends[0].x > 213 && ends[0].x < 239 && ends[0].y > 210);
    assert.ok(ends[1].x > 252 && ends[1].x < 268 && ends[1].y > 210);
    assert.ok(ends[2].y < 201);
    // Continuous travel through the old mid-pass pause: fixed geometry and no
    // speed changes masquerading as dropped frames.
    const advances = [];
    for (const time of [1600, 1640, 1680, 1720, 1760]) {
      advances.push((await sample('laryngoscope', 'SUCCESS', time)).tubes[0].offset);
    }
    for (let i = 1; i < advances.length; i++) {
      assert.ok(advances[i] < advances[i - 1], 'the pass never stalls midway');
      assert.ok(Math.abs((advances[i - 1] - advances[i]) - (advances[0] - advances[1])) < 0.01, 'constant advancement speed');
    }
    const geometry = await page.evaluate(() => {
      const profile = document.querySelector('#procedure-patient-head > g').getBBox();
      const handle = document.getElementById('lx-mac-handle').getBoundingClientRect();
      const hinge = document.getElementById('lx-mac-hinge').getBoundingClientRect();
      return {
        headDepthRatio: profile.width / profile.height,
        handleBelowHinge: (handle.top + handle.bottom) / 2 > hinge.bottom + 20,
        routes: ['tracheal', 'esophageal', 'failed'].map(route => {
          const path = document.getElementById(`lx-${route}-route`);
          return Array.from({ length: 51 }, (_, i) => {
            const p = path.getPointAtLength(path.getTotalLength() * i / 50);
            return { x: p.x, y: p.y };
          });
        }),
        tubeFilter: getComputedStyle(document.getElementById('lx-tube-tracheal')).filter,
      };
    });
    assert.ok(geometry.headDepthRatio > 0.7, 'the cranium has human depth rather than a flattened profile');
    assert.ok(geometry.handleBelowHinge, 'Mac handle projects below the mouth');
    assert.equal(geometry.tubeFilter, 'none', 'no animated SVG blur during tube advancement');
    for (const points of geometry.routes) {
      let lastAngle = -Infinity;
      for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x, dy = points[i].y - points[i - 1].y;
        assert.ok(dx >= -0.05 && dy >= -0.05, 'the tube never doubles back');
        const angle = Math.atan2(dy, dx);
        assert.ok(angle >= lastAngle - 0.04, 'one smooth bend, without alternating snake-like curves');
        lastAngle = angle;
      }
    }
    // Starting the fade must not restart the tube or blade animation.
    await sample('laryngoscope', 'SUCCESS', 3400);
    const fade = await page.evaluate(() => {
      const overlay = document.getElementById('laryngoscope-overlay');
      const tube = document.querySelector('#lx-tube-tracheal use');
      const before = getComputedStyle(tube).strokeDashoffset;
      overlay.classList.add('is-fading');
      overlay.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = 3620; });
      return { before, after: getComputedStyle(tube).strokeDashoffset, opacity: getComputedStyle(overlay).opacity };
    });
    assert.equal(fade.before, '0px');
    assert.equal(fade.after, fade.before, 'keep the seated tube during fade-out');
    assert.equal(fade.opacity, '0');
    // Save reviewable fixed frames. Screenshots don't require a live scenario.
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 800 });
      for (const [id, time] of [['bvm', 1100], ['lucas', 370], ['scalpel', 460], ['laryngoscope', 2350]]) {
        await sample(id, 'SUCCESS', time);
        await page.screenshot({ path: path.join(output, `${id}-${width}.png`) });
      }
    }
    for (const [outcome, time] of [['SUCCESS', 1600], ['FAILURE', 1700], ['FAILURE', 2000], ['FAILURE', 3000], ['COMPLICATION', 3000]]) {
      await page.setViewportSize({ width: 390, height: 844 });
      await sample('laryngoscope', outcome, time);
      await page.screenshot({ path: path.join(output, `intubation-${outcome.toLowerCase()}-${time}.png`) });
    }
    await page.setViewportSize({ width: 568, height: 320 });
    await sample('laryngoscope', 'SUCCESS', 3000);
    await page.screenshot({ path: path.join(output, 'intubation-landscape.png') });
    // Shared <use> anatomy must also render in the three original upright scenes.
    const anatomy = await page.evaluate(() => ['inmed', 'nebmed', 'niv'].map(id => {
      document.getElementById(`${id}-overlay`).style.display = 'flex';
      return document.querySelector(`#${id}-overlay use[href="#patient-face-profile"]`).getBBox().width;
    }));
    anatomy.forEach(width => assert.ok(width > 50));
    // Defibrillation still uses the legacy label fade formerly housed in the
    // laryngoscope styles; replacing that scene must not remove the shared keyframe.
    const defibLabelOpacity = await page.evaluate(() => {
      const overlay = document.getElementById('defib-overlay');
      overlay.style.display = '';
      overlay.classList.add('visible', 'outcome-SUCCESS');
      overlay.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = 850; });
      return Number(getComputedStyle(document.getElementById('defib-label')).opacity);
    });
    assert.equal(defibLabelOpacity, 1);
    assert.deepEqual(errors, []);
    console.log(`${layouts} layout/outcome/motion checks passed; ventilation, all three compression cycles, surgical phases, anatomical intubation routes and shared anatomy verified. Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
