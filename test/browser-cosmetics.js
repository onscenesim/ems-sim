'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { validate, stickers } = require('../public/cosmetics-catalog');
const root = path.resolve(__dirname, '../public');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-cosmetics-ui-'));
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
    const errors = [];
    let player = null, failSave = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://ems.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { player } });
      if (url.pathname === '/api/auth/cosmetics') {
        if (failSave) return route.fulfill({ status: 500, json: { message: 'Save failed. Please try again.' } });
        try { player.cosmetics = validate(route.request().postDataJSON(), player.stats.xp, player.cosmeticsUnlocked === true, player.stats.scenariosCompleted || 0); return route.fulfill({ json: { player } }); }
        catch (error) { return route.fulfill({ status: 400, json: { message: error.message } }); }
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
      const file = path.join(root, url.pathname.replace(/^\//, '') || 'index.html');
      return route.fulfill(fs.existsSync(file) && fs.statSync(file).isFile() ? { path: file } : { status: 404, body: '' });
    });
    async function showGame() {
      await page.evaluate(() => {
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('terminal').style.display = 'flex';
        sessionId = 'cosmetics-demo';
        applyVitals({ HR: 124, BP: '138/82', SpO2: 97, ETCO2: 36, RR: 18, Temp: '37.2 C', Glucose: '126', GCS: '15', Pain: '4/10' });
      });
    }
    async function open() {
      await page.evaluate(() => setVitalsPanelOpen(true));
      await page.locator('#notepad-stickers-edit').click();
      await page.waitForFunction(() => document.getElementById('cosmetics-dialog').open);
    }
    async function apply() {
      await page.locator('#cosmetics-apply').click();
      await page.waitForFunction(() => !document.getElementById('cosmetics-dialog').open);
    }
    await page.goto('http://ems.test/');
    await page.waitForFunction(() => !!window.EMSCosmetics);
    await showGame();
    await open();
    assert.equal(await page.locator('.cosmetic-sticker').count(), 19);
    assert.equal(await page.locator('.cosmetic-pen').count(), 8);
    assert.equal(await page.locator('[data-sticker="emt"]').isDisabled(), true);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { for (let i = 0; i < 24; i++) recordGuestProgress('earned-call-' + i, { completed: true, completionXP: 200 }); });
    await open();
    assert.equal(await page.locator('.cosmetic-sticker:disabled').count(), 0);
    await page.waitForFunction(() => [...document.querySelectorAll('.cosmetic-sticker img')].every(img => img.complete));
    assert.deepEqual(await page.locator('.cosmetic-sticker img').evaluateAll(images => images.filter(img => !img.naturalWidth).map(img => img.src)), []);
    await page.locator('[data-pen="red"]').click();
    await page.locator('[data-sticker="freedom-house"]').click();
    await page.locator('[data-sticker="narcan"]').click();
    await page.locator('[data-sticker="dos-epis"]').click();
    assert.match(await page.locator('#cosmetics-status').textContent(), /Two stickers/);
    assert.equal(await page.locator('.cosmetic-sticker[aria-pressed="true"]').count(), 2);
    await page.locator('[data-sticker="narcan"]').click();
    await page.locator('[data-sticker="custom-note"]').click();
    const customText = 'Return the gas card. <script>window.stickerXSS=1</script>';
    await page.locator('#cosmetics-note').fill(customText);
    await apply();
    assert.equal(await page.locator('.notepad-sticker').count(), 2);
    assert.equal(await page.locator('#scratch-pen').inputValue(), 'red');
    assert.equal(await page.evaluate(() => guestProgressStats().xp), 4800, 'equipping spends no XP');
    assert.equal(await page.evaluate(() => window.stickerXSS), undefined, 'note is inert text');
    assert.match(await page.locator('#notepad-stickers .sticker-art-custom-note').getAttribute('alt'), /Return the gas card/);

    await page.evaluate(() => setVitalsPanelOpen(true));
    const canvas = page.locator('#vitals-scratch');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 40, { steps: 5 });
    await page.mouse.up();
    const redPixels = () => page.evaluate(() => {
      const bytes = scratchContext.getImageData(0, 0, vitalsScratch.width, vitalsScratch.height).data;
      let count = 0;
      for (let i = 0; i < bytes.length; i += 4) if (bytes[i] > 140 && bytes[i + 1] < 70 && bytes[i + 3] > 0) count++;
      return count;
    });
    const before = await redPixels();
    assert.ok(before > 20, 'canvas uses the selected red pen');
    await page.locator('#scratch-pen').selectOption('green');
    await page.waitForFunction(() => !document.getElementById('scratch-pen').disabled);
    assert.equal(await redPixels(), before, 'changing pen preserves existing ink');
    await page.screenshot({ path: path.join(output, 'notepad-pen.png') });
    await page.locator('#scratch-clear').click();
    assert.equal(await redPixels(), 0, 'clear still clears doodles');
    await page.locator('#vitals-close').click();
    await page.reload();
    await page.waitForFunction(() => !!window.EMSCosmetics);
    await showGame();
    assert.equal(await page.locator('.notepad-sticker').count(), 2);
    assert.equal(await page.locator('#scratch-pen').inputValue(), 'green');
    assert.match(await page.locator('.notepad-sticker img[alt^="Post-it"]').getAttribute('alt'), /gas card/, 'custom note survives refresh');

    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 700 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => setVitalsPanelOpen(true));
      await page.locator('#notepad-stickers').scrollIntoViewIfNeeded();
      const layout = await page.evaluate(() => {
        const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; };
        return { stickers: [...document.querySelectorAll('.notepad-sticker')].map(rect), vitals: [...document.querySelectorAll('.notepad-readings .vital-row-label, .notepad-readings .vital-row-value, .notepad-readings .vital-row-stamp')].map(rect), width: document.documentElement.scrollWidth };
      });
      assert.ok(layout.width <= viewport.width, 'no horizontal viewport overflow');
      assert.equal(await page.locator('#vitals-bar .notepad-sticker').count(), 0, 'stickers belong inside the notebook');
      for (const s of layout.stickers) {
        assert.ok(s.x >= 0 && s.right <= viewport.width);
        for (const v of layout.vitals) assert.ok(s.right <= v.x || s.x >= v.right || s.bottom <= v.y || s.y >= v.bottom, 'stickers never overlap notebook readings');
      }
      await page.screenshot({ path: path.join(output, `notebook-${viewport.width}.png`) });
      await open();
      const bounds = await page.locator('#cosmetics-dialog').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width);
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height);
      await page.screenshot({ path: path.join(output, `drawer-${viewport.width}.png`) });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('cosmetics-dialog').open);
    }
    // Saving to an account is separate from guest cosmetics, with visible rollback on failure.
    player = { id: 'one', displayName: 'Player One', stats: { xp: 4800, scenariosCompleted: 24 }, cosmetics: { pen: 'purple', stickers: ['speed', 'house'], note: 'Account note' } };
    await page.evaluate(() => refreshPlayer());
    assert.equal(await page.locator('#scratch-pen').inputValue(), 'purple');
    assert.equal(await page.locator('#notepad-stickers .sticker-art-speed').count(), 1);
    assert.equal(await page.locator('#notepad-stickers .sticker-art-speed').getAttribute('src'), '/stickers/speed.jpg');
    await page.screenshot({ path: path.join(output, 'meme-stickers.png') });
    await page.evaluate(() => setVitalsPanelOpen(true));
    failSave = true;
    await page.locator('#scratch-pen').selectOption('orange');
    await page.waitForFunction(() => document.getElementById('scratch-pen-status').textContent.includes('Save failed'));
    assert.equal(await page.locator('#scratch-pen').inputValue(), 'purple');
    failSave = false;
    await page.locator('#scratch-pen').selectOption('teal');
    await page.waitForFunction(() => !document.getElementById('scratch-pen').disabled);
    assert.equal(player.cosmetics.pen, 'teal');
    assert.deepEqual(player.cosmetics.stickers, ['speed', 'house']);
    await page.evaluate(() => setVitalsPanelOpen(false));
    player.stats.scenariosCompleted = 19;
    await page.evaluate(() => refreshPlayer());
    await open();
    assert.equal(await page.locator('[data-sticker="lifepak12"]').isDisabled(), true);
    assert.match(await page.locator('[data-sticker="lifepak12"] .cosmetic-cost').textContent(), /20 completed scenarios/);
    player.stats.scenariosCompleted = 20;
    await page.evaluate(() => refreshPlayer());
    assert.equal(await page.locator('[data-sticker="lifepak12"]').isDisabled(), false);
    await page.keyboard.press('Escape');
    player = { id: 'admin', displayName: 'ADMIN', role: 'admin', cosmeticsUnlocked: true, stats: { xp: 0 }, cosmetics: { pen: 'navy', stickers: [], note: '' } };
    await page.evaluate(() => refreshPlayer());
    await open();
    assert.equal(await page.locator('.cosmetic-sticker:disabled').count(), 0);
    assert.equal(await page.locator('.cosmetic-pen:disabled').count(), 0);
    assert.match(await page.locator('#cosmetics-xp').textContent(), /ADMIN/);
    await page.locator('[data-sticker="lifepak12"]').click();
    await page.locator('[data-sticker="speed"]').click();
    await page.locator('[data-pen="orange"]').click();
    await apply();
    assert.equal(player.stats.xp, 0);
    assert.deepEqual(player.cosmetics.stickers, ['lifepak12', 'speed']);
    assert.equal(player.cosmetics.pen, 'orange');
    player = null;
    await page.evaluate(() => refreshPlayer());
    assert.equal(await page.locator('#scratch-pen').inputValue(), 'green');
    assert.equal(await page.locator('#notepad-stickers .sticker-art-speed').count(), 0, 'guest cosmetics return after logout');
    // Every design in a single review sheet, separate from the usable drawer.
    await page.setViewportSize({ width: 1200, height: 1150 });
    await open();
    await page.evaluate(() => {
      const sheet = document.createElement('div');
      sheet.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#b9bfad;display:grid;grid-template-columns:repeat(5,1fr);padding:20px;gap:12px;z-index:99999;';
      document.querySelectorAll('.cosmetic-sticker').forEach(item => sheet.appendChild(item.cloneNode(true)));
      document.getElementById('cosmetics-dialog').close();
      document.body.appendChild(sheet);
    });
    await page.screenshot({ path: path.join(output, 'collection.png') });
    assert.deepEqual(errors, []);
    console.log('Cosmetics browser checks passed. Screenshots: ' + output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
