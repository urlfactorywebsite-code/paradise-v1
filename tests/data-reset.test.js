'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server');
const { testDatabase } = require('./database-helper');
const DP = require('../shared/domain');

async function fixture(t) {
  const database = await testDatabase();
  const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'paradise-reset-'));
  let app = await createApp({ ...database, backupDir });
  let base;
  async function listen() {
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    base = 'http://127.0.0.1:' + app.server.address().port;
  }
  await listen();
  t.after(async () => { await app.close(); await database.destroy(); await fs.rm(backupDir, { recursive: true, force: true }); });
  function client() {
    return { cookie: '', csrf: '', async call(route, method = 'GET', data, status = 200, headers = {}) {
      const response = await fetch(base + route, { method,
        headers: { Cookie: this.cookie, 'X-CSRF-Token': this.csrf, 'Content-Type': 'application/json', ...headers },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
      if (response.headers.get('set-cookie')) this.cookie = response.headers.get('set-cookie').split(';')[0];
      const value = await response.json();
      if (value.csrfToken) this.csrf = value.csrfToken;
      assert.equal(response.status, status, route + ': ' + JSON.stringify(value));
      return value;
    } };
  }
  const admin = client(), password = 'Reset-test-' + crypto.randomUUID();
  const auth = await admin.call('/api/auth/setup', 'POST', { name: 'Reset owner', username: 'resetowner', password, demo: true }, 201);
  const prepare = async () => admin.call('/api/data/reset/prepare', 'POST', { revision: (await admin.call('/api/state')).revision });
  const confirm = (token, step, status = 200) => admin.call('/api/data/reset/confirm', 'POST', { token, step }, status);
  return { get app() { return app; }, database, admin, auth, password, client, prepare, confirm, backupDir,
    async restart() { await app.close(); app = await createApp({ ...database, backupDir }); await listen(); } };
}

test('reset rejects anonymous, delegated employees, missing CSRF, cross-origin and forced-password sessions', async t => {
  const f = await fixture(t), revision = (await f.admin.call('/api/state')).revision;
  await f.client().call('/api/data/reset/prepare', 'POST', { revision }, 401);
  await f.admin.call('/api/data/reset/prepare', 'POST', { revision }, 403, { 'X-CSRF-Token': '' });
  await f.admin.call('/api/data/reset/prepare', 'POST', { revision }, 403, { Origin: 'https://untrusted.example' });
  await f.admin.call('/api/users', 'POST', { name: 'Delegated employee', username: 'resetemployee', password: f.password, role: 'Employee', permissions: ['settings.manage', 'users.manage', 'fields.manage'] }, 201);
  const employee = f.client();
  await employee.call('/api/auth/login', 'POST', { username: 'resetemployee', password: f.password });
  for (const route of ['/api/data/reset/prepare', '/api/data/reset/confirm'])
    await employee.call(route, 'POST', { revision, step: 3, token: 'invalid' }, 403);
  await f.app.db.prepare('UPDATE users SET must_change_password=1 WHERE id=?').run(f.auth.user.id);
  await f.admin.call('/api/data/reset/prepare', 'POST', { revision }, 403);
  assert.ok((await f.app.store.readState()).state.products.length);
});

test('reset requires three ordered confirmations and rejects forged, expired and foreign-session tokens', async t => {
  const f = await fixture(t), before = await f.admin.call('/api/state');
  await f.admin.call('/api/data/reset/prepare', 'POST', {}, 428);
  await f.admin.call('/api/data/reset/prepare', 'POST', { revision: before.revision - 1 }, 409);
  const prepared = await f.prepare();
  await f.confirm(prepared.token, 3, 422);
  await f.confirm('not-a-token', 1, 403);
  await f.confirm(prepared.token.split('.')[0] + '.' + 'é'.repeat(43), 1, 403);
  const other = f.client();
  await other.call('/api/auth/login', 'POST', { username: 'resetowner', password: f.password });
  await other.call('/api/data/reset/confirm', 'POST', { token: prepared.token, step: 1 }, 403);
  const first = await f.confirm(prepared.token, 1);
  await f.confirm(first.token, 1, 422);
  const second = await f.confirm(first.token, 2);
  assert.equal((await f.admin.call('/api/state')).revision, before.revision);
  assert.deepEqual((await f.admin.call('/api/state')).state.products, before.state.products);
  const key = (await f.app.db.prepare('SELECT pricing_import_key FROM workspace WHERE id=1').get()).pricing_import_key;
  const claim = JSON.parse(Buffer.from(second.token.split('.')[0], 'base64url').toString());
  const payload = Buffer.from(JSON.stringify({ ...claim, expires: Date.now() - 1 })).toString('base64url');
  const expired = payload + '.' + crypto.createHmac('sha256', key).update(payload).digest('base64url');
  await f.confirm(expired, 3, 403);
});

test('reset aborts if workspace data or field configuration changes during confirmation', async t => {
  const f = await fixture(t);
  let prepared = await f.prepare();
  await f.admin.call('/api/customers', 'POST', { name: 'New data during warnings', mob: '9876500002' }, 201);
  await f.confirm(prepared.token, 1, 409);
  prepared = await f.prepare();
  await f.app.db.exec('UPDATE field_configuration_state SET revision=revision+1 WHERE id=1');
  await f.confirm(prepared.token, 1, 409);
  assert.ok((await f.app.store.readState()).state.customers.some(c => c.name === 'New data during warnings'));
});

test('reset rechecks administrator access under the mutation lock', async t => {
  const f = await fixture(t), prepared = await f.prepare();
  await f.app.db.prepare("UPDATE users SET role='Employee' WHERE id=?").run(f.auth.user.id);
  await f.confirm(prepared.token, 1, 403);
  assert.ok((await f.app.store.readState()).state.products.length);
});

test('reset rolls back all deletions if any cleanup fails', async t => {
  const f = await fixture(t), before = await f.app.store.readState();
  let challenge = await f.prepare();
  challenge = await f.confirm(challenge.token, 1);
  challenge = await f.confirm(challenge.token, 2);
  const exec = f.app.db.exec;
  f.app.db.exec = async sql => { if (sql === 'DELETE FROM categories') throw new Error('Injected cleanup failure'); return exec(sql); };
  try { await f.confirm(challenge.token, 3, 500); }
  finally { f.app.db.exec = exec; }
  assert.deepEqual(await f.app.store.readState(), before);
  await f.confirm(challenge.token, 3);
  assert.equal((await f.app.store.readState()).state.products.length, 0);
});

test('reset empties business tables, retains accounts/settings/backups and stays empty after restart', async t => {
  const f = await fixture(t), before = await f.app.store.readState(), db = f.app.db;
  const other = f.client();
  await other.call('/api/auth/login', 'POST', { username: 'resetowner', password: f.password });
  const customer = (await f.admin.call('/api/customers', 'POST', {
    name: 'Reset delivery customer', mob: '9876500003', categoryId: 'cc_bni',
    deliveryAddresses: [{ label: 'Delivery', line1: 'Test street', country: 'India', isDefault: true }],
  }, 201)).data;
  const quote = await f.admin.call('/api/quotations', 'POST', { cid: customer.id, items: [{ pid: 'p2', cfg: { ...DP.defCfg(DP.resolveProduct(before.state.products.find(p => p.id === 'p2'), before.state.set)), qty: 3 } }] }, 201);
  await f.admin.call('/api/quotations/' + quote.data.id + '/whatsapp', 'POST', { version: quote.version, number: '+919876500003', message: 'Reset test sharing PDF' }, 201);
  const sharp = require('sharp');
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#112233' } }).png().toBuffer();
  await f.admin.call('/api/customer-categories/cc_bni', 'PATCH', { version: 1, data: { logoDataUrl: 'data:image/png;base64,' + png.toString('base64') } });
  await f.admin.call('/api/products/p1/field-configuration', 'POST', {});
  await f.admin.call('/api/configurable-fields', 'POST', { data: { pageKey: 'products', scopeType: 'product', scopeId: 'p1', fieldKey: 'custom_reset', label: 'Product option', fieldType: 'dropdown', options: [{ value: 'first', label: 'First' }] } }, 201);
  await db.prepare('INSERT INTO pricing_imports VALUES(?,?,?,?,?,?,?)').run('reset_import', f.auth.user.id, new Date().toISOString(), 'test.xlsx', 'hash', '{}', '[]');
  await fs.writeFile(path.join(f.backupDir, 'existing.dump'), 'retained-backup');
  const users = await db.prepare('SELECT * FROM users ORDER BY id').all();
  const settings = await db.prepare('SELECT settings,settings_version FROM workspace WHERE id=1').get();
  const fields = await db.prepare("SELECT * FROM configurable_fields WHERE scope_type<>'product' ORDER BY id").all();
  const businessTables = ['categories', 'products', 'customers', 'quotations', 'quotation_items', 'quotation_history',
    'quote_sequences', 'whatsapp_message_logs', 'pricing_imports', 'customer_delivery_addresses', 'customer_categories',
    'customer_category_logos', 'quotation_item_analytics', 'product_field_bindings', 'field_configuration_audit_logs'];
  for (const table of businessTables)
    assert.ok((await db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).n > 0, 'Nonempty fixture: ' + table);
  const current = await f.admin.call('/api/state');
  let challenge = await f.prepare();
  challenge = await f.confirm(challenge.token, 1);
  challenge = await f.confirm(challenge.token, 2);
  await f.confirm(challenge.token, 3);
  await f.confirm(challenge.token, 3, 403); // Signing-key rotation makes completion single use.
  for (const table of businessTables) assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).n, 0, table);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM configurable_fields WHERE scope_type='product'").get()).n, 0);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM configurable_field_options o JOIN configurable_fields f ON f.id=o.field_id WHERE f.scope_type=\'product\'').get()).n, 0);
  assert.deepEqual(await db.prepare('SELECT * FROM users ORDER BY id').all(), users);
  assert.deepEqual(await db.prepare('SELECT settings,settings_version FROM workspace WHERE id=1').get(), settings);
  assert.deepEqual(await db.prepare("SELECT * FROM configurable_fields WHERE scope_type<>'product' ORDER BY id").all(), fields);
  assert.equal(await fs.readFile(path.join(f.backupDir, 'existing.dump'), 'utf8'), 'retained-backup');
  assert.deepEqual((await db.prepare('SELECT action FROM audit_events').all()).map(r => r.action), ['workspace.data_reset']);
  const clean = await f.admin.call('/api/state');
  for (const collection of ['cats', 'products', 'customers', 'quotes', 'customerCategories']) assert.deepEqual(clean.state[collection], [], collection);
  assert.equal(clean.revision, current.revision + 1);
  await f.admin.call('/api/changes', 'POST', { revision: before.revision, changes: [{ collection: 'customers', action: 'upsert', id: 'stale', record: { id: 'stale', name: 'Stale record', mob: '9876500099' } }] }, 409);
  await other.call('/api/state', 'GET', undefined, 401);
  await f.restart();
  const restarted = await f.admin.call('/api/state');
  for (const collection of ['cats', 'products', 'customers', 'quotes', 'customerCategories']) assert.deepEqual(restarted.state[collection], [], collection);
  assert.equal((await f.admin.call('/api/auth/status')).initialized, true);
  // Normal work is possible in the empty database, without restoring a catalog.
  await f.admin.call('/api/customers', 'POST', { name: 'First real customer', mob: '9876500004' }, 201);
  const login = f.client();
  await login.call('/api/auth/login', 'POST', { username: 'resetowner', password: f.password });
});
