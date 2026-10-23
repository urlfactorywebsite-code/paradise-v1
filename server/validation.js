'use strict';
const DP = require('../shared/domain');
const { isDeepStrictEqual: equal } = require('node:util');
const fail = (message, status = 422) => { throw Object.assign(new Error(message), { status }); };
const object = (v, label) => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${label} must be an object.`); return v; };
function str(v, label, max = 200, required = false) {
  if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) fail(`Invalid ${label}.`);
  if (required && !v.trim()) fail(`${label} is required.`);
  return v;
}
const text = (v, label, max = 200) => str(v ?? '', label, max);
function num(v, label, max = 10000000, integer = false) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max || (integer && !Number.isInteger(v))) fail(`Invalid ${label}.`);
  return v;
}
const id = v => { if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(v)) fail('Invalid record ID.'); return v; };
function date(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) fail('Invalid date.');
  return v;
}
function list(v, label, max = 10000) { if (!Array.isArray(v) || v.length > max) fail(`Invalid ${label}.`); return v; }
function records(v, label, map) {
  const result = list(v, label).map(x => { object(x, label); id(x.id); return map(x); });
  if (new Set(result.map(x => x.id)).size !== result.length) fail(`Duplicate ${label} IDs.`);
  return result;
}
const on = v => { if (![0, 1, false, true].includes(v)) fail('Invalid active flag.'); return v ? 1 : 0; };
const terms = v => list(v, 'terms', 100).map(t => str(t, 'term', 4000));
function settings(v) {
  object(v, 'settings');
  const result = {};
  for (const k of ['name', 'tag', 'addr', 'phone', 'email', 'web', 'gstin', 'prefix']) result[k] = text(v[k], k, k === 'addr' ? 2000 : 200);
  str(result.name, 'company name', 200, true);
  if (!/^[A-Za-z0-9 /_-]{1,40}$/.test(result.prefix)) fail('Quotation prefix may contain letters, numbers, spaces, /, _ and - only.');
  result.tax = num(v.tax, 'default tax', 100);
  result.valid = num(v.valid, 'validity', 3650, true);
  if (typeof v.showNotes !== 'boolean') fail('Invalid internal notes setting.');
  result.showNotes = v.showNotes;
  result.terms = terms(v.terms);
  return result;
}
function product(p, cats) {
  if (!cats.some(c => c.id === p.cat)) fail('Product category does not exist.');
  if (!['unit', 'area', 'fixed'].includes(p.m)) fail('Invalid pricing method.');
  const r = { id: p.id, code: str(p.code, 'product code', 80, true), name: str(p.name, 'product name', 200, true), cat: p.cat,
    m: p.m, rate: num(p.rate, 'product rate'), min: num(p.min ?? 0, 'minimum charge'), tax: num(p.tax, 'product tax', 100), on: on(p.on) };
  if (p.sizes && p.m === 'unit') r.sizes = 1;
  r.tiers = p.m === 'unit' ? list(p.tiers, 'quantity tiers', 100).map(t => {
    if (!Array.isArray(t) || t.length !== 2) fail('Invalid quantity tier.');
    const q = num(t[0], 'tier quantity', 1000000, true); if (!q) fail('Tier quantity must be positive.');
    return [q, num(t[1], 'tier price')];
  }).sort((a, b) => a[0] - b[0]) : null;
  if (r.tiers && (!r.tiers.length || new Set(r.tiers.map(t => t[0])).size !== r.tiers.length)) fail('Quantity tiers must be nonempty and unique.');
  r.f = list(p.f, 'product options', 50).map(f => {
    object(f, 'product field');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(f.k) || ['__proto__', 'constructor', 'prototype', 'qty', 'sz', 'w', 'h', 'u'].includes(f.k)) fail('Invalid product field key.');
    if (!['sel', 'txt', 'dim'].includes(f.t)) fail('Invalid product field type.');
    const field = { k: f.k, l: str(f.l, 'option label', 150, true), t: f.t };
    if (f.t === 'sel') {
      field.o = list(f.o, 'choices', 100).map(o => {
        if (!Array.isArray(o) || o.length !== 3 || !['f', 'u', 'p', 'a'].includes(o[1])) fail('Invalid option charge.');
        return [str(o[0], 'option name', 200, true), o[1], num(o[2], 'option amount')];
      });
      if (!field.o.length || new Set(field.o.map(x => x[0])).size !== field.o.length) fail('Option names must be nonempty and unique.');
    }
    return field;
  });
  if (new Set(r.f.map(f => f.k)).size !== r.f.length) fail('Duplicate product fields.');
  return r;
}
function cfg(v) {
  object(v, 'item configuration');
  const result = {};
  for (const [k, value] of Object.entries(v)) {
    if (k.startsWith('_')) continue;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k) || ['constructor', 'prototype'].includes(k)) fail('Invalid configuration key.');
    if (k === 'sz') {
      object(value, 'size quantities'); result.sz = {};
      for (const [size, amount] of Object.entries(value)) {
        if (!DP.SZ.includes(size)) fail('Invalid clothing size.');
        result.sz[size] = num(amount, 'size quantity', 1000000, true);
      }
    } else if (typeof value === 'number') { if (!Number.isFinite(value) || Math.abs(value) > 10000000) fail('Invalid configuration number.'); result[k] = value; }
    else result[k] = str(value, 'configuration value', 4000);
  }
  return result;
}
function validateState(input, previous, user, allocateNumber, options = {}) {
  object(input, 'state');
  if (user.role !== 'Administrator' && ['set', 'products', 'cats'].some(k => !equal(input[k], previous[k]))) fail('Only administrators can change catalog, pricing, or company settings.', 403);
  const state = {
    cats: records(input.cats, 'category', c => ({ id: c.id, name: str(c.name, 'category name', 200, true), on: on(c.on) })),
    set: settings(input.set)
  };
  state.products = records(input.products, 'product', p => product(p, state.cats));
  if (new Set(state.products.map(p => p.code.trim().toLowerCase())).size !== state.products.length) fail('Product codes must be unique.');
  state.customers = records(input.customers, 'customer', c => {
    const r = { id: c.id, date: date(c.date) };
    for (const k of ['name', 'co', 'person', 'mob', 'email', 'addr', 'gstin', 'notes']) r[k] = text(c[k], `customer ${k}`, ['notes', 'addr'].includes(k) ? 4000 : 200);
    str(r.name, 'customer name', 200, true);
    if (!/^[0-9+ ()-]{10,20}$/.test(r.mob)) fail('Enter a valid customer mobile number.');
    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) fail('Invalid customer email.');
    return r;
  });
  const oldQuotes = new Map(previous.quotes.map(q => [q.id, q]));
  const now = new Date().toISOString();
  state.quotes = records(input.quotes, 'quotation', q => {
    const old = oldQuotes.get(q.id);
    const source = old || options.duplicateSources?.get(q.id);
    if (!state.customers.some(c => c.id === q.cid)) fail('Quotation customer does not exist.');
    if (!DP.ST.includes(q.status)) fail('Invalid quotation status.');
    if (!old && q.status !== 'Draft') fail('New quotations must start as Draft.');
    if (q.status === 'Approved Internally' && old?.status !== q.status && user.role !== 'Administrator') fail('Internal approval requires an administrator.', 403);
    const r = { id: q.id, cid: q.cid, date: date(q.date), valid: date(q.valid), status: q.status };
    if (r.valid < r.date) fail('Valid-until date must be on or after quotation date.');
    r.no = old ? old.no : allocateNumber(r.date, state.set.prefix);
    for (const k of ['sales', 'ref', 'project', 'subject', 'req']) r[k] = text(q[k], k, k === 'req' ? 4000 : 500);
    r.by = old ? old.by : user.name;
    r.customerSnapshot = structuredClone(source?.cid === q.cid ? (source.customerSnapshot || previous.customers.find(c => c.id === q.cid)) : state.customers.find(c => c.id === q.cid));
    r.companySnapshot = structuredClone(source?.companySnapshot || (source ? previous.set : state.set));
    r.chargeTax = source?.chargeTax ?? (source ? previous.set.tax : state.set.tax);
    r.disc = { t: q.disc?.t, v: num(q.disc?.v, 'discount') };
    if (!['f', 'p'].includes(r.disc.t) || (r.disc.t === 'p' && r.disc.v > 100)) fail('Invalid discount.');
    r.del = num(q.del, 'delivery charge'); r.oth = num(q.oth, 'other charge'); r.terms = terms(q.terms);
    r.items = records(q.items, 'quotation item', item => {
      const config = cfg(item.cfg), notes = text(item.notes, 'item notes', 4000);
      const saved = source?.items.find(i => i.id === item.id);
      if (saved && saved.pid === item.pid && equal(cfg(saved.cfg), config) && !q._refreshPrices) return { ...structuredClone(saved), notes };
      const p = state.products.find(x => x.id === item.pid);
      if (!p || !p.on || !state.cats.find(c => c.id === p.cat)?.on) fail('Select an active product from an active category.');
      const result = DP.calc(p, config); if (result.err) fail(result.err);
      if (!Number.isSafeInteger(result.sub) || result.sub > 1000000000000) fail('Item amount exceeds the supported limit.');
      return DP.mkItem(p, config, item.id, notes);
    });
    if (!r.items.length && !['Draft', 'Cancelled'].includes(r.status)) fail('Add an item before changing status.');
    let totals;
    try { totals = DP.totals(r, state.set); }
    catch (error) { fail(error.message); }
    if (!Number.isSafeInteger(totals.grand) || totals.grand < 0 || totals.grand > 10000000000000) fail('Quotation total exceeds the supported limit.');
    r.hist = old ? structuredClone(old.hist) : [{ f: '—', t: 'Draft', d: now, u: user.name }];
    if (old && old.status !== r.status) r.hist.push({ f: old.status, t: r.status, d: now, u: user.name });
    return r;
  });
  for (const old of previous.quotes) if (!state.quotes.some(q => q.id === old.id) && user.role !== 'Administrator' && !['Draft', 'Cancelled'].includes(old.status)) fail('Only administrators can delete quotations beyond Draft or Cancelled.', 403);
  state.log = structuredClone(previous.log);
  const descriptions = [];
  for (const key of ['cats', 'products', 'customers', 'set']) if (!equal(state[key], previous[key])) descriptions.push(`Updated ${ { cats: 'categories', products: 'catalog/pricing', customers: 'customers', set: 'company settings' }[key]}`);
  for (const q of state.quotes) if (!equal(q, oldQuotes.get(q.id))) descriptions.push(`${oldQuotes.has(q.id) ? 'Updated' : 'Created'} ${q.no} (${q.status})`);
  for (const q of previous.quotes) if (!state.quotes.some(x => x.id === q.id)) descriptions.push(`Deleted ${q.no}`);
  state.log = [...descriptions.map(x => ({ t: now, x, u: user.name })), ...state.log].slice(0, 100);
  return state;
}
module.exports = { validateState, fail, str, date, id, num, settings, cfg };
