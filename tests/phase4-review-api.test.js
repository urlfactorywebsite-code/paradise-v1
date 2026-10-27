'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createApp } = require('../server'), { testDatabase } = require('./database-helper');
const DP = require('../shared/domain');

async function fixture(t) {
  const database = await testDatabase(), app = await createApp(database);
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); await database.destroy(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let cookie = '', csrf = '';
  async function request(route, method = 'GET', body, expected = 200, headers = {}) {
    const response = await fetch(base + route, { method,
      headers: { ...(cookie ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const data = response.headers.get('content-type')?.includes('application/json')
      ? await response.json() : Buffer.from(await response.arrayBuffer());
    if (data.csrfToken) csrf = data.csrfToken;
    assert.equal(response.status, expected, `${method} ${route}: ${Buffer.isBuffer(data) ? 'PDF' : JSON.stringify(data)}`);
    return data;
  }
  const password = 'Review-' + crypto.randomUUID();
  await request('/api/auth/setup', 'POST', { name: 'Phase Four Review', username: 'reviewadmin', password, demo: true }, 201);
  const initial = await request('/api/state');
  await request('/api/state', 'PUT', { revision: initial.revision, state: initial.state });
  return { request, app, password };
}
async function manager(request, permissions = ['product.view', 'product.manage']) {
  const password = 'Manager-' + crypto.randomUUID();
  await request('/api/users', 'POST', { name: 'Catalog review', username: 'reviewcatalog', password,
    role: 'Employee', permissions }, 201);
  await request('/api/auth/login', 'POST', { username: 'reviewcatalog', password });
}

test('Phase 4 review: pricing rules on unassigned shared templates require pricing management', async t => {
  const { request } = await fixture(t);
  const route = '/api/configuration-templates/area-product';
  const original = await request(route), configured = structuredClone(original.data);
  const material = configured.f.find(f => f.k === 'material');
  material.o = [['Synthetic review material', 'a', 10]];
  material.optionMeta = { 'Synthetic review material': { enabled: true, approved: true } };
  await request(route, 'PUT', { revision: original.revision, data: configured });
  await manager(request);
  {
    const current = await request(route);
    const changed = structuredClone(current.data), field = changed.f.find(f => ['sel', 'multi'].includes(f.t));
    field.rateBasis = 'area';
    await request(route, 'PUT', { revision: current.revision, data: changed }, 403);
    assert.deepEqual((await request(route)).data, current.data);
  }
});

test('Phase 4 review: reordering priced template fields is catalog work while actual rate policies remain protected', async t => {
  const { request } = await fixture(t), route = '/api/configuration-templates/area-product';
  const original = await request(route), configured = structuredClone(original.data);
  for (const key of ['material', 'lamination']) {
    const field = configured.f.find(value => value.k === key), label = 'Synthetic review ' + key;
    field.o = [[label, 'a', 10]]; field.optionMeta = { [label]: { enabled: true, approved: true } };
    field.rateBasis = 'area'; field.allowCustom = true;
    field.customCharge = { type: 'a', amount: 10, approved: true };
  }
  await request(route, 'PUT', { revision: original.revision, data: configured });
  await manager(request, ['product.view', 'product.manage', 'pricing.view']);
  let current = await request(route), reordered = structuredClone(current.data);
  reordered.f.reverse();
  current = await request(route, 'PUT', { revision: current.revision, data: reordered });
  assert.deepEqual(current.data, reordered);
  for (const mutate of [
    field => { delete field.rateBasis; },
    field => { field.customCharge.amount = 11; },
  ]) {
    const forged = structuredClone(current.data); mutate(forged.f.find(field => field.k === 'material'));
    await request(route, 'PUT', { revision: current.revision, data: forged }, 403);
    assert.deepEqual((await request(route)).data, current.data);
  }
});

test('Phase 4 review: catalog mutations enforce CSRF, origin and atomic operation validation', async t => {
  const { request } = await fixture(t), before = await request('/api/state');
  await request('/api/catalog/prepare', 'POST', { revision: before.revision, apply: true }, 403, { 'X-CSRF-Token': '' });
  await request('/api/catalog/prepare', 'POST', { revision: before.revision, apply: true }, 403, { Origin: 'https://invalid.example' });
  const product = structuredClone(before.state.products.find(p => p.id === 'p13'));
  product.name = 'Must roll back';
  await request('/api/changes', 'POST', { revision: before.revision, changes: [
    { collection: 'products', action: 'upsert', id: product.id, record: product },
    { collection: 'products', action: 'upsert', id: 'invalid', record: { id: 'wrong' } },
  ] }, 422);
  const after = await request('/api/state');
  assert.equal(after.revision, before.revision);
  assert.deepEqual(after.state, before.state);
});

test('Phase 4 review: forged quotation metadata and snapshots cannot expose internal PDF fields or alter calculated amounts', async t => {
  const { request } = await fixture(t);
  let product = await request('/api/products/p2');
  const p = structuredClone(product.data);
  p.f.push({ k: 'privateMemo', l: 'Internal production note', t: 'txt', required: false,
    internal_only: true, show_on_customer_pdf: true });
  product = await request('/api/products/p2', 'PUT', { version: product.version, data: p });
  const cfg = { ...DP.defCfg(product.data), qty: 2, privateMemo: 'PHASE4_REVIEW_PRIVATE' };
  const expected = await request('/api/pricing/calculate', 'POST', { productId: p.id, cfg });
  let quote = await request('/api/quotations', 'POST', { data: { cid: 'C1', createdBy: 'forged',
    companySnapshot: { name: 'FORGED_COMPANY' }, items: [{ pid: p.id, cfg, sub: 1, base: 1,
      name: 'FORGED_PRODUCT', notes: 'PHASE4_REVIEW_ITEM_NOTE', sp: ['FORGED_SPECIFICATION'],
      fieldSnapshot: [{ k: 'privateMemo', l: 'Leaked field', t: 'txt', show_on_customer_pdf: true }] }] } }, 201);
  assert.equal(quote.data.items[0].sub, expected.sub);
  assert.equal(quote.data.items[0].name, p.name);
  assert.notEqual(quote.data.createdBy, 'forged');
  assert.notEqual(quote.data.companySnapshot.name, 'FORGED_COMPANY');
  const saved = structuredClone(quote.data.items[0]);
  const pdf = (await request('/api/quotations/' + quote.data.id + '/pdf')).toString('latin1');
  for (const privateText of ['PHASE4_REVIEW_PRIVATE', 'PHASE4_REVIEW_ITEM_NOTE', 'FORGED_SPECIFICATION', 'Leaked field']) assert.ok(!pdf.includes(privateText));
  const forged = structuredClone(quote.data);
  forged.items[0].sub = 1; forged.items[0].base = 1;
  forged.items[0].fieldSnapshot = [{ k: 'privateMemo', l: 'FORGED_LEAK', t: 'txt', show_on_customer_pdf: true }];
  quote = await request('/api/quotations/' + quote.data.id, 'PUT', { version: quote.version, data: forged });
  assert.deepEqual(quote.data.items[0], saved);
});

test('Phase 4 review: template and pending-price tampering across batch and full-state APIs reject without writes', async t => {
  const { request } = await fixture(t);
  const initial = await request('/api/state');
  await request('/api/catalog/prepare', 'POST', { revision: initial.revision, apply: true });
  await manager(request, ['product.view', 'product.manage', 'pricing.view']);
  const before = await request('/api/state');
  const product = structuredClone(before.state.products.find(p => p.id === 'p13'));
  product.catalogTemplate.overrides = { ...product.catalogTemplate.overrides,
    finish: { k: product.catalogTemplate.map.finish || 'finish', l: 'Finish', t: 'sel',
      o: [['Unauthorized priced option', 'f', 1]], required: false } };
  await request('/api/changes', 'POST', { revision: before.revision, changes: [
    { collection: 'products', action: 'upsert', id: product.id, record: product },
  ] }, 403);
  const forged = structuredClone(before.state);
  forged.products.find(p => p.id === 'p13').priceConfigured = true;
  await request('/api/state', 'PUT', { revision: before.revision, state: forged }, 403);
  const after = await request('/api/state');
  assert.equal(after.revision, before.revision); assert.deepEqual(after.state, before.state);
});

test('Phase 4 review: product-specific required fields cannot be weakened through product or full-state writes', async t => {
  const { request } = await fixture(t), initial = await request('/api/state');
  await request('/api/catalog/prepare', 'POST', { revision: initial.revision, apply: true });
  const product = await request('/api/products/p16'), before = await request('/api/state');
  assert.equal(product.data.code, 'GD-CT');
  for (const mutate of [
    field => { field.t = 'txt'; delete field.integer; delete field.min; delete field.max; },
    field => { field.required = false; },
    field => { field.integer = false; },
    field => { field.min = 0; },
    field => { field.when = { key: 'qty', equals: 0 }; },
  ]) {
    const changed = structuredClone(product.data); mutate(changed.f.find(field => field.k === 'pageCount'));
    await request('/api/products/' + changed.id, 'PUT', { version: product.version, data: changed }, 422);
    const full = structuredClone(before.state); full.products[full.products.findIndex(value => value.id === changed.id)] = changed;
    await request('/api/state', 'PUT', { revision: before.revision, state: full }, 422);
  }
  const after = await request('/api/state');
  assert.equal(after.revision, before.revision); assert.deepEqual(after.state, before.state);
});

test('Phase 4 review: legacy invalid catalogue master data blocks new pricing and duplicates while historical snapshots remain editable', async t => {
  const { request, app } = await fixture(t), initial = await request('/api/state');
  await request('/api/catalog/prepare', 'POST', { revision: initial.revision, apply: true });
  let product = await request('/api/products/p16');
  const state = (await request('/api/state')).state, effective = DP.resolveProduct(product.data, state.set);
  for (const field of effective.f.filter(field => ['sel', 'multi'].includes(field.t))) {
    const label = 'Synthetic review choice';
    field.o = [[label, 'f', 0]]; field.optionMeta = { [label]: { enabled: true, approved: true } };
  }
  Object.assign(effective, { rate: 1, tax: 18, priceConfigured: true, on: 1 });
  product = await request('/api/products/p16', 'PUT', { version: product.version, data: DP.stripProduct(effective, state.set) });
  const cfg = { ...DP.defCfg(DP.resolveProduct(product.data, state.set)), pageCount: 8, qty: 2 };
  const quote = await request('/api/quotations', 'POST', { data: { cid: 'C1', items: [{ pid: product.data.id, cfg }] } }, 201);
  const snapshot = structuredClone(quote.data.items), corrupted = structuredClone(product.data);
  const badField = corrupted.f.find(field => field.k === 'pageCount');
  Object.assign(badField, { t: 'txt', required: false });
  for (const key of ['min', 'max', 'integer']) delete badField[key];
  // Simulate a legacy persisted invalid definition, without weakening public write validation.
  await app.store.db.prepare('UPDATE products SET body=? WHERE id=?').run(JSON.stringify(corrupted), corrupted.id);
  const before = await request('/api/state'), sequences = await app.store.db.prepare('SELECT * FROM quote_sequences ORDER BY year').all();
  await request('/api/pricing/calculate', 'POST', { productId: product.data.id, cfg: { ...cfg, pageCount: 'arbitrary text' } }, 422);
  await request('/api/quotations', 'POST', { data: { cid: 'C1', items: [{ pid: product.data.id, cfg: { ...cfg, pageCount: 'arbitrary text' } }] } }, 422);
  await request('/api/quotations/' + quote.data.id + '/duplicate', 'POST', { version: quote.version }, 422);
  assert.equal((await request('/api/state')).revision, before.revision);
  assert.deepEqual(await app.store.db.prepare('SELECT * FROM quote_sequences ORDER BY year').all(), sequences);
  const edited = await request('/api/quotations/' + quote.data.id, 'PATCH', { version: quote.version, data: { subject: 'Historical snapshot still available' } });
  assert.deepEqual(edited.data.items, snapshot);
  assert.deepEqual((await request('/api/products/' + corrupted.id)).data, corrupted);
  assert.ok((await request('/api/quotations/' + quote.data.id + '/pdf')).subarray(0, 4).equals(Buffer.from('%PDF')));
});
