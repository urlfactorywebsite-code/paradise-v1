'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createApp } = require('../server');
const { testDatabase } = require('./database-helper');
const DP = require('../shared/domain');

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
  assert.equal(response.status, expected, `${method} ${route}: ${Buffer.isBuffer(value) ? 'binary document' : JSON.stringify(value)}`);
  return value;
 }
 await request('/api/auth/setup', 'POST', { name: 'Phase Three Admin', username: 'phase3admin', password: 'Fixture-' + crypto.randomUUID(), demo: true }, 201);
 // Establish the existing normalizer's defaults/snapshots before comparing
 // Phase 3 changes with historical persisted records.
 const initial = await request('/api/state');
 await request('/api/state', 'PUT', { revision: initial.revision, state: initial.state });
 return { request, app, database };
}
const templateRoute = '/api/configuration-templates/promotional-gift';
async function setup(request, id) {
 const old = await request('/api/products/' + id), template = (await request(templateRoute)).data;
 return request('/api/products/' + id, 'PUT', { version: old.version, data: DP.phase3Product(old.data, template) });
}
function approveLocations(p) {
 const locations = p.f.find(f => f.k === 'printLocations');
 for (const [key, basis, rate] of [['Front', 'u', 3], ['Back', 'f', 11], ['Sleeve', 'q', 2]]) {
  const option = locations.o.find(o => o[0] === key);
  option[1] = basis; option[2] = rate;
  Object.assign(locations.optionMeta[key], { enabled: true, approved: true });
 }
 return p;
}
const shirtConfig = p => ({ ...DP.defCfg(p), sz: { S: 10 }, qty: 10, printLocations: ['Front', 'Back'], designRequirements: 'P3-ARTWORK-CUSTOMER', note: 'P3-PRIVATE-INTERNAL' });

test('Phase 3 HTTP A: dynamic T-shirt sizes and configured print locations are validated and backend-priced', async t => {
 const { request } = await fixture(t), historical = (await request('/api/quotations/Q3')).data;
 let p = await setup(request, 'p7');
 assert.equal(p.data.f.filter(f => f.t === 'SIZE_BREAKDOWN').length, 1);
 assert.ok(p.data.f.find(f => f.k === 'printLocations').o.some(o => o[0] === 'Neck Label'));
 await request('/api/pricing/calculate', 'POST', { productId: 'p7', cfg: shirtConfig(p.data) }, 422);
 const draft = approveLocations(structuredClone(p.data)), sizes = draft.f.find(f => f.t === 'SIZE_BREAKDOWN');
 sizes.sizes.push({ key: 'kids_custom', label: 'Kids 6-8', enabled: true, price: 2 });
 sizes.sizes.find(s => s.key === 'XXL').enabled = false;
 p = await request('/api/products/p7', 'PUT', { version: p.version, data: draft });
 const cfg = { ...shirtConfig(p.data), sz: { S: 10, kids_custom: 2 }, qty: 12 };
 const priced = await request('/api/pricing/calculate', 'POST', { productId: 'p7', cfg });
 assert.equal(priced.qty, 12);
 assert.equal(priced.sub, 12 * 26000 + 2 * 200 + 12 * 300 + 1100);
 assert.equal(priced.L.filter(row => row[0].startsWith('Print Locations:')).length, 2);
 const mismatched = { ...cfg, qty: 999 };
 await request('/api/pricing/calculate', 'POST', { productId: 'p7', cfg: mismatched }, 422);
 await request('/api/quotations/preview', 'POST', { cid: 'C1', items: [{ pid: 'p7', cfg: mismatched }] }, 422);
 await request('/api/quotations', 'POST', { data: { cid: 'C1', items: [{ pid: 'p7', cfg: mismatched }] } }, 422);
 for (const invalid of [{ S: -1 }, { S: 1.5 }, { unknown: 0 }, { XXL: 0 }, { S: 0 }]) {
  await request('/api/pricing/calculate', 'POST', { productId: 'p7', cfg: { ...cfg, sz: invalid } }, 422);
 }
 for (const invalid of [['Front', 'Front'], ['1 Location'], ['Unknown'], []]) {
  await request('/api/pricing/calculate', 'POST', { productId: 'p7', cfg: { ...cfg, printLocations: invalid } }, 422);
 }
 const preview = await request('/api/quotations/preview', 'POST', { cid: 'C1', items: [{ pid: 'p7', cfg }] });
 const saved = await request('/api/quotations', 'POST', { data: { cid: 'C1', items: [{ id: 'shirt-line', pid: 'p7', cfg, sub: 1, base: 1, fieldSnapshot: [{ k: 'note', l: 'Public forged note', t: 'txt', show_on_customer_pdf: true }] }] } }, 201);
 assert.equal(saved.data.items[0].sub, priced.sub);
 assert.equal(saved.data.items[0].qty, 12);
 assert.equal(saved.data.items[0].cfg.designRequirements, cfg.designRequirements);
 assert.equal(DP.totals(saved.data).grand, preview.totals.grand);
 const content = (await request('/api/quotations/' + saved.data.id + '/pdf')).toString('latin1');
 assert.ok(content.includes('P3-ARTWORK-CUSTOMER')); assert.ok(content.includes('Kids 6-8'));
 assert.ok(!content.includes('P3-PRIVATE-INTERNAL')); assert.ok(!content.includes('Public forged note'));
 const edited = await request('/api/quotations/' + saved.data.id, 'PATCH', { version: saved.version, data: { items: [{ id: 'shirt-line', pid: 'p7', cfg: { ...cfg, designRequirements: 'P3-EDITED-ARTWORK', printLocations: ['Front', 'Sleeve'] } }] } });
 assert.equal(edited.data.items[0].cfg.designRequirements, 'P3-EDITED-ARTWORK');
 assert.equal(edited.data.items[0].sub, 12 * 26000 + 2 * 200 + 12 * 500);
 const constrained = structuredClone(p.data), locationField = constrained.f.find(f => f.k === 'printLocations');
 locationField.minSelections = 2; locationField.maxSelections = 2;
 p = await request('/api/products/p7', 'PUT', { version: p.version, data: constrained });
 for (const choices of [['Front'], ['Front', 'Back', 'Sleeve']]) await request('/api/pricing/calculate', 'POST', { productId: 'p7', cfg: { ...cfg, printLocations: choices } }, 422);
 await request('/api/pricing/calculate', 'POST', { productId: 'p7', cfg });
 assert.deepEqual((await request('/api/quotations/Q3')).data, historical);
 assert.ok((await request('/api/quotations/Q3/pdf')).toString('latin1').includes('1 Location'));
});

test('Phase 3 HTTP B: Logo additional requirements persist and do not change package prices', async t => {
 const { request } = await fixture(t), before = (await request('/api/products/p2')).data;
 const oldPrice = DP.calc(before, DP.defCfg(before)).sub, p = await setup(request, 'p2');
 const cfg = { ...DP.defCfg(p.data), additionalRequirements: 'P3-LOGO-REQUIREMENTS', note: 'P3-LOGO-PRIVATE' };
 const saved = await request('/api/quotations', 'POST', { data: { cid: 'C1', items: [{ id: 'logo-line', pid: 'p2', cfg }] } }, 201);
 assert.equal(saved.data.items[0].sub, oldPrice);
 assert.equal((await request('/api/quotations/' + saved.data.id)).data.items[0].cfg.additionalRequirements, cfg.additionalRequirements);
 const visible = (await request('/api/quotations/' + saved.data.id + '/pdf')).toString('latin1');
 assert.ok(visible.includes('P3-LOGO-REQUIREMENTS')); assert.ok(!visible.includes('P3-LOGO-PRIVATE'));
 const draft = structuredClone(p.data); draft.f.find(f => f.k === 'additionalRequirements').show_on_customer_pdf = false;
 await request('/api/products/p2', 'PUT', { version: p.version, data: draft });
 assert.equal((await request('/api/quotations/' + saved.data.id)).data.items[0].sub, oldPrice);
 const hidden = await request('/api/quotations', 'POST', { data: { cid: 'C1', items: [{ pid: 'p2', cfg }] } }, 201);
 assert.ok(!(await request('/api/quotations/' + hidden.data.id + '/pdf')).toString('latin1').includes('P3-LOGO-REQUIREMENTS'));
});

test('Phase 3 HTTP C/D: all five gifts inherit once, preserve existing rates and restore artwork selections', async t => {
 const { request } = await fixture(t), oldQuotes = (await request('/api/state')).state.quotes;
 const beforeCatalog = await request('/api/catalog'), template = (await request(templateRoute)).data;
 for (const id of ['p8', 'p9', 'p10', 'p11', 'p12']) {
  const old = beforeCatalog.products.find(p => p.id === id), oldConfig = DP.defCfg(old), oldPrice = DP.calc(old, oldConfig).sub;
  let p = await setup(request, id), effective = DP.resolveGiftProduct(p.data, template);
  assert.deepEqual(p.data.f, old.f, `${old.name}: existing field definitions/prices retained`);
  assert.equal(new Set(effective.f.map(f => f.k)).size, effective.f.length);
  for (const semantic of template.f.map(f => f.k)) {
   const mapped = p.data.giftTemplate.map[semantic] || semantic;
   assert.equal(effective.f.filter(f => f.k === mapped).length, 1, `${old.name}: ${semantic}`);
  }
  assert.equal(DP.calc(effective, DP.defCfg(effective)).sub, oldPrice);
  if (id === 'p10') assert.equal(p.data.giftTemplate.map.model, 'type');
  if (id === 'p11') assert.equal(p.data.giftTemplate.map.model, 'stand');
  const cfg = { ...DP.defCfg(effective), artwork: 'P3-GIFT-ARTWORK-' + id };
  const saved = await request('/api/quotations', 'POST', { data: { cid: 'C1', items: [{ id: 'gift-line-' + id, pid: id, cfg }] } }, 201);
  assert.equal(saved.data.items[0].sub, oldPrice);
  assert.equal((await request('/api/quotations/' + saved.data.id)).data.items[0].cfg.artwork, cfg.artwork);
  assert.ok((await request('/api/quotations/' + saved.data.id + '/pdf')).toString('latin1').includes(cfg.artwork));
  p = await request('/api/products/' + id, 'PUT', { version: p.version, data: DP.phase3Product(p.data, template) });
  assert.equal(DP.resolveGiftProduct(p.data, template).f.length, effective.f.length);
 }
 const after = await request('/api/catalog');
 assert.ok(after.giftTemplate); assert.equal(after.products.filter(p => p.giftTemplate).length, 5);
 for (const product of beforeCatalog.products.filter(p => !['p8', 'p9', 'p10', 'p11', 'p12'].includes(p.id))) assert.deepEqual(after.products.find(p => p.id === product.id), product);
 for (const historical of oldQuotes) assert.deepEqual((await request('/api/quotations/' + historical.id)).data, historical);
 assert.equal((await request('/api/ready')).schemaVersion, 6);
});

test('Phase 3 HTTP D: shared definitions propagate, product overrides/disable persist and saved price snapshots remain stable', async t => {
 const { request } = await fixture(t);
 let paper = await setup(request, 'p8'); await setup(request, 'p9');
 let shared = await request(templateRoute), draft = structuredClone(shared.data);
 const color = draft.f.find(f => f.k === 'color');
 Object.assign(color, { t: 'sel', required: false, o: [['Blue', 'u', 2], ['Red', 'f', 5]], optionMeta: { Blue: { enabled: true, approved: true }, Red: { enabled: true, approved: true } } });
 shared = await request(templateRoute, 'PUT', { revision: shared.revision, data: draft });
 for (const id of ['p8', 'p9']) {
  const raw = (await request('/api/products/' + id)).data, effective = DP.resolveGiftProduct(raw, shared.data);
  assert.equal(effective.f.find(f => f.k === 'color').t, 'sel');
  const cfg = { ...DP.defCfg(effective), color: 'Blue' };
  const result = await request('/api/pricing/calculate', 'POST', { productId: id, cfg });
  assert.equal(result.sub, DP.calc(effective, { ...cfg, color: '' }).sub + cfg.qty * 200);
 }
 paper = await request('/api/products/p8'); draft = structuredClone(paper.data);
 draft.giftTemplate.overrides.color = { ...structuredClone(shared.data.f.find(f => f.k === 'color')), l: 'Bag Colour', o: [['Blue', 'u', 4]], optionMeta: { Blue: { enabled: true, approved: true } } };
 draft.giftTemplate.disabled.push('packaging');
 draft.f.push({ k: 'bagHandle', l: 'Handle instructions', t: 'txt', show_on_customer_pdf: true });
 paper = await request('/api/products/p8', 'PUT', { version: paper.version, data: draft });
 let effective = DP.resolveGiftProduct(paper.data, shared.data);
 assert.equal(effective.f.find(f => f.k === 'color').l, 'Bag Colour');
 assert.ok(!effective.f.some(f => f.k === 'packaging'));
 const cfg = { ...DP.defCfg(effective), color: 'Blue', bagHandle: 'P3-HANDLE-REFERENCE', artwork: 'P3-SNAPSHOT-ARTWORK' };
 const saved = await request('/api/quotations', 'POST', { data: { cid: 'C1', items: [{ pid: 'p8', cfg }] } }, 201);
 shared = await request(templateRoute); draft = structuredClone(shared.data);
 draft.f.find(f => f.k === 'artwork').l = 'Changed after quotation';
 draft.f.find(f => f.k === 'color').o[0][2] = 9;
 await request(templateRoute, 'PUT', { revision: shared.revision, data: draft });
 const retained = await request('/api/quotations/' + saved.data.id, 'PATCH', { version: saved.version, data: { subject: 'Snapshot preserved' } });
 assert.deepEqual(retained.data.items, saved.data.items);
 const pdf = (await request('/api/quotations/' + saved.data.id + '/pdf')).toString('latin1');
 assert.ok(pdf.includes('P3-SNAPSHOT-ARTWORK')); assert.ok(!pdf.includes('Changed after quotation'));
 const duplicate = await request('/api/quotations/' + saved.data.id + '/duplicate', 'POST', { version: retained.version }, 201);
 const currentState=(await request('/api/state')).state,currentProduct=DP.resolveProduct(currentState.products.find(p=>p.id==='p8'),currentState.set);
 assert.equal(duplicate.data.items[0].sub,DP.calc(currentProduct,cfg).sub);
 assert.deepEqual((await request('/api/quotations/'+saved.data.id)).data.items,saved.data.items);
});

test('Phase 3 HTTP E: template/override conflicts, invalid definitions and stale updates are atomic', async t => {
 const { request } = await fixture(t), p = await setup(request, 'p10'), shared = await request(templateRoute);
 for (const mutate of [
  x => { x.giftTemplate.id = 'circular-template'; },
  x => { x.giftTemplate.map.material = 'type'; },
  x => { x.giftTemplate.disabled = ['missing']; },
  x => { x.giftTemplate.overrides.color = { k: 'type', l: 'Conflicting key' }; },
  x => { x.phase3LegacyFields = {}; },
  x => { x.phase3LegacyFields = [null]; },
 ]) {
  const bad = structuredClone(p.data); mutate(bad);
  await request('/api/products/p10', 'PUT', { version: p.version, data: bad }, 422);
 }
 for (const mutate of [
  x => { x.id = 'wrong'; },
  x => { x.f.push(structuredClone(x.f[0])); },
  x => { x.f = [null]; },
  x => { x.f.find(f => f.k === 'artwork').when = { key: 'artwork', equals: 'cycle' }; },
 ]) {
  const bad = structuredClone(shared.data); mutate(bad);
  await request(templateRoute, 'PUT', { revision: shared.revision, data: bad }, 422);
 }
 const changed = structuredClone(shared.data); changed.f.find(f => f.k === 'artwork').l = 'Customer Artwork';
 await request(templateRoute, 'PUT', { revision: shared.revision, data: changed });
 await request(templateRoute, 'PUT', { revision: shared.revision, data: shared.data }, 409);
 assert.deepEqual((await request('/api/products/p10')).data, p.data);
});

test('Phase 3 HTTP E: product/template rates retain catalog and pricing authorization', async t => {
 const { request } = await fixture(t); let p = await setup(request, 'p7'), gift = await setup(request, 'p8'), shared = await request(templateRoute);
 const approvedTemplate = structuredClone(shared.data);
 Object.assign(approvedTemplate.f.find(f => f.k === 'color'), { t: 'sel', o: [['Blue', 'u', 2]], optionMeta: { Blue: { enabled: true, approved: true } } });
 shared = await request(templateRoute, 'PUT', { revision: shared.revision, data: approvedTemplate });
 const password = 'Access-' + crypto.randomUUID();
 await request('/api/users', 'POST', { name: 'Phase 3 catalog', username: 'phase3catalog', password, role: 'Employee', permissions: ['product.view', 'product.manage'] }, 201);
 await request('/api/users', 'POST', { name: 'Phase 3 pricing', username: 'phase3pricing', password, role: 'Employee', permissions: ['product.view', 'pricing.view', 'pricing.manage'] }, 201);
 await request('/api/users', 'POST', { name: 'Phase 3 employee', username: 'phase3employee', password, role: 'Employee', permissions: ['product.view'] }, 201);
 await request('/api/auth/login', 'POST', { username: 'phase3catalog', password });
 const rateChange = approveLocations(structuredClone(p.data));
 await request('/api/products/p7', 'PUT', { version: p.version, data: rateChange }, 403);
 let draft = structuredClone(shared.data); draft.f.find(f => f.k === 'color').o[0][2] = 3;
 await request(templateRoute, 'PUT', { revision: shared.revision, data: draft }, 403);
 const giftChange = structuredClone(gift.data);
 giftChange.giftTemplate.overrides.color = { ...structuredClone(shared.data.f.find(f => f.k === 'color')), o: [['Blue', 'u', 4]], optionMeta: { Blue: { enabled: true, approved: true } } };
 await request('/api/products/p8', 'PUT', { version: gift.version, data: giftChange }, 403);
 const workspace = await request('/api/state'), forgedSettings = structuredClone(workspace.state.set);
 forgedSettings.giftTemplate = draft;
 await request('/api/changes', 'POST', { revision: workspace.revision, changes: [{ collection: 'set', action: 'upsert', id: 'company', record: forgedSettings }] }, 403);
 draft = structuredClone(shared.data); draft.f.find(f => f.k === 'artwork').l = 'Catalog-managed Artwork';
 shared = await request(templateRoute, 'PUT', { revision: shared.revision, data: draft });
 await request('/api/auth/login', 'POST', { username: 'phase3pricing', password });
 shared = await request(templateRoute);
 draft = structuredClone(shared.data); draft.f.find(f => f.k === 'color').o[0][2] = 3;
 shared = await request(templateRoute, 'PUT', { revision: shared.revision, data: draft });
 assert.equal(shared.data.f.find(f => f.k === 'color').o[0][2], 3);
 draft = structuredClone(shared.data); draft.f.find(f => f.k === 'artwork').l = 'Forbidden pricing rename';
 await request(templateRoute, 'PUT', { revision: shared.revision, data: draft }, 403);
 await request('/api/auth/login', 'POST', { username: 'phase3employee', password });
 await request(templateRoute, 'PUT', { revision: shared.revision, data: shared.data }, 403);
 await request('/api/products/p7', 'PUT', { version: p.version, data: rateChange }, 403);
});

test('Phase 3 HTTP C/E: custom gift colour requires an Admin-approved explicit charge', async t => {
 const { request } = await fixture(t); await setup(request, 'p8');
 let shared = await request(templateRoute), template = structuredClone(shared.data), color = template.f.find(f => f.k === 'color');
 color.allowCustom = true; color.customCharge = { type: 'u', amount: null, approved: false };
 shared = await request(templateRoute, 'PUT', { revision: shared.revision, data: template });
 let raw = (await request('/api/products/p8')).data, effective = DP.resolveGiftProduct(raw, shared.data), cfg = { ...DP.defCfg(effective), color: 'Customer-specific teal' };
 await request('/api/pricing/calculate', 'POST', { productId: 'p8', cfg }, 422);
 template = structuredClone(shared.data); template.f.find(f => f.k === 'color').customCharge = { type: 'u', amount: 2, approved: true };
 shared = await request(templateRoute, 'PUT', { revision: shared.revision, data: template });
 effective = DP.resolveGiftProduct(raw, shared.data);
 const priced = await request('/api/pricing/calculate', 'POST', { productId: 'p8', cfg });
 assert.equal(priced.sub, DP.calc(effective, { ...cfg, color: '' }).sub + cfg.qty * 200);
 const saved = await request('/api/quotations', 'POST', { data: { cid: 'C1', items: [{ pid: 'p8', cfg }] } }, 201);
 assert.equal(saved.data.items[0].cfg.color, 'Customer-specific teal');
 assert.ok((await request('/api/quotations/' + saved.data.id + '/pdf')).toString('latin1').includes('Customer-specific teal'));
});
