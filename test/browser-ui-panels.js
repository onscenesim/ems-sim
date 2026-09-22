'use strict';
// Optional browser check; uses the same Playwright/Chrome overrides as browser-procedure-animations.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { CREW } = require('../src/data/crew');
const root = path.resolve(__dirname, '../public');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-ui-'));
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let player = { id: 'test-player', displayName: 'Test Player', stats: {}, preferences: { showFieldBriefing: true } };
    let failSave = false;
    await page.route('http://ems.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { player } });
      if (url.pathname === '/api/auth/preferences') {
        if (failSave) return route.fulfill({ status: 500, json: { message: 'Could not save preferences. Please try again.' } });
        player.preferences = route.request().postDataJSON();
        return route.fulfill({ json: { player } });
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
      const file = path.join(root, url.pathname.replace(/^\//, '') || 'index.html');
      return route.fulfill(fs.existsSync(file) && fs.statSync(file).isFile() ? { path: file } : { status: 404, body: '' });
    });
    await page.goto('http://ems.test/');
    await page.waitForFunction(() => currentPlayer?.id === 'test-player');
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 600 }]) {
      await page.setViewportSize(viewport);
      const ball = await page.locator('#eightball').boundingBox();
      const toolbar = await page.locator('.start-toolbar').boundingBox();
      assert.ok(ball.y >= 0 && ball.y + ball.height <= viewport.height, '8 ball stays in view');
      assert.ok(ball.x >= 0 && ball.x + ball.width <= viewport.width, '8 ball fits narrow screens');
      await page.locator('#eightball').click();
      assert.ok((await page.locator('#eightball-response').textContent()).length > 0);
      await page.screenshot({ animations: 'disabled', path: path.join(output, `menu-${viewport.width}.png`) });
      await page.evaluate(() => {
        const extra = document.createElement('div');
        extra.id = 'future-menu-section';
        extra.style.height = '1200px';
        document.getElementById('start-card').appendChild(extra);
        document.querySelector('.start-content').scrollTop = 99999;
      });
      const after = await page.locator('.start-toolbar').boundingBox();
      assert.equal(after.y, toolbar.y, 'future menu growth cannot displace the 8 ball');
      await page.evaluate(() => document.getElementById('future-menu-section').remove());
      await page.locator('#options-open').click();
      assert.equal(await page.locator('#briefing-toggle').isVisible(), true);
      await page.screenshot({ animations: 'disabled', path: path.join(output, `options-${viewport.width}.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#options-open').evaluate(e => e === document.activeElement), true);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    assert.equal(await page.locator('#briefing-toggle').isVisible(), false);
    assert.equal(await page.locator('#sound-toggle').isVisible(), false);
    assert.equal(await page.locator('#theme-toggle-start').isVisible(), false);
    await page.locator('#options-open').click();
    await page.locator('#sound-toggle').uncheck();
    await page.locator('#theme-toggle-start').check();
    await page.locator('#briefing-toggle').uncheck();
    await page.waitForFunction(() => !document.getElementById('briefing-toggle').disabled);
    assert.equal(player.preferences.showFieldBriefing, false);
    await page.reload();
    await page.waitForFunction(() => currentPlayer?.id === 'test-player');
    await page.locator('#options-open').click();
    assert.equal(await page.locator('#sound-toggle').isChecked(), false);
    assert.equal(await page.locator('#theme-toggle-start').isChecked(), true);
    await page.locator('#sound-toggle').check();
    await page.locator('#theme-toggle-start').uncheck();
    assert.equal(await page.locator('#briefing-toggle').isChecked(), false);
    await page.evaluate(() => printBriefing());
    assert.equal(await page.locator('.briefing').count(), 0);
    failSave = true;
    await page.locator('#briefing-toggle').check();
    await page.waitForFunction(() => !document.getElementById('briefing-toggle').disabled);
    assert.equal(await page.locator('#briefing-toggle').isChecked(), false);
    assert.match(await page.locator('#briefing-save-status').textContent(), /Could not save/);
    failSave = false;
    await page.locator('#briefing-toggle').check();
    await page.waitForFunction(() => !document.getElementById('briefing-toggle').disabled);
    await page.locator('#options-close').click();
    await page.addStyleTag({ content: '* { transition: none !important; }' });
    await page.evaluate(crew => {
      window.soundCalls = [];
      playSound = name => window.soundCalls.push({ name, enabled: soundEnabled });
      document.getElementById('start-screen').style.display = 'none';
      document.getElementById('terminal').style.display = 'flex';
      printBriefing();
      populateCrewPanel({ partner: crew[0], captain: crew[10] });
      for (const member of crew) {
        const card = buildCrewMemberCard(member);
        if (!card.querySelector('.crew-triggers') || /MANDATORY|MUST|NEVER/.test(card.textContent)) throw Error('Missing conversational crew copy: ' + member.name);
      }
    }, CREW);
    assert.equal(await page.locator('.briefing').count(), 1);
    assert.match(await page.locator('.brief-options-note').textContent(), /hide this briefing in the options menu/);
    assert.equal(await page.locator('#scratch-hint').count(), 0);
    await page.locator('#sound-toggle-hdr').click();
    assert.equal(await page.locator('#sound-toggle-hdr').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#sound-toggle').isChecked(), false);
    await page.locator('#sound-toggle-hdr').click();
    assert.equal(await page.locator('#sound-toggle-hdr').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.evaluate(() => window.soundCalls), [{ name: 'radio', enabled: true }, { name: 'radio', enabled: true }]);
    assert.equal(await page.locator('#hdr-collapse, #header-reveal, #badge-unit').count(), 0);
    await page.locator('#vitals-expand').click();
    assert.equal(await page.locator('#vitals-expand').getAttribute('aria-expanded'), 'true');
    const inkCount = () => page.evaluate(() => scratchContext.getImageData(0, 0, vitalsScratch.width, vitalsScratch.height).data.filter((v, i) => i % 4 === 3 && v > 0).length);
    const box = await page.locator('#vitals-scratch').boundingBox();
    await page.mouse.move(box.x + 20, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 110, box.y + 60, { steps: 10 });
    await page.mouse.up();
    assert.ok(await inkCount() > 0);
    await page.locator('#vitals-expand').click();
    assert.equal(await page.locator('#vitals-panel').isVisible(), false);
    await page.locator('#vitals-expand').click();
    assert.ok(await inkCount() > 0, 'closing the notepad retains doodles');
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'desktop-notepad.png') });
    await page.locator('#crew-btn').click();
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'desktop-crew.png') });
    assert.match(await page.locator('.crew-notes').first().evaluate(e => getComputedStyle(e).fontFamily), /PixelOperator/);
    await page.locator('#crew-panel-close').click();
    await page.evaluate(() => showDrugPanel('epinephrine'));
    assert.equal(await page.locator('#drug-panel').evaluate(e => e.classList.contains('open')), true);
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'desktop-medication.png') });
    await page.evaluate(() => {
      hideDrugPanel();
      patientDemoSource = 'Crew';
      populatePatientPanel({ name: 'Test Patient', age: 65, sex: 'Male' }, 'TEST');
      document.getElementById('patient-panel').classList.add('open');
    });
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'desktop-patient.png') });
    await page.evaluate(() => document.getElementById('patient-panel').classList.remove('open'));
    for (const width of [320, 390, 600]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => {
        patientBtn.style.display = '';
        applyBackupStatus({ status: 'on_scene' });
        applyCrewStatus({ partner: 'in_back', captain: 'in_back', driver: 'anonymous' });
      });
      const headerRects = await page.evaluate(() => [...document.querySelectorAll('#hdr-controls > button, #hdr-badges > .badge')].filter(e => getComputedStyle(e).display !== 'none').map(e => {
        const r = e.getBoundingClientRect();
        return { id: e.id || e.dataset.crewRole, x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      }));
      for (let i = 0; i < headerRects.length; i++) {
        const a = headerRects[i];
        assert.ok(a.x >= 0 && a.right <= width, 'header item fits: ' + a.id);
        for (const b of headerRects.slice(i + 1)) assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, 'header items do not overlap: ' + a.id + '/' + b.id);
      }
      const sizes = await page.evaluate(() => {
        const r = document.getElementById('vitals-expand').getBoundingClientRect();
        return { width: innerWidth, scroll: document.documentElement.scrollWidth, button: r.height, right: r.right, monitor: document.getElementById('vitals-bar').getBoundingClientRect().height };
      });
      assert.ok(sizes.scroll <= sizes.width, 'no page overflow at ' + width);
      assert.ok(sizes.button >= 44 && sizes.right <= width, 'visible touch target at ' + width);
      assert.ok(sizes.monitor > sizes.button, 'monitor remains visible');
      await page.screenshot({ animations: 'disabled', path: path.join(output, `mobile-${width}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#vitals-scratch').scrollIntoViewIfNeeded();
    await page.locator('#scratch-clear').click();
    assert.equal(await inkCount(), 0);
    const touchBox = await page.locator('#vitals-scratch').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchBox.x + 30, y: touchBox.y + 30 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchBox.x + 100, y: touchBox.y + 55 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(await inkCount() > 0, 'finger drawing works');
    await page.evaluate(() => resetVitals());
    assert.equal(await inkCount(), 0, 'new call clears doodles');
    assert.equal(await page.locator('#vitals-expand').getAttribute('aria-expanded'), 'false');
    await page.locator('#vitals-expand').click();
    await page.locator('#vitals-close').focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#vitals-panel').isVisible(), false);
    // Model the distinct iOS visual viewport through keyboard open, pan, and close.
    await page.evaluate(async () => {
      const originalViewport = window.visualViewport;
      const viewport = new EventTarget();
      Object.assign(viewport, { height: 420, offsetTop: 28, scale: 1 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
      const originalScrollTo = window.scrollTo;
      let forcedScrolls = 0;
      window.scrollTo = () => forcedScrolls++;
      const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      userInput.focus({ preventScroll: true });
      adjustForViewport();
      await frame();
      let r = document.getElementById('input-row').getBoundingClientRect();
      if (r.bottom > 449 || r.top < 28) throw Error('Composer outside keyboard viewport');
      userInput.blur();
      setLoading(true);
      setLoading(false);
      if (document.activeElement === userInput) throw Error('Reply reopened the mobile keyboard');
      for (let i = 0; i < 80; i++) print('History line ' + i);
      output.scrollTop = 100;
      Object.assign(viewport, { height: 500, offsetTop: 0 });
      adjustForViewport();
      await frame();
      if (Math.abs(output.scrollTop - 100) > 1) throw Error('Viewport update jumped away from reading position');
      Object.assign(viewport, { height: 844, offsetTop: 0 });
      adjustForViewport();
      await frame();
      if (Math.abs(terminal.getBoundingClientRect().height - 844) > 1) throw Error('Keyboard dismissal did not restore height');
      if (forcedScrolls) throw Error('Viewport changes forced page scrolls');
      window.scrollTo = originalScrollTo;
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport });
      output.innerHTML = '';
      printBriefing();
      adjustForViewport();
    });
    for (const id of ['options-close', 'vitals-close', 'drug-panel-close', 'crew-panel-close', 'patient-panel-close', 'progress-close', 'auth-close']) {
      assert.equal(await page.locator('#' + id).evaluate(e => e.classList.contains('xp-close') && !!e.getAttribute('aria-label')), true);
    }
    await page.evaluate(() => {
      window.confirmed = false;
      showConfirm({ title: 'Test close', body: 'Cancel safely', onConfirm: () => { window.confirmed = true; } });
    });
    await page.locator('.confirm-close').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#confirm-overlay').count(), 0);
    assert.equal(await page.evaluate(() => window.confirmed), false);
    await page.evaluate(() => { toggleTheme(); showCrewPanel(); });
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'mobile-light-crew.png') });
    assert.deepEqual(errors, []);
    console.log('UI checks passed. Screenshots: ' + output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
