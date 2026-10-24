'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../server');
const { connectDatabase } = require('../server/database');
const { testDatabase } = require('./database-helper');
const DP = require('../shared/domain');
const { EMPLOYEE_PERMISSIONS } = require('../server/access');
async function fixture(t) {
  const database = await testDatabase(), app = await createApp(database);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); await database.destroy(); });
  const password = 'Security-' + crypto.randomUUID(), base = `http://127.0.0.1:${app.server.address().port}`;
  const client = () => {
    let cookie = '', csrf = '';
    return { async request(route, method = 'GET', body, expected = 200) {
      const r = await fetch(base + route, { method, headers: {
        ...(cookie ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
      const data = r.headers.get('content-type')?.includes('application/json') ? await r.json() : Buffer.from(await r.arrayBuffer());
      if (data.csrfToken) csrf = data.csrfToken;
      assert.equal(r.status, expected, `${method} ${route}: ${Buffer.isBuffer(data) ? 'binary' : JSON.stringify(data)}`);
      return data;
    } };
  };
  const admin = client();
  await admin.request('/api/auth/setup', 'POST', { name: 'Administrator', username: 'admin', password, demo: true }, 201);
  const employee = async (username, permissions) => {
    const { user } = await admin.request('/api/users', 'POST', { name: username, username, password, role: 'Employee', ...(permissions === undefined ? {} : { permissions }) }, 201);
    const account = client(); await account.request('/api/auth/login', 'POST', { username, password });
    return { account, user };
  };
  const input = (state, extra = {}) => ({ cid: state.customers[0].id, items: [{ pid: 'p1', cfg: DP.defCfg(state.products.find((p) => p.id === 'p1')) }], ...extra });
  return { app, admin, employee, client, input, password };
}
test('immutable quote ownership scopes state, search, reports, history, PDF, preview and all write paths', async (t) => {
  const f = await fixture(t), alice = await f.employee('alice'), bob = await f.employee('bobby'),
    state = (await alice.account.request('/api/state')).state;
  assert.equal(state.quotes.length, 0);
  const own = await alice.account.request('/api/quotations', 'POST', f.input(state, { by: 'bobby', createdBy: bob.user.id, sales: 'bobby' }), 201), id = own.data.id;
  assert.equal(own.data.createdBy, alice.user.id);
  assert.equal(own.data.by, 'alice');
  assert.equal((await bob.account.request('/api/quotations')).pagination.total, 0);
  assert.equal((await bob.account.request('/api/dashboard')).count, 0);
  assert.equal((await bob.account.request('/api/reports/summary?salesperson=bobby')).count, 0);
  assert.equal((await bob.account.request('/api/customers/' + state.customers[0].id + '/quotations')).pagination.total, 0);
  assert.doesNotMatch((await bob.account.request('/api/reports/quotations.csv')).toString(), new RegExp(own.data.no));
  for (const suffix of ['', '/history', '/pdf']) await bob.account.request('/api/quotations/' + id + suffix, 'GET', undefined, 404);
  for (const action of ['duplicate', 'reprice', 'status']) await bob.account.request('/api/quotations/' + id + '/' + action, 'POST', { version: own.version, status: 'Cancelled' }, 404);
  await bob.account.request('/api/quotations/' + id, 'PATCH', { version: own.version, data: { subject: 'steal' } }, 404);
  await bob.account.request('/api/quotations/preview', 'POST', { ...own.data, subject: 'steal' }, 404);
  let current = await bob.account.request('/api/state');
  await bob.account.request('/api/changes', 'POST', { revision: current.revision, changes: [{ collection: 'quotes', action: 'delete', id }] }, 404);
  await bob.account.request('/api/state', 'PUT', { ...current, state: { ...current.state, quotes: [{ ...own.data, createdBy: bob.user.id, subject: 'steal' }] } }, 404);
  // Saving a scoped state must preserve the invisible quotations.
  current = await bob.account.request('/api/state');
  current.state.customers[0].notes = 'Permitted customer edit';
  await bob.account.request('/api/state', 'PUT', current);
  assert.equal((await alice.account.request('/api/quotations/' + id)).data.createdBy, alice.user.id);
  assert.ok((await f.admin.request('/api/quotations')).pagination.total > 1);
});
test('configurable permissions are enforced and changes revoke sessions; managers cannot elevate administrator access', async (t) => {
  const f = await fixture(t), employee = await f.employee('restricted', ['customer.view', 'product.view']);
  assert.deepEqual((await employee.account.request('/api/auth/me')).user.permissions, ['customer.view', 'product.view']);
  await employee.account.request('/api/quotations', 'POST', { cid: 'C1' }, 403);
  await employee.account.request('/api/customers', 'POST', { name: 'Blocked', mob: '9876500123' }, 403);
  await employee.account.request('/api/pricing/calculate', 'POST', { productId: 'p1', cfg: {} }, 403);
  await employee.account.request('/api/reports/summary', 'GET', undefined, 403);
  await f.admin.request('/api/users/' + employee.user.id, 'PATCH', { version: employee.user.version, permissions: null });
  await employee.account.request('/api/state', 'GET', undefined, 401);
  await employee.account.request('/api/auth/login', 'POST', { username: 'restricted', password: f.password });
  assert.deepEqual((await employee.account.request('/api/auth/me')).user.permissions, [...EMPLOYEE_PERMISSIONS]);
  const manager = await f.employee('manager', [...EMPLOYEE_PERMISSIONS, 'users.manage']);
  await manager.account.request('/api/users', 'POST', { name: 'Escalation', username: 'elevated', password: f.password, role: 'Administrator' }, 403);
  await manager.account.request('/api/users/' + employee.user.id, 'PATCH', { version: 2, permissions: ['settings.manage'] }, 403);
  const admin = (await f.admin.request('/api/auth/me')).user;
  await manager.account.request('/api/users/' + admin.id, 'PATCH', { version: admin.version, active: false }, 403);
  const privileged = await f.employee('privileged', [...EMPLOYEE_PERMISSIONS, 'settings.manage']);
  await manager.account.request('/api/users/' + privileged.user.id + '/reset-password', 'POST', { version: privileged.user.version, password: 'Cannot-take-over-2026' }, 403);
  await manager.account.request('/api/users/' + privileged.user.id, 'PATCH', { version: privileged.user.version, permissions: ['users.manage'] }, 403);
  await f.admin.request('/api/users/' + employee.user.id, 'PATCH', { version: 2, permissions: ['not.a.permission'] }, 422);
});
test('catalog and pricing managers can read their catalogs and update only their permitted product fields', async (t) => {
  const f = await fixture(t), catalog = await f.employee('catalog_manager', ['product.manage']),
    pricing = await f.employee('pricing_manager', ['pricing.manage']);
  assert.ok((await pricing.account.request('/api/state')).state.products.length);
  assert.ok((await catalog.account.request('/api/catalog')).products.length);
  let product = await pricing.account.request('/api/products/p1');
  product = await pricing.account.request('/api/products/p1', 'PATCH', { version: product.version, data: { tiers: product.data.tiers.map(([q, p]) => [q, p + 1]) } });
  await pricing.account.request('/api/products/p1', 'PATCH', { version: product.version, data: { name: 'Forbidden metadata' } }, 403);
  product = await catalog.account.request('/api/products/p1', 'PATCH', { version: product.version, data: { name: 'Allowed metadata' } });
  await catalog.account.request('/api/products/p1', 'PATCH', { version: product.version, data: { tiers: [[100, 1]] } }, 403);
});
test('independent approval, draft-only editing and deletion permission are enforced by the backend', async (t) => {
  const f = await fixture(t), alice = await f.employee('alice', [...EMPLOYEE_PERMISSIONS, 'quotation.approve']),
    reviewer = await f.employee('reviewer', [...EMPLOYEE_PERMISSIONS, 'quotation.view_all', 'quotation.approve']),
    state = (await alice.account.request('/api/state')).state,
    own = await alice.account.request('/api/quotations', 'POST', f.input(state), 201), id = own.data.id;
  await alice.account.request('/api/quotations/' + id + '/status', 'POST', { version: own.version, status: 'Approved Internally' }, 403);
  const pending = await alice.account.request('/api/quotations/' + id + '/status', 'POST', { version: own.version, status: 'Pending Internal Review' });
  await alice.account.request('/api/quotations/' + id, 'PATCH', { version: pending.version, data: { subject: 'Cannot edit submitted' } }, 403);
  const approved = await reviewer.account.request('/api/quotations/' + id + '/status', 'POST', { version: pending.version, status: 'Approved Internally' });
  assert.equal(approved.data.hist.at(-1).u, 'reviewer');
  await alice.account.request('/api/quotations/' + id, 'DELETE', { version: approved.version }, 403);
});
test('WhatsApp manual sharing stores a protected immutable PDF and truthful separate history, failure and retry', async (t) => {
  const f = await fixture(t), alice = await f.employee('alice'), bob = await f.employee('bobby');
  await f.admin.request('/api/customers/C1', 'PATCH', { version: 1, data: { wa: '' } });
  const state = (await alice.account.request('/api/state')).state,
    own = await alice.account.request('/api/quotations', 'POST', f.input(state), 201), id = own.data.id;
  await alice.account.request('/api/quotations/' + id + '/whatsapp', 'POST', { version: own.version }, 422);
  await alice.account.request('/api/quotations/' + id + '/whatsapp', 'POST', { version: own.version, number: '9876543210' }, 422);
  await bob.account.request('/api/quotations/' + id + '/whatsapp', 'POST', { version: own.version, number: '+919876543210' }, 404);
  const attempt = await alice.account.request('/api/quotations/' + id + '/whatsapp', 'POST', { version: own.version, number: '+91 98765 43210' }, 201), logId = attempt.data.id;
  assert.equal(attempt.data.status, 'Prepared'); assert.equal(attempt.automatedDelivery, false);
  assert.match(attempt.instructions, /does not send or attach/); assert.match(attempt.clickToChatUrl, /^https:\/\/wa.me\/919876543210\?text=/);
  assert.equal((await alice.account.request('/api/quotations/' + id)).data.status, 'Draft');
  const originalPdf = await alice.account.request(attempt.pdfUrl);
  assert.equal(originalPdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(crypto.createHash('sha256').update(originalPdf).digest('hex'), attempt.data.pdfSha256);
  await f.client().request(attempt.pdfUrl, 'GET', undefined, 401);
  await bob.account.request(attempt.pdfUrl, 'GET', undefined, 404);
  assert.equal((await bob.account.request('/api/whatsapp/history')).pagination.total, 0);
  assert.equal((await f.admin.request('/api/whatsapp/history?quotationId=' + id)).pagination.total, 1);
  await alice.account.request('/api/whatsapp/history/' + logId + '/status', 'POST', { status: 'Delivered' }, 422);
  await alice.account.request('/api/whatsapp/history/' + logId + '/status', 'POST', { status: 'Failed', notes: 'Chat could not open' });
  await alice.account.request('/api/whatsapp/history/' + logId + '/status', 'POST', { status: 'Manually Confirmed' }, 409);
  const retry = await alice.account.request('/api/whatsapp/history/' + logId + '/retry', 'POST', { version: own.version }, 201);
  assert.equal(retry.data.retryOf, logId);
  await alice.account.request('/api/whatsapp/history/' + logId + '/retry', 'POST', { version: own.version }, 409);
  await alice.account.request('/api/whatsapp/history/' + retry.data.id + '/status', 'POST', { status: 'Failed' });
  const edited = await alice.account.request('/api/quotations/' + id, 'PATCH', { version: own.version, data: { subject: 'Later revision' } });
  assert.deepEqual(await alice.account.request(attempt.pdfUrl), originalPdf);
  await alice.account.request('/api/whatsapp/history/' + retry.data.id + '/retry', 'POST', { version: edited.version }, 409);
  const updated = await alice.account.request('/api/quotations/' + id + '/whatsapp', 'POST', { version: edited.version, number: '+919876543210' }, 201);
  const confirmed = await alice.account.request('/api/whatsapp/history/' + updated.data.id + '/status', 'POST', { status: 'Manually Confirmed', notes: 'PDF attached and sent manually' });
  assert.equal(confirmed.data.status, 'Manually Confirmed');
  assert.equal((await alice.account.request('/api/quotations/' + id)).data.status, 'Draft');
  await f.admin.request('/api/quotations/' + id, 'DELETE', { version: edited.version }, 409);
  assert.equal((await alice.account.request('/api/whatsapp/history?quotationId=' + id)).pagination.total, 3);
});
test('saving a WhatsApp recipient is atomic with preparation and enforces version and edit permission', async (t) => {
  const f = await fixture(t), state = (await f.admin.request('/api/state')).state;
  const created = await f.admin.request('/api/quotations', 'POST', f.input(state), 201), id = created.data.id;
  const prepared = await f.admin.request('/api/quotations/' + id + '/whatsapp', 'POST', {
    version: created.version, number: '+91 91234 56789', message: 'Reviewed quotation', saveNumber: true,
  }, 201);
  assert.equal(prepared.data.number, '+919123456789');
  assert.equal((await f.admin.request('/api/customers/C1')).data.wa, '+919123456789');
  const current = await f.admin.request('/api/quotations/' + id);
  await f.admin.request('/api/quotations/' + id, 'PATCH', { version: current.version, data: { subject: 'Updated after review' } });
  await f.admin.request('/api/quotations/' + id + '/whatsapp', 'POST', { version: current.version, number: '+919123456780', saveNumber: true }, 409);
  assert.equal((await f.admin.request('/api/customers/C1')).data.wa, '+919123456789');
  assert.equal((await f.admin.request('/api/whatsapp/history?quotationId=' + id)).pagination.total, 1);
  const employee = await f.employee('shareatomic', EMPLOYEE_PERMISSIONS.filter(p => p !== 'customer.edit'));
  const own = await employee.account.request('/api/quotations', 'POST', f.input((await employee.account.request('/api/state')).state), 201);
  await employee.account.request('/api/quotations/' + own.data.id + '/whatsapp', 'POST', {
    version: own.version, number: '+919123456789', saveNumber: true,
  }, 403);
  assert.equal((await f.admin.request('/api/whatsapp/history?quotationId=' + own.data.id)).pagination.total, 0);
});

test('WhatsApp settings reject unconfigured providers and secrets and templates are resolved only on server', async (t) => {
  const f = await fixture(t), employee = await f.employee('employee');
  assert.equal((await employee.account.request('/api/whatsapp/settings')).data.mode, 'manual');
  await employee.account.request('/api/whatsapp/settings', 'PATCH', { version: 1, enabled: false }, 403);
  let settings = await f.admin.request('/api/whatsapp/settings');
  await f.admin.request('/api/whatsapp/settings', 'PATCH', { version: settings.version, mode: 'business_api' }, 422);
  await f.admin.request('/api/whatsapp/settings', 'PATCH', { version: settings.version, token: 'must-not-store' }, 422);
  settings = await f.admin.request('/api/whatsapp/settings', 'PATCH', { version: settings.version, messageTemplate: 'Hi {{customer_name}}: {quotationNumber} / {{grand_total}}' });
  const state = (await employee.account.request('/api/state')).state,
    q = await employee.account.request('/api/quotations', 'POST', f.input(state), 201),
    share = await employee.account.request('/api/quotations/' + q.data.id + '/whatsapp', 'POST', { version: q.version, number: '+919876543210' }, 201);
  assert.doesNotMatch(share.data.message, /\{|\}/);
  await f.admin.request('/api/whatsapp/settings', 'PATCH', { version: settings.version, enabled: false });
  await employee.account.request('/api/quotations/' + q.data.id + '/whatsapp', 'POST', { version: q.version, number: '+919876543210' }, 409);
});
test('a sharing-only employee uses saved contact data and needs customer edit permission to override the recipient', async (t) => {
  const f = await fixture(t), employee = await f.employee('share_only', EMPLOYEE_PERMISSIONS.filter((p) => p !== 'customer.edit')),
    state = (await employee.account.request('/api/state')).state,
    q = await employee.account.request('/api/quotations', 'POST', f.input(state), 201);
  const share = await employee.account.request('/api/quotations/' + q.data.id + '/whatsapp', 'POST', { version: q.version }, 201);
  assert.equal(share.data.number, state.customers[0].wa);
  await employee.account.request('/api/quotations/' + q.data.id + '/whatsapp', 'POST', { version: q.version, number: '+919876543210' }, 403);
  const explicitBlank = await f.admin.request('/api/quotations', 'POST', f.input(state, { contact: { wa: '' } }), 201);
  await f.admin.request('/api/quotations/' + explicitBlank.data.id + '/whatsapp', 'POST', { version: explicitBlank.version }, 422);
});
test('additive schema upgrade resolves only unambiguous legacy owners and preserves unknown historical ownership', async () => {
  const database = await testDatabase(), db = connectDatabase(database);
  let app;
  try {
    await db.exec(fs.readFileSync(path.join(__dirname, '../server/schema.sql'), 'utf8'));
    await db.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES(3,'legacy');");
    for (const [id, name, role] of [['unique-id', 'Unique author', 'Administrator'], ['same-1', 'Same author', 'Employee'], ['same-2', 'Same author', 'Employee']])
      await db.prepare('INSERT INTO users(id,name,username,password_hash,role) VALUES(?,?,?,?,?)').run(id, name, id, 'unused', role);
    await db.prepare('INSERT INTO customers VALUES(?,?,?,?,?,?,?,?)').run('C1', 'Customer', '9000000001', '', '{}', 1, 0, 'legacy');
    for (const [id, author] of [['Q1', 'Unique author'], ['Q2', 'Same author'], ['Q3', 'Unknown author']])
      await db.prepare('INSERT INTO quotations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, id, 'C1', '2026-01-01', '2026-02-01', 'Draft', author, 0, JSON.stringify({ id, by: author }), 1, 0, 'legacy');
    app = await createApp(database);
    assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n, 4);
    const rows = await db.prepare('SELECT id,owner_id,body FROM quotations ORDER BY id').all();
    assert.equal(rows[0].owner_id, 'unique-id');
    assert.equal(JSON.parse(rows[0].body).createdBy, 'unique-id');
    assert.equal(rows[1].owner_id, null); assert.equal(rows[2].owner_id, null);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM users').get()).n, 3);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM whatsapp_message_logs').get()).n, 0);
  } finally { if (app) await app.close(); await db.close(); await database.destroy(); }
});
