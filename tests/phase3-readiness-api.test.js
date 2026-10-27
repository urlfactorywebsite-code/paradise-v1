'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createApp } = require('../server');
const { testDatabase } = require('./database-helper');
const DP = require('../shared/domain');
const templateRoute = '/api/configuration-templates/promotional-gift';

async function fixture(t) {
 const database = await testDatabase(), app = await createApp(database);
 await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
 t.after(async () => { await app.close(); await database.destroy(); });
 const base = `http://127.0.0.1:${app.server.address().port}`;
 let cookie = '', csrf = '';
 async function request(route, method = 'GET', body, expected = 200) {
  const response = await fetch(base + route, { method, headers: {
   ...(cookie ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}),
   ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  const value = response.headers.get('content-type')?.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  if (value.csrfToken) csrf = value.csrfToken;
  assert.equal(response.status, expected, `${method} ${route}: ${Buffer.isBuffer(value) ? 'PDF' : JSON.stringify(value)}`);
  return value;
 }
 await request('/api/auth/setup', 'POST', { name: 'Readiness Admin', username: 'readinessadmin', password: 'Fixture-' + crypto.randomUUID(), demo: true }, 201);
 const initial = await request('/api/state');
 await request('/api/state', 'PUT', { revision: initial.revision, state: initial.state });
 return { request };
}

test('Phase 3 readiness HTTP: sparse custom size quantities ignore Object prototype names and explicit entries price normally', async t => {
 const { request } = await fixture(t), original = await request('/api/products/p7');
 const draft = DP.phase3Product(original.data), sizes = draft.f.find(f => f.t === 'SIZE_BREAKDOWN');
 for (const [key, label] of [['toString', 'Kids 6-8'], ['valueOf', 'Youth 10-12'], ['hasOwnProperty', 'Adult 3XL']]) sizes.sizes.push({ key, label, enabled: true, price: 2.03 });
 const locations = draft.f.find(f => f.k === 'printLocations');
 locations.o.find(o => o[0] === 'Front')[2] = 1.25;
 Object.assign(locations.optionMeta.Front, { enabled: true, approved: true });
 const product = await request('/api/products/p7', 'PUT', { version: original.version, data: draft });
 const sparse = { ...DP.defCfg(product.data), qty: 10, sz: { S: 10 }, printLocations: ['Front'], designRequirements: 'SPARSE-CUSTOM-SIZE-ARTWORK' };
 const price = await request('/api/pricing/calculate', 'POST', { productId: 'p7', cfg: sparse });
 assert.equal(price.qty, 10); assert.equal(price.base, 260000); assert.equal(price.sub, 261250);
 assert.ok(!price.L.some(row => /Kids 6-8|Youth 10-12|Adult 3XL/.test(row[0])));
 const preview = await request('/api/quotations/preview', 'POST', { cid: 'C1', items: [{ pid: 'p7', cfg: sparse }] });
 const saved = await request('/api/quotations', 'POST', { data: { cid: 'C1', items: [{ id: 'sparse-size-line', pid: 'p7', cfg: sparse, sub: 1, qty: 999 }] } }, 201);
 assert.equal(saved.data.items[0].qty, 10); assert.equal(saved.data.items[0].sub, price.sub);
 assert.deepEqual(saved.data.items[0].cfg.sz, { S: 10 });
 assert.equal(DP.totals(saved.data).grand, preview.totals.grand);
 const reopened = await request('/api/quotations/' + saved.data.id);
 assert.deepEqual(reopened.data.items[0], saved.data.items[0]);
 const pdf = (await request('/api/quotations/' + saved.data.id + '/pdf')).toString('latin1');
 assert.ok(pdf.includes('SPARSE-CUSTOM-SIZE-ARTWORK')); assert.ok(!pdf.includes('Kids 6-8'));
 const explicit = { ...sparse, sz: { S: 4, toString: 2, valueOf: 3, hasOwnProperty: 1 } };
 const charged = await request('/api/pricing/calculate', 'POST', { productId: 'p7', cfg: explicit });
 assert.equal(charged.qty, 10); assert.equal(charged.base, 260000); assert.equal(charged.sub, 262468);
 assert.equal(charged.L.filter(row => /Kids 6-8|Youth 10-12|Adult 3XL/.test(row[0])).length, 3);
 for (const key of ['__proto__', 'constructor', 'prototype']) {
  const invalid = { ...sparse, sz: JSON.parse(`{"S":10,"${key}":1}`) };
  await request('/api/pricing/calculate', 'POST', { productId: 'p7', cfg: invalid }, 422);
  await request('/api/quotations', 'POST', { data: { cid: 'C1', items: [{ pid: 'p7', cfg: invalid }] } }, 422);
 }
 for (const value of ['5', { quantity: 5 }, -1, 1.5]) await request('/api/pricing/calculate', 'POST', { productId: 'p7', cfg: { ...sparse, sz: { S: 10, toString: value } } }, 422);
 assert.deepEqual((await request('/api/quotations/' + saved.data.id)).data, saved.data);
});

test('Phase 3 readiness HTTP: inherited quantity references follow mapped keys and retain server pricing authority', async t => {
 const { request } = await fixture(t), original = await request(templateRoute), template = structuredClone(original.data);
 template.f[template.f.findIndex(f => f.k === 'model')] = { k: 'model', l: 'Product Model', t: 'num', min: 1, max: 100, integer: true, default: 2, required: true, show_on_customer_pdf: true };
 Object.assign(template.f.find(f => f.k === 'customization'), { required: true, o: [['Emboss', 'u', 2.5]], optionMeta: { Emboss: { enabled: true, approved: true, quantityKey: 'model' } } });
 const shared = await request(templateRoute, 'PUT', { revision: original.revision, data: template });
 const raw = { id: 'phase3-mapped-quantity', code: 'P3-MAPPED-QTY', name: 'Mapped quantity gift fixture', cat: 'c3', m: 'unit', rate: 10, tax: 18, on: 1, minQty: 1,
  f: [{ k: 'legacyQty', l: 'Legacy quantity', t: 'num', min: 1, max: 100, integer: true, default: 3, required: true }],
  giftTemplate: { id: 'promotional_gift', map: { model: 'legacyQty' }, disabled: [], overrides: {} } };
 const product = await request('/api/products', 'POST', { data: raw }, 201);
 const effective = DP.resolveGiftProduct(product.data, shared.data), config = { ...DP.defCfg(effective), qty: 10 };
 assert.equal(effective.f.find(f => f.k === 'customization').optionMeta.Emboss.quantityKey, 'legacyQty');
 const price = await request('/api/pricing/calculate', 'POST', { productId: raw.id, cfg: config });
 assert.equal(price.base, 10000); assert.equal(price.sub, 17500);
 const saved = await request('/api/quotations', 'POST', { data: { cid: 'C1', items: [{ pid: raw.id, cfg: config, sub: 1, base: 1, qty: 999, fieldSnapshot: [{ k: 'note', l: 'Public forged note', t: 'txt', show_on_customer_pdf: true }] }] } }, 201);
 assert.equal(saved.data.items[0].sub, 17500); assert.equal(saved.data.items[0].qty, 10);
 assert.equal(saved.data.items[0].fieldSnapshot.find(f => f.k === 'customization').optionMeta.Emboss.quantityKey, 'legacyQty');
 assert.ok(!saved.data.items[0].fieldSnapshot.some(f => f.l === 'Public forged note'));
 const malformed = structuredClone(product.data);
 malformed.giftTemplate.disabled = ['customization'];
 malformed.giftTemplate.overrides.customization = { ...effective.f.find(f => f.k === 'customization'), optionMeta: { Emboss: { enabled: true, approved: true, quantityKey: 'missingQuantity' } } };
 await request('/api/products/' + raw.id, 'PUT', { version: product.version, data: malformed }, 422);
 const password = 'Catalog-' + crypto.randomUUID();
 // This fixture inspects unchanged master rates: grant rate reads, never rate writes.
 await request('/api/users', 'POST', { name: 'Readiness Catalog', username: 'readinesscatalog', password, role: 'Employee', permissions: ['product.view', 'product.manage', 'pricing.view'] }, 201);
 await request('/api/auth/login', 'POST', { username: 'readinesscatalog', password });
 const before = await request('/api/state');
 const unauthorizedTemplate = structuredClone(shared.data);
 unauthorizedTemplate.f.find(f => f.k === 'customization').o[0][2] = 0;
 await request(templateRoute, 'PUT', { revision: before.revision, data: unauthorizedTemplate }, 403);
 const unauthorizedOverride = structuredClone(product.data);
 unauthorizedOverride.giftTemplate.overrides.customization = { ...effective.f.find(f => f.k === 'customization'), o: [['Emboss', 'u', 0]] };
 await request('/api/products/' + raw.id, 'PUT', { version: product.version, data: unauthorizedOverride }, 403);
 for (const marker of ['__templateRaw', '__templateBase']) await request('/api/products/' + raw.id, 'PATCH', { version: product.version, data: { [marker]: { ...raw, rate: 0 } } }, 422);
 assert.deepEqual((await request('/api/products/' + raw.id)).data, product.data);
 assert.equal((await request('/api/state')).revision, before.revision);
 assert.deepEqual((await request(templateRoute)).data, shared.data);
});
