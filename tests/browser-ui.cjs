'use strict';
// Run only against the disposable test app, never the normal local workspace.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:6402';
const target = new URL(base);
if (process.env.TEST_DISPOSABLE !== '1' || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || target.port === '6400')
  throw new Error('Set TEST_DISPOSABLE=1 and TEST_BASE_URL to a separate local test app (for example port 6402).');
fs.mkdirSync('test-results', { recursive: true });
const results = [], exceptions = [];
let browser, page, context;
const idle = () => page.waitForFunction(() => !busy);
async function check(name, run) {
  try { const detail = await run(); results.push({ name, result: 'PASS', detail }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, result: 'FAIL', error: error.message }); throw error; }
}
async function choose(name, label) {
  await page.getByRole('combobox', { name, exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search ' + name + ' options', exact: true });
  await search.fill(label);
  await page.getByRole('option', { name: label, exact: true }).click();
}
async function goView(view) {
  const mobile = await page.evaluate(() => matchMedia('(max-width: 800px)').matches);
  if (mobile && !await page.locator('body').evaluate(node => node.classList.contains('navigation-open')))
    await page.locator('#mobile-menu').click();
  await page.locator(`#workspace-sidebar nav a[href="#${view}"]`).click();
  await page.waitForFunction(view => document.querySelector('nav a.on')?.getAttribute('href') === '#' + view, view);
  if (mobile && await page.locator('body').evaluate(node => node.classList.contains('navigation-open')))
    await page.locator('#workspace-sidebar .mobile-close').click();
  await page.waitForFunction(() => [...document.querySelectorAll('select')].filter(select => !select.multiple && select.size <= 1 && !select.hasAttribute('data-native-select')).every(select => select.classList.contains('dp-select-native')));
}
async function openDashboardFilters() {
  const filters = page.locator('#dashboard-filters');
  if (!await filters.evaluate(node => node.open)) await filters.locator('summary').click();
  await page.getByRole('combobox', { name: 'Customer', exact: true }).waitFor();
}
async function auditDropdowns(scope) {
  await scope.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
  const selects = scope.locator('select:not([multiple])'), checked = [];
  for (let index = 0; index < await selects.count(); index++) {
    const select = selects.nth(index);
    if (await select.evaluate(node => node.size > 1 || node.hasAttribute('data-native-select'))) continue;
    const button = select.locator('xpath=..').locator(':scope > .dp-select-trigger');
    await button.waitFor({ state: 'attached' });
    if (!await button.isVisible() || await button.isDisabled()) continue;
    const before = await select.evaluate(node => ({ index: node.selectedIndex, label: node.options[node.selectedIndex]?.label }));
    const label = await button.getAttribute('aria-label'); assert.ok(label?.trim(), 'Dropdown has a meaningful accessible label');
    await select.evaluate(node => { node.dataset.auditChanges = '0'; node.addEventListener('change', () => { node.dataset.auditChanges = String(Number(node.dataset.auditChanges) + 1); }, { once: true }); });
    await button.click();
    assert.equal(await button.getAttribute('aria-expanded'), 'true');
    const selected = page.locator('.dp-select-menu [role="option"][aria-selected="true"]');
    if (await selected.count() && await selected.getAttribute('aria-disabled') !== 'true') await selected.click(); else await page.keyboard.press('Escape');
    assert.equal(await select.evaluate(node => node.selectedIndex), before.index, label);
    assert.equal(await select.getAttribute('data-audit-changes'), '0', label);
    assert.equal(await page.locator('.dp-select-menu').count(), 0, label);
    checked.push({ label, selected: before.label, options: await select.locator('option').count() });
  }
  return checked;
}
async function restore() { await page.evaluate(async () => { adopt(await api('/api/state')); Q = null; F = { q: '', st: '', cu: '', sp: '', a: '', b: '', mn: '', mx: '' }; D = { r: 'all', a: '', b: '' }; location.hash = '#dash'; render(); }); await idle(); }
(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page = await context.newPage(); page.on('pageerror', error => exceptions.push(error.message));
  await check('Connect to disposable workspace', async () => {
    await page.goto(base); await page.locator('#auth_username').waitFor();
    const initialized = await page.getByRole('heading', { name: 'Sign in to your workspace', exact: true }).isVisible();
    const username = process.env.TEST_USERNAME || 'uitestadmin', password = process.env.TEST_PASSWORD || crypto.randomUUID() + '-Test';
    if (initialized && !process.env.TEST_PASSWORD) throw new Error('Use a fresh test database, or set TEST_USERNAME and TEST_PASSWORD for the disposable fixture.');
    if (!initialized) { await page.getByLabel('Your name', { exact: true }).fill('UI Regression Admin'); await page.locator('#auth_demo').check(); }
    await page.getByLabel('Username', { exact: true }).fill(username); await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: initialized ? 'Sign in' : 'Create workspace' }).click();
    await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor(); await idle();
  });
  await check('All dashboard selects use the shared accessible control', async () => {
    await page.getByRole('combobox', { name: 'Date range', exact: true }).waitFor();
    const counts = await page.evaluate(() => ({ native: [...document.querySelectorAll('select')].filter(s => !s.multiple && s.size <= 1).length, enhanced: document.querySelectorAll('.dp-select-trigger').length }));
    assert.equal(counts.native, counts.enhanced); return counts;
  });
  await check('Keyboard selection reveals custom date controls without replacing filters', async () => {
    const trigger = page.getByRole('combobox', { name: 'Date range', exact: true });
    await trigger.focus(); await trigger.press('ArrowDown'); await page.keyboard.press('End'); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => D.r), 'custom'); assert.equal(await page.locator('#dashboard-dates').isVisible(), true);
    await choose('Date range', 'All time');
  });
  await check('A 10000-option list renders a bounded window and supports search', async () => {
    await page.evaluate(() => { const s = document.createElement('select'); s.id = 'large-regression'; s.setAttribute('aria-label', 'Large regression list'); const f = document.createDocumentFragment(); for (let i = 0; i < 10000; i++) { const o = document.createElement('option'); o.value = String(i); o.textContent = 'Customer ' + String(i).padStart(5, '0'); o.disabled = i === 0; f.append(o); } s.append(f); s.selectedIndex = 9000; s.addEventListener('change', () => { s.dataset.changes = String(Number(s.dataset.changes || 0) + 1); }); document.querySelector('main').append(s); });
    await page.getByRole('combobox', { name: 'Large regression list', exact: true }).click();
    assert.ok(await page.getByRole('option').count() <= 20);
    await page.getByRole('searchbox', { name: 'Search Large regression list options', exact: true }).fill('Customer 09999');
    await page.getByRole('option', { name: 'Customer 09999', exact: true }).click();
    assert.deepEqual(await page.locator('#large-regression').evaluate(s => ({ value: s.value, changes: s.dataset.changes })), { value: '9999', changes: '1' });
    return { totalOptions: 10000, maximumRenderedRows: 20 };
  });
  await check('Keyboard skips disabled options and selects the last option', async () => {
    await page.getByRole('combobox', { name: 'Large regression list', exact: true }).focus();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#large-regression').inputValue(), '1');
    await page.getByRole('combobox', { name: 'Large regression list', exact: true }).press('ArrowDown'); await page.keyboard.press('End'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#large-regression').inputValue(), '9999');
  });
  await check('Search with no matches and Escape restore trigger focus', async () => {
    await page.getByRole('combobox', { name: 'Large regression list', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search Large regression list options', exact: true }).fill('no-such-regression-option');
    await page.getByText('No matching options', { exact: true }).waitFor(); assert.equal(await page.getByRole('option').count(), 0);
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('combobox', { name: 'Large regression list', exact: true }).getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Large regression list');
  });
  await check('Disabled state and native programmatic changes remain synchronized', async () => {
    await page.locator('#large-regression').evaluate(s => { s.disabled = true; });
    await page.waitForFunction(() => document.querySelector('#large-regression').parentElement.querySelector('button').disabled);
    await page.locator('#large-regression').evaluate(s => { s.disabled = false; s.value = '123'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.getByRole('combobox', { name: 'Large regression list', exact: true }).getByText('Customer 00123', { exact: true }).waitFor();
    await page.locator('#large-regression').evaluate(s => s.parentElement.remove());
  });
  await check('Option labels render as text and outside clicks dismiss the menu', async () => {
    await page.evaluate(() => { const s = document.createElement('select'); s.id = 'label-regression'; s.setAttribute('aria-label', 'Safe label list'); const o = document.createElement('option'); o.textContent = '<img src=x onerror=alert(1)>'; s.append(o); document.querySelector('main').append(s); });
    await page.getByRole('combobox', { name: 'Safe label list', exact: true }).click();
    await page.getByRole('option', { name: '<img src=x onerror=alert(1)>', exact: true }).waitFor(); assert.equal(await page.locator('.dp-select-menu img').count(), 0);
    await page.getByRole('heading', { name: 'Dashboard', exact: true }).click(); assert.equal(await page.locator('.dp-select-menu').count(), 0);
    await page.locator('#label-regression').evaluate(s => s.parentElement.remove());
  });
  await check('Large quotation lists paginate and preserve search controls', async () => {
    await page.evaluate(() => { const sample = DP.seed(), q = sample.quotes[0], c = sample.customers[0]; S.customers = Array.from({ length: 1500 }, (_, i) => ({ ...structuredClone(c), id: 'PerfCustomer' + i, name: 'Performance Customer ' + i })); S.quotes = Array.from({ length: 1500 }, (_, i) => ({ ...structuredClone(q), id: 'PerfQuote' + i, cid: 'PerfCustomer' + i, no: 'PERF/2026/' + i, status: i % 2 ? 'Draft' : 'Sent to Customer', createdBy: AUTH.id })); location.hash = '#list'; render(); });
    await page.getByRole('heading', { name: 'All Quotations', exact: true }).waitFor(); assert.equal(await page.locator('#tb tr').count(), 100);
    await page.getByRole('button', { name: 'Next quotations', exact: true }).click(); await page.locator('#tb').getByText('PERF/2026/100', { exact: true }).waitFor();
    await page.getByPlaceholder('Search number, customer, mobile, product').fill('PERF/2026/1499');
    await page.locator('#tb').getByText('PERF/2026/1499', { exact: true }).waitFor(); assert.equal(await page.locator('#tb tr').count(), 1);
    return { quotations: 1500, rowsPerPage: 100 };
  });
  await check('Dashboard filtering preserves its active dropdown and matches totals', async () => {
    // The preceding list fixture is deliberately browser-only. Dashboard totals
    // now come from the API, so restore the real disposable records first.
    await restore();
    await goView('dash');
    await openDashboardFilters();
    const customer = await page.evaluate(() => ({ id: S.customers[0].id, name: S.customers[0].name }));
    await page.getByRole('combobox', { name: 'Customer', exact: true }).evaluate(button => { button.dataset.regressionIdentity = 'retained'; });
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dashboard' && new URL(r.url()).searchParams.get('customer') === customer.id && r.ok());
    await choose('Customer', customer.name);
    const expected = await (await response).json();
    await page.waitForFunction(() => document.querySelector('#dashboard-results')?.getAttribute('aria-busy') === 'false');
    assert.equal(await page.getByRole('combobox', { name: 'Customer', exact: true }).getAttribute('data-regression-identity'), 'retained');
    assert.equal(expected.kpis.total, await page.evaluate(id => S.quotes.filter(q => q.cid === id).length, customer.id));
    assert.equal(await page.locator('#dashboard-results .cards .card b').first().innerText(), String(expected.kpis.total));
    await restore();
  });
  await check('Reports dropdown updates results without replacing its controls', async () => {
    await page.locator('#workspace-sidebar nav a[href="#rep"]').click(); await page.getByRole('combobox', { name: 'Status', exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Status', exact: true }).evaluate(b => { b.dataset.regressionIdentity = 'retained'; });
    const response = page.waitForResponse(r => r.url().includes('/api/reports/summary?') && r.url().includes('status=Draft'));
    await choose('Status', 'Draft'); assert.equal((await response).status(), 200);
    assert.equal(await page.getByRole('combobox', { name: 'Status', exact: true }).getAttribute('data-regression-identity'), 'retained');
  });
  await check('Configurator dropdowns work inside dialogs and Escape dismisses only the menu', async () => {
    await page.evaluate(() => { Q = newQ(); openCfg('p5'); });
    await page.getByRole('combobox', { name: 'Dimension unit', exact: true }).waitFor();
    await choose('Dimension unit', 'cm'); assert.equal(await page.evaluate(() => CF.u), 'cm');
    await page.getByRole('combobox', { name: 'Dimension unit', exact: true }).click(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modal').isVisible(), true); await page.keyboard.press('Escape'); assert.equal(await page.locator('#modal').isVisible(), false);
  });
  await check('Every application view upgrades its single-select controls', async () => {
    const views = ['dash', 'new', 'list', 'cust', 'prod', 'cat', 'price', 'rep', 'team', 'set', 'wa'];
    for (const view of views) {
      await goView(view);
      await page.waitForFunction(() => [...document.querySelectorAll('select')].filter(s => !s.multiple && s.size <= 1).every(s => s.classList.contains('dp-select-native')));
      assert.equal(await page.locator('select:not(.dp-select-native)').count(), 0, view);
    }
    await restore();
  });
  await check('Every screen dropdown opens, displays its selection and closes consistently', async () => {
    const screens = {};
    for (const view of ['dash', 'new', 'list', 'cust', 'prod', 'cat', 'price', 'rep', 'team', 'set', 'wa']) {
      await goView(view);
      screens[view] = await auditDropdowns(page.locator('main'));
    }
    assert.ok(Object.values(screens).flat().length > 20); await restore(); return screens;
  });
  await check('Dynamic customer, product, rule, category, status and team dialog dropdowns work', async () => {
    const dialogs = {};
    const fixtures = [
      ['customer', "custForm('C1')"],
      ['product', "prodForm('p5')"],
      ['pricing rules', "prodForm('p5');addRule('charges');addRule('compatibility')"],
      ['product catalog', 'Q=newQ();openCat()'],
      ['quotation status', "statusQ('Q3')"],
      ['new team member', 'userForm()'],
    ];
    for (const [name, command] of fixtures) {
      await page.evaluate(code => { (0, eval)(code); }, command);
      dialogs[name] = await auditDropdowns(page.locator('#modal'));
      if (name === 'pricing rules') {
        const allowed = page.getByRole('listbox', { name: 'Allowed choices (select one or more)', exact: true });
        const values = await allowed.locator('option').evaluateAll(nodes => nodes.slice(0, 2).map(node => node.value));
        await allowed.selectOption(values);
        assert.deepEqual(await page.evaluate(() => PRODUCT_DRAFT.compatibility.at(-1).allowed), values);
      }
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
    await page.evaluate(async () => { await loadTeam(); await editUser(AUTH.id); });
    dialogs['edit team member'] = await auditDropdowns(page.locator('#modal'));
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    assert.ok(Object.values(dialogs).flat().length > 10); await restore(); return dialogs;
  });
  await check('Every product configurator applies dropdown selections to its specification model', async () => {
    const products = await page.evaluate(() => S.products.filter(product => product.on).map(product => ({ id: product.id, name: product.name })));
    let selections = 0;
    for (const product of products) {
      await page.evaluate(id => { Q = newQ(); openCfg(id); }, product.id);
      await page.locator('#modal .dp-select-trigger').first().waitFor();
      const keys = await page.locator('#modal select').evaluateAll(nodes => nodes.map(node => node.getAttribute('onchange')?.match(/cs_\('([^']+)'/)?.[1]).filter(Boolean));
      for (const key of keys) {
        const position = await page.locator('#modal select').evaluateAll((nodes, key) => nodes.findIndex(node => node.getAttribute('onchange')?.startsWith("cs_('" + key + "',")), key);
        if (position < 0) continue;
        const select = page.locator('#modal select').nth(position);
        const next = await select.evaluate(node => { const option = Array.from(node.options).find(option => !option.disabled && option.value !== node.value); return option && { value: option.value, label: option.label }; });
        if (!next) continue;
        await select.locator('xpath=..').locator(':scope > .dp-select-trigger').click();
        await page.getByRole('option', { name: next.label, exact: true }).click();
        assert.equal(String(await page.evaluate(key => CF[key], key)), next.value, product.name + ': ' + key); selections++;
      }
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
    assert.ok(selections > 20); await restore(); return { products: products.length, selections };
  });
  await check('WhatsApp review saves the recipient and creates a protected PDF', async () => {
    await page.evaluate(() => shareQuotation('Q3')); await page.locator('#wa_number').waitFor(); await idle();
    await page.locator('#wa_number').fill('+91 98765 43210'); await page.locator('#wa_message').fill('Please review quotation DP/QTN/2026/0003. Thank you!'); await page.locator('#wa_save_number').check();
    await page.getByRole('button', { name: 'Prepare PDF and WhatsApp chat', exact: true }).click();
    await page.getByRole('link', { name: 'Open WhatsApp with reviewed message', exact: true }).waitFor(); await idle();
    const result = await page.evaluate(async () => ({ prepared: WA_PREPARED, customer: (await api('/api/customers/C3')).data }));
    assert.equal(result.customer.wa, '+919876543210'); assert.equal(result.prepared.data.status, 'Prepared');
    const url = new URL(result.prepared.clickToChatUrl); assert.equal(url.pathname, '/919876543210'); assert.equal(url.searchParams.get('text'), 'Please review quotation DP/QTN/2026/0003. Thank you!');
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download quotation PDF', exact: true }).click(); const d = await download; await d.saveAs('test-results/whatsapp-regression.pdf');
    const data = fs.readFileSync('test-results/whatsapp-regression.pdf'); assert.equal(data.subarray(0, 5).toString(), '%PDF-'); assert.equal(crypto.createHash('sha256').update(data).digest('hex'), result.prepared.data.pdfSha256);
  });
  await check('WhatsApp link opens the reviewed handoff without sending or changing status', async () => {
    await context.route('https://wa.me/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Test handoff</h1>' }));
    const opened = context.waitForEvent('page'); await page.getByRole('link', { name: 'Open WhatsApp with reviewed message', exact: true }).click(); const popup = await opened; await popup.waitForLoadState(); assert.ok(popup.url().startsWith('https://wa.me/919876543210?text=')); await popup.close();
    const status = await page.evaluate(async () => ({ log: (await api('/api/whatsapp/history/' + WA_PREPARED.data.id)).data.status, quote: (await api('/api/quotations/Q3')).data.status }));
    assert.deepEqual(status, { log: 'Prepared', quote: 'Draft' }); await page.getByRole('button', { name: 'Close', exact: true }).click();
  });
  await check('Mobile dropdown stays within viewport and every screen avoids horizontal overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const view of ['dash', 'new', 'list', 'cust', 'prod', 'cat', 'price', 'rep', 'team', 'set', 'wa']) {
      await goView(view);
      const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth })); assert.ok(size.scroll <= size.width + 1, JSON.stringify({ view, ...size }));
    }
    await goView('dash'); await openDashboardFilters(); await page.getByRole('combobox', { name: 'Customer', exact: true }).click();
    const rect = await page.locator('.dp-select-menu').boundingBox(); assert.ok(rect.x >= 0 && rect.x + rect.width <= 391 && rect.y >= 0 && rect.y + rect.height <= 845);
    await page.screenshot({ path: 'test-results/dropdown-mobile.png', fullPage: true }); await page.keyboard.press('Escape');
  });
  await check('Desktop dropdown screenshot and no JavaScript exceptions', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(() => document.querySelector('.workspace-frame').getBoundingClientRect().left >= document.querySelector('#workspace-sidebar').getBoundingClientRect().right - 1);
    await page.getByRole('combobox', { name: 'Customer', exact: true }).click();
    await page.screenshot({ path: 'test-results/dropdown-desktop.png', fullPage: true }); await page.keyboard.press('Escape'); assert.deepEqual(exceptions, []);
  });
})().catch(async error => { console.error(error.message); process.exitCode = 1; if (page) { console.error((await page.locator('#connection').innerText().catch(() => '')).slice(0, 500)); await page.screenshot({ path: 'test-results/ui-regression-failure.png', fullPage: true }).catch(() => {}); } }).finally(async () => { fs.writeFileSync('test-results/ui-regressions.json', JSON.stringify({ results, exceptions }, null, 2)); if (browser) await browser.close(); });
