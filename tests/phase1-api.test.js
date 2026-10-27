'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../server');
const { connectDatabase } = require('../server/database');
const { createStore } = require('../server/store');
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
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  if (data.csrfToken) csrf = data.csrfToken;
  assert.equal(response.status, expected, `${method} ${route}: ${Buffer.isBuffer(data) ? 'binary PDF' : JSON.stringify(data)}`);
  return data;
 }
 await request('/api/auth/setup', 'POST', { name: 'Phase One Admin', username: 'phaseadmin', password: 'Fixture-' + crypto.randomUUID(), demo: true }, 201);
 return { request, app, database };
}
function definition() {
 return { id: 'phase-product', code: 'PHASE-ONE', name: 'Configurable uniforms', cat: 'c3', on: 1, m: 'unit', rate: 10, tax: 18, minQty: 1, f: [
  { k: 'material', l: 'Material', t: 'sel', o: [['Cotton','f',0],['Polyester','f',0]] },
  { k: 'method', l: 'Method', t: 'sel', o: [['DTF','f',0],['Sublimation','f',0]] },
  { k: 'details', l: 'Design Requirements', t: 'txt', show_on_customer_pdf: true, when: { mode: 'ALL', conditions: [
   { key: 'material', operator: 'equals', value: 'Cotton' }, { key: 'method', operator: 'not_equals', value: 'Sublimation' },
  ] } },
  { k: 'sizes', l: 'Sizes', t: 'SIZE_BREAKDOWN', sizes: [
   { key: 'XS', label: 'Extra Small', enabled: true, price: 0 },
   { key: 'kids', label: 'Kids 6-8 years', enabled: true, price: 2 },
   { key: 'old', label: 'Retired size', enabled: false, price: 0 },
  ], show_on_customer_pdf: true },
  { k: 'extras', l: 'Extras', t: 'multi', required: false, o: [['Box','u',1],['Ribbon','f',2]], show_on_customer_pdf: true },
  { k: 'internalNotes', l: 'Internal notes', t: 'txt', internal_only: true, show_on_customer_pdf: true },
 ] };
}
const config = () => ({ qty: 99, material: 'Cotton', method: 'DTF', details: 'Customer artwork reference', sizes: { XS: 3, kids: 2 }, extras: ['Box','Ribbon'], internalNotes: 'SECRET-PHASE-ONE' });

test('review: malformed catalog updates return 422 and size prices retain separate authorization', async t => {
 const {request}=await fixture(t),created=await request('/api/products','POST',{data:definition()},201);
 for(const size of [null,3,[],false]){
  const bad=structuredClone(created.data);bad.f.find(f=>f.t==='SIZE_BREAKDOWN').sizes=[size];
  await request('/api/products/'+created.data.id,'PATCH',{version:created.version,data:{f:bad.f}},422);
 }
 const password='Review-'+crypto.randomUUID();
 await request('/api/users','POST',{name:'Pricing reviewer',username:'pricingreview',password,role:'Employee',permissions:['product.view','pricing.view','pricing.manage']},201);
 await request('/api/auth/login','POST',{username:'pricingreview',password});
 const changed=structuredClone(created.data);changed.f.find(f=>f.t==='SIZE_BREAKDOWN').sizes[0].price=3;
 const updated=await request('/api/products/'+created.data.id,'PATCH',{version:created.version,data:{f:changed.f}});
 assert.equal(updated.data.f.find(f=>f.t==='SIZE_BREAKDOWN').sizes[0].price,3);
 changed.f.find(f=>f.k==='details').show_on_customer_pdf=false;
 await request('/api/products/'+created.data.id,'PATCH',{version:updated.version,data:{f:changed.f}},403);
});

test('review: HTTP PDF creation and unchanged saves cannot forge camel-case internal field visibility',async t=>{
 const {request}=await fixture(t),p=definition();
 p.f.push({k:'confidential',l:'InternalNotes',t:'txt',show_on_customer_pdf:true});
 await request('/api/products','POST',{data:p},201);
 const input={pid:p.id,id:'private-line',cfg:{...config(),confidential:'SECRET-REVIEW-LABEL'},sp:['Public: SECRET-REVIEW-LABEL'],fieldSnapshot:[{k:'confidential',l:'Public',t:'txt',show_on_customer_pdf:true}]};
 let q=await request('/api/quotations','POST',{data:{cid:'C1',items:[input]}},201);
 let pdf=await request('/api/quotations/'+q.data.id+'/pdf');
 assert.ok(!pdf.toString('latin1').includes('SECRET-REVIEW-LABEL'));
 const item=structuredClone(q.data.items[0]);item.sp=input.sp;item.fieldSnapshot=input.fieldSnapshot;
 q=await request('/api/quotations/'+q.data.id,'PATCH',{version:q.version,data:{items:[item]}});
 pdf=await request('/api/quotations/'+q.data.id+'/pdf');
 assert.ok(!pdf.toString('latin1').includes('SECRET-REVIEW-LABEL'));
 assert.equal(q.data.items[0].fieldSnapshot.at(-1).l,'InternalNotes');
});

test('Phase 1 HTTP catalog, pricing, preview, create, edit, snapshot, duplicate, PDF and reprice integration', async t => {
 const f = await fixture(t), request = f.request;
 const p = await request('/api/products', 'POST', { data: definition() }, 201);
 assert.equal(p.data.f.find(field => field.k === 'details').when.mode, 'ALL');
 const calculated = await request('/api/pricing/calculate', 'POST', { productId: p.data.id, cfg: config() });
 assert.equal(calculated.qty, 5); assert.equal(calculated.sub, 6100);
 const quote = { cid: 'C1', items: [{ id: 'phase-line', pid: p.data.id, cfg: config(), notes: 'PRIVATE-ITEM-NOTES' }] };
 const preview = await request('/api/quotations/preview', 'POST', quote);
 assert.equal(preview.quotation.items[0].qty, 5);
 const created = await request('/api/quotations', 'POST', { data: quote }, 201);
 let saved = await request('/api/quotations/' + created.data.id);
 assert.deepEqual(saved.data.items[0].cfg.sizes, { XS: 3, kids: 2 });
 assert.ok(saved.data.items[0].fieldSnapshot);
 const updatedConfig = { ...config(), sizes: { XS: 2, kids: 5 } };
 await request('/api/quotations/' + created.data.id, 'PATCH', { version: saved.version, data: { items: [{ id: 'phase-line', pid: p.data.id, cfg: updatedConfig }] } });
 saved = await request('/api/quotations/' + created.data.id);
 assert.equal(saved.data.items[0].qty, 7); assert.deepEqual(saved.data.items[0].cfg.sizes, { XS: 2, kids: 5 });
 const snapshot = structuredClone(saved.data.items[0]);
 const pdf = await request('/api/quotations/' + created.data.id + '/pdf');
 const content = pdf.toString('latin1');
 assert.ok(content.includes('Design Requirements')); assert.ok(content.includes('Customer artwork reference'));
 assert.ok(!content.includes('SECRET-PHASE-ONE')); assert.ok(!content.includes('PRIVATE-ITEM-NOTES'));
 const changed = structuredClone(p.data); changed.rate = 20; changed.f.find(field => field.k === 'details').show_on_customer_pdf = false;
 changed.f.find(field => field.k === 'sizes').sizes.find(size => size.key === 'kids').enabled = false;
 await request('/api/products/' + p.data.id, 'PUT', { version: p.version, data: changed });
 saved = await request('/api/quotations/' + created.data.id);
 await request('/api/quotations/' + created.data.id, 'PATCH', { version: saved.version, data: { subject: 'Preserve historical selections' } });
 saved = await request('/api/quotations/' + created.data.id);
 assert.deepEqual(saved.data.items[0], snapshot);
 // A duplicate is a new quotation: retired size choices cannot be newly quoted.
 await request('/api/quotations/' + created.data.id + '/duplicate', 'POST', { version: saved.version }, 422);
 assert.deepEqual((await request('/api/quotations/'+created.data.id)).data.items[0],snapshot);
 await request('/api/quotations/' + created.data.id + '/reprice', 'POST', { version: saved.version }, 422);
});

test('Phase 1 HTTP rejects invalid definitions and sizes through all shared validation entry points', async t => {
 const { request } = await fixture(t);
 const invalid = definition(); invalid.f[2].when.conditions[0].key = 'missing';
 await request('/api/products', 'POST', { data: invalid }, 422);
 const circular = definition(); circular.f[0].when = { key: 'details', equals: 'x' };
 await request('/api/products', 'POST', { data: circular }, 422);
 const p = await request('/api/products', 'POST', { data: definition() }, 201);
 for (const cfg of [null, [], 'invalid', { ...config(), sz: { unknown: -1 } }]) {
  await request('/api/pricing/calculate', 'POST', { productId: p.data.id, cfg }, 422);
 }
 // Non-applicable hidden dimensions are discarded; visible area inputs remain validated.
 const hiddenDimensions=await request('/api/pricing/calculate','POST',{productId:p.data.id,cfg:{...config(),w:{invalid:-1}}});
 assert.equal(hiddenDimensions.sub,6100);
 await request('/api/pricing/calculate','POST',{productId:'p5',cfg:{qty:1,w:{invalid:-1},h:3,u:'ft'}},422);
 for (const sizes of [{ XS: -1 }, { XS: 1.5 }, { unknown: 1 }, { old: 1 }, { XS: '3' }]) {
  const cfg = { ...config(), sizes };
  await request('/api/pricing/calculate', 'POST', { productId: p.data.id, cfg }, 422);
  await request('/api/quotations/preview', 'POST', { cid: 'C1', items: [{ pid: p.data.id, cfg }] }, 422);
  await request('/api/quotations', 'POST', { data: { cid: 'C1', items: [{ pid: p.data.id, cfg }] } }, 422);
 }
 const hidden = { ...config(), method: 'Sublimation', details: 'STALE-HIDDEN-CONTENT' };
 const created = await request('/api/quotations', 'POST', { data: { cid: 'C1', items: [{ pid: p.data.id, cfg: hidden }] } }, 201);
 assert.equal(created.data.items[0].cfg.details, undefined);
 assert.ok(!DP.customerSpecifications(created.data.items[0]).join(' ').includes('STALE-HIDDEN'));
 const state = await request('/api/state'), badProduct = structuredClone(p.data);
 badProduct.f[2].when.mode = 'INVALID';
 await request('/api/changes', 'POST', { revision: state.revision, changes: [{ collection: 'products', action: 'upsert', id: badProduct.id, record: badProduct }] }, 422);
 const replacement = structuredClone(state.state); replacement.products.find(product => product.id === p.data.id).f = badProduct.f;
 await request('/api/state', 'PUT', { revision: state.revision, state: replacement }, 422);
 assert.equal((await request('/api/state')).revision, state.revision);
});

test('migration 005 preserves v4 bodies, credentials, revisions and quantities and can be reapplied', async () => {
 const database = await testDatabase(), db = connectDatabase(database);
 try {
  await db.exec(fs.readFileSync(path.join(__dirname, '../server/schema.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname, '../server/migrations/004-access-whatsapp.sql'), 'utf8'));
  await db.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES(4,'legacy');");
  const state = DP.seed({ demo: true }), p = state.products.find(product => product.id === 'p7'), q = state.quotes[2], item = q.items[0];
  delete item.fieldSnapshot; // A real pre-Phase-1 item has no presentation metadata.
  await db.prepare('INSERT INTO users(id,name,username,password_hash,role) VALUES(?,?,?,?,?)').run('owner','Preserved User','owner','unchanged-hash','Administrator');
  await db.prepare('INSERT INTO workspace VALUES(1,?,?,1,?)').run(29, JSON.stringify(state.set), 'legacy');
  await db.prepare('INSERT INTO categories VALUES(?,?,?,?,?,?,?)').run('c3','Gifts',1,JSON.stringify(state.cats[2]),2,0,'legacy');
  await db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?)').run(p.id,p.cat,p.name,p.code,1,JSON.stringify(p),9,0,'legacy');
  await db.prepare('INSERT INTO customers VALUES(?,?,?,?,?,?,?,?)').run('C3','Preserved Customer','9000000003','',JSON.stringify(state.customers[2]),3,0,'legacy');
  const body = { ...q }; delete body.items; delete body.hist;
  await db.prepare('INSERT INTO quotations(id,number,customer_id,date,valid_until,status,salesperson,total,body,version,position,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(q.id,q.no,q.cid,q.date,q.valid,q.status,q.sales,DP.totals(q).grand,JSON.stringify(body),5,0,'legacy');
  await db.prepare('INSERT INTO quotation_items VALUES(?,?,?,?,?,?,?)').run(q.id,item.id,item.pid,item.qty,item.sub,JSON.stringify(item),0);
  const before = await db.prepare('SELECT body,version FROM products').get(), originalItem = await db.prepare('SELECT body,quantity,subtotal FROM quotation_items').get();
  const originalCustomer = await db.prepare('SELECT body,version FROM customers').get();
  const originalQuote = await db.prepare('SELECT body,version,total FROM quotations').get();
  const originalWorkspace = await db.prepare('SELECT settings,revision FROM workspace').get();
  await createStore(db);
  assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n, 6);
  assert.deepEqual(await db.prepare('SELECT body,version FROM products').get(), before);
  assert.deepEqual(await db.prepare('SELECT body,quantity,subtotal FROM quotation_items').get(), originalItem);
  assert.deepEqual(await db.prepare('SELECT body,version FROM customers').get(), originalCustomer);
  assert.deepEqual(await db.prepare('SELECT body,version,total FROM quotations').get(), originalQuote);
  assert.deepEqual(await db.prepare('SELECT settings,revision FROM workspace').get(), originalWorkspace);
  assert.equal((await db.prepare('SELECT password_hash FROM users').get()).password_hash, 'unchanged-hash');
  assert.equal((await db.prepare('SELECT revision FROM workspace').get()).revision, 29);
  await db.exec(fs.readFileSync(path.join(__dirname, '../server/migrations/005-product-configuration.sql'), 'utf8'));
  await createStore(db);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM schema_migrations WHERE version=5').get()).n, 1);
  const malformed = JSON.stringify({ ...p, f: [{ k: 'sizes', l: 'Sizes', t: 'SIZE_BREAKDOWN', sizes: [] }] });
  await assert.rejects(db.prepare('UPDATE products SET body=? WHERE id=?').run(malformed,p.id), /products_configuration_shape/);
  assert.deepEqual(await db.prepare('SELECT body,version FROM products').get(), before);
 } finally { await db.close(); await database.destroy(); }
});
