'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createApp } = require('../server');
const { testDatabase } = require('./database-helper');
const { workspaceToday, workspaceTimezone } = require('../server/dashboard');
const DP = require('../shared/domain');

async function fixture(t) {
  const database = await testDatabase(), app = await createApp(database);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); await database.destroy(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const password = 'Dashboard-' + crypto.randomUUID();
  function client() {
    let cookie = '', csrf = '';
    return {
      async request(route, method = 'GET', body, expected = 200) {
        const response = await fetch(base + route, {
          method, headers: {
            ...(cookie ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        const data = await response.json();
        if (data.csrfToken) csrf = data.csrfToken;
        assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`);
        return data;
      },
    };
  }
  const admin = client();
  const setup = await admin.request('/api/auth/setup', 'POST', {
    name: 'Dashboard Administrator', username: 'dashboardadmin', password, demo: false,
  }, 201);
  const state = (await admin.request('/api/state')).state;
  const customer = (await admin.request('/api/customers', 'POST', { data: {
    name: 'Dashboard Search Customer', co: 'Search Company', mob: '9001234567',
    email: 'private-dashboard@example.test', addr: 'Private customer address',
  } }, 201)).data;
  const employee = async (name, permissions = null) => {
    const { user } = await admin.request('/api/users', 'POST', { name, username: name, password, role: 'Employee', permissions }, 201);
    const account = client();
    await account.request('/api/auth/login', 'POST', { username: name, password });
    return { account, user };
  };
  const quote = async (account = admin, changes = {}) => {
    const record = await account.request('/api/quotations', 'POST', {
      data: { cid: customer.id, date: '2026-10-20', valid: '2026-11-10',
        items: [{ pid: 'p2', cfg: DP.defCfg(state.products.find((p) => p.id === 'p2')) }], ...changes },
    }, 201);
    return { ...record.data, version: record.version };
  };
  const status = async (account, quote, value) => {
    const record = await account.request(`/api/quotations/${quote.id}/status`, 'POST', { version: quote.version, status: value });
    return { ...record.data, version: record.version };
  };
  return { app, admin, adminId: setup.user.id, client, customer, employee, quote, status };
}

function addDays(date, days) {
  const result = new Date(date + 'T00:00:00Z');
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

test('dashboard aggregates use stored paise, share filters with listing, keep real stable recent records and preserve report fields', async (t) => {
  const f = await fixture(t);
  const staff = await f.employee('dashboardstaff');
  const second = (await f.admin.request('/api/customers', 'POST', { data: { name: 'Second customer', co: 'Second business', mob: '9001234568' } }, 201)).data;
  const created = [];
  for (let index = 0; index < 9; index++) {
    let quote = await f.quote(index % 2 ? staff.account : f.admin, {
      date: index === 0 ? '2026-09-30' : '2026-10-20',
      cid: index === 2 ? second.id : f.customer.id,
    });
    if (index === 3 || index === 4) quote = await f.status(index % 2 ? staff.account : f.admin, quote, 'Pending Internal Review');
    created.push(quote);
  }
  const before = await f.app.db.prepare('SELECT revision,settings FROM workspace').all();
  const auditBefore = await f.app.db.prepare('SELECT count(*) AS n FROM audit_events').get();
  const originalGet = f.app.store.get, originalRead = f.app.store.readState;
  f.app.store.get = f.app.store.readState = async () => { throw Error('Dashboard must not read every full quotation/workspace.'); };
  let dashboard;
  try { dashboard = await f.admin.request('/api/dashboard?from=2026-10-01&to=2026-10-31'); }
  finally { f.app.store.get = originalGet; f.app.store.readState = originalRead; }
  const expected = await f.app.db.prepare("SELECT count(*) AS total,coalesce(sum(total),0) AS value,count(*) FILTER (WHERE status='Draft') AS draft,count(*) FILTER (WHERE status='Pending Internal Review') AS pending FROM quotations WHERE date>=? AND date<=?").get('2026-10-01', '2026-10-31');
  assert.deepEqual(dashboard.kpis, { total: expected.total, draft: expected.draft, pendingReview: expected.pending, quotedValue: expected.value });
  assert.equal(dashboard.count, 8);
  assert.equal(dashboard.quotedValue, expected.value);
  assert.equal(dashboard.moneyUnit, 'paise');
  assert.equal(dashboard.currency, 'INR');
  assert.equal(dashboard.recent.length, 6);
  const sorted = created.filter((q) => q.date >= '2026-10-01').sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no) || b.id.localeCompare(a.id));
  assert.deepEqual(dashboard.recent.map((q) => q.id), sorted.slice(0, 6).map((q) => q.id));
  for (const quote of dashboard.recent) {
    assert.equal(quote.total, DP.totals(quote).grand);
    assert.ok(quote.customer && quote.creator);
    assert.equal(quote.createdAt, quote.hist[0].d);
    assert.ok(quote.items.length);
  }
  for (const field of ['byStatus', 'byDate', 'bySalesperson', 'byEmployee', 'byCustomer', 'products', 'expired', 'activity']) assert.ok(Array.isArray(dashboard[field]), field);
  assert.equal(dashboard.products[0].timesQuoted, 8);
  assert.equal(dashboard.whatsapp.automatedDelivery, false);
  assert.deepEqual(await f.app.db.prepare('SELECT revision,settings FROM workspace').all(), before);
  assert.deepEqual(await f.app.db.prepare('SELECT count(*) AS n FROM audit_events').get(), auditBefore);
  for (const filters of [
    'from=2026-09-30&to=2026-09-30',
    `employee=${staff.user.id}`, `customer=${second.id}`, 'status=Pending%20Internal%20Review',
    `employee=${staff.user.id}&customer=${f.customer.id}&status=Draft&from=2026-10-01&to=2026-10-31`,
  ]) {
    const dashboard = await f.admin.request('/api/dashboard?' + filters);
    const listing = await f.admin.request('/api/quotations?pageSize=100&' + filters);
    assert.equal(dashboard.kpis.total, listing.pagination.total, filters);
    assert.equal(dashboard.kpis.quotedValue, listing.data.reduce((sum, quote) => sum + DP.totals(quote).grand, 0), filters);
    assert.ok(dashboard.recent.every((q) => listing.data.some((record) => record.id === q.id)), 'Recent records use the selected filters');
  }
});

test('dashboard quote scope cannot be widened by report grants or employee filters and does not require report access', async (t) => {
  const f = await fixture(t);
  const limited = await f.employee('limiteddashboard', ['quotation.create', 'quotation.view_own', 'quotation.status', 'reports.view_all']);
  const noReports = await f.employee('noreportsdashboard', ['quotation.create', 'quotation.view_own']);
  const hidden = await f.quote(f.admin);
  const own = await f.quote(limited.account);
  await f.quote(noReports.account);
  const dashboard = await limited.account.request('/api/dashboard');
  assert.equal(dashboard.count, 1);
  assert.deepEqual(dashboard.recent.map((q) => q.id), [own.id]);
  assert.ok(!JSON.stringify(dashboard).includes(hidden.no));
  assert.equal((await limited.account.request('/api/dashboard?employee=' + f.adminId)).count, 0);
  assert.equal((await noReports.account.request('/api/dashboard')).count, 1);
  const denied = await f.employee('denieddashboard', ['reports.view_all']);
  await denied.account.request('/api/dashboard', 'GET', undefined, 403);
  await f.client().request('/api/dashboard', 'GET', undefined, 401);
  await limited.account.request(`/api/quotations/${hidden.id}`, 'GET', undefined, 404);
});

test('attention is based on real pending history and expiry dates, deduplicates and enforces independent review permissions', async (t) => {
  const f = await fixture(t);
  const staff = await f.employee('attentionstaff');
  const reviewer = await f.employee('attentionreviewer', ['quotation.view_all', 'quotation.approve', 'quotation.status']);
  const { today } = await f.admin.request('/api/dashboard');
  let ownPending = await f.quote(f.admin, { date: addDays(today, -2), valid: addDays(today, 1) });
  ownPending = await f.status(f.admin, ownPending, 'Pending Internal Review');
  let staffPending = await f.quote(staff.account, { date: addDays(today, -1), valid: addDays(today, 15) });
  staffPending = await f.status(staff.account, staffPending, 'Pending Internal Review');
  let expiring = await f.quote(staff.account, { date: today, valid: addDays(today, 7) });
  expiring = await f.status(staff.account, expiring, 'Pending Internal Review');
  expiring = await f.status(reviewer.account, expiring, 'Approved Internally');
  expiring = await f.status(staff.account, expiring, 'Sent to Customer');
  const excludedDraft = await f.quote(f.admin, { date: today, valid: today });
  let future = await f.quote(staff.account, { date: today, valid: addDays(today, 8) });
  future = await f.status(staff.account, future, 'Pending Internal Review');
  future = await f.status(reviewer.account, future, 'Approved Internally');
  let terminal = await f.quote(staff.account, { date: today, valid: today });
  terminal = await f.status(staff.account, terminal, 'Cancelled');
  let overdue = await f.quote(staff.account, { date: addDays(today, -10), valid: addDays(today, -1) });
  overdue = await f.status(staff.account, overdue, 'Pending Internal Review');
  overdue = await f.status(reviewer.account, overdue, 'Approved Internally');
  const adminDashboard = await f.admin.request('/api/dashboard');
  assert.equal(adminDashboard.expiryWindowDays, 7);
  assert.equal(adminDashboard.reviewThresholdHours, null);
  assert.equal(adminDashboard.attentionTotal, 3);
  assert.deepEqual(new Set(adminDashboard.attention.map((q) => q.id)), new Set([ownPending.id, staffPending.id, expiring.id]));
  const adminOwn = adminDashboard.attention.find((q) => q.id === ownPending.id);
  assert.equal(adminOwn.reason, 'review');
  assert.equal(adminOwn.canReview, false);
  assert.equal(adminOwn.pendingSince, ownPending.hist.at(-1).d);
  assert.equal(adminDashboard.attention.find((q) => q.id === staffPending.id).canReview, true);
  const expiry = adminDashboard.attention.find((q) => q.id === expiring.id);
  assert.equal(expiry.reason, 'expiry');
  assert.equal(expiry.valid, addDays(today, 7));
  assert.equal(expiry.canReview, false);
  for (const excluded of [excludedDraft, future, terminal, overdue]) assert.ok(!adminDashboard.attention.some((q) => q.id === excluded.id));
  const staffDashboard = await staff.account.request('/api/dashboard');
  assert.ok(staffDashboard.attention.every((q) => !q.canReview));
  assert.ok(!staffDashboard.attention.some((q) => q.id === ownPending.id));
  assert.equal((await reviewer.account.request('/api/dashboard')).attention.find((q) => q.id === staffPending.id).canReview, true);
  assert.equal((await f.admin.request('/api/dashboard?status=Draft')).attention.length, 0);
  assert.equal((await f.admin.request('/api/dashboard?from=1900-01-01&to=1900-01-01')).attentionTotal, 0);
  await staff.account.request(`/api/quotations/${staffPending.id}/status`, 'POST', { version: staffPending.version, status: 'Approved Internally' }, 403);
  await f.admin.request(`/api/quotations/${ownPending.id}/status`, 'POST', { version: ownPending.version, status: 'Approved Internally' }, 403);
});

test('global search is bounded, escaped, scoped and returns only minimal permitted customer fields', async (t) => {
  const f = await fixture(t);
  const staff = await f.employee('searchstaff', ['quotation.create', 'quotation.view_own', 'reports.view_all']);
  const hidden = await f.quote(f.admin), own = await f.quote(staff.account);
  for (let index = 0; index < 11; index++) await f.admin.request('/api/customers', 'POST', { data: { name: 'Dashboard Search result ' + index, co: 'Search Group', mob: String(9001234600 + index), notes: 'Private note' } }, 201);
  const result = await f.admin.request('/api/search?q=Search&pageSize=3');
  assert.equal(result.customers.length, 3);
  assert.equal(result.quotations.length, 2);
  assert.equal(result.pagination.total, 14);
  assert.equal(result.pagination.totalPages, 4);
  assert.deepEqual(Object.keys(result.customers[0]).sort(), ['co', 'id', 'name']);
  assert.deepEqual(Object.keys(result.quotations[0]).sort(), ['customer', 'date', 'id', 'no', 'status']);
  const page2 = await f.admin.request('/api/search?q=Search&pageSize=3&page=2');
  assert.ok(page2.customers.every((c) => !result.customers.some((first) => first.id === c.id)));
  const staffResults = await staff.account.request('/api/search?q=Search');
  assert.deepEqual(staffResults.quotations.map((q) => q.id), [own.id]);
  assert.deepEqual(staffResults.customers, []);
  assert.ok(!JSON.stringify(staffResults).includes(hidden.no));
  assert.equal((await staff.account.request('/api/search?q=' + encodeURIComponent(hidden.no))).quotations.length, 0);
  assert.equal((await f.admin.request('/api/search?q=%25')).pagination.total, 0);
  assert.equal((await f.admin.request('/api/search?q=%27%20OR%201%3D1--')).pagination.total, 0);
  assert.equal((await f.admin.request('/api/search?q=%20%20')).pagination.total, 0);
  const customerOnly = await f.employee('customeronlydashboard', ['customer.view']);
  const customerResults = await customerOnly.account.request('/api/search?q=Search');
  assert.equal(customerResults.quotations.length, 0);
  assert.equal(customerResults.customers.length, 5);
  const denied = await f.employee('nosearchdashboard', ['reports.view_all']);
  await denied.account.request('/api/search?q=Search', 'GET', undefined, 403);
  await f.client().request('/api/search?q=Search', 'GET', undefined, 401);
});

test('dashboard and search reject invalid filters, return real empty states and honor workspace timezone boundaries', async (t) => {
  const f = await fixture(t);
  const empty = await f.admin.request('/api/dashboard');
  assert.deepEqual(empty.kpis, { total: 0, draft: 0, pendingReview: 0, quotedValue: 0 });
  assert.deepEqual(empty.recent, []);
  assert.deepEqual(empty.attention, []);
  assert.equal(empty.attentionTotal, 0);
  assert.match(empty.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(workspaceToday('Asia/Kolkata', new Date('2026-10-27T20:00:00Z')), '2026-10-28');
  assert.equal(workspaceToday('UTC', new Date('2026-10-27T20:00:00Z')), '2026-10-27');
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = 'Invalid/Workspace-Timezone';
    assert.equal(workspaceTimezone(), 'Asia/Kolkata');
    process.env.TZ = 'UTC';
    assert.equal(workspaceTimezone(), 'UTC');
  } finally { if (previousTimezone === undefined) delete process.env.TZ; else process.env.TZ = previousTimezone; }
  for (const query of ['from=2026-02-30', 'from=2026-10-29&to=2026-10-01', 'status=Not-a-status', 'customer=bad%20id', 'employee=bad%27id', 'min=-1', 'max=oops']) await f.admin.request('/api/dashboard?' + query, 'GET', undefined, 422);
  for (const query of ['q=' + 'a'.repeat(201), 'pageSize=11', 'pageSize=0', 'page=0', 'pageSize=oops']) await f.admin.request('/api/search?' + query, 'GET', undefined, 422);
});
