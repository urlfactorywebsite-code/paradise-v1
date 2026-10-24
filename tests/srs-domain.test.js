'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DP = require('../shared/domain');
const { validateState, settings } = require('../server/validation');
const { authorizeChanges, scopeState } = require('../server/access');
const { quotationPdf } = require('../server/pdf');
const admin = { id: 'admin', name: 'Administrator', role: 'Administrator' };
const employee = { id: 'employee', name: 'Employee', role: 'Employee' };
const product = (m = 'unit', extra = {}) => ({ id: 'test-product', code: 'TEST', name: 'Test product', cat: 'c1', m, rate: 10, min: 0, minQty: 1, tax: 18, f: [], ...extra });
function baseState() {
  const state = DP.seed({ demo: false });
  state.customers.push({ id: 'customer', date: '2026-10-23', name: 'Customer', mob: '+919000000001', wa: '+449000000001', co: '', person: '', email: '', addr: '', gstin: '', notes: '', type: 'Individual', on: 1 });
  return validateState(state, state, admin, () => 'UNUSED');
}
const quotation = (state, extra = {}) => ({ id: 'quotation', cid: 'customer', date: '2026-10-23', valid: '2026-11-07', status: 'Draft', disc: { t: 'p', v: 0 }, del: 0, oth: 0, terms: [], items: [DP.mkItem(state.products[0], DP.defCfg(state.products[0]), 'line')], ...extra });
function save(state, q, user = admin) {
  const input = structuredClone(state); input.quotes = [q];
  return validateState(input, state, user, (date, prefix, start) => `${prefix}/${date.slice(0,4)}/${start}`);
}

test('all SRS catalog groups are present and unapproved additions cannot be quoted', () => {
  const seed = DP.seed({ demo: false });
  assert.equal(seed.cats.length, 3);
  assert.equal(seed.products.length, 40);
  for (const name of ['Envelope', 'ID Card & Lanyard', 'Custom Graphic Designs', 'LED Board', 'DTF Printing for Fabric & Leather', 'Gold / Silver Foil & Emboss Printing', 'Gazebo / Kiosk', 'Sublimation Gift Printing']) assert.ok(seed.products.some(p => p.name === name));
  assert.equal(seed.products.filter(p => p.on).length, 12);
  for (const p of seed.products.filter(p => !p.priceConfigured && !p.on)) assert.match(DP.calc(p, DP.defCfg(p)).err, /Approved pricing/);
  const state = baseState(); const input = structuredClone(state); input.products[12].on = 1;
  assert.throws(() => validateState(input, state, admin, () => ''), /approved pricing/);
});

test('all six pricing methods and all additional charge types use the shared engine', () => {
  assert.equal(DP.calc(product('fixed'), { qty: 5 }).sub, 1000);
  assert.equal(DP.calc(product('unit'), { qty: 5 }).sub, 5000);
  assert.equal(DP.calc(product('area'), { qty: 2, w: 4, h: 3, u: 'ft' }).sub, 24000);
  assert.equal(DP.calc(product('tier', { tiers: [[2, 9], [5, 7]] }), { qty: 5 }).sub, 3500);
  assert.equal(DP.calc(product('package'), { qty: 5 }).sub, 1000);
  const p = product('base', { f: [{ k: 'dim', l: 'Dimensions', t: 'dim' }], charges: [
    { label: 'Setup', type: 'f', amount: 2 }, { label: 'Per unit', type: 'u', amount: 3 },
    { label: 'Percentage', type: 'p', amount: 10 }, { label: 'Area', type: 'a', amount: 1 },
    { label: 'Quantity', type: 'q', amount: 4 }
  ] });
  const result = DP.calc(p, { qty: 2, w: 2, h: 3, u: 'ft' });
  assert.equal(result.err, null); assert.equal(result.sub, 3900);
  assert.equal(result.L.length, 6);
  assert.match(DP.calc(product('unit', { minQty: 10 }), { qty: 9 }).err, /Minimum/);
  assert.equal(DP.calc(product('unit', { min: 100 }), { qty: 1 }).base, 10000);
});

test('required, optional, default, numeric, conditional and compatible fields work together', () => {
  const p = product('unit', { f: [
    { k: 'material', l: 'Material', t: 'sel', o: [['Paper','f',0],['Fabric','u',1]], default: 'Paper' },
    { k: 'color', l: 'Colour', t: 'sel', o: [['White','f',0],['Black','f',0]], required: false },
    { k: 'reference', l: 'Artwork reference', t: 'txt', required: true, when: { key: 'material', equals: 'Fabric' } },
    { k: 'copies', l: 'Copies', t: 'num', min: 1, max: 5, integer: true, default: 2 }
  ], compatibility: [{ when: { key: 'material', equals: 'Fabric' }, field: 'color', allowed: ['Black'], message: 'Fabric requires black.' }] });
  assert.equal(DP.calc(p, { qty: 1 }).err, null);
  assert.match(DP.calc(p, { qty: 1, copies: 2.5 }).err, /numeric/);
  assert.match(DP.calc(p, { qty: 1, copies: 6 }).err, /numeric/);
  assert.match(DP.calc(p, { qty: 1, material: 'Fabric', color: 'White' }).err, /requires black/);
  assert.match(DP.calc(p, { qty: 1, material: 'Fabric', color: 'Black' }).err, /required/);
  assert.equal(DP.calc(p, { qty: 1, material: 'Fabric', color: 'Black', reference: 'Approved artwork' }).sub, 1100);
  assert.equal(DP.fieldVisible(p.f[2], { material: 'Paper' }), false);
  assert.equal(DP.defCfg(p).copies, 2);
});

test('inclusive and exempt tax treatments survive discounts and mixed-rate aggregation', () => {
  const inclusive = DP.mkItem(product('fixed', { rate: 118, taxMode: 'inclusive' }), { qty: 1 }, 'inclusive');
  const exclusive = DP.mkItem(product('fixed', { rate: 100 }), { qty: 1 }, 'exclusive');
  const exempt = DP.mkItem(product('fixed', { rate: 50, taxMode: 'exempt' }), { qty: 1 }, 'exempt');
  assert.equal(DP.calc(product('fixed', { rate: 118, taxMode: 'inclusive' }), { qty: 1 }).gst, 1800);
  const q = { items: [inclusive, exclusive, exempt], disc: { t: 'p', v: 10 }, del: 0, oth: 0, taxDisplay: 'igst' };
  const result = DP.totals(q);
  assert.equal(result.taxable, 22500); assert.equal(result.gst, 3240); assert.equal(result.grand, 25740);
  assert.equal(result.igst, 3240); assert.equal(result.cgst, 0);
  const split = DP.totals({ ...q, taxDisplay: 'split' });
  assert.equal(split.cgst + split.sgst, split.gst);
  assert.throws(() => DP.totals({ ...q, items: [{ ...inclusive, taxMode: 'invalid' }] }), /tax treatment/);
});

test('employee discount limits, additional-charge restrictions and manual override auditing are enforced', () => {
  const state = baseState();
  assert.throws(() => save(state, quotation(state, { disc: { t: 'p', v: 11 } }), employee), /authorized employee limit/);
  assert.ok(save(state, quotation(state, { disc: { t: 'p', v: 10 } }), employee).quotes[0]);
  state.set.employeeDiscountMax = 10;
  assert.throws(() => save(state, quotation(state, { disc: { t: 'f', v: 11 } }), employee), /authorized employee limit/);
  state.set.allowAdditionalCharges = false;
  assert.throws(() => save(state, quotation(state, { del: 10 }), employee), /charges are not permitted/);
  const q = quotation(state); q.items[0].override = { amount: 99, reason: 'Approved special rate' };
  assert.throws(() => save(state, q, employee), /override permission/);
  const updated = save(state, q); const saved = updated.quotes[0].items[0];
  assert.equal(saved.sub, 9900); assert.equal(saved.override.originalSub, 50000);
  assert.equal(saved.override.by, admin.id); assert.ok(saved.override.at);
  const again = save(updated, updated.quotes[0]); assert.deepEqual(again.quotes[0].items[0], saved);
  const removed = structuredClone(updated.quotes[0]); delete removed.items[0].override;
  assert.equal(save(updated, removed).quotes[0].items[0].sub, 50000);
});

test('customer contacts, immutable creators, company settings, numbering and price snapshots persist', () => {
  const state = baseState(); state.set.sequenceStart = 200; state.set.taxDisplay = 'igst';
  const q = quotation(state, { contact: { person: 'Accounts', wa: '+12025550123', email: 'accounts@example.test', addr: 'Quotation billing address' } });
  const result = save(state, q); const saved = result.quotes[0];
  assert.equal(saved.no, 'DP/QTN/2026/200'); assert.equal(saved.createdBy, admin.id);
  assert.equal(saved.customerSnapshot.wa, '+12025550123'); assert.equal(result.customers[0].wa, '+449000000001');
  assert.equal(saved.taxDisplay, 'igst');
  const next = structuredClone(result); next.products[0].tiers[0][1] = 100; next.quotes[0].createdBy = 'forged';
  const updated = validateState(next, result, admin, () => 'UNUSED');
  assert.equal(updated.quotes[0].items[0].sub, saved.items[0].sub); assert.equal(updated.quotes[0].createdBy, admin.id);
  assert.throws(() => settings({ ...state.set, logo: 'javascript:alert(1)' }), /PNG or JPEG/);
  assert.throws(() => settings({ ...state.set, currency: 'USD' }), /currency/);
  assert.equal(settings({ ...state.set, whatsappTemplate: 'Hello {{customer_name}}' }).whatsappTemplate, 'Hello {{customer_name}}');
});

test('independent approval blocks a creator and permits another authorized reviewer', () => {
  const state = baseState(); const result = save(state, quotation(state));
  const q = { ...result.quotes[0], status: 'Approved Internally' };
  assert.throws(() => save(result, q), /different authorized user/);
  assert.equal(save(result, q, { ...admin, id: 'reviewer' }).quotes[0].status, 'Approved Internally');
});

test('validating a legacy unassigned quotation never claims it for the editing user', () => {
  const state = baseState(); const result = save(state, quotation(state));
  delete result.quotes[0].createdBy;
  const updated = save(result, structuredClone(result.quotes[0]), employee);
  assert.equal(updated.quotes[0].createdBy, null);
});

test('legacy quotation tax treatment and presentation stay fixed when global tax settings change', () => {
  const state = baseState();
  const saved = save(state, quotation(state, { del: 100 }));
  const legacy = saved.quotes[0];
  delete legacy.taxDisplay; delete legacy.chargeTaxMode;
  delete legacy.companySnapshot.taxDisplay; delete legacy.companySnapshot.taxMode;
  for (const item of legacy.items) delete item.taxMode;
  const before = DP.totals(legacy);
  const input = structuredClone(saved); input.set.taxMode = 'inclusive'; input.set.taxDisplay = 'igst';
  const result = validateState(input, saved, admin, () => 'UNUSED');
  const updated = result.quotes[0];
  assert.equal(updated.taxDisplay, 'split'); assert.equal(updated.chargeTaxMode, 'exclusive');
  assert.equal(DP.totals(updated, result.set).grand, before.grand);
  assert.equal(DP.totals(updated, result.set).gst, before.gst);
  assert.equal(DP.totals(updated, result.set).cgst, before.cgst);
  assert.equal(DP.totals(updated, result.set).igst, 0);
  const pdf = quotationPdf(updated, result).toString('latin1');
  assert.ok(pdf.includes('CGST 9%')); assert.ok(pdf.includes('SGST 9%'));
  assert.ok(!pdf.includes('IGST')); assert.ok(pdf.includes(DP.rs(before.grand)));
  // Duplicating a historical document preserves the source tax basis too.
  const duplicatedInput = structuredClone(result), duplicate = structuredClone(legacy);
  duplicate.id = 'duplicate'; duplicate.status = 'Draft'; duplicatedInput.quotes.push(duplicate);
  const duplicated = validateState(duplicatedInput, result, admin, () => 'DP/QTN/2026/2', { duplicateSources: new Map([['duplicate', legacy]]) }).quotes[1];
  assert.equal(duplicated.taxDisplay, 'split'); assert.equal(duplicated.chargeTaxMode, 'exclusive');
  assert.equal(DP.totals(duplicated, result.set).grand, before.grand);
});

test('catalog metadata and master pricing have independent permissions across authorization and validation', () => {
  const state = baseState();
  const catalogManager = { ...employee, permissions: ['product.manage'] };
  const pricingManager = { ...employee, permissions: ['pricing.manage'] };
  const both = { ...employee, permissions: ['product.manage','pricing.manage'] };
  assert.equal(scopeState({state}, pricingManager).state.products.length, state.products.length);
  assert.equal(scopeState({state}, catalogManager).state.products.length, state.products.length);
  const check = (mutate, user) => {
    const input = structuredClone(state); mutate(input);
    authorizeChanges(input, state, user);
    return validateState(input, state, user, () => 'UNUSED');
  };
  assert.equal(check(s => { s.products[0].name = 'Renamed card'; s.products[0].f[0].l = 'Card shape'; }, catalogManager).products[0].name, 'Renamed card');
  assert.throws(() => check(s => { s.products[0].name = 'Not authorized'; }, pricingManager), /Product management/);
  assert.equal(check(s => { s.products[4].rate = 20; }, pricingManager).products[4].rate, 20);
  assert.equal(check(s => { s.products[0].tiers[0][1] = 6; }, pricingManager).products[0].tiers[0][1], 6);
  assert.throws(() => check(s => { s.products[0].tiers[0][1] = 6; }, catalogManager), /Pricing management/);
  const priced = s => s.products[0].f.find(f => f.k === 'mat').o[1];
  assert.equal(check(s => { priced(s)[2] = 2; }, pricingManager).products[0].f.find(f => f.k === 'mat').o[1][2], 2);
  assert.throws(() => check(s => { priced(s)[2] = 2; }, catalogManager), /Pricing management/);
  assert.throws(() => check(s => { priced(s)[0] = 'Renamed paid material'; }, pricingManager), /Product management/);
  assert.throws(() => check(s => { s.products[0].f = s.products[0].f.filter(f => f.k !== 'mat'); }, catalogManager), /Pricing management/);
  assert.ok(check(s => { s.products[0].f.push({ k: 'reference', l: 'Reference', t: 'txt' }); }, catalogManager).products[0].f.some(f => f.k === 'reference'));
  for (const user of [catalogManager,pricingManager]) assert.throws(() => check(s => { s.products.push({ ...structuredClone(s.products[0]), id: 'new-product', code: 'NEW' }); }, user), /management permission/);
  assert.equal(check(s => { s.products.push({ ...structuredClone(s.products[0]), id: 'new-product', code: 'NEW' }); }, both).products.length, 41);
  for (const user of [catalogManager,pricingManager]) assert.throws(() => check(s => { s.products.pop(); }, user), /management permission/);
});
