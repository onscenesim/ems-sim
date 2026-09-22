'use strict';
// Optional real-browser interaction check; same overrides as browser-ui-panels.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createGlovebox, gloveboxView, sortItem } = require('../src/engine/glovebox');
const { items, resolve } = require('../public/glovebox-catalog');
const root = path.resolve(__dirname, '../public');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-glovebox-'));

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
    const errors = [];
    const states = new Map();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://ems.test/**', async route => {
      const url = new URL(route.request().url());
      const match = url.pathname.match(/^\/api\/scenario\/([^/]+)\/glovebox$/);
      if (match) {
        const id = match[1];
        if (!states.has(id)) states.set(id, createGlovebox(id));
        const state = states.get(id);
        try {
          const result = route.request().method() === 'POST' ? sortItem(state, route.request().postDataJSON().item, route.request().postDataJSON().destination) : {};
          return route.fulfill({ json: { glovebox: gloveboxView(state), progressScope: 'guest', ...result } });
        } catch (error) { return route.fulfill({ status: error.status, json: { message: error.message, error: error.code } }); }
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
      const file = path.join(root, url.pathname.replace(/^\//, '') || 'index.html');
      return route.fulfill(fs.existsSync(file) && fs.statSync(file).isFile() ? { path: file } : { status: 404, body: '' });
    });
    async function setup() {
      await page.evaluate(() => {
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('terminal').style.display = 'flex';
        window.effectPlays = {};
        for (const name of ['glovebox', 'rummage', 'pocket', 'trash', 'paper']) {
          for (const voice of SOUND_VOICE_POOLS.get(name)) voice.play = () => { effectPlays[name] = (effectPlays[name] || 0) + 1; return Promise.resolve(); };
        }
      });
    }
    await page.goto('http://ems.test/');
    await setup();
    const trigger = page.locator('#glovebox-btn');
    const dialog = page.locator('#glovebox-dialog');
    const activeIds = () => page.locator('#glovebox-tray .glovebox-item').evaluateAll(nodes => nodes.map(node => node.dataset.item));
    async function open(call) {
      await page.evaluate(id => { sessionId = id; }, call);
      const response = page.waitForResponse(url => url.url().endsWith(`/${call}/glovebox`));
      await trigger.click();
      await response;
      await page.waitForFunction(() => document.getElementById('glovebox-empty').textContent !== 'Opening the compartment…');
    }
    async function close() {
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('glovebox-dialog').open);
      await page.waitForFunction(() => document.activeElement.id === 'glovebox-btn');
    }
    const art = [];
    for (const item of items) {
      const state = createGlovebox(item.id);
      state.order = [item.id, ...state.order.filter(id => id !== item.id)];
      states.set(item.id, state);
      await open(item.id);
      const first = page.locator('#glovebox-tray .glovebox-item').first();
      await first.click();
      assert.equal(await page.locator('#glovebox-tooltip').isVisible(), true);
      assert.equal(await page.locator('#glovebox-item-name').textContent(), item.name);
      art.push([item.id, await first.innerHTML()]);
      const ids = await activeIds();
      await close();
      await open(item.id);
      assert.deepEqual(await activeIds(), ids, 'closing and reopening cannot reroll finds');
      await close();
    }
    assert.equal(await page.evaluate(() => effectPlays.glovebox), 80);
    assert.equal(await page.evaluate(() => effectPlays.rummage), 40);
    await page.evaluate(() => { soundEnabled = false; });
    await open('muted');
    await page.locator('.glovebox-item').first().click();
    assert.equal(await page.evaluate(() => effectPlays.glovebox), 80);
    assert.equal(await page.evaluate(() => effectPlays.rummage), 40);
    await close();
    await page.evaluate(() => { soundEnabled = true; document.getElementById('vitals-expand').click(); });
    assert.equal(await page.evaluate(() => effectPlays.paper), 1, 'notepad opens with paper flip');
    await page.evaluate(() => setVitalsPanelOpen(false));

    for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 568 }, { width: 390, height: 844 }, { width: 740, height: 360 }]) {
      await page.setViewportSize(viewport);
      const call = `layout-${viewport.width}`;
      const state = createGlovebox(call);
      state.initialCount = 3;
      state.order = ['shears', 'aux', 'callahan-note', ...state.order.filter(id => !['shears', 'aux', 'callahan-note'].includes(id))];
      states.set(call, state);
      await open(call);
      assert.equal((await activeIds()).length, 3);
      assert.equal(await trigger.locator('span').isVisible(), viewport.width > 600);
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width);
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height);
      for (const zone of ['pocket', 'trash']) {
        const bounds = await page.locator(`#glovebox-${zone}`).boundingBox();
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height, 'drop targets stay on screen');
      }
      const item = page.locator('[data-item="shears"]');
      await item.scrollIntoViewIfNeeded();
      const before = await item.boundingBox();
      await page.mouse.move(before.x + 40, before.y + 40);
      await page.mouse.down();
      await page.mouse.move(before.x + 60, before.y + 52, { steps: 5 });
      await page.mouse.up();
      const after = await item.boundingBox();
      assert.ok(after.x > before.x + 10, 'mouse drag moves item');
      assert.equal((await activeIds()).length, 3, 'moving inside compartment never sorts');
      await item.focus();
      await page.keyboard.press('ArrowRight');
      assert.ok((await item.boundingBox()).x > after.x, 'arrows move item');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#glovebox-tooltip').isVisible(), true);
      await page.screenshot({ animations: 'disabled', path: path.join(output, `glovebox-${viewport.width}.png`) });
      // Wrong destination retains the item and earns nothing.
      await page.locator('#glovebox-trash').click();
      await page.waitForFunction(() => document.getElementById('glovebox-feedback').textContent.includes('might want'));
      assert.equal((await activeIds()).length, 3);
      assert.equal(await page.locator('#glovebox-xp').textContent(), '0 XP');
      // Click/keyboard alternatives support players who cannot drag.
      await page.locator('#glovebox-pocket').click();
      await page.waitForFunction(() => document.getElementById('glovebox-xp').textContent === '5 XP');
      assert.equal((await activeIds()).length, 2);
      assert.equal(await page.locator('#glovebox-inventory-list li').count(), 1);
      // Drag the cord onto the trash, revealing one find after two removals.
      const cord = page.locator('[data-item="aux"]');
      await cord.scrollIntoViewIfNeeded();
      const cordBox = await cord.boundingBox();
      const bin = await page.locator('#glovebox-trash').boundingBox();
      await page.mouse.move(cordBox.x + 40, cordBox.y + 35);
      await page.mouse.down();
      await page.mouse.move(bin.x + bin.width / 2, bin.y + bin.height / 2, { steps: 10 });
      await page.mouse.up();
      await page.waitForFunction(() => document.getElementById('glovebox-xp').textContent === '10 XP');
      assert.equal((await activeIds()).length, 2, 'two removed reveals one additional item');
      const ids = await activeIds();
      await close();
      await open(call);
      assert.deepEqual(await activeIds(), ids);
      assert.equal(await page.locator('#glovebox-xp').textContent(), '10 XP');
      await close();
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await open('touch');
    const first = page.locator('#glovebox-tray .glovebox-item').first();
    const id = await first.getAttribute('data-item');
    const target = resolve(id).destination;
    const source = await first.boundingBox();
    const dest = await page.locator(`#glovebox-${target}`).boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: source.x + 40, y: source.y + 40 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: dest.x + 25, y: dest.y + 25 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => document.getElementById('glovebox-xp').textContent === '5 XP');
    assert.ok(!(await activeIds()).includes(id), 'touch can sort items');
    const touchIds = await activeIds();
    await close();
    await page.reload();
    await setup();
    await open('touch');
    assert.deepEqual(await activeIds(), touchIds, 'refresh restores the call’s sorted state');
    assert.equal(await page.locator('#glovebox-xp').textContent(), '5 XP');
    assert.ok(await page.evaluate(() => guestProgressStats().xp >= 45), 'guest XP persists on this device');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#glovebox-tray .glovebox-item').first().tap();
    assert.equal(await page.locator('#glovebox-tray .glovebox-item').first().locator('svg').evaluate(node => getComputedStyle(node).animationName), 'none');
    await close();
    await page.evaluate(() => { resetToStart(); showProgress(); });
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'progress.png') });
    // Review the entire sprite catalog at once.
    await page.setViewportSize({ width: 1000, height: 1000 });
    await page.evaluate(entries => {
      document.body.innerHTML = '';
      document.body.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:14px;padding:25px;background:#1b2325;height:auto;overflow:auto;';
      for (const [id, sprite] of entries) {
        const cell = document.createElement('div');
        cell.style.cssText = 'color:#d5d5c9;font:13px monospace;text-align:center;';
        cell.innerHTML = `<div style="width:96px;height:80px;margin:10px auto">${sprite}</div><span>${id}</span>`;
        document.body.appendChild(cell);
      }
    }, art);
    await page.screenshot({ path: path.join(output, 'catalog.png') });
    assert.deepEqual(errors, []);
    console.log('Glovebox browser checks passed. Screenshots: ' + output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
