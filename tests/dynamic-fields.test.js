'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createApp } = require('../server');
const { testDatabase } = require('./database-helper');
const { connectDatabase } = require('../server/database');
const { createStore } = require('../server/store');
const { REGISTRY } = require('../server/field-registry');

async function fixture(t) {
  const database = await testDatabase(), app = await createApp(database);
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const extraApps = [];
  t.after(async () => { for (const extra of extraApps) await extra.close(); await app.close(); await database.destroy(); });
  const base = 'http://127.0.0.1:' + app.server.address().port, password = 'Field-test-' + crypto.randomUUID();
  function client() {
    let cookie = '', csrf = '';
    return { headers: () => ({ Cookie: cookie, 'X-CSRF-Token': csrf }), async request(route, method = 'GET', data, expected = 200, extra = {}, destination = base) {
      const response = await fetch(destination + route, { method, headers: { Cookie: cookie, 'X-CSRF-Token': csrf, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const body = response.status === 304 ? null : await response.json();
      if (body?.csrfToken) csrf = body.csrfToken;
      assert.equal(response.status, expected, route + ': ' + JSON.stringify(body));
      return { body, etag: response.headers.get('etag') };
    } };
  }
  const admin = client();
  await admin.request('/api/auth/setup', 'POST', { name: 'Field owner', username: 'fieldowner', password, demo: true }, 201);
  const call = async (...args) => (await admin.request(...args)).body;
  const create = data => call('/api/configurable-fields', 'POST', { data }, 201);
  const patch = (field, data, expected = 200) => call('/api/configurable-fields/' + field.data.id, 'PATCH', { version: field.version, data }, expected);
  return { app, database, admin, call, create, patch, client, password, extraApps, base };
}
const definition = (more = {}) => ({ pageKey: 'quotations', fieldKey: 'custom_finish', label: 'Finish', fieldType: 'dropdown', options: [{ value: 'matte', label: 'Matte' }, { value: 'gloss', label: 'Gloss' }], ...more });
const resolve = '/api/field-configurations/resolve?pageKeys=quotations';

test('fields: registry identifies canonical workflows/relationships and label-only integrations', async t => {
  const f = await fixture(t), registry = await f.call('/api/field-configurations/registry');
  assert.equal(registry.data.length, REGISTRY.length);
  assert.equal(registry.customFieldPolicy.policy, 'configurable');
  const spec = await f.call('/api/openapi.json');
  assert.ok(spec.paths['/api/configurable-fields'].post.responses['201']);
  assert.ok(spec.paths['/api/configurable-fields/{id}/options'].post.responses['201']);
  assert.ok(spec.paths['/api/field-configurations/resolve'].get.responses['304']);
  for (const key of ['status', 'payment_status', 'workflow', 'role', 'tax_classification', 'pricing_fields', 'delivery_address']) assert.ok(registry.data.some(field => field.fieldKey === key && field.policy === 'protected'));
  const statuses = registry.data.find(field => field.pageKey === 'quotations' && field.fieldKey === 'status');
  assert.deepEqual(statuses.canonicalValues, require('../shared/domain').ST);
  assert.deepEqual(registry.data.find(field => field.pageKey === 'products' && field.fieldKey === 'pricing_method').canonicalValues, require('../shared/domain').METHODS);
  for (const field of registry.data.filter(value => value.policy === 'protected')) {
    await f.call('/api/configurable-fields/' + field.id, 'PATCH', { version: 1, data: { label: 'Changed' } }, 403);
    await f.call('/api/configurable-fields/' + field.id + '/options', 'POST', { version: 1, data: { value: 'unapproved', label: 'Unapproved' } }, 403);
  }
  const renamed = await f.patch({ data: { id: 'system_customers_name' }, version: 1 }, { label: 'Client name' });
  assert.equal(renamed.data.label, 'Client name');
  await f.patch(renamed, { isRequired: false }, 422);
  await f.create(definition({ fieldKey: 'status' })).then(() => assert.fail('Reserved field accepted'), error => assert.match(error.message, /422/));
});

test('fields: create, rename, configure, order, archive and audit preserve immutable option keys', async t => {
  const f = await fixture(t);
  let field = await f.create(definition()), fieldId = field.data.id;
  assert.equal(field.version, 1); assert.equal(field.data.options.length, 2);
  field = await f.patch(field, { label: 'Surface finish', isRequired: true, displayOrder: 4, configuration: { placeholder: 'Choose finish', helpText: 'Saved specifications', maxLength: 50 } });
  const option = field.data.options.find(value => value.value === 'matte');
  field = await f.call('/api/configurable-fields/' + fieldId + '/options/' + option.id, 'PATCH', { version: field.version, data: { label: 'Soft matte' } });
  assert.equal(field.data.options.find(value => value.id === option.id).value, 'matte');
  field = await f.call('/api/configurable-fields/' + fieldId + '/options', 'POST', { version: field.version, data: { value: 'satin', label: 'Satin' } }, 201);
  const reordered = field.data.options.map(value => value.id).reverse();
  field = await f.call('/api/configurable-fields/' + fieldId + '/options/reorder', 'POST', { version: field.version, optionIds: reordered });
  assert.deepEqual(field.data.options.map(value => value.id), reordered);
  field = await f.call('/api/configurable-fields/' + fieldId + '/options/' + option.id, 'DELETE', { version: field.version });
  const archived = field.data.options.find(value => value.id === option.id);
  assert.ok(archived.archivedAt); assert.equal(archived.isActive, false); assert.equal(archived.value, 'matte');
  assert.ok(!(await f.call(resolve)).data.quotations.find(value => value.id === fieldId).options.some(value => value.value === 'matte'));
  assert.equal((await f.call(resolve)).data.quotations.find(value => value.id === fieldId).retainedOptions.find(value => value.value === 'matte').label, 'Soft matte');
  await f.call('/api/configurable-fields/' + fieldId + '/options', 'POST', { version: field.version, data: { value: 'matte', label: 'Reused' } }, 409);
  await f.call('/api/configurable-fields/' + fieldId + '/options/' + option.id, 'PATCH', { version: field.version, data: { isActive: true } }, 409);
  await f.call('/api/configurable-fields/' + fieldId + '/options/' + option.id, 'PATCH', { version: field.version, data: { value: 'renamed_key' } }, 422);
  const audit = await f.call('/api/configurable-fields/' + fieldId + '/audit');
  assert.equal(audit.pagination.total, 6);
  const change = audit.data.find(value => value.action === 'option_updated');
  assert.equal(change.beforeValue.options.find(value => value.id === option.id).label, 'Matte');
  assert.equal(change.afterValue.options.find(value => value.id === option.id).label, 'Soft matte');
  assert.ok(audit.data.every(value => value.actorUserId));
});

test('fields: product > page > global resolution is explicit, whole-field and namespace-safe', async t => {
  const f = await fixture(t), state = (await f.call('/api/state')).state, pid = state.products[0].id;
  let global = await f.create(definition({ pageKey: 'global', configuration: { pages: ['quotations', 'customers'] }, label: 'Global finish' }));
  const page = await f.create({ baseFieldId: global.data.id, pageKey: 'quotations', scopeType: 'page', label: 'Quotation finish' });
  const specific = await f.create({ baseFieldId: global.data.id, pageKey: 'quotations', scopeType: 'product', scopeId: pid, label: 'Product finish', isActive: false });
  const find = payload => payload.data.quotations.find(value => value.rootFieldId === global.data.id);
  assert.equal(find(await f.call(resolve)).id, page.data.id);
  const selected = find(await f.call(resolve + '&productId=' + pid));
  assert.equal(selected.id, specific.data.id); assert.equal(selected.isActive, false, 'Inactive override must not fall back');
  assert.equal(selected.qualifiedKey, 'global.custom_finish');
  const batch = await f.call('/api/field-configurations/resolve?pageKeys=quotations,customers&productId=' + pid);
  assert.equal(batch.data.customers.find(value => value.rootFieldId === global.data.id).id, global.data.id);
  await f.create(definition({ pageKey: 'customers', label: 'Separate local field' }));
  assert.equal((await f.call('/api/field-configurations/resolve?pageKeys=customers')).data.customers.filter(value => value.fieldKey === 'custom_finish').length, 2);
  global = await f.patch(global, { label: 'New default' });
  assert.equal(find(await f.call(resolve)).label, 'Quotation finish');
  await f.create({ baseFieldId: page.data.id, pageKey: 'quotations', scopeType: 'product', scopeId: pid }).then(() => assert.fail('Override chain accepted'), error => assert.match(error.message, /422/));
  await f.create({ baseFieldId: global.data.id, pageKey: 'customers', scopeType: 'product', scopeId: pid }).then(() => assert.fail('Meaningless product scope accepted'), error => assert.match(error.message, /422/));
});

test('fields: duplicate field/option writes and stale versions cannot partially commit', async t => {
  const f = await fixture(t), field = await f.create(definition());
  const before = await f.call('/api/configurable-fields/' + field.data.id);
  await f.call('/api/configurable-fields', 'POST', { data: definition() }, 409);
  await f.call('/api/configurable-fields', 'POST', { data: definition({ fieldKey: 'custom_atomic', options: [{ value: 'same', label: 'One' }, { value: 'same', label: 'Two' }] }) }, 409);
  assert.equal((await f.call('/api/configurable-fields?q=custom_atomic')).pagination.total, 0);
  await f.call('/api/configurable-fields/' + field.data.id, 'PATCH', { data: { label: 'Missing version' } }, 428);
  const results = await Promise.allSettled([f.patch(field, { label: 'First' }), f.patch(field, { label: 'Second' })]);
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
  assert.match(results.find(value => value.status === 'rejected').reason.message, /409/);
  const current = await f.call('/api/configurable-fields/' + field.data.id);
  assert.equal(current.data.version, before.data.version + 1);
  await f.call('/api/configurable-fields/' + field.data.id + '/options/reorder', 'POST', { version: current.data.version, optionIds: [current.data.options[0].id] }, 422);
  assert.equal((await f.call('/api/configurable-fields/' + field.data.id)).revision, current.revision);
});

test('fields: empty required dropdowns, unsafe keys, unknown metadata and ownership input fail validation', async t => {
  const f = await fixture(t);
  for (const data of [definition({ isRequired: true, options: [] }), definition({ isRequired: true, isVisible: false }), definition({ fieldKey: '__proto__' }), definition({ pageKey: 'anything' }), definition({ tenant_id: 'other' }), definition({ options: [{ value: 'constructor', label: 'Unsafe' }] }), definition({ configuration: { html: '<script>alert(1)</script>' } }), definition({ scopeType: 'product', scopeId: 'missing' }), definition({ configuration: { maxLength: -1 } }), definition({ label: '\0bad' }), definition({ options: Array.from({ length: 101 }, (_, i) => ({ value: 'option_' + i, label: 'Option' })) })]) {
    await f.call('/api/configurable-fields', 'POST', { data }, data.isRequired && data.isVisible !== false ? 409 : 422);
  }
  for (const data of [definition({ baseFieldId: '' }), definition({ scopeType: false }), definition({ fieldType: null }), definition({ options: [{ value: 'one', label: 'One', isActive: null }] }), definition({ options: [{ value: 'one', label: 'One', displayOrder: null }] })]) await f.call('/api/configurable-fields', 'POST', { data }, 422);
  let field = await f.create(definition({ isRequired: true, options: [{ value: 'only', label: 'Only' }] }));
  await f.call('/api/configurable-fields/' + field.data.id + '/options/' + field.data.options[0].id, 'DELETE', { version: field.version }, 409);
  await f.patch(field, { fieldKey: 'custom_changed' }, 422);
  field = await f.patch(field, { isRequired: false, isVisible: false, isActive: false });
  assert.equal(field.data.isVisible, false);
  for (const query of ['tenant_id=x', 'pageKey=customers&pageKey=products', 'pageSize=101', 'q=']) await f.call('/api/configurable-fields?' + query, 'GET', undefined, 422);
  assert.equal((await f.call('/api/configurable-fields?q=%27%20OR%201%3D1--')).pagination.total, 0);
});

test('fields: RBAC, CSRF, page access and separate company isolation cover all operations', async t => {
  const f = await fixture(t), other = await fixture(t), field = await f.create(definition()), anonymous = f.client();
  for (const route of ['/api/configurable-fields', '/api/field-configurations/registry', resolve]) await anonymous.request(route, 'GET', undefined, 401);
  const employee = (await f.call('/api/users', 'POST', { name: 'Field staff', username: 'fieldstaff', password: f.password, role: 'Employee' }, 201)).user;
  const staff = f.client(); await staff.request('/api/auth/login', 'POST', { username: 'fieldstaff', password: f.password });
  await staff.request(resolve);
  await staff.request('/api/configurable-fields', 'GET', undefined, 403);
  await staff.request('/api/configurable-fields', 'POST', { data: definition() }, 403);
  await staff.request('/api/field-configurations/resolve?pageKeys=users', 'GET', undefined, 403);
  await f.call('/api/users/' + employee.id, 'PATCH', { version: employee.version || 1, permissions: ['fields.view'] });
  await staff.request('/api/auth/login', 'POST', { username: 'fieldstaff', password: f.password });
  await staff.request('/api/configurable-fields');
  await staff.request(resolve, 'GET', undefined, 403);
  await staff.request('/api/configurable-fields/' + field.data.id, 'PATCH', { version: field.version, data: { label: 'Forbidden' } }, 403);
  await f.admin.request('/api/configurable-fields/' + field.data.id, 'PATCH', { version: field.version, data: { label: 'CSRF' } }, 403, { 'X-CSRF-Token': 'invalid' });
  await other.call('/api/configurable-fields/' + field.data.id, 'GET', undefined, 404);
  await other.call('/api/configurable-fields/' + field.data.id + '/options/' + field.data.options[0].id, 'PATCH', { version: 1, data: { label: 'Foreign' } }, 404);
  await f.call(resolve + '&tenant_id=other', 'GET', undefined, 422);
  assert.equal((await other.call('/api/configurable-fields?q=custom_finish')).pagination.total, 0);
  const manager = (await f.call('/api/users', 'POST', { name: 'Field manager', username: 'fieldmanager', password: f.password, role: 'Employee', permissions: ['fields.manage'] }, 201)).user;
  const management = f.client(); await management.request('/api/auth/login', 'POST', { username: 'fieldmanager', password: f.password });
  const managed = await management.request('/api/configurable-fields', 'POST', { data: definition({ fieldKey: 'custom_managed' }) }, 201);
  assert.equal((await f.call('/api/configurable-fields/' + managed.body.data.id + '/audit')).data[0].actorUserId, manager.id);
  await management.request(resolve);
  await management.request('/api/customers', 'GET', undefined, 403);
  await management.request('/api/products', 'GET', undefined, 403);
});

test('fields: conditional batch retrieval revalidates per scope and invalidates across application instances', async t => {
  const f = await fixture(t), first = await f.admin.request(resolve);
  await f.admin.request(resolve, 'GET', undefined, 304, { 'If-None-Match': first.etag });
  const different = await f.admin.request('/api/field-configurations/resolve?pageKeys=customers', 'GET', undefined, 200, { 'If-None-Match': first.etag });
  assert.notEqual(first.etag, different.etag);
  const second = await createApp(f.database); f.extraApps.push(second);
  await new Promise(resolve => second.server.listen(0, '127.0.0.1', resolve));
  const field = await f.create(definition());
  const refreshed = await f.admin.request(resolve, 'GET', undefined, 200, { 'If-None-Match': first.etag });
  assert.notEqual(first.etag, refreshed.etag); assert.ok(refreshed.body.data.quotations.some(value => value.id === field.data.id));
  await f.admin.request('/api/configurable-fields', 'POST', { data: definition({ fieldKey: 'custom_second' }) }, 201, {}, 'http://127.0.0.1:' + second.server.address().port);
  const again = await f.admin.request(resolve, 'GET', undefined, 200, { 'If-None-Match': refreshed.etag });
  assert.ok(again.body.data.quotations.some(value => value.fieldKey === 'custom_second'));
});

test('fields: batched resolution has bounded queries, stable ordering and safe plain text', async t => {
  const f = await fixture(t);
  const first = await f.create(definition({ label: '<img src=x onerror=alert(1)>', displayOrder: 7 }));
  await f.create(definition({ pageKey: 'customers', displayOrder: 1 }));
  const prepare = f.app.db.prepare, statements = [];
  f.app.db.prepare = sql => { statements.push(sql); return prepare(sql); };
  let data;
  try { data = await f.call('/api/field-configurations/resolve?pageKeys=quotations,customers'); } finally { f.app.db.prepare = prepare; }
  assert.equal(statements.filter(sql => sql.includes('FROM configurable_fields')).length, 1);
  assert.equal(statements.filter(sql => sql.includes('FROM configurable_field_options')).length, 1);
  assert.equal(data.data.quotations.find(value => value.id === first.data.id).label, '<img src=x onerror=alert(1)>');
  const list = await f.call('/api/configurable-fields?pageSize=2&page=2');
  assert.equal(list.data.length, 2); assert.ok(list.pagination.total > 2);
  const plan = await f.app.db.prepare('EXPLAIN (FORMAT JSON) SELECT * FROM configurable_field_options WHERE field_id=? ORDER BY display_order,id').get(first.data.id);
  assert.ok(plan['QUERY PLAN']);
});

test('fields: option IDs cannot be enumerated or modified through a different field', async t => {
  const f = await fixture(t), a = await f.create(definition()), b = await f.create(definition({ fieldKey: 'custom_second' }));
  await f.call('/api/configurable-fields/' + a.data.id + '/options/' + b.data.options[0].id, 'PATCH', { version: a.version, data: { label: 'Cross-field' } }, 404);
  await f.call('/api/configurable-fields/' + a.data.id + '/options/reorder', 'POST', { version: a.version, optionIds: b.data.options.map(value => value.id) }, 422);
  assert.equal((await f.call('/api/configurable-fields/' + a.data.id)).version, undefined);
  assert.equal((await f.call('/api/configurable-fields/' + a.data.id)).data.version, 1);
});

test('fields: mandatory audit failures roll back configuration, options, versions and cache revision', async t => {
  const f = await fixture(t), field = await f.create(definition()), before = await f.call('/api/configurable-fields/' + field.data.id);
  const prepare = f.app.db.prepare;
  f.app.db.prepare = sql => sql.includes('INSERT INTO field_configuration_audit_logs') ? { run: async () => { throw Error('Injected field audit failure'); } } : prepare(sql);
  try { await f.patch(field, { label: 'Must roll back' }, 500); } finally { f.app.db.prepare = prepare; }
  assert.deepEqual(await f.call('/api/configurable-fields/' + field.data.id), before);
  assert.equal((await f.call('/api/configurable-fields/' + field.data.id + '/audit')).pagination.total, 1);
});

test('fields: schema-10 migration is atomic, idempotent, data preserving and enforces stable IDs', async t => {
  const f = await fixture(t), db = f.app.db;
  const tables = ['workspace', 'customers', 'customer_delivery_addresses', 'products', 'quotations', 'quotation_items', 'quotation_item_analytics', 'quotation_history', 'whatsapp_message_logs'];
  const fingerprint = async () => Object.fromEntries(await Promise.all(tables.map(async table => [table, await db.prepare('SELECT * FROM ' + table + ' ORDER BY 1,2').all()])));
  const before = await fingerprint();
  await db.exec('DROP TABLE product_field_bindings;DROP TABLE field_configuration_audit_logs,configurable_field_options,configurable_fields,field_configuration_state;DROP FUNCTION preserve_field_configuration_identity();DELETE FROM schema_migrations WHERE version>=11');
  const exec = db.exec;
  db.exec = async sql => { await exec(sql); if (sql.includes('CREATE TABLE configurable_fields')) throw Error('Injected configuration migration failure'); };
  try { await assert.rejects(createStore(db), /Injected configuration migration failure/); } finally { db.exec = exec; }
  assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n, 10);
  assert.equal((await db.prepare("SELECT to_regclass('configurable_fields') AS name").get()).name, null);
  assert.deepEqual(await fingerprint(), before);
  const second = connectDatabase(f.database); f.extraApps.push(second);
  await Promise.all([createStore(db), createStore(second)]);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM configurable_fields').get()).n, REGISTRY.length);
  assert.deepEqual(await fingerprint(), before);
  const field = await f.create(definition());
  await assert.rejects(db.prepare("UPDATE configurable_field_options SET value='changed' WHERE id=?").run(field.data.options[0].id), /immutable/);
  await assert.rejects(db.prepare("UPDATE configurable_fields SET field_key='custom_changed' WHERE id=?").run(field.data.id), /immutable/);
  await createStore(db);
  assert.equal((await f.call('/api/configurable-fields/' + field.data.id)).data.options[0].value, field.data.options[0].value);
});

test('fields: configuration writes leave existing customers, quotations and priced product definitions unchanged', async t => {
  const f = await fixture(t), state = (await f.call('/api/state')).state;
  const snapshot = async () => Object.fromEntries(await Promise.all(['workspace', 'customers', 'products', 'quotations', 'quotation_items', 'quotation_history', 'quotation_item_analytics', 'whatsapp_message_logs'].map(async table => [table, await f.app.db.prepare('SELECT * FROM ' + table + ' ORDER BY 1,2').all()])));
  const before = await snapshot();
  let field = await f.create(definition({ configuration: { helpText: 'Independent configuration' } }));
  await f.create({ baseFieldId: field.data.id, pageKey: 'quotations', scopeType: 'product', scopeId: state.products[0].id });
  field = await f.patch(field, { isActive: false, isVisible: false, label: 'New presentation label' });
  await f.call('/api/configurable-fields/' + field.data.id + '/options/' + field.data.options[0].id, 'DELETE', { version: field.version });
  assert.deepEqual(await snapshot(), before);
  const pricing = await f.call('/api/pricing/calculate', 'POST', { productId: state.products[0].id, cfg: require('../shared/domain').defCfg(state.products[0]) });
  assert.equal(pricing.moneyUnit, 'paise'); assert.ok(Number.isSafeInteger(pricing.grand));
});

test('fields: workspace/option limits and indexed lookups remain bounded at the configured maximum', async t => {
  const f = await fixture(t), field = await f.create(definition({ options: Array.from({ length: 100 }, (_, n) => ({ value: 'option_' + n, label: 'Option ' + n })) }));
  await f.call('/api/configurable-fields/' + field.data.id + '/options', 'POST', { version: field.version, data: { value: 'overflow', label: 'Overflow' } }, 409);
  const count = (await f.app.db.prepare('SELECT count(*) AS n FROM configurable_fields').get()).n;
  await f.app.db.prepare(`INSERT INTO configurable_fields(id,page_key,field_key,label,field_type,policy,scope_type,scope_id)
    SELECT 'limit_'||n,'quotations','custom_limit_'||n,'Limit '||n,'dropdown','configurable','page','quotations' FROM generate_series(1,?)n`).run(500 - count);
  await f.call('/api/configurable-fields', 'POST', { data: definition({ fieldKey: 'custom_overflow' }) }, 409);
  const resolved = await f.call(resolve); assert.ok(resolved.data.quotations.length <= 500);
  assert.equal((await f.call('/api/configurable-fields')).pagination.total, 500);
  await f.app.db.exec('ANALYZE configurable_fields;ANALYZE configurable_field_options');
  await f.app.db.readTransaction(async () => {
    await f.app.db.exec('SET LOCAL enable_seqscan=off');
    const plan = await f.app.db.prepare('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM configurable_field_options WHERE field_id=? ORDER BY display_order,id').get(field.data.id);
    assert.match(JSON.stringify(plan), /configurable_field_options_order|configurable_field_options_field_id_value_key/);
  });
});

test('fields: scoped product references remain valid on deactivation and reject destructive removal cleanly', async t => {
  const f = await fixture(t), field = await f.create(definition());
  const product = await f.call('/api/products', 'POST', { id: 'field_scope_product', code: 'FSP', name: 'Scoped product', cat: 'c1', m: 'unit', rate: 20, tax: 18, min: 0, minQty: 1, on: 1, priceConfigured: true, f: [] }, 201);
  const scoped = await f.create({ baseFieldId: field.data.id, pageKey: 'quotations', scopeType: 'product', scopeId: product.data.id });
  await f.call('/api/products/' + product.data.id, 'DELETE', { version: product.version }, 409);
  await f.call('/api/products/' + product.data.id, 'PATCH', { version: product.version, data: { on: 0 } });
  assert.ok((await f.call(resolve + '&productId=' + product.data.id)).data.quotations.some(value => value.id === scoped.data.id));
  await f.call('/api/configurable-fields', 'POST', { data: { baseFieldId: field.data.id, pageKey: 'quotations', scopeType: 'product', scopeId: 'not_a_product' } }, 404);
});

test('review: page identities reject coercible values without persisting unreachable fields', async t => {
  const f = await fixture(t), before = await f.call('/api/configurable-fields');
  for (const pageKey of [['quotations'], { toString: 'quotations' }, null, 42])
    await f.call('/api/configurable-fields', 'POST', { data: definition({ pageKey }) }, 422);
  for (const pages of [[['quotations']], [{ toString: 'quotations' }], [null]])
    await f.call('/api/configurable-fields', 'POST', { data: definition({ pageKey: 'global', configuration: { pages } }) }, 422);
  assert.deepEqual(await f.call('/api/configurable-fields'), before);
});

test('review: mutation envelopes reject irrelevant properties, empty patches and unsupported operations', async t => {
  const f = await fixture(t);
  await f.call('/api/configurable-fields', 'POST', { data: definition(), optionIds: [] }, 422);
  await f.call('/api/configurable-fields', 'POST', { data: definition(), version: 99 }, 422);
  const field = await f.create(definition()), route = '/api/configurable-fields/' + field.data.id, optionRoute = route + '/options/' + field.data.options[0].id;
  const before = await f.call(route);
  for (const [path, method, data] of [
    [route, 'PATCH', { version: field.version, data: { label: 'Ignored reorder' }, optionIds: [] }],
    [route + '/options', 'POST', { version: field.version, data: { value: 'third', label: 'Third' }, optionIds: [] }],
    [optionRoute, 'PATCH', { version: field.version, data: { label: 'Ignored reorder' }, optionIds: [] }],
    [optionRoute, 'PATCH', { version: field.version, data: {} }],
    [optionRoute, 'DELETE', { version: field.version, optionIds: [] }],
    [route + '/options/reorder', 'POST', { version: field.version, optionIds: field.data.options.map(option => option.id), data: {} }],
  ]) await f.call(path, method, data, 422);
  await f.call(route, 'PUT', {}, 405);
  await f.call(route + '/audit', 'POST', {}, 405);
  assert.deepEqual(await f.call(route), before);
});

test('review: saved references retain original IDs, values and label snapshots after rename, reorder and archive', async t => {
  const f = await fixture(t);
  let field = await f.create(definition());
  const original = field.data.options.find(option => option.value === 'matte'), route = '/api/configurable-fields/' + field.data.id;
  // A test-only consumer record models a previously saved option reference.
  // Phase 1 does not add custom values to real customer/quotation schemas.
  await f.app.db.exec(`CREATE TABLE engine_review_saved_choices (
    id TEXT PRIMARY KEY, field_id TEXT REFERENCES configurable_fields(id),
    option_id TEXT REFERENCES configurable_field_options(id), stored_value TEXT, label_snapshot TEXT)`);
  await f.app.db.prepare('INSERT INTO engine_review_saved_choices VALUES(?,?,?,?,?)').run('existing_record', field.data.id, original.id, original.value, original.label);
  const saved = await f.app.db.prepare('SELECT * FROM engine_review_saved_choices').all();
  field = await f.call(route + '/options/' + original.id, 'PATCH', { version: field.version, data: { label: 'Renamed matte' } });
  field = await f.call(route + '/options/reorder', 'POST', { version: field.version, optionIds: field.data.options.map(option => option.id).reverse() });
  field = await f.call(route + '/options/' + original.id, 'DELETE', { version: field.version });
  assert.deepEqual(await f.app.db.prepare('SELECT * FROM engine_review_saved_choices').all(), saved);
  const retained = (await f.call(resolve)).data.quotations.find(value => value.id === field.data.id).retainedOptions.find(option => option.id === original.id);
  assert.equal(retained.value, 'matte'); assert.equal(retained.label, 'Renamed matte'); assert.ok(retained.archivedAt);
  await assert.rejects(f.app.db.prepare('DELETE FROM configurable_field_options WHERE id=?').run(original.id), /foreign key/);
  const state = (await f.call('/api/state')).state;
  const override = await f.create({ baseFieldId: field.data.id, pageKey: 'quotations', scopeType: 'product', scopeId: state.products[0].id });
  assert.ok(override.data.options.some(option => option.value === 'matte' && option.archivedAt));
  assert.ok((await f.call(route)).data.options.some(option => option.id === original.id));
  assert.deepEqual(await f.app.db.prepare('SELECT * FROM engine_review_saved_choices').all(), saved);
});

test('review: conflicting option edits and duplicate product scopes commit exactly one winner', async t => {
  const f = await fixture(t), field = await f.create(definition()), route = '/api/configurable-fields/' + field.data.id;
  const option = field.data.options.find(value => value.value === 'matte');
  const changes = await Promise.allSettled([
    f.call(route + '/options/' + option.id, 'PATCH', { version: field.version, data: { label: 'Concurrent rename' } }),
    f.call(route + '/options/' + option.id, 'DELETE', { version: field.version }),
  ]);
  assert.equal(changes.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(changes.find(result => result.status === 'rejected').reason.message, /409/);
  const latest = await f.call(route);
  assert.equal(latest.data.version, 2); assert.equal((await f.call(route + '/audit')).pagination.total, 2);
  const pid = (await f.call('/api/state')).state.products[0].id;
  const payload = { baseFieldId: field.data.id, pageKey: 'quotations', scopeType: 'product', scopeId: pid };
  const revision = latest.revision, scopes = await Promise.allSettled([f.create({ ...payload, label: 'First scope' }), f.create({ ...payload, label: 'Second scope' })]);
  assert.equal(scopes.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(scopes.find(result => result.status === 'rejected').reason.message, /409/);
  const listing = await f.call('/api/configurable-fields?scopeType=product&scopeId=' + pid);
  assert.equal(listing.pagination.total, 1); assert.equal(listing.revision, revision + 1);
});

test('review: a mid-reorder failure rolls back every option position, field version, audit and cache revision', async t => {
  const f = await fixture(t), field = await f.create(definition()), route = '/api/configurable-fields/' + field.data.id;
  const before = await f.call(route), auditBefore = await f.call(route + '/audit'), prepare = f.app.db.prepare;
  let updates = 0;
  f.app.db.prepare = sql => {
    const statement = prepare(sql);
    return sql.startsWith('UPDATE configurable_field_options SET display_order') ? { ...statement, run: async (...values) => {
      if (++updates === 2) throw Error('Injected option reorder failure');
      return statement.run(...values);
    } } : statement;
  };
  try { await f.call(route + '/options/reorder', 'POST', { version: field.version, optionIds: field.data.options.map(option => option.id).reverse() }, 500); }
  finally { f.app.db.prepare = prepare; }
  assert.equal(updates, 2); assert.deepEqual(await f.call(route), before); assert.deepEqual(await f.call(route + '/audit'), auditBefore);
});

test('review: permission revocation while a write body is streaming is rechecked before any mutation', async t => {
  const f = await fixture(t), manager = (await f.call('/api/users', 'POST', { name: 'Queued manager', username: 'queuedmanager', password: f.password, role: 'Employee', permissions: ['fields.manage'] }, 201)).user;
  const staff = f.client(); await staff.request('/api/auth/login', 'POST', { username: 'queuedmanager', password: f.password });
  const before = await f.call('/api/configurable-fields'), prepare = f.app.db.prepare;
  let authenticated;
  const auth = new Promise(resolve => { authenticated = resolve; });
  f.app.db.prepare = sql => {
    const statement = prepare(sql);
    return sql.startsWith('SELECT users.*, sessions.csrf') ? { ...statement, get: async (...values) => {
      const row = await statement.get(...values); if (row?.id === manager.id) authenticated(); return row;
    } } : statement;
  };
  const payload = JSON.stringify({ data: definition({ fieldKey: 'custom_revoked' }) }), prefix = '{"data":';
  let outgoing;
  const response = new Promise((resolve, reject) => {
    outgoing = require('node:http').request(f.base + '/api/configurable-fields', { method: 'POST', headers: { ...staff.headers(), 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, incoming => {
      let text = ''; incoming.setEncoding('utf8'); incoming.on('data', chunk => { text += chunk; }); incoming.on('end', () => resolve({ status: incoming.statusCode, body: JSON.parse(text) }));
    });
    outgoing.on('error', reject); outgoing.write(prefix);
  });
  // Keep errors observed even if a setup assertion fails before awaiting it.
  response.catch(() => {});
  let timeout;
  try {
    await Promise.race([auth, new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Streaming request never authenticated.')), 3000); })]);
    clearTimeout(timeout); f.app.db.prepare = prepare;
    await f.call('/api/users/' + manager.id, 'PATCH', { version: manager.version || 1, permissions: [] });
    outgoing.end(payload.slice(prefix.length));
    assert.equal((await response).status, 401);
  } finally { clearTimeout(timeout); f.app.db.prepare = prepare; outgoing.destroy(); }
  assert.deepEqual(await f.call('/api/configurable-fields'), before);
});

test('review: cached reads cannot bypass revoked access, another company or product scope', async t => {
  const f = await fixture(t), other = await fixture(t), pid = (await f.call('/api/state')).state.products[0].id;
  const cached = await f.admin.request(resolve);
  await other.admin.request(resolve, 'GET', undefined, 200, { 'If-None-Match': cached.etag });
  const scoped = await f.admin.request(resolve + '&productId=' + pid, 'GET', undefined, 200, { 'If-None-Match': cached.etag });
  assert.notEqual(scoped.etag, cached.etag);
  const employee = (await f.call('/api/users', 'POST', { name: 'Cached staff', username: 'cachedstaff', password: f.password, role: 'Employee', permissions: ['quotation.view_own'] }, 201)).user;
  const staff = f.client(); await staff.request('/api/auth/login', 'POST', { username: 'cachedstaff', password: f.password });
  const ownCached = await staff.request(resolve);
  await f.call('/api/users/' + employee.id, 'PATCH', { version: employee.version || 1, permissions: ['fields.view'] });
  await staff.request(resolve, 'GET', undefined, 401, { 'If-None-Match': ownCached.etag });
  await staff.request('/api/auth/login', 'POST', { username: 'cachedstaff', password: f.password });
  await staff.request(resolve, 'GET', undefined, 403, { 'If-None-Match': ownCached.etag });
});

test('review: protected fields reject every option mutation family and retain canonical data', async t => {
  const f = await fixture(t), stateBefore = (await f.call('/api/state')).state, fieldId = 'system_quotations_status', route = '/api/configurable-fields/' + fieldId;
  const before = await f.call(route);
  for (const [path, method, input] of [
    [route + '/options', 'POST', { version: 1, data: { value: 'bypass', label: 'Bypass' } }],
    [route + '/options/not_an_option', 'PATCH', { version: 1, data: { label: 'Bypass' } }],
    [route + '/options/not_an_option', 'DELETE', { version: 1 }],
    [route + '/options/reorder', 'POST', { version: 1, optionIds: [] }],
    [route, 'PATCH', { version: 1, data: { isActive: false } }],
  ]) await f.call(path, method, input, 403);
  await f.call('/api/configurable-fields', 'POST', { data: { baseFieldId: fieldId, pageKey: 'quotations', scopeType: 'page', options: [] } }, 422);
  assert.deepEqual(await f.call(route), before);
  assert.deepEqual((await f.call('/api/state')).state, stateBefore);
});
