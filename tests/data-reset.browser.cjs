'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createApp } = require('../server');
const { testDatabase } = require('./database-helper');
const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (process.env.TEST_DISPOSABLE !== '1' || !target || !['localhost', '127.0.0.1'].includes(target.hostname) || target.port !== '55429')
  throw Error('Use disposable PostgreSQL on loopback 55429 with TEST_DISPOSABLE=1.');
let database, app, browser, context, page, base, csrf;
const checks = [], errors = [], output = path.resolve('test-results');
fs.mkdirSync(output, { recursive: true });
async function request(route, method = 'GET', data, status = 200) {
  const response = await context.request.fetch(base + route, { method, headers: { 'X-CSRF-Token': csrf }, ...(data === undefined ? {} : { data }) });
  const result = await response.json();
  assert.equal(response.status(), status, route + ': ' + JSON.stringify(result));
  return result;
}
async function check(name, fn) {
  try { await fn(); checks.push({ name, result: 'PASS' }); console.log('PASS ' + name); }
  catch (error) { checks.push({ name, result: 'FAIL', error: error.message }); throw error; }
}
const idle = () => page.waitForFunction(() => !busy);
async function unlock() { for (let n = 0; n < 5; n++) await page.locator('#reset-unlock').click(); }
async function warning(step) { await page.getByRole('dialog', { name: 'Warning ' + step + ' of 3', exact: true }).waitFor(); await idle(); }
async function start() { await unlock(); await page.locator('#reset-data').click(); await warning(1); }

(async () => {
  try {
    database = await testDatabase();
    app = await createApp({ ...database, staticDir: path.resolve('dist') });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    base = 'http://127.0.0.1:' + app.server.address().port;
    browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(chromium.executablePath()) ? chromium.executablePath() : 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const password = 'Reset-browser-' + crypto.randomUUID();
    const setup = await context.request.post(base + '/api/auth/setup', { data: { name: 'Reset browser owner', username: 'resetbrowser', password, demo: true } });
    assert.equal(setup.status(), 201); csrf = (await setup.json()).csrfToken;
    await page.goto(base + '/#set');
    await page.locator('#data-reset').waitFor(); await idle();
    const original = await request('/api/state');
    await check('Reset section is last in Settings and requires exactly five unlock clicks', async () => {
      assert.equal(await page.locator('main #data-reset').evaluate(node => node === node.parentElement.lastElementChild), true);
      assert.equal(await page.locator('#reset-data').isDisabled(), true);
      assert.equal(await page.locator('#reset-unlock').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(179, 38, 30)');
      for (let n = 1; n <= 4; n++) { await page.locator('#reset-unlock').click(); assert.equal(await page.locator('#reset-data').isDisabled(), true); }
      await page.locator('#reset-unlock').click();
      assert.equal(await page.locator('#reset-data').isEnabled(), true);
      assert.equal(await page.locator('#reset-unlock').isDisabled(), true);
      assert.equal((await request('/api/state')).revision, original.revision);
      await page.locator('#data-reset').screenshot({ path: path.join(output, 'data-reset-desktop.png') });
      await page.reload(); await page.locator('#data-reset').waitFor();
      assert.equal(await page.locator('#reset-data').isDisabled(), true);
    });
    await check('Cancel at any of the three warnings retains data and relocks reset', async () => {
      for (const stopAt of [1, 2, 3]) {
        await start();
        for (let n = 1; n < stopAt; n++) { await page.locator('#reset-confirm').click(); await warning(n + 1); }
        assert.equal((await request('/api/state')).revision, original.revision);
        assert.equal(await page.getByRole('button', { name: 'Cancel reset', exact: true }).evaluate(node => node === document.activeElement), true);
        await page.getByRole('button', { name: 'Cancel reset', exact: true }).click();
        assert.equal(await page.locator('#data-reset-dialog').count(), 0);
        assert.equal(await page.locator('#reset-data').isDisabled(), true);
        assert.equal(await page.locator('#reset-unlock').isEnabled(), true);
      }
      assert.deepEqual((await request('/api/state')).state, original.state);
    });
    await check('Escape cancels safely and navigation resets unlock progress', async () => {
      await start(); await page.keyboard.press('Escape');
      assert.equal(await page.locator('#data-reset-dialog').count(), 0);
      assert.equal(await page.locator('#reset-data').isDisabled(), true);
      await page.locator('#reset-unlock').click();
      await page.evaluate(() => go('dash')); await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
      await page.evaluate(() => go('set')); await page.locator('#data-reset').waitFor();
      assert.equal(await page.locator('#reset-unlock').textContent(), 'Unlock reset (0/5)');
    });
    await check('Server conflict closes confirmations and leaves the reset button locked', async () => {
      await start();
      await request('/api/customers', 'POST', { name: 'Added during warning', mob: '9876500010' }, 201);
      await page.locator('#reset-confirm').click(); await idle();
      assert.equal(await page.locator('#data-reset-dialog').count(), 0);
      assert.equal(await page.locator('#reset-data').isDisabled(), true);
      assert.equal(await page.locator('#reset-unlock').isEnabled(), true);
      assert.ok((await request('/api/state')).state.customers.some(c => c.name === 'Added during warning'));
      await page.reload(); await page.locator('#data-reset').waitFor(); await idle();
    });
    await check('Mobile reset and warning dialogs fit the screen and show permanent deletion warnings', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#data-reset').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('#data-reset').evaluate(node => node.getBoundingClientRect().right <= innerWidth));
      await page.locator('#data-reset').screenshot({ path: path.join(output, 'data-reset-mobile.png') });
      await start();
      assert.ok(await page.locator('#data-reset-dialog').evaluate(node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
      await page.locator('#data-reset-dialog').screenshot({ path: path.join(output, 'data-reset-warning-mobile.png') });
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1440, height: 1000 });
    });
    await check('Only the third confirmation clears data, reloads empty and preserves login/settings', async () => {
      const savedSettings = (await request('/api/state')).state.set;
      await page.evaluate(() => { Q = { id: 'stale-draft', items: [] }; });
      await start();
      await page.locator('#reset-confirm').click(); await warning(2);
      assert.ok((await request('/api/state')).state.products.length);
      await page.locator('#reset-confirm').click(); await warning(3);
      assert.ok((await request('/api/state')).state.products.length);
      assert.equal(await page.locator('#reset-confirm').textContent(), 'Delete all data permanently');
      await page.locator('#data-reset-dialog').screenshot({ path: path.join(output, 'data-reset-final-warning.png') });
      await page.locator('#reset-confirm').click();
      await page.waitForFunction(() => typeof S !== 'undefined' && S !== null && S.products.length === 0 && S.quotes.length === 0);
      await page.locator('#data-reset').waitFor(); await idle();
      assert.equal(await page.locator('#data-reset-dialog').count(), 0);
      assert.equal(await page.locator('#reset-data').isDisabled(), true);
      assert.equal(await page.evaluate(() => Q), null);
      const clean = await request('/api/state');
      for (const key of ['cats', 'products', 'customers', 'quotes', 'customerCategories']) assert.deepEqual(clean.state[key], [], key);
      assert.deepEqual(clean.state.set, savedSettings);
      assert.equal((await request('/api/auth/status')).user.username, 'resetbrowser');
      await page.reload(); await page.locator('#data-reset').waitFor();
      assert.equal((await request('/api/state')).state.products.length, 0);
    });
    await check('Delegated employees cannot see the reset section in Settings', async () => {
      await request('/api/users', 'POST', { name: 'Settings employee', username: 'resetstaff', password, role: 'Employee', permissions: ['settings.manage'] }, 201);
      const staff = await browser.newContext();
      try {
        assert.equal((await staff.request.post(base + '/api/auth/login', { data: { username: 'resetstaff', password } })).status(), 200);
        const tab = await staff.newPage(); await tab.goto(base + '/#set');
        await tab.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
        assert.equal(await tab.locator('#data-reset').count(), 0);
      } finally { await staff.close(); }
    });
    assert.deepEqual(errors, []);
    console.log(checks.length + ' browser checks passed.');
  } catch (error) {
    await page?.screenshot({ path: path.join(output, 'data-reset-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'data-reset-browser-results.json'), JSON.stringify({ checks, errors }, null, 2));
    await browser?.close(); await app?.close(); await database?.destroy();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
