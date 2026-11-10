'use strict';
// PLAYWRIGHT_MODULE=/path/to/playwright CHROME_EXECUTABLE=/path/to/chrome node test/browser-laryngoscope.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function checkLaryngoscope() {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-laryngoscope-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('http://ems.test/**', route => {
      const file = path.join(__dirname, '../public', new URL(route.request().url()).pathname.replace(/^\//, '') || 'index.html');
      return route.fulfill(fs.existsSync(file) && fs.statSync(file).isFile() ? { path: file } : { status: 404, body: '' });
    });
    await page.goto('http://ems.test/');
    await page.evaluate(() => {
      playSound = () => {};
      window.setTimeout = () => 0;
      document.getElementById('start-screen').style.display = 'none';
      document.getElementById('terminal').style.display = 'flex';
    });
    const profiles = [[35, 'male'], [35, 'female'], [8, 'male'], [8, 'female'], [.5, 'female']];
    async function show(age, sex, outcome, percent) {
      return page.evaluate(({ age, sex, outcome, percent }) => {
        configureAirwayPatient({ age, sex });
        animateProcedureScene('laryngoscope', 'intubation', outcome);
        const overlay = document.getElementById('laryngoscope-overlay');
        overlay.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = percent * 72; });
        const css = id => getComputedStyle(document.getElementById(id));
        const route = document.querySelector(`#lx-tube-${outcome === 'COMPLICATION' ? 'esophageal' : outcome === 'FAILURE' ? 'failed' : 'tracheal'} .lx-tube-wall`);
        const tip = route.getPointAtLength(route.getTotalLength());
        return {
          tip: { x: tip.x, y: tip.y }, d: getComputedStyle(route).d,
          tube: Number(css('lx-tube-assembly').opacity), blade: Number(css('lx-mac').opacity),
          stylet: Number.parseFloat(getComputedStyle(route.parentNode.querySelector('.lx-stylet')).strokeDashoffset),
          cuff: Number(css(outcome === 'COMPLICATION' ? 'lx-esophageal-cuff' : 'lx-male-cuff').opacity),
          label: Number(css('laryngoscope-label').opacity),
          boxes: [...overlay.children].map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }),
          animations: overlay.getAnimations({ subtree: true }).length,
        };
      }, { age, sex, outcome, percent });
    }
    // Check both metal surfaces and the full tube, not only a tip or endpoint.
    for (const [age, sex] of profiles) {
      await show(age, sex, 'SUCCESS', 0);
      const collisions = await page.evaluate(({ age, sex }) => {
        const overlay = document.getElementById('laryngoscope-overlay');
        const animations = overlay.getAnimations({ subtree: true });
        const headClass = age < 4 ? 'baby' : age < 14 ? 'child' : sex;
        const head = document.querySelector(`#lx-head .airway-profile-${headClass}`);
        const pharynx = document.getElementById('lx-pharynx');
        const tissues = [['palate', document.getElementById('lx-palate')], ['tongue', document.getElementById('lx-male-tongue')], ['face', head], ...Array.from(document.querySelectorAll('.airway-teeth path')).filter(el => getComputedStyle(el.parentElement).display !== 'none' && getComputedStyle(el).display !== 'none').map(el => ['teeth', el])];
        const metal = [document.querySelector(age < 4 ? '#lx-miller-blade > path' : '#lx-male-mac-blade'), document.querySelector('#lx-mac-handle > rect'), document.getElementById('lx-mac-hinge')];
        const samples = metal.map(el => {
          const points = [], b = el.getBBox();
          if (el.getTotalLength) for (let l = 0; l < el.getTotalLength(); l += 1) points.push(el.getPointAtLength(l));
          for (let x = b.x + 1; x < b.x + b.width; x += 3) for (let y = b.y + 1; y < b.y + b.height; y += 3) {
            const point = new DOMPoint(x, y);
            if (el.isPointInFill(point)) points.push(point);
          }
          return { el, points };
        });
        const hits = [];
        for (let percent = 4; percent <= 98; percent += .25) {
          animations.forEach(a => { a.pause(); a.currentTime = percent * 72; });
          for (const { el, points } of samples) {
            for (const [name, tissue] of tissues) {
              const matrix = tissue.getScreenCTM().inverse().multiply(el.getScreenCTM());
              for (const local of points) {
                const point = local.matrixTransform(matrix);
                if (!tissue.isPointInFill(point)) continue;
                if (name === 'face' && pharynx.isPointInFill(point)) continue;
                hits.push({ percent, part: el.id || 'handle', tissue: name, x: +point.x.toFixed(1), y: +point.y.toFixed(1) });
                break;
              }
            }
          }
        }
        return hits;
      }, { age, sex });
      assert.deepEqual(collisions, [], `${age}/${sex}: instrument clips anatomy`);
      for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
        await show(age, sex, outcome, 0);
        const tubeHits = await page.evaluate(({ outcome, age, sex }) => {
          const overlay = document.getElementById('laryngoscope-overlay'), animations = overlay.getAnimations({ subtree: true });
          const route = document.querySelector(`#lx-tube-${outcome === 'COMPLICATION' ? 'esophageal' : outcome === 'FAILURE' ? 'failed' : 'tracheal'} .lx-tube-wall`);
          const tissues = [['palate', document.getElementById('lx-palate')], ['tongue', document.getElementById('lx-male-tongue')]];
          const lumen = document.getElementById(outcome === 'COMPLICATION' ? 'lx-esophagus' : 'lx-trachea');
          const hits = [];
          for (let percent = 45; percent <= 100; percent += .25) {
            animations.forEach(a => { a.pause(); a.currentTime = percent * 72; });
            if (+getComputedStyle(document.getElementById('lx-tube-assembly')).opacity < .1) continue;
            const length = route.getTotalLength();
            for (let l = 1; l < length; l += 3) {
              const p = route.getPointAtLength(l).matrixTransform(document.getElementById('lx-trachea').getScreenCTM().inverse().multiply(route.getScreenCTM()));
              if (p.y < 183) continue;
              for (const [name, tissue] of tissues) if (tissue.isPointInFill(p) && !(name === 'tongue' && document.getElementById('lx-trachea').isPointInFill(p))) {
                hits.push({ percent, tissue: name, x: +p.x.toFixed(1), y: +p.y.toFixed(1) }); break;
              }
              if (p.x > 305 && outcome !== 'FAILURE' && !lumen.isPointInFill(p)) hits.push({ percent, tissue: 'lumen wall', x: +p.x.toFixed(1), y: +p.y.toFixed(1) });
            }
          }
          return hits.slice(0, 12);
        }, { outcome, age, sex });
        assert.deepEqual(tubeHits, [], `${age}/${sex}/${outcome}: tube leaves its corridor`);
        const end = await show(age, sex, outcome, 99.9);
        assert.equal(end.blade, 0);
        assert.equal(end.tube, outcome === 'FAILURE' ? 0 : 1);
        assert.equal(end.label, 1);
      }
      await show(age, sex, 'SUCCESS', 50);
      await page.screenshot({ path: path.join(output, `${age}-${sex}-lift.png`) });
    }
    const preCordsEarly = await show(35, 'male', 'SUCCESS', 45);
    const preCordsLate = await show(35, 'male', 'SUCCESS', 56.5);
    assert.equal(preCordsEarly.d, preCordsLate.d, 'preformed tube stays rigid before crossing the cords');
    const stiff = await show(35, 'male', 'SUCCESS', 64);
    const relaxed = await show(35, 'male', 'SUCCESS', 83);
    assert.ok(relaxed.tip.y > stiff.tip.y + .5, 'distal tube conforms to the descending trachea after stylet withdrawal');
    assert.notEqual(stiff.d, relaxed.d);
    assert.equal(stiff.stylet, 0);
    assert.equal(relaxed.stylet, 100);
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(viewport);
      for (const reduced of [false, true]) {
        await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
        for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
          const state = await show(35, 'male', outcome, 99.9);
          for (const r of state.boxes) assert.ok(r.x >= -1 && r.y >= -1 && r.right <= viewport.width + 1 && r.bottom <= viewport.height + 1, `scene fits ${JSON.stringify(viewport)}`);
          if (reduced) assert.equal(state.animations, 0);
          assert.equal(state.tube, outcome === 'FAILURE' ? 0 : 1);
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log(`Laryngoscope checks passed: five profiles, four outcomes, blade/tissue clearance, tube routing and flexion, responsive and reduced-motion layouts. Screenshots: ${output}`);
  } finally { await browser.close(); }
}
module.exports = { checkLaryngoscope };
if (require.main === module) checkLaryngoscope().catch(error => { console.error(error); process.exitCode = 1; });
