'use strict';

// This runner writes intentional synthetic fixtures only to a separate local test app.
// Example: TEST_DISPOSABLE=1 TEST_BASE_URL=http://127.0.0.1:6428 node tests/dashboard.browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const DP = require('../shared/domain');
const { EMPLOYEE_PERMISSIONS } = require('../server/access');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:6428';
const target = new URL(base);
if (process.env.TEST_DISPOSABLE !== '1' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || target.port === '6400')
  throw new Error('Set TEST_DISPOSABLE=1 and use a separate loopback test installation, never port 6400.');

fs.mkdirSync('test-results', { recursive: true });
const results = [], exceptions = [], browserWarnings = [];
const suffix = crypto.randomBytes(5).toString('hex');
const fixturePassword = 'Disposable-dashboard-' + crypto.randomUUID();
const fixtures = { users: [], quotations: [], customers: [] };
let browser, page, context, admin, latestDashboard, activeRequest = 0;

async function check(name, run) {
  try {
    const detail = await run();
    results.push({ name, result: 'PASS', ...(detail === undefined ? {} : { detail }) });
    console.log('PASS ' + name);
  } catch (error) {
    results.push({ name, result: 'FAIL', error: error.message });
    throw error;
  }
}
const idle = () => page.waitForFunction(() => !busy);
const close = async () => {
  if (await page.locator('#modal').isVisible())
    await page.getByRole('button', { name: 'Close', exact: true }).first().click();
};
const addDays = (date, count) => {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
};
const money = value => '\u20b9' + (value / 100).toLocaleString('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

function client(requestContext) {
  let csrf;
  return { async request(route, method = 'GET', body, expected = 200) {
    const response = await requestContext.fetch(base + route, {
      method, headers: { ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { data: body }),
    });
    const json = response.headers()['content-type']?.includes('application/json');
    const data = json ? await response.json() : await response.body();
    if (data.csrfToken) csrf = data.csrfToken;
    assert.equal(response.status(), expected, method + ' ' + route + ': ' +
      (json ? JSON.stringify(data) : 'binary response'));
    return data;
  } };
}

function watch(testPage) {
  testPage.on('pageerror', error => exceptions.push(error.message));
  testPage.on('console', entry => {
    if (entry.type() === 'warning' && /react|uncaught|unhandled/i.test(entry.text()))
      browserWarnings.push(entry.text());
  });
  testPage.on('response', async response => {
    if (new URL(response.url()).pathname === '/api/dashboard' && response.ok()) {
      const number = ++activeRequest;
      const data = await response.json().catch(() => null);
      if (data && number === activeRequest) latestDashboard = data;
    }
  });
}

async function dashboardReady() {
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
  await page.locator('#recent-quotations table').waitFor();
  await page.locator('#needs-attention').waitFor();
  await page.waitForFunction(() => document.querySelector('#dashboard-results')?.getAttribute('aria-busy') !== 'true');
  await idle();
}

async function choose(label, option) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search ' + label + ' options', exact: true });
  await search.fill(option);
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function filter(label, option) {
  const [response] = await Promise.all([
    page.waitForResponse(r => new URL(r.url()).pathname === '/api/dashboard' && r.ok()),
    choose(label, option),
  ]);
  const data = await response.json();
  await dashboardReady();
  return data;
}

async function assertKpis(data) {
  const values = await page.locator('#dashboard-results .cards').first().locator('.card b').allTextContents();
  assert.deepEqual(values.map(s => s.trim()), [String(data.kpis.total), String(data.kpis.draft),
    String(data.kpis.pendingReview), money(data.kpis.quotedValue)]);
}

async function signIn(testPage, username, password) {
  await testPage.goto(base);
  await testPage.getByLabel('Username', { exact: true }).fill(username);
  await testPage.getByLabel('Password', { exact: true }).fill(password);
  await testPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await testPage.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
}

async function navigateDashboard() {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dashboard' && r.ok());
  await page.evaluate(() => go('dash'));
  const data = await (await response).json();
  await dashboardReady();
  return data;
}

(async () => {
  browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
    // A browser timezone different from the business timezone catches host-dependent greetings/dates.
    timezoneId: 'America/Los_Angeles' });
  page = await context.newPage();
  watch(page);
  admin = client(context.request);

  await check('Dashboard: authenticated shell and current user use live account data', async () => {
    const status = await admin.request('/api/auth/status');
    let username = process.env.TEST_USERNAME, password = process.env.TEST_PASSWORD;
    if (!status.initialized) {
      username ||= 'dashboard_admin_' + suffix;
      password ||= fixturePassword;
      await admin.request('/api/auth/setup', 'POST', {
        name: 'Dashboard Fixture Administrator', username, password, demo: true,
      }, 201);
    } else {
      if (!username || !password) throw new Error('An initialized disposable app requires TEST_USERNAME and TEST_PASSWORD.');
      await admin.request('/api/auth/login', 'POST', { username, password });
    }
    await page.goto(base);
    await dashboardReady();
    const me = await admin.request('/api/auth/me');
    assert.match(await page.locator('header').textContent(), new RegExp(me.user.name));
    assert.match(await page.locator('header').textContent(), new RegExp(me.user.role));
    assert.match(await page.getByRole('heading', { name: 'Dashboard', exact: true }).textContent(),
      new RegExp(me.user.name.split(/\s+/)[0]));
    assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-label'), 'Collapse sidebar');
    assert.equal(await page.evaluate(() => D.r), 'month');
    assert.deepEqual(await page.locator('select[aria-label="Date range"] option').evaluateAll(options =>
      options.map(option => option.value).sort()),
    ['all', 'custom', 'last30', 'lastmonth', 'month', 'today', 'week', 'yesterday']);
    return { role: me.user.role, reportingPeriod: 'month', timezone: latestDashboard.timezone };
  });

  await check('Dashboard: fixtures come from real isolated quotation and customer APIs', async () => {
    const state = (await admin.request('/api/state')).state;
    const product = state.products.find(p => p.id === 'p1');
    assert.ok(product?.on, 'The disposable demo catalog contains its configured fixture product.');
    for (let n = 0; n < 2; n++) {
      const customer = await admin.request('/api/customers', 'POST', {
        name: 'Dashboard ' + suffix + ' Customer ' + n,
        co: 'Fixture company ' + suffix + ' ' + n,
        mob: '98765' + String(10000 + n), wa: '+9198765' + String(10000 + n),
        notes: 'Isolated dashboard browser fixture', allowDuplicate: true,
      }, 201);
      fixtures.customers.push(customer.data);
    }
    for (const name of ['Alice', 'Bob', 'Empty']) {
      const user = (await admin.request('/api/users', 'POST', {
        name: 'Dashboard ' + name + ' ' + suffix, username: 'dash_' + name.toLowerCase() + '_' + suffix,
        password: fixturePassword, role: 'Employee',
        permissions: EMPLOYEE_PERMISSIONS.filter(p => p !== 'customer.view'),
      }, 201)).user;
      const accountContext = await browser.newContext();
      const account = client(accountContext.request);
      await account.request('/api/auth/login', 'POST', { username: user.username, password: fixturePassword });
      fixtures.users.push({ user, account, context: accountContext });
    }
    const today = (await admin.request('/api/dashboard')).today;
    for (let n = 0; n < 8; n++) {
      const owner = fixtures.users[n < 5 ? 0 : 1];
      const cfg = DP.defCfg(product);
      const result = await owner.account.request('/api/quotations', 'POST', {
        cid: fixtures.customers[n % 2].id, date: n === 0 ? '2001-01-04' : today,
        valid: n === 0 ? '2001-02-04' : addDays(today, n === 2 ? 2 : 15),
        subject: 'Dashboard fixture ' + suffix + ' ' + n,
        items: [{ pid: product.id, cfg }],
      }, 201);
      let quotation = result;
      if (n === 1 || n === 2)
        quotation = await owner.account.request('/api/quotations/' + result.data.id + '/status', 'POST', {
          version: result.version, status: 'Pending Internal Review', remarks: 'Browser fixture submission',
        });
      if (n === 2) {
        quotation = await admin.request('/api/quotations/' + result.data.id + '/status', 'POST', {
          version: quotation.version, status: 'Approved Internally', remarks: 'Independent fixture review',
        });
        quotation = await admin.request('/api/quotations/' + result.data.id + '/status', 'POST', {
          version: quotation.version, status: 'Sent to Customer', remarks: 'Fixture customer quotation',
        });
      }
      fixtures.quotations.push(quotation.data);
    }
    await page.evaluate(async () => { adopt(await api('/api/state')); render(); });
    await dashboardReady();
    return { fixtureQuotations: fixtures.quotations.length, fixtureCustomers: fixtures.customers.length,
      normalInstallationModified: false };
  });

  await check('Dashboard: four KPI cards equal authorized backend totals and stored paise', async () => {
    const data = await admin.request('/api/dashboard?from=' + latestDashboard.today.slice(0, 8) + '01&to=' + latestDashboard.today);
    await assertKpis(data);
    const all = await admin.request('/api/quotations?pageSize=100');
    const month = all.data.filter(q => q.date >= data.today.slice(0, 8) + '01' && q.date <= data.today);
    assert.equal(data.kpis.total, month.length);
    const state = (await admin.request('/api/state')).state;
    assert.equal(data.kpis.quotedValue, month.reduce((sum, q) => sum + DP.totals(q, state.set).grand, 0));
    assert.equal(data.kpis.draft, month.filter(q => q.status === 'Draft').length);
    assert.equal(data.kpis.pendingReview, month.filter(q => q.status === 'Pending Internal Review').length);
    assert.match(await page.locator('#dashboard-results').textContent(), /Across all statuses/);
    return data.kpis;
  });

  await check('Dashboard: date and advanced employee/customer/status filters update every primary panel', async () => {
    const before = latestDashboard;
    const all = await filter('Date range', 'All time');
    await assertKpis(all);
    assert.ok(all.kpis.total > before.kpis.total);
    const details = page.locator('#dashboard-filters');
    await details.locator('summary').click();
    const own = await filter('Employee', fixtures.users[0].user.name);
    assert.equal(own.kpis.total, 5);
    const customer = await filter('Customer', fixtures.customers[0].name);
    assert.equal(customer.kpis.total, 3);
    const draft = await filter('Quotation status', 'Draft');
    assert.equal(draft.kpis.total, 2);
    await assertKpis(draft);
    assert.ok(draft.recent.every(q => q.status === 'Draft' && q.cid === fixtures.customers[0].id));
    await filter('Employee', 'All permitted employees');
    await filter('Customer', 'All customers');
    await filter('Quotation status', 'All statuses');
    await filter('Employee', fixtures.users[0].user.name);
    await choose('Date range', 'Custom date range');
    await page.locator('#dashboard-results').getByRole('alert').filter({ hasText: 'Choose both dates' }).waitFor();
    await page.getByLabel('Dashboard from date', { exact: true }).fill('2001-01-01');
    await page.getByLabel('Dashboard from date', { exact: true }).press('Tab');
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dashboard' &&
      new URL(r.url()).searchParams.get('to') === '2001-01-31' && r.ok());
    await page.getByLabel('Dashboard to date', { exact: true }).fill('2001-01-31');
    await page.getByLabel('Dashboard to date', { exact: true }).press('Tab');
    const custom = await (await response).json();
    await dashboardReady();
    assert.equal(custom.kpis.total, 1);
    await assertKpis(custom);
    assert.match(await page.locator('#recent-quotations').textContent(), new RegExp(fixtures.quotations[0].no));
    await filter('Date range', 'This month');
    await filter('Employee', 'All permitted employees');
  });

  await check('Dashboard: recent rows are bounded, sorted and open existing quotation details', async () => {
    const data = latestDashboard;
    assert.ok(data.recent.length <= 6);
    for (let n = 1; n < data.recent.length; n++)
      assert.ok(data.recent[n - 1].date >= data.recent[n].date);
    const displayed = await page.locator('#recent-quotations tbody tr').allTextContents();
    assert.equal(displayed.length, data.recent.length);
    data.recent.forEach((q, n) => assert.ok(displayed[n].includes(q.no)));
    const quote = data.recent[0];
    await page.locator('#recent-quotations').getByRole('button', { name: quote.no, exact: true }).click();
    await page.locator('#modal').getByText(quote.no, { exact: true }).first().waitFor();
    assert.match(await page.locator('#modal').textContent(), new RegExp(quote.no));
    await close();
    await page.locator('#recent-quotations').getByRole('link', { name: 'View all', exact: true }).click();
    await page.getByRole('heading', { name: 'All Quotations', exact: true }).waitFor();
    await navigateDashboard();
  });

  await check('Dashboard: attention uses actual review/expiry records and Review never changes status', async () => {
    const data = await filter('Employee', fixtures.users[0].user.name);
    const pending = fixtures.quotations[1], expiry = fixtures.quotations[2];
    const review = data.attention.find(row => row.id === pending.id);
    const expiring = data.attention.find(row => row.id === expiry.id);
    assert.equal(review.reason, 'review');
    assert.equal(review.canReview, true);
    assert.equal(expiring.reason, 'expiry');
    assert.equal(expiring.valid, expiry.valid);
    assert.equal(new Set(data.attention.map(row => row.id)).size, data.attention.length);
    assert.match(await page.locator('#needs-attention').textContent(), new RegExp(pending.no));
    const reviewRow = page.locator('#needs-attention').locator('article,li,.attention-item').filter({ hasText: pending.no }).first();
    await reviewRow.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('heading', { name: new RegExp('Change status.*' + pending.no) }).waitFor();
    assert.equal((await admin.request('/api/quotations/' + pending.id)).data.status, 'Pending Internal Review');
    await close();
    await filter('Employee', 'All permitted employees');
    return { reviewThresholdHours: data.reviewThresholdHours, expiryDate: expiry.valid };
  });

  await check('Dashboard: global search uses bounded server records and opens quotations/customers', async () => {
    const search = page.locator('#global-search');
    await search.fill(fixtures.quotations[1].no);
    const result = page.locator('#global-search-results');
    await result.getByRole('button').filter({ hasText: fixtures.quotations[1].no }).first().click();
    await page.locator('#modal').getByText(fixtures.quotations[1].no, { exact: true }).first().waitFor();
    assert.match(await page.locator('#modal').textContent(), new RegExp(fixtures.quotations[1].no));
    await close();
    await search.fill(fixtures.customers[0].name);
    await result.locator('button[data-id="' + fixtures.customers[0].id + '"]').click();
    await page.getByRole('heading', { name: fixtures.customers[0].name, exact: true }).waitFor();
    await close();
    await search.fill('no-dashboard-record-' + suffix);
    await result.getByText(/No matching|No .*results|No .*matches|No .*found/i).waitFor();
    await search.press('Escape');
    assert.equal(await result.isVisible(), false);
  });

  await check('Dashboard: sidebar collapse persists and every navigation target remains authorized', async () => {
    await page.locator('#sidebar-toggle').click();
    assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-label'), 'Expand sidebar');
    assert.equal(await page.evaluate(() => localStorage.getItem('dp.sidebar.collapsed')), '1');
    await page.reload();
    await dashboardReady();
    assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-label'), 'Expand sidebar');
    await page.locator('#workspace-sidebar nav a[href="#list"]').focus();
    assert.equal(await page.locator('#workspace-sidebar nav a[href="#list"]').evaluate(el => el === document.activeElement), true);
    assert.ok(await page.locator('#workspace-sidebar nav a[href="#list"]').getAttribute('title'));
    await page.locator('#sidebar-toggle').click();
    await page.waitForFunction(() => {
      const side = document.querySelector('#workspace-sidebar').getBoundingClientRect();
      const frame = document.querySelector('.workspace-frame').getBoundingClientRect();
      return Math.abs(side.x) < 1 && Math.abs(side.width - 220) < 1 && frame.x >= side.right - 1;
    });
    await page.locator('#global-search').fill('');
    await page.evaluate(() => { document.activeElement?.blur(); scrollTo({ left: 0, top: 0, behavior: 'instant' }); });
    await page.waitForTimeout(300);
    const geometry = await page.evaluate(() => {
      const side = document.querySelector('#workspace-sidebar'), frame = document.querySelector('.workspace-frame');
      return { side: side.getBoundingClientRect().toJSON(), frame: frame.getBoundingClientRect().toJSON(),
        sidebarPosition: getComputedStyle(side).position, sidebarWidth: getComputedStyle(side).width,
        frameMargin: getComputedStyle(frame).marginLeft, scrollX, scrollY,
        collapsed: document.querySelector('.workspace-shell').classList.contains('sidebar-collapsed') };
    });
    assert.equal(geometry.collapsed, false);
    assert.ok(geometry.frame.x >= geometry.side.right - 1, JSON.stringify(geometry));
    await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true, animations: 'disabled' });
    await page.screenshot({ path: 'test-results/dashboard-desktop-viewport.png', animations: 'disabled' });
    return geometry;
  });

  await check('Dashboard: a search response received during debounce cannot expose stale matches', async () => {
    const previous = await admin.request('/api/search?q=' + encodeURIComponent(fixtures.quotations[1].no));
    let held;
    await page.route('**/api/search?*', async route => {
      if (!held) { held = route; return; }
      await route.continue();
    });
    await page.locator('#global-search').fill(fixtures.quotations[1].no);
    for (let n = 0; !held && n < 200; n++) await page.waitForTimeout(10);
    assert.ok(held, 'The original search was intercepted.');
    await page.evaluate(number => {
      window.dashboardStaleSearchSeen = false;
      window.dashboardSearchObserver = new MutationObserver(() => {
        if (document.querySelector('#global-search-results')?.textContent.includes(number))
          window.dashboardStaleSearchSeen = true;
      });
      window.dashboardSearchObserver.observe(document.querySelector('#global-search-results'), {
        childList: true, subtree: true,
      });
    }, fixtures.quotations[1].no);
    await page.locator('#global-search').fill('no-debounced-result-' + suffix);
    await held.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(previous) }).catch(() => {});
    await page.locator('#global-search-results').getByText(/No matching|No .*results|No .*matches|No .*found/i).waitFor();
    assert.equal(await page.evaluate(() => window.dashboardStaleSearchSeen), false);
    await page.evaluate(() => window.dashboardSearchObserver.disconnect());
    await page.unroute('**/api/search?*');
    await page.locator('#global-search').press('Escape');
  });

  await check('Dashboard: stale filter responses cannot replace the current reporting range', async () => {
    let held;
    await page.route('**/api/dashboard?*', async route => {
      if (!held) { held = route; return; }
      await route.continue();
    });
    const old = await admin.request('/api/dashboard?from=2001-01-01&to=2001-01-31');
    await page.evaluate(() => { refreshDashboard(); });
    await page.waitForFunction(() => document.querySelector('#dashboard-results'));
    for (let n = 0; !held && n < 100; n++) await page.waitForTimeout(10);
    assert.ok(held, 'The first request was intercepted.');
    const today = await filter('Date range', 'Today');
    await held.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(old) }).catch(() => {});
    await page.waitForTimeout(80);
    await assertKpis(today);
    assert.equal(await page.locator('#recent-quotations').getByText(fixtures.quotations[0].no, { exact: true }).count(), 0);
    await page.unroute('**/api/dashboard?*');
  });

  await check('Dashboard: slow/error responses expose recovery without synthetic values', async () => {
    let held;
    await page.route('**/api/dashboard?*', async route => { held = route; });
    await page.evaluate(() => { refreshDashboard(); });
    for (let n = 0; !held && n < 100; n++) await page.waitForTimeout(10);
    assert.ok(held);
    assert.match(await page.locator('#dashboard-results').textContent(), /Loading|loading/);
    await held.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Dashboard fixture temporary failure' }) });
    await page.locator('#dashboard-results').getByText(/Dashboard fixture temporary failure/).waitFor();
    assert.equal(await page.locator('#recent-quotations tbody tr').count(), 0);
    await page.unroute('**/api/dashboard?*');
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dashboard' && r.ok());
    await page.locator('#dashboard-results').getByRole('button', { name: /Retry/ }).click();
    await response;
    await dashboardReady();
    await assertKpis(latestDashboard);
  });

  await check('Dashboard: narrow screens have no page overflow and mobile drawer supports dismiss/reopen', async () => {
    await filter('Date range', 'This month');
    await page.locator('#global-search').fill('');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(size.scroll <= size.width + 1, JSON.stringify(size));
      await page.locator('#notifications-menu summary').click();
      const notifications = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(notifications.scroll <= notifications.width + 1, JSON.stringify(notifications));
      assert.equal(await page.locator('#notifications-menu [class*="count"]').count(), 0);
      await page.keyboard.press('Escape');
      await page.locator('#mobile-menu').click();
      await page.locator('#sidebar-backdrop').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#sidebar-backdrop').isVisible(), false);
      await page.waitForFunction(() => document.querySelector('#workspace-sidebar').getBoundingClientRect().right <= 1);
      await page.locator('#mobile-menu').click();
      await page.locator('#sidebar-backdrop').click({ position: { x: width - 5, y: 300 } });
      assert.equal(await page.locator('#sidebar-backdrop').isVisible(), false);
      await page.waitForFunction(() => document.querySelector('#workspace-sidebar').getBoundingClientRect().right <= 1);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('#workspace-sidebar').getBoundingClientRect().right <= 1);
    await page.evaluate(() => { document.activeElement?.blur(); scrollTo({ left: 0, top: 0, behavior: 'instant' }); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true, animations: 'disabled' });
    await page.screenshot({ path: 'test-results/dashboard-mobile-viewport.png', animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  await check('Dashboard: own-only employees cannot search/open other quotations, customers or review controls', async () => {
    const original = page;
    const alice = fixtures.users[0];
    page = await alice.context.newPage();
    watch(page);
    await page.goto(base);
    await dashboardReady();
    const allOwn = await alice.account.request('/api/dashboard');
    assert.equal(allOwn.kpis.total, 5);
    const own = await alice.account.request('/api/dashboard?from=' + allOwn.today.slice(0, 8) + '01&to=' + allOwn.today);
    assert.equal(own.kpis.total, 4);
    await assertKpis(own);
    assert.ok(own.attention.every(row => row.canReview === false));
    assert.equal(await page.locator('#needs-attention').getByRole('button', { name: 'Review', exact: true }).count(), 0);
    for (const route of ['team', 'set', 'cat', 'price', 'catalog', 'cust'])
      assert.equal(await page.locator('#workspace-sidebar nav a[href="#' + route + '"]').count(), 0, route);
    const hidden = fixtures.quotations[5];
    await alice.account.request('/api/quotations/' + hidden.id, 'GET', undefined, 404);
    const search = await alice.account.request('/api/search?q=' + encodeURIComponent(hidden.no));
    assert.equal(search.quotations.length, 0);
    assert.equal(search.customers.length, 0);
    await page.locator('#global-search').fill(hidden.no);
    await page.locator('#global-search-results').getByText(/No matching|No .*results|No .*matches|No .*found/i).waitFor();
    assert.equal(await page.locator('#global-search-results').getByText(hidden.no, { exact: true }).count(), 0);
    await page.close();
    page = original;
  });

  await check('Dashboard: an authorized empty account has zero KPIs and a useful attention empty state', async () => {
    const original = page;
    page = await fixtures.users[2].context.newPage();
    watch(page);
    await page.goto(base);
    await dashboardReady();
    const empty = await fixtures.users[2].account.request('/api/dashboard');
    assert.deepEqual(empty.kpis, { total: 0, draft: 0, pendingReview: 0, quotedValue: 0 });
    await assertKpis(empty);
    assert.match(await page.locator('#needs-attention').textContent(), /nothing|no .*attention|all caught up/i);
    assert.match(await page.locator('#recent-quotations').textContent(), /No quotations/i);
    await page.close();
    page = original;
  });

  await check('Dashboard: existing create/edit/duplicate/PDF/WhatsApp flows remain connected', async () => {
    await page.getByRole('button', { name: /Create Quotation/ }).first().click();
    await page.getByRole('heading', { name: /^Create Quotation/ }).waitFor();
    await choose('Customer', fixtures.customers[0].name + ' \u2014 ' + fixtures.customers[0].co);
    await page.locator('.editor-section-heading').getByRole('button', { name: 'Add product', exact: true }).click();
    await page.locator('#cq').fill(await page.evaluate(() => prod('p1').name));
    await page.locator('#cl .pc').first().click();
    await page.getByRole('button', { name: 'Add to quotation', exact: true }).click();
    await page.getByRole('button', { name: 'Save Draft', exact: true }).first().click();
    await page.getByRole('heading', { name: /^Edit Quotation/ }).waitFor();
    await idle();
    const id = await page.evaluate(() => Q.id);
    await page.locator('.editor-additional-details summary').click();
    await page.getByLabel('Subject', { exact: true }).fill('Saved dashboard regression subject ' + suffix);
    await page.getByRole('button', { name: 'Save Draft', exact: true }).first().click();
    await idle();
    const saved = await admin.request('/api/quotations/' + id);
    assert.equal(saved.data.subject, 'Saved dashboard regression subject ' + suffix);
    const pdf = await admin.request('/api/quotations/' + id + '/pdf');
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    fs.writeFileSync('test-results/dashboard-quotation.pdf', pdf);
    await page.getByRole('button', { name: 'Duplicate Quotation', exact: true }).click();
    await idle();
    const afterDuplicate = await admin.request('/api/quotations?customer=' + fixtures.customers[0].id + '&pageSize=100');
    const duplicate = afterDuplicate.data.find(q => q.id !== id && q.subject === saved.data.subject);
    assert.ok(duplicate);
    assert.equal(duplicate.status, 'Draft');
    await page.evaluate(id => shareQuotation(id), id);
    await page.getByRole('heading', { name: /Share on WhatsApp/ }).waitFor();
    await page.getByRole('button', { name: 'Prepare PDF and WhatsApp chat', exact: true }).click();
    await page.getByRole('heading', { name: 'Ready for manual sharing', exact: true }).waitFor();
    assert.match(await page.locator('#wa-result').textContent(), /does not send/i);
    assert.equal((await admin.request('/api/quotations/' + id)).data.status, 'Draft');
    await close();
    await navigateDashboard();
    return { pdfBytes: pdf.length, duplicatedAsDraft: true, externalWhatsAppDelivery: 'NOT RUN' };
  });

  await check('Dashboard: no JavaScript exceptions or framework warnings', async () => {
    assert.deepEqual(exceptions, []);
    assert.deepEqual(browserWarnings, []);
    return { exceptions: exceptions.length, frameworkWarnings: browserWarnings.length };
  });

  await check('Dashboard: an expired session returns to sign in and removes authenticated data', async () => {
    await context.clearCookies();
    await page.evaluate(() => refreshDashboard());
    await page.getByRole('heading', { name: 'Sign in to your workspace', exact: true }).waitFor();
    assert.equal(await page.locator('#dashboard-results').count(), 0);
    assert.equal(await page.locator('#global-search-results').count(), 0);
    assert.deepEqual(exceptions, []);
  });
})().catch(async error => {
  console.error(error.stack);
  process.exitCode = 1;
  if (page) await page.screenshot({ path: 'test-results/dashboard-browser-failure.png', fullPage: true }).catch(() => {});
}).finally(async () => {
  fs.writeFileSync('test-results/dashboard-browser.json', JSON.stringify({ results, exceptions, browserWarnings,
    fixtureMode: 'real authenticated APIs in explicitly disposable installation',
    passed: results.filter(row => row.result === 'PASS').length,
    failed: results.filter(row => row.result === 'FAIL').length,
  }, null, 2));
  if (browser) await browser.close();
});
