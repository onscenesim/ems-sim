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
        animateProcedureScene(id, id === 'scalpel' ? 'resuscitative_thoracotomy' : id === 'laryngoscope' ? 'intubation' : id === 'sga' ? 'supraglottic_airway' : id === 'opa' ? 'oropharyngeal_airway' : id === 'ncd' ? 'needle_decompression' : id, outcome);
        const animations = overlay.getAnimations({ subtree: true });
        animations.forEach(animation => { animation.pause(); animation.currentTime = time; });
        const css = target => getComputedStyle(document.getElementById(target));
        const matrix = target => new DOMMatrix(css(target).transform);
        const scene = document.getElementById(`${id}-svg`);
        const rect = scene.getBoundingClientRect();
        const point = (id, x, y) => {
          const transform = scene.getScreenCTM().inverse().multiply(document.getElementById(id).getScreenCTM());
          const p = new DOMPoint(x, y).matrixTransform(transform);
          return { x: p.x, y: p.y };
        };
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
            bladeTip: point('lx-mac', 191, 172),
            tongueTip: point('lx-tongue', 193, 170),
            tongueAnchor: point('lx-tongue', 165, 123),
            epiglottisTip: point('lx-epiglottis', 190, 165),
            cordsOpacity: Number(css('lx-cords').opacity),
            macRotation: matrix('lx-mac').b,
            phaseSeat: Number(css('lx-phase-seat').opacity),
          } : {}),
          ...(['sga', 'opa'].includes(id) ? {
            tip: point(`${id}-device`, id === 'sga' ? 216 : 194, id === 'sga' ? 198 : 173),
            tongue: point(`${id}-tongue`, 193, 170),
            anchor: point(`${id}-tongue`, 165, 123),
            deviceOpacity: Number(css(`${id}-device`).opacity),
            placementOpacity: Number(css(`${id}-placement`).opacity),
            orientation: matrix(`${id}-device`).a,
            flow: Number(css(`${id}-flow`).opacity),
            ...(id === 'sga' ? { bend: css('sga-stem').d, lumenBend: css('sga-lumen').d, cuff: css('sga-cuff').transform, grip: Number(css('sga-grip').opacity), connectorPoint: point('sga-device', 153, 86) } : {}),
          } : {}),
          ...(id === 'suction' ? {
            tip: point('yankauer', 185, 164),
            particles: [...document.querySelectorAll('.suction-particle')].map(e => ({
              opacity: Number(getComputedStyle(e).opacity),
              position: point(e.id, 0, 0),
              distance: getComputedStyle(e).offsetDistance,
            })),
            flow: Number(css('suction-flow').opacity),
            flowOffset: Number.parseFloat(css('suction-flow').strokeDashoffset),
            jam: Number(css('suction-jam').opacity),
            jamImpact: Number(css('suction-jam-impact').opacity),
          } : {}),
          ...(id === 'ncd' ? {
            needle: matrix('ncd-needle').e,
            catheter: point('ncd-catheter', 243, 0),
            introducer: Number(css('ncd-introducer').opacity),
            air: Number(css('ncd-puff').opacity),
            airSize: matrix('ncd-air-size').a,
            blood: Number(css('ncd-drips').opacity),
            drips: [...document.querySelectorAll('.ncd-drip')].map(e => Number(getComputedStyle(e).opacity)),
            ooze: Number(css('ncd-ooze').opacity),
            oozeOffset: Number.parseFloat(css('ncd-ooze-stream').strokeDashoffset),
            ring: Number(css('ncd-success-ring').opacity),
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
        for (const id of ['bvm', 'lucas', 'scalpel', 'laryngoscope', 'sga', 'opa', 'suction', 'ncd']) {
          for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
            const state = await sample(id, outcome, id === 'laryngoscope' || id === 'suction' ? 3300 : 3000);
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
    // Check the mechanism, not just the result: insertion reaches the vallecula,
    // pauses without moving tissue, then lifts tongue/epiglottis before the ETT enters.
    const entering = await sample('laryngoscope', 'SUCCESS', 600);
    const seated = await sample('laryngoscope', 'SUCCESS', 1120);
    const seatHold = await sample('laryngoscope', 'SUCCESS', 1240);
    const lifted = await sample('laryngoscope', 'SUCCESS', 1760);
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    assert.ok(entering.bladeTip.x < seated.bladeTip.x && entering.bladeTip.y < seated.bladeTip.y, 'blade advances down the tongue');
    assert.ok(distance(seated.bladeTip, seatHold.bladeTip) < 0.01, 'seat the tip before applying lift');
    assert.ok(seated.phaseSeat > 0.7);
    assert.ok(distance(seated.bladeTip, seated.tongueTip) < 7, 'tip seats at the base of the tongue');
    assert.ok(distance(lifted.bladeTip, lifted.tongueTip) < 7, 'blade maintains contact while lifting the tongue');
    assert.ok(lifted.bladeTip.x > seated.bladeTip.x + 10 && lifted.bladeTip.y < seated.bladeTip.y - 10, 'forward/upward lift');
    assert.equal(seated.macRotation, lifted.macRotation, 'lift translates the seated blade instead of levering it against the teeth');
    assert.ok(distance(seated.tongueAnchor, lifted.tongueAnchor) < 0.01, 'tongue stays anchored');
    assert.ok(lifted.tongueTip.x > seated.tongueTip.x + 10 && lifted.tongueTip.y < seated.tongueTip.y - 10);
    assert.ok(lifted.epiglottisTip.x > seated.epiglottisTip.x + 15);
    assert.ok(seated.cordsOpacity < 0.3 && lifted.cordsOpacity === 1, 'cords become visible only after lift');
    const airwayView = await sample('laryngoscope', 'SUCCESS', 1760);
    assert.equal(airwayView.macOpacity, 1);
    assert.equal(airwayView.tubes[0].offset, 100, 'blade lift precedes tube pass');
    assert.equal(airwayView.tubes[0].pathOpacity, 0, 'no floating tube endcaps before entry');
    const airwayPass = await sample('laryngoscope', 'SUCCESS', 2300);
    assert.ok(airwayPass.tubes[0].offset > 0 && airwayPass.tubes[0].offset < 100);
    const airwaySuccess = await sample('laryngoscope', 'SUCCESS', 3150);
    assert.equal(airwaySuccess.tubes[0].display, 'block');
    assert.equal(airwaySuccess.tubes[0].offset, 0);
    assert.equal(airwaySuccess.tubes[1].display, 'none');
    assert.equal(airwaySuccess.cuffs[0].opacity, 1);
    assert.ok(airwaySuccess.ring > 0);
    const airwayMarginal = await sample('laryngoscope', 'MARGINAL', 3150);
    assert.equal(airwayMarginal.tubes[0].offset, 0);
    assert.equal(airwayMarginal.ring, 0, 'marginal does not get the success celebration');
    const failedAttempt = await sample('laryngoscope', 'FAILURE', 2520);
    const withdrawing = await sample('laryngoscope', 'FAILURE', 2760);
    const withdrawn = await sample('laryngoscope', 'FAILURE', 3000);
    assert.equal(failedAttempt.tubes[2].offset, 0);
    assert.ok(withdrawing.tubes[2].offset > 0 && withdrawing.tubes[2].offset < 100);
    assert.equal(withdrawn.tubes[2].offset, 100);
    assert.equal(withdrawn.tubes[2].pathOpacity, 0, 'withdrawal leaves no tube tip or endcaps behind');
    assert.equal(withdrawn.connector, 0);
    assert.equal(withdrawn.cuffs[0].display, 'none');
    const misplaced = await sample('laryngoscope', 'COMPLICATION', 3600);
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
    assert.ok(ends[0].x > 210 && ends[0].y > 160 && ends[0].y < 181);
    assert.ok(ends[1].x > 210 && ends[1].y > 191 && ends[1].y < 205);
    assert.ok(ends[2].x < 201);
    // Continuous travel through the old mid-pass pause: fixed geometry and no
    // speed changes masquerading as dropped frames.
    const advances = [];
    for (const time of [2200, 2240, 2280, 2320, 2360]) {
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
        handleForward: (handle.left + handle.right) / 2 > hinge.right,
        handleLevel: Math.abs(new DOMMatrix(getComputedStyle(document.getElementById('lx-mac-handle')).transform).b) < 0.01,
        flangeWidth: document.getElementById('lx-mac-flange').getBBox().width,
        cuffX: Number(document.getElementById('lx-tracheal-cuff').getAttribute('cx')),
        cuffRadius: Number(document.getElementById('lx-tracheal-cuff').getAttribute('rx')),
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
    assert.ok(geometry.handleForward && geometry.handleLevel, 'Mac handle extends forward at a right angle to the proximal blade');
    assert.ok(geometry.flangeWidth > 20, 'raised flange follows the broad curved spatula');
    assert.ok(ends[0].x >= 235 && ends[0].x <= 250, 'successful tube has a compact visible segment beyond the cords');
    assert.ok(geometry.cuffX - geometry.cuffRadius > 209 && geometry.cuffX + geometry.cuffRadius < ends[0].x - 4, 'cuff stays beyond the cords and behind the shortened tip');
    assert.equal(geometry.tubeFilter, 'none', 'no animated SVG blur during tube advancement');
    for (const points of geometry.routes) {
      let lastAngle = Infinity;
      for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x, dy = points[i].y - points[i - 1].y;
        assert.ok(dx >= -0.05 && dy >= -0.05, 'the tube never doubles back');
        const angle = Math.atan2(dy, dx);
        assert.ok(angle <= lastAngle + 0.04, 'one smooth bend, without alternating snake-like curves');
        lastAngle = angle;
      }
    }
    // Insertion mechanism and outcome poses use exact CSS-clock seeks.
    const sgaEntry = await sample('sga', 'SUCCESS', 544);
    const sgaMiddle = await sample('sga', 'SUCCESS', 1530);
    const sgaSeated = await sample('sga', 'SUCCESS', 3000);
    assert.ok(sgaEntry.tip.y < sgaMiddle.tip.y && sgaMiddle.tip.y < sgaSeated.tip.y);
    assert.notEqual(sgaEntry.bend, sgaSeated.bend, 'stem bends along the airway');
    assert.equal(sgaMiddle.bend, sgaMiddle.lumenBend, 'walls and lumen bend together');
    assert.equal(sgaEntry.cuff, sgaSeated.cuff, 'preformed cuff never inflates');
    assert.ok(sgaSeated.tip.x > 210 && sgaSeated.tip.y > 191 && sgaSeated.tip.y < 205, 'distal tip seats at the upper esophagus');
    assert.ok(sgaSeated.flow > 0.8);
    const mouthEntry = await sample('sga', 'SUCCESS', 816);
    assert.ok(mouthEntry.tip.x >= 150 && mouthEntry.tip.x <= 162 && mouthEntry.tip.y >= 116 && mouthEntry.tip.y <= 124, 'cuff enters through the mouth, not through the face');
    const pushStart = await sample('sga', 'SUCCESS', 952);
    const pushEnd = await sample('sga', 'SUCCESS', 1360);
    assert.equal(pushStart.grip, 1); assert.equal(pushEnd.grip, 1, 'gloved grip stays attached during forward insertion');
    assert.ok(pushEnd.tip.x > pushStart.tip.x + 12 && pushEnd.tip.y > pushStart.tip.y + 20, 'firm forward/downward push follows the oral passage');
    assert.ok(pushEnd.connectorPoint.y > pushStart.connectorPoint.y + 25, 'provider drives the proximal end forward');
    assert.equal(sgaSeated.grip, 0, 'release the grip after seating');
    for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
      const entry = await sample('sga', outcome, 816);
      assert.ok(distance(entry.tip, mouthEntry.tip) < 0.01, 'outcome offsets must not displace mouth entry');
      for (const time of [952, 1088, 1224, 1360, 1496, 1632, 1768, 1972]) {
        const { tip } = await sample('sga', outcome, time);
        assert.ok(tip.y >= 120 && tip.y <= 202, 'tip stays within insertion depth');
        const left = 150 + Math.max(0, tip.y - 130) * 0.45;
        const right = tip.y < 130 ? 169 : tip.y < 150 ? 185 : 222;
        assert.ok(tip.x >= left && tip.x <= right, `cuff follows the mouth/pharynx corridor: ${outcome} at ${time}: ${JSON.stringify(tip)}`);
      }
    }

    const sgaMarginal = await sample('sga', 'MARGINAL', 3000);
    const sgaFailure = await sample('sga', 'FAILURE', 3000);
    const sgaComplication = await sample('sga', 'COMPLICATION', 3000);
    assert.ok(sgaFailure.tip.y < sgaMarginal.tip.y && sgaMarginal.tip.y < sgaSeated.tip.y, 'different seating depths');
    assert.ok(sgaComplication.tip.x < sgaMarginal.tip.x, 'complication visibly misaligns the cuff');
    assert.equal(sgaFailure.flow, 0); assert.equal(sgaComplication.flow, 0);
    const opaEntry = await sample('opa', 'SUCCESS', 1080);
    const opaEdge = await sample('opa', 'SUCCESS', 1368);
    const opaTurned = await sample('opa', 'SUCCESS', 1584);
    const opaSeated = await sample('opa', 'SUCCESS', 3200);
    assert.equal(opaEntry.orientation, -1, 'OPA enters inverted');
    assert.ok(opaEntry.tip.x >= 145 && opaEntry.tip.x <= 160 && opaEntry.tip.y >= 115 && opaEntry.tip.y <= 125, 'inverted tip enters at the lips, before turning into the pharynx');
    assert.ok(Math.abs(opaEdge.orientation) < 0.07, 'half-turn passes through edge-on');
    assert.equal(opaTurned.orientation, 1, 'turn completes before final advancement');
    assert.ok(opaTurned.tip.y < opaSeated.tip.y);
    assert.ok(opaSeated.tip.x < 201, 'OPA ends at tongue base, never in the trachea');
    assert.ok(opaSeated.tongue.y < opaEntry.tongue.y - 5, 'seated OPA supports tongue clear of airway');
    assert.ok(distance(opaSeated.anchor, opaEntry.anchor) < 0.01, 'tongue remains anchored');
    const opaMarginal = await sample('opa', 'MARGINAL', 3200);
    assert.ok(opaMarginal.tip.y < opaSeated.tip.y - 15, 'marginal does not reach the full depth');
    assert.ok(opaMarginal.tongue.y > opaSeated.tongue.y, 'short OPA supports less tongue');
    for (const outcome of ['FAILURE', 'COMPLICATION']) {
      const attempted = await sample('opa', outcome, 2304);
      const withdrawing = await sample('opa', outcome, 2520);
      const withdrawn = await sample('opa', outcome, 2808);
      assert.equal(attempted.placementOpacity, 1);
      assert.ok(withdrawing.tip.y < attempted.tip.y && withdrawing.placementOpacity > 0 && withdrawing.placementOpacity < 1);
      assert.equal(withdrawn.placementOpacity, 0); assert.equal(withdrawn.flow, 0);
      assert.ok(distance(withdrawn.tongue, opaEntry.tongue) < 0.01, 'tongue relaxes after withdrawal');
    }
    for (const id of ['sga', 'opa']) {
      for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
        const animated = await sample(id, outcome, 3600);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const still = await sample(id, outcome, 3600);
        assert.ok(distance(animated.tip, still.tip) < 0.01 || still.placementOpacity === 0, 'reduced motion preserves the outcome placement');
        assert.equal(animated.placementOpacity, still.placementOpacity);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      }
    }
    // Debris removal is finite and depends on the outcome. Exact clock seeks
    // verify actual motion, retention and a persistent plug after the jam.
    const suctionEntry = await sample('suction', 'SUCCESS', 504);
    assert.ok(suctionEntry.tip.x >= 150 && suctionEntry.tip.x <= 160 && suctionEntry.tip.y >= 115 && suctionEntry.tip.y <= 124, 'Yankauer enters at the lips');
    assert.equal(suctionEntry.particles.filter(p => p.opacity === 1).length, 12);
    assert.ok(distance(suctionEntry.particles[0].position, { x: 173, y: 151 }) < 0.01, 'debris starts in the airway');
    const suctionDrawing = await sample('suction', 'SUCCESS', 1240);
    assert.ok(suctionDrawing.particles[0].position.y < suctionEntry.particles[0].position.y, 'particles travel out through the wand');
    assert.ok(suctionDrawing.flow > 0);
    assert.ok(suctionDrawing.flowOffset < 0, 'flow cue travels outward with the particles');
    for (const [outcome, remaining] of [['SUCCESS', 0], ['MARGINAL', 6], ['FAILURE', 10], ['COMPLICATION', 10]]) {
      const end = await sample('suction', outcome, 3300);
      assert.equal(end.particles.filter(p => p.opacity > 0).length, remaining);
      assert.equal(end.jam, outcome === 'COMPLICATION' ? 1 : 0);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const still = await sample('suction', outcome, 3300);
      assert.equal(still.particles.filter(p => p.opacity > 0).length, remaining, 'reduced motion preserves cleared amount');
      assert.equal(still.jam, end.jam);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    const preJam = await sample('suction', 'COMPLICATION', 1656);
    const jammed = await sample('suction', 'COMPLICATION', 1900);
    const heldJam = await sample('suction', 'COMPLICATION', 3300);
    assert.ok(preJam.flow > 0); assert.equal(preJam.jam, 0);
    assert.equal(jammed.flow, 0); assert.equal(jammed.jam, 1); assert.equal(jammed.jamImpact, 1);
    assert.ok(distance(jammed.particles[2].position, jammed.tip) < 0.01, 'large particle physically plugs the tip');
    assert.ok(distance(jammed.particles[2].position, heldJam.particles[2].position) < 0.01, 'serious jam stays lodged');
    assert.equal(heldJam.flow, 0, 'suction cannot restart through a blocked tip');
    const ncdSeated = await sample('ncd', 'SUCCESS', 1200);
    const ncdWithdrawn = await sample('ncd', 'SUCCESS', 2160);
    assert.equal(ncdSeated.needle, 0); assert.equal(ncdSeated.air, 0);
    assert.equal(ncdWithdrawn.needle, -168); assert.equal(ncdWithdrawn.air, 0, 'no burst until the needle and housing clear the hub');
    assert.ok(distance(ncdSeated.catheter, ncdWithdrawn.catheter) < 0.01, 'catheter remains seated during needle withdrawal');
    const ncdRelease = await sample('ncd', 'SUCCESS', 2400);
    const ncdLimited = await sample('ncd', 'MARGINAL', 2400);
    assert.equal(ncdRelease.introducer, 0); assert.equal(ncdRelease.air, 1);
    assert.ok(ncdRelease.ring > 0);
    assert.ok(ncdLimited.air < ncdRelease.air && ncdLimited.airSize < ncdRelease.airSize);
    assert.equal(ncdRelease.blood, 0); assert.equal(ncdRelease.ooze, 0);
    const ncdFailed = await sample('ncd', 'FAILURE', 2450);
    assert.equal(ncdFailed.air, 0); assert.equal(ncdFailed.blood, 1);
    assert.ok(ncdFailed.drips.some(opacity => opacity > 0)); assert.equal(ncdFailed.ooze, 0);
    const earlyOoze = await sample('ncd', 'COMPLICATION', 2450);
    const lateOoze = await sample('ncd', 'COMPLICATION', 3400);
    assert.equal(earlyOoze.air, 0); assert.equal(earlyOoze.blood, 0); assert.equal(earlyOoze.ooze, 1);
    assert.ok(earlyOoze.oozeOffset > lateOoze.oozeOffset && lateOoze.oozeOffset === 0, 'ooze continues after a few isolated drops would stop');
    // Starting the fade must not restart the tube or blade animation.
    await sample('laryngoscope', 'SUCCESS', 4000);
    const fade = await page.evaluate(() => {
      const overlay = document.getElementById('laryngoscope-overlay');
      const tube = document.querySelector('#lx-tube-tracheal use');
      const before = getComputedStyle(tube).strokeDashoffset;
      overlay.classList.add('is-fading');
      overlay.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = 4220; });
      return { before, after: getComputedStyle(tube).strokeDashoffset, opacity: getComputedStyle(overlay).opacity };
    });
    assert.equal(fade.before, '0px');
    assert.equal(fade.after, fade.before, 'keep the seated tube during fade-out');
    assert.equal(fade.opacity, '0');
    // Save reviewable fixed frames. Screenshots don't require a live scenario.
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 800 });
      for (const [id, time] of [['bvm', 1100], ['lucas', 370], ['scalpel', 460], ['laryngoscope', 3150], ['sga', 3000], ['opa', 3200], ['suction', 3300], ['ncd', 2400]]) {
        await sample(id, 'SUCCESS', time);
        await page.screenshot({ path: path.join(output, `${id}-${width}.png`) });
      }
    }
    for (const [outcome, time] of [['SUCCESS', 600], ['SUCCESS', 1120], ['SUCCESS', 1760], ['SUCCESS', 2300], ['FAILURE', 2520], ['FAILURE', 2760], ['FAILURE', 3600], ['COMPLICATION', 3600]]) {
      await page.setViewportSize({ width: 390, height: 844 });
      await sample('laryngoscope', outcome, time);
      await page.screenshot({ path: path.join(output, `intubation-${outcome.toLowerCase()}-${time}.png`) });
    }
    for (const id of ['sga', 'opa', 'suction', 'ncd']) {
      for (const [outcome, fraction] of [['SUCCESS', 0.24], ['SUCCESS', 0.28], ['SUCCESS', 0.38], ['SUCCESS', 0.5], ['SUCCESS', 0.9], ['MARGINAL', 0.9], ['FAILURE', 0.9], ['COMPLICATION', 0.9]]) {
        await page.setViewportSize({ width: 390, height: 844 });
        await sample(id, outcome, (id === 'sga' ? 3400 : 3600) * fraction);
        await page.screenshot({ path: path.join(output, `${id}-${outcome.toLowerCase()}-${fraction}.png`) });
      }
    }
    await page.setViewportSize({ width: 568, height: 320 });
    await sample('laryngoscope', 'SUCCESS', 3600);
    await page.screenshot({ path: path.join(output, 'intubation-landscape.png') });
    // All three airway scenes must resolve the shared supine head, including its
    // full cranium. A missing definition can silently render an empty <use>.
    const sharedHeads = await page.evaluate(() => ['laryngoscope', 'sga', 'opa', 'suction'].map(id => {
      document.getElementById(`${id}-overlay`).style.display = 'flex';
      const prefix = id === 'laryngoscope' ? 'lx' : id;
      const head = document.querySelector(`#${prefix}-head use`).getBBox();
      return { width: head.width, height: head.height };
    }));
    sharedHeads.forEach(head => assert.ok(head.width > 180 && head.height > 100, 'complete shared head renders'));
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
    // Shared IV geometry must still render in both procedures after extraction.
    await page.setViewportSize({ width: 390, height: 844 });
    const ivShared = await page.evaluate(() => {
      document.querySelectorAll('[id$="-overlay"]').forEach(e => { e.classList.remove('visible'); e.style.display = 'none'; });
      const overlay = document.getElementById('iv-overlay'); overlay.style.display = '';
      animateIV('SUCCESS');
      overlay.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = 1100; });
      return ['access-catheter-hub', 'access-introducer-housing'].map(id => document.querySelector(`#iv-overlay use[href="#${id}"]`).getBBox().width);
    });
    assert.ok(ivShared[0] > 20 && ivShared[1] > 80, 'original IV retains the full hub and introducer');
    await page.screenshot({ path: path.join(output, 'iv-shared-access.png') });
    const legacyNcric = await page.evaluate(() => {
      document.querySelectorAll('[id$="-overlay"]').forEach(e => { e.classList.remove('visible'); e.style.display = 'none'; });
      const overlay = document.getElementById('ncric-overlay'); overlay.style.display = '';
      animateNCD('SUCCESS', 'needle_cricothyrotomy');
      overlay.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = 850; });
      return { header: document.getElementById('ncric-header').textContent, visible: overlay.classList.contains('visible'), chestVisible: document.getElementById('ncd-overlay').classList.contains('visible'), device: document.getElementById('ncric-device').getBBox().width };
    });
    assert.equal(legacyNcric.header, 'NEEDLE CRICOTHYROTOMY');
    assert.equal(legacyNcric.visible, true); assert.equal(legacyNcric.chestVisible, false); assert.ok(legacyNcric.device > 100);
    await page.screenshot({ path: path.join(output, 'needle-cric-legacy.png') });
    // Transport cards retain their own visual style and caller-owned sound.
    async function transportSample(id, time) {
      return page.evaluate(({ id, time }) => {
        document.querySelectorAll('[id$="-overlay"]').forEach(e => { e.classList.remove('visible'); e.style.display = 'none'; });
        const overlay = document.getElementById(`${id}-overlay`);
        overlay.style.display = '';
        animateTransportScene(id);
        const animations = overlay.getAnimations({ subtree: true });
        animations.forEach(a => { a.pause(); a.currentTime = time; });
        const matrix = selector => new DOMMatrix(getComputedStyle(overlay.querySelector(selector)).transform);
        const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; };
        const wheel = matrix(`.${id === 'loading' ? 'loading' : 'depart'}-wheel`);
        return {
          card: rect(overlay), children: [...overlay.children].map(rect),
          pointer: getComputedStyle(overlay).pointerEvents,
          animations: animations.length,
          ground: matrix(id === 'loading' ? '#loading-ground' : '#depart-road').e,
          background: matrix(`#${id}-background`).e,
          vehicle: matrix(id === 'loading' ? '#loading-cart' : '#depart-car').e,
          wheel: { a: wheel.a, b: wheel.b },
          bodyPitch: id === 'depart' ? matrix('#depart-body').b : 0,
        };
      }, { id, time });
    }
    let transportLayouts = 0;
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(viewport);
      for (const reduced of [false, true]) {
        await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
        for (const id of ['loading', 'depart']) {
          const state = await transportSample(id, 1100);
          assert.equal(state.pointer, 'none');
          for (const r of [state.card, ...state.children]) {
            assert.ok(r.left >= 0 && r.right <= viewport.width + 1 && r.top >= 0 && r.bottom <= viewport.height + 1, `${id} card fits ${JSON.stringify(viewport)}`);
          }
          assert.ok(state.children[1].width >= 240, 'transport illustration stays legible');
          if (reduced) {
            assert.equal(state.animations, 0); assert.equal(state.ground, 0);
            assert.equal(state.wheel.a, 1); assert.equal(state.bodyPitch, 0);
          }
          transportLayouts++;
        }
      }
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const cartStart = await transportSample('loading', 100);
    const cartMoving = await transportSample('loading', 900);
    assert.equal(cartStart.ground, 0); assert.equal(cartStart.wheel.a, 1);
    assert.ok(cartMoving.ground < cartMoving.background && cartMoving.background < 0, 'stretcher background has parallax');
    assert.ok(cartMoving.vehicle > cartStart.vehicle);
    const cartAngle = (cartMoving.vehicle + 18 - cartMoving.ground) / 10;
    assert.ok(Math.abs(cartMoving.wheel.a - Math.cos(cartAngle)) < 0.001);
    assert.ok(Math.abs(cartMoving.wheel.b - Math.sin(cartAngle)) < 0.001, 'caster rotation matches ground travel');
    const parked = await transportSample('depart', 699);
    const lurch = await transportSample('depart', 898);
    const rolling = await transportSample('depart', 1300);
    assert.equal(parked.vehicle, 0); assert.equal(parked.ground, 0); assert.equal(parked.wheel.a, 1);
    assert.ok(lurch.bodyPitch < -0.01, 'brief nose-up lurch at departure');
    assert.equal(rolling.bodyPitch, 0, 'suspension settles after the initial lurch');
    assert.ok(rolling.vehicle > lurch.vehicle && rolling.ground < lurch.ground);
    assert.ok(rolling.ground < rolling.background && rolling.background < 0);
    const driveAngle = (rolling.vehicle - rolling.ground) / 18;
    assert.ok(Math.abs(rolling.wheel.a - Math.cos(driveAngle)) < 0.001);
    assert.ok(Math.abs(rolling.wheel.b - Math.sin(driveAngle)) < 0.001, 'ambulance tires turn with its acceleration');
    for (const id of ['loading', 'depart']) {
      const hold = id === 'loading' ? 2600 : 1800;
      await transportSample(id, hold);
      const fade = await page.evaluate(({ id, hold }) => {
        const overlay = document.getElementById(`${id}-overlay`);
        const vehicle = document.getElementById(id === 'loading' ? 'loading-cart' : 'depart-car');
        const before = getComputedStyle(vehicle).transform;
        overlay.classList.add('is-fading');
        overlay.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = hold + 250; });
        return { before, after: getComputedStyle(vehicle).transform, opacity: getComputedStyle(overlay).opacity };
      }, { id, hold });
      assert.equal(fade.before, fade.after, 'final transport pose remains fixed through fade');
      assert.equal(fade.opacity, '0');
    }
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 800 });
      for (const [id, time] of [['loading', 900], ['depart', 898], ['depart', 1300]]) {
        await transportSample(id, time);
        await page.screenshot({ path: path.join(output, `${id}-${width}-${time}.png`) });
      }
    }
    console.log(`${transportLayouts} transport layout/motion checks passed; rotating wheels, parallax, departure lurch, and fade verified.`);
    // Hemorrhage feedback must preserve distinct severities and stop flow on success.
    async function hemorrhage(id, outcome, time) {
      return page.evaluate(({ id, outcome, time }) => {
        document.querySelectorAll('[id$="-overlay"]').forEach(e => { e.classList.remove('visible'); e.style.display = 'none'; });
        const overlay = document.getElementById(`${id}-overlay`);
        overlay.style.display = '';
        animateProcedureScene(id, id, outcome);
        overlay.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = time; });
        const style = selector => getComputedStyle(overlay.querySelector(selector));
        const rect = overlay.getBoundingClientRect();
        return {
          left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
          label: overlay.querySelector('[id$="-label"]').textContent,
          amount: id === 'bleeding_control' ? new DOMMatrix(style('.pressure-stain').transform).a : Number(style('.tq-flow').opacity),
          ooze: id === 'bleeding_control' ? Number(style('.pressure-ooze').opacity) : 0,
          hand: id === 'bleeding_control' ? style('#pressure-hands').transform : style('#tq-grip').opacity,
          windlass: id === 'tourniquet' ? style('#tq-windlass').transform : '',
        };
      }, { id, outcome, time });
    }
    for (const reduced of [false, true]) {
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 800 });
        for (const id of ['bleeding_control', 'tourniquet']) {
          const amounts = [];
          for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
            const state = await hemorrhage(id, outcome, 4100);
            assert.ok(state.left >= 0 && state.right <= width && state.top >= 0 && state.bottom <= (width === 320 ? 568 : 800), 'hemorrhage card fits viewport');
            assert.ok(state.label.startsWith(outcome));
            amounts.push(state.amount);
            if (outcome === 'SUCCESS') assert.equal(id === 'tourniquet' ? state.amount : state.ooze, 0, 'successful control has no active bleeding');
            if (!reduced) await page.screenshot({ path: path.join(output, `${id}-${outcome}-${width}.png`) });
          }
          assert.ok(amounts.every((n, i) => i === 0 || n > amounts[i - 1]), 'blood severity increases across all four outcomes');
        }
      }
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const early = await hemorrhage('tourniquet', 'SUCCESS', 700);
    const late = await hemorrhage('tourniquet', 'SUCCESS', 3200);
    assert.equal(early.amount, 1, 'arterial bleeding starts before tightening');
    assert.equal(late.amount, 0, 'successful tightening stops arterial flow');
    assert.notEqual(early.windlass, late.windlass, 'windlass turns during tightening');
    const pressureA = await hemorrhage('bleeding_control', 'FAILURE', 500);
    const pressureB = await hemorrhage('bleeding_control', 'FAILURE', 540);
    assert.notEqual(pressureA.hand, pressureB.hand, 'hands tremble while maintaining pressure');
    assert.ok(pressureA.amount < (await hemorrhage('bleeding_control', 'FAILURE', 3200)).amount, 'gauze progressively saturates');
    console.log('32 hemorrhage outcome/layout/reduced-motion checks passed; pressure tremor, saturation and tourniquet flow verified.');
    assert.deepEqual(errors, []);
    console.log(`${layouts} layout/outcome/motion checks passed; ventilation, all three compression cycles, surgical phases, anatomical intubation routes, i-gel seating, OPA turnover/withdrawal, suction clearance/jam, NCD withdrawal/release and shared anatomy verified. Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
