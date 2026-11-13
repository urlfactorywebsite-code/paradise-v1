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
  const prepare = async (selection = ['quotations', 'customers', 'deliveryAddresses']) => admin.call('/api/data/reset/prepare', 'POST', { revision: (await admin.call('/api/state')).revision, selection });
  const confirm = (token, step, status = 200) => admin.call('/api/data/reset/confirm', 'POST', { token, step }, status);
  return { get app() { return app; }, database, admin, auth, password, client, prepare, confirm, backupDir,
    async restart() { await app.close(); app = await createApp({ ...database, backupDir }); await listen(); } };
}

async function createdRecords(f, { quotation = true, sharing = false } = {}) {
  const state = (await f.admin.call('/api/state')).state;
  const customer = (await f.admin.call('/api/customers', 'POST', {
    name: 'Created customer', mob: '9876500003', categoryId: 'cc_bni',
    deliveryAddresses: [{ label: 'Delivery', line1: 'Test street', country: 'India', isDefault: true }],
  }, 201)).data;
  let quote;
  if (quotation) quote = await f.admin.call('/api/quotations', 'POST', {
    cid: customer.id, items: [{ pid: 'p2', cfg: { ...DP.defCfg(DP.resolveProduct(state.products.find(p => p.id === 'p2'), state.set)), qty: 3 } }],
  }, 201);
  if (sharing) await f.admin.call('/api/quotations/' + quote.data.id + '/whatsapp', 'POST', {
    version: quote.version, number: '+919876500003', message: 'Reset test sharing PDF',
  }, 201);
  return { customer, quote };
}
async function complete(f, selection) {
  let challenge = await f.prepare(selection);
  challenge = await f.confirm(challenge.token, 1);
  challenge = await f.confirm(challenge.token, 2);
  await f.confirm(challenge.token, 3);
  return challenge;
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
  const f = await fixture(t);
  const records = await createdRecords(f, { sharing: true });
  const before = await f.app.store.readState();
  let challenge = await f.prepare();
  challenge = await f.confirm(challenge.token, 1);
  challenge = await f.confirm(challenge.token, 2);
  const exec = f.app.db.exec;
  f.app.db.exec = async sql => { if (sql === 'DELETE FROM customer_delivery_addresses') throw new Error('Injected cleanup failure'); return exec(sql); };
  try { await f.confirm(challenge.token, 3, 500); }
  finally { f.app.db.exec = exec; }
  assert.deepEqual(await f.app.store.readState(), before);
  await f.confirm(challenge.token, 3);
  assert.equal((await f.app.store.readState()).state.quotes.some(q => q.id === records.quote.data.id), false);
  assert.ok((await f.app.store.readState()).state.products.length);
});

test('selected reset deletes created records while preserving seeds, catalog, settings, history and backups across restart', async t => {
  const f = await fixture(t), before = await f.app.store.readState(), db = f.app.db;
  const other = f.client();
  await other.call('/api/auth/login', 'POST', { username: 'resetowner', password: f.password });
  const { customer, quote } = await createdRecords(f, { sharing: true });
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
  const retainedTables = ['categories', 'products', 'quote_sequences', 'pricing_imports', 'customer_categories',
    'customer_category_logos', 'product_field_bindings', 'field_configuration_audit_logs', 'configurable_fields', 'configurable_field_options'];
  const retained = {};
  for (const table of retainedTables) retained[table] = (await db.query(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY row_to_json(t)::text`)).rows;
  const current = await f.admin.call('/api/state');
  const seedCustomers = current.state.customers.filter(c => c.id !== customer.id);
  const seedQuotes = current.state.quotes.filter(q => q.id !== quote.data.id);
  const auditBefore = await db.prepare('SELECT * FROM audit_events ORDER BY id').all();
  let challenge = await f.prepare();
  challenge = await f.confirm(challenge.token, 1);
  challenge = await f.confirm(challenge.token, 2);
  await f.confirm(challenge.token, 3);
  await f.confirm(challenge.token, 3, 403); // Signing-key rotation makes completion single use.
  for (const table of retainedTables) assert.deepEqual((await db.query(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY row_to_json(t)::text`)).rows, retained[table], table);
  for (const table of ['whatsapp_message_logs', 'customer_delivery_addresses']) assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).n, 0, table);
  for (const table of ['quotation_items', 'quotation_history', 'quotation_item_analytics']) assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE quotation_id=?`).get(quote.data.id)).n, 0, table);
  assert.deepEqual(await db.prepare('SELECT * FROM users ORDER BY id').all(), users);
  assert.deepEqual(await db.prepare('SELECT settings,settings_version FROM workspace WHERE id=1').get(), settings);
  assert.deepEqual(await db.prepare("SELECT * FROM configurable_fields WHERE scope_type<>'product' ORDER BY id").all(), fields);
  assert.equal(await fs.readFile(path.join(f.backupDir, 'existing.dump'), 'utf8'), 'retained-backup');
  const auditAfter = await db.prepare('SELECT * FROM audit_events ORDER BY id').all();
  assert.deepEqual(auditAfter.slice(0, -1), auditBefore);
  assert.equal(auditAfter.at(-1).action, 'workspace.data_reset');
  const clean = await f.admin.call('/api/state');
  assert.deepEqual(clean.state.customers, seedCustomers);
  assert.deepEqual(clean.state.quotes, seedQuotes);
  for (const collection of ['cats', 'products', 'customerCategories']) assert.deepEqual(clean.state[collection], current.state[collection], collection);
  assert.equal(clean.revision, current.revision + 1);
  await f.admin.call('/api/changes', 'POST', { revision: before.revision, changes: [{ collection: 'customers', action: 'upsert', id: 'stale', record: { id: 'stale', name: 'Stale record', mob: '9876500099' } }] }, 409);
  await other.call('/api/state', 'GET', undefined, 401);
  await f.restart();
  const restarted = await f.admin.call('/api/state');
  for (const collection of ['cats', 'products', 'customers', 'quotes', 'customerCategories']) assert.deepEqual(restarted.state[collection], clean.state[collection], collection);
  assert.equal((await f.admin.call('/api/auth/status')).initialized, true);
  // Normal work continues with the retained catalog and monotonically increasing numbers.
  await f.admin.call('/api/customers', 'POST', { name: 'First real customer', mob: '9876500004' }, 201);
  const login = f.client();
  await login.call('/api/auth/login', 'POST', { username: 'resetowner', password: f.password });
});

test('reset rejects missing, unknown, duplicate or changed checkbox selections', async t => {
  const f = await fixture(t), revision = (await f.admin.call('/api/state')).revision;
  for (const selection of [undefined, [], ['products'], ['quotations', 'quotations'], ['customers']])
    await f.admin.call('/api/data/reset/prepare', 'POST', { revision, selection }, 422);
  const prepared = await f.prepare(['quotations']);
  assert.deepEqual(prepared.selection, ['quotations']);
  await f.admin.call('/api/data/reset/confirm', 'POST', { token: prepared.token, step: 1, selection: ['customers', 'deliveryAddresses'] }, 422);
});

test('quotation-only reset keeps all customers and addresses, preserves edited seed identities and continues numbering', async t => {
  const f = await fixture(t), { quote } = await createdRecords(f, { sharing: true });
  await f.app.db.exec("UPDATE quotations SET body=(body::jsonb || '{\"project\":\"Renamed seed quotation\"}'::jsonb)::text WHERE id='Q1'");
  await f.app.db.exec("UPDATE customers SET name='Renamed seed customer',body=(body::jsonb || '{\"name\":\"Renamed seed customer\"}'::jsonb)::text WHERE id='C1'");
  const before = await f.admin.call('/api/state');
  const sequences = await f.app.db.prepare('SELECT * FROM quote_sequences ORDER BY year').all();
  await complete(f, ['quotations']);
  const after = await f.admin.call('/api/state');
  assert.deepEqual(after.state.customers, before.state.customers);
  assert.deepEqual(after.state.quotes, before.state.quotes.filter(q => q.id !== quote.data.id));
  assert.deepEqual(await f.app.db.prepare('SELECT * FROM quote_sequences ORDER BY year').all(), sequences);
  const next = await f.admin.call('/api/quotations', 'POST', { cid: 'C1', items: [{ pid: 'p2', cfg: DP.defCfg(DP.resolveProduct(after.state.products.find(p => p.id === 'p2'), after.state.set)) }] }, 201);
  assert.ok(Number(next.data.no.split('/').at(-1)) > Number(quote.data.no.split('/').at(-1)));
});

test('customer reset requires linked created quotations and never deletes a retained demo quotation', async t => {
  const f = await fixture(t), { customer } = await createdRecords(f);
  const revision = (await f.admin.call('/api/state')).revision;
  await f.admin.call('/api/data/reset/prepare', 'POST', { revision, selection: ['customers', 'deliveryAddresses'] }, 409);
  await f.app.db.prepare("UPDATE quotations SET customer_id=? WHERE id='Q1'").run(customer.id);
  await f.admin.call('/api/data/reset/prepare', 'POST', { revision, selection: ['quotations', 'customers', 'deliveryAddresses'] }, 409);
  assert.ok((await f.admin.call('/api/state')).state.customers.some(c => c.id === customer.id));
});

test('unlinked customer-only reset retains every quotation and demo customer', async t => {
  const f = await fixture(t), { customer } = await createdRecords(f, { quotation: false });
  const before = await f.admin.call('/api/state');
  await complete(f, ['customers', 'deliveryAddresses']);
  const after = await f.admin.call('/api/state');
  assert.deepEqual(after.state.quotes, before.state.quotes);
  assert.deepEqual(after.state.customers, before.state.customers.filter(c => c.id !== customer.id));
});

test('address-only reset clears live pointers, retains customers/quotations and their historical delivery snapshots', async t => {
  const f = await fixture(t), { customer, quote } = await createdRecords(f);
  const before = await f.admin.call('/api/state');
  assert.ok(before.state.quotes.find(q => q.id === quote.data.id).deliveryAddressSnapshot);
  await complete(f, ['deliveryAddresses']);
  const after = await f.admin.call('/api/state');
  assert.deepEqual(after.state.quotes, before.state.quotes);
  assert.deepEqual(after.state.customers.map(c => c.id), before.state.customers.map(c => c.id));
  const saved = await f.admin.call('/api/customers/' + customer.id);
  assert.equal(saved.data.deliveryAddressId, undefined);
  assert.deepEqual(saved.data.deliveryAddresses || [], []);
  await f.admin.call('/api/customers/' + customer.id, 'PATCH', { version: saved.version, data: { name: 'Editable after address reset' } });
});
