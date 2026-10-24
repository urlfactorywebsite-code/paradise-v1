'use strict';
const DP = require('../shared/domain');
const { hasPermission, authorizeProductChanges } = require('./access');
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
function choice(v, values, label) { if (!values.includes(v)) fail(`Invalid ${label}.`); return v; }
function bool(v, label, fallback = false) { if (v === undefined) return fallback; if (typeof v !== 'boolean') fail(`Invalid ${label}.`); return v; }
function image(v, label) {
 const value = text(v, label, 750000);
 if (value && !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) fail(`${label} must be an embedded PNG or JPEG image.`);
 return value;
}
function settings(v) {
 object(v, 'settings');
 const result = {};
 for (const k of ['name', 'tag', 'addr', 'phone', 'email', 'web', 'gstin', 'prefix']) result[k] = text(v[k], k, k === 'addr' ? 2000 : 200);
 str(result.name, 'company name', 200, true);
 if (!/^[A-Za-z0-9 /_-]{1,40}$/.test(result.prefix)) fail('Quotation prefix may contain letters, numbers, spaces, /, _ and - only.');
 result.tax = num(v.tax, 'default tax', 100);
 result.valid = num(v.valid, 'validity', 3650, true);
 result.showNotes = bool(v.showNotes, 'internal notes setting');
 result.terms = terms(v.terms);
 result.employeeDiscountLimit = num(v.employeeDiscountLimit ?? 10, 'employee discount percentage limit', 100);
 result.employeeDiscountMax = num(v.employeeDiscountMax ?? 0, 'employee discount amount limit');
 result.allowAdditionalCharges = bool(v.allowAdditionalCharges, 'additional charge setting', true);
 result.independentApproval = bool(v.independentApproval, 'independent approval setting', true);
 result.taxMode = choice(v.taxMode ?? 'exclusive', DP.TAX_MODES, 'default tax treatment');
 result.taxDisplay = choice(v.taxDisplay ?? 'split', ['split', 'igst'], 'tax presentation');
 result.currency = choice(v.currency ?? 'INR', ['INR'], 'currency');
 result.sequenceStart = num(v.sequenceStart ?? 1, 'quotation starting sequence', 999999999, true);
 if (!result.sequenceStart) fail('Quotation starting sequence must be positive.');
 result.logo = image(v.logo, 'company logo');
 for (const k of ['signature', 'footer', 'customerNotes', 'whatsappTemplate']) result[k] = text(v[k], k, ['signature','footer'].includes(k) ? 200 : 4000);
 return result;
}
const fieldKey = (v) => {
 if (typeof v !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(v) || ['__proto__','constructor','prototype'].includes(v)) fail('Invalid product field key.');
 return v;
};
function condition(v) {
 object(v, 'field condition'); fieldKey(v.key);
 const scalar = value => { if (typeof value === 'number') { if (!Number.isFinite(value) || Math.abs(value)>10000000) fail('Invalid condition value.'); return value; } return str(value, 'condition value', 4000); };
 return { key: v.key, equals: Array.isArray(v.equals) ? list(v.equals, 'condition options', 100).map(scalar) : scalar(v.equals) };
}
function product(p, cats) {
 if (!cats.some(c => c.id === p.cat)) fail('Product category does not exist.');
 const r = { id: p.id, code: str(p.code, 'product code', 80, true), name: str(p.name, 'product name', 200, true), cat: p.cat,
  m: choice(p.m, DP.METHODS, 'pricing method'), rate: num(p.rate, 'product rate'), min: num(p.min ?? 0, 'minimum charge'), minQty: num(p.minQty ?? p.tiers?.[0]?.[0] ?? 1, 'minimum quantity', 1000000, true), tax: num(p.tax, 'product tax', 100), taxMode: choice(p.taxMode ?? 'exclusive', DP.TAX_MODES, 'product tax treatment'), on: on(p.on),
  description: text(p.description, 'product description', 4000), image: image(p.image, 'product image'), unit: text(p.unit ?? 'item', 'unit', 80), type: text(p.type ?? 'Product', 'product type', 100), priceConfigured: bool(p.priceConfigured, 'pricing readiness', true) };
 if (!r.minQty) fail('Minimum quantity must be positive.');
 if (r.on && !r.priceConfigured) fail('Configure approved pricing before activating this product.');
 if (p.sizes && ['unit','tier'].includes(p.m)) r.sizes = 1;
 r.tiers = ['unit','tier'].includes(p.m) && p.tiers != null ? list(p.tiers, 'quantity tiers', 100).map(t => {
  if (!Array.isArray(t) || t.length !== 2) fail('Invalid quantity tier.');
  const q = num(t[0], 'tier quantity', 1000000, true); if (!q) fail('Tier quantity must be positive.');
  return [q, num(t[1], 'tier price')];
 }).sort((a,b)=>a[0]-b[0]) : null;
 if ((p.m==='tier' && !r.tiers?.length) || (r.tiers && (!r.tiers.length || new Set(r.tiers.map(t=>t[0])).size!==r.tiers.length))) fail('Quantity tiers must be nonempty and unique.');
 r.f = list(p.f, 'product options', 50).map(f => {
  object(f, 'product field'); fieldKey(f.k);
  if (['qty','sz','w','h','u'].includes(f.k)) fail('Reserved product field key.');
  const field = { k:f.k, l:str(f.l, 'option label', 150, true), t:choice(f.t, ['sel','txt','dim','num'], 'product field type') };
  if (f.required!==undefined) field.required=bool(f.required, 'required field flag');
  if (f.when!==undefined) field.when=condition(f.when);
  if (f.t==='sel') {
   field.o=list(f.o, 'choices', 100).map(o=>{
    if (!Array.isArray(o)||o.length!==3||!['f','u','p','a','q'].includes(o[1])) fail('Invalid option charge.');
    return [str(o[0], 'option name', 200, true),o[1],num(o[2], 'option amount')];
   });
   if (!field.o.length||new Set(field.o.map(x=>x[0])).size!==field.o.length) fail('Option names must be nonempty and unique.');
  }
  if (f.t==='num') {
   for (const k of ['min','max']) if (f[k]!==undefined) { if (typeof f[k]!=='number'||!Number.isFinite(f[k])||Math.abs(f[k])>10000000) fail('Invalid numeric field limit.'); field[k]=f[k]; }
   if (field.min!==undefined&&field.max!==undefined&&field.min>field.max) fail('Numeric minimum exceeds maximum.');
   field.integer=bool(f.integer, 'whole number flag');
  }
  if (f.t==='txt'&&f.maxLength!==undefined) field.maxLength=num(f.maxLength,'text length',4000,true);
  if (f.default!==undefined) {
   if (f.t==='num') { if (typeof f.default!=='number'||!Number.isFinite(f.default)||(field.min!==undefined&&f.default<field.min)||(field.max!==undefined&&f.default>field.max)||(field.integer&&!Number.isInteger(f.default))) fail('Invalid numeric default.'); field.default=f.default; }
   else if (f.t!=='dim') { field.default=str(f.default,'field default',4000); if (f.t==='sel'&&field.default!==''&&!field.o.some(o=>o[0]===field.default)) fail('Default option does not exist.'); }
  }
  return field;
 });
 if (new Set(r.f.map(f=>f.k)).size!==r.f.length) fail('Duplicate product fields.');
 const known = new Set(['qty','w','h','u',...r.f.map(f=>f.k)]);
 const checkCondition = v => { if (v&&!known.has(v.key)) fail('Condition references an unknown field.'); };
 r.f.forEach(f=>checkCondition(f.when));
 r.compatibility=list(p.compatibility??[], 'compatibility rules', 100).map(rule=>{
  object(rule,'compatibility rule'); const when=condition(rule.when);checkCondition(when);
  const field=r.f.find(f=>f.k===rule.field&&f.t==='sel');if(!field)fail('Compatibility rules must reference an option field.');
  const allowed=list(rule.allowed,'compatible options',100).map(v=>str(v,'compatible option',200,true));
  if(!allowed.length||allowed.some(value=>!field.o.some(o=>o[0]===value)))fail('Compatible options must exist in the field.');
  return {when,field:field.k,allowed,message:text(rule.message,'compatibility message',500)};
 });
 r.charges=list(p.charges??[], 'additional charges', 100).map(charge=>{
  object(charge,'additional charge');const result={label:str(charge.label,'charge label',200,true),type:choice(charge.type,['f','u','p','a','q'],'charge type'),amount:num(charge.amount,'charge amount')};
  if(charge.when!==undefined){result.when=condition(charge.when);checkCondition(result.when);}return result;
 });
 if(new Set(r.charges.map(c=>c.label)).size!==r.charges.length)fail('Additional charge names must be unique.');
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
  list(input.products, 'products');
  if (!equal(input.set, previous.set) && !hasPermission(user, 'settings.manage')) fail('Company settings permission is required.', 403);
  if (!equal(input.cats, previous.cats) && !hasPermission(user, 'product.manage')) fail('Product management permission is required.', 403);
  authorizeProductChanges(input.products, previous.products, user);
  const state = {
    cats: records(input.cats, 'category', c => ({ id: c.id, name: str(c.name, 'category name', 200, true), description: text(c.description, 'category description', 4000), order: num(c.order ?? 0, 'category display order', 1000000, true), on: on(c.on) })),
    set: settings(input.set)
  };
  state.products = records(input.products, 'product', p => product(p, state.cats));
  if (new Set(state.products.map(p => p.code.trim().toLowerCase())).size !== state.products.length) fail('Product codes must be unique.');
  state.customers = records(input.customers, 'customer', c => {
    const old = previous.customers.find(x => x.id === c.id);
    const r = { id: c.id, date: date(c.date), wa: text(c.wa, 'customer WhatsApp number', 30), type: text(c.type ?? 'Individual', 'customer type', 100), on: on(c.on ?? 1), createdBy: old ? (old.createdBy || 'System') : (user.id || user.name) };
    for (const k of ['name', 'co', 'person', 'mob', 'email', 'addr', 'gstin', 'notes']) r[k] = text(c[k], `customer ${k}`, ['notes', 'addr'].includes(k) ? 4000 : 200);
    str(r.name, 'customer name', 200, true);
    if (!/^[0-9+ ()-]{10,20}$/.test(r.mob)) fail('Enter a valid customer mobile number.');
    r.wa = r.wa.replace(/[ ()-]/g, '');
    if (r.wa && !/^\+[1-9]\d{7,14}$/.test(r.wa)) fail('WhatsApp number must include + and an international dialing code, using 8-15 digits.');
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
    if (q.status === 'Approved Internally' && old?.status !== q.status && !hasPermission(user, 'quotation.approve')) fail('Internal approval permission is required.', 403);
    if (q.status === 'Approved Internally' && old?.status !== q.status && state.set.independentApproval && (old?.createdBy || q.createdBy) === user.id) fail('Independent approval requires a different authorized user.', 403);
    const r = { id: q.id, cid: q.cid, date: date(q.date), valid: date(q.valid), status: q.status };
    if (r.valid < r.date) fail('Valid-until date must be on or after quotation date.');
    r.no = old ? old.no : allocateNumber(r.date, state.set.prefix, state.set.sequenceStart);
    for (const k of ['sales', 'ref', 'project', 'subject', 'req']) r[k] = text(q[k], k, k === 'req' ? 4000 : 500);
    r.by = old ? old.by : user.name;
    r.createdBy = old ? (old.createdBy || null) : (user.id || user.name);
    r.customerSnapshot = structuredClone(source?.cid === q.cid ? (source.customerSnapshot || previous.customers.find(c => c.id === q.cid)) : state.customers.find(c => c.id === q.cid));
    r.companySnapshot = structuredClone(source?.companySnapshot || (source ? previous.set : state.set));
    if (q.contact !== undefined) {
      object(q.contact, 'quotation contact');
      if (!equal(q.contact, old?.contact) && !hasPermission(user, 'customer.edit')) fail('Customer edit permission is required to change quotation contact details.', 403);
      r.contact = {};
      for (const k of ['person','mob','wa','email','addr']) if (q.contact[k] !== undefined) r.contact[k] = text(q.contact[k], 'quotation contact ' + k, k === 'addr' ? 4000 : 200);
      if (q.contact.whatsapp !== undefined && q.contact.wa === undefined) r.contact.wa = text(q.contact.whatsapp, 'quotation WhatsApp number', 20);
      if (r.contact.mob && !/^[0-9+ ()-]{10,20}$/.test(r.contact.mob)) fail('Invalid quotation mobile number.');
      if (r.contact.wa) r.contact.wa = r.contact.wa.replace(/[ ()-]/g, '');
      if (r.contact.wa && !/^\+[1-9]\d{7,14}$/.test(r.contact.wa)) fail('Quotation WhatsApp number must use an international dialing code.');
      if (r.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.contact.email)) fail('Invalid quotation email.');
      for (const [k, value] of Object.entries(r.contact)) r.customerSnapshot[k === 'whatsapp' ? 'wa' : k] = value;
    }
    r.chargeTax = source?.chargeTax ?? (source ? previous.set.tax : state.set.tax);
    r.chargeTaxMode = source ? (source.chargeTaxMode ?? source.companySnapshot?.taxMode ?? 'exclusive') : state.set.taxMode;
    r.taxDisplay = source ? (source.taxDisplay ?? source.companySnapshot?.taxDisplay ?? 'split') : state.set.taxDisplay;
    r.disc = { t: q.disc?.t, v: num(q.disc?.v, 'discount') };
    if (!['f', 'p'].includes(r.disc.t) || (r.disc.t === 'p' && r.disc.v > 100)) fail('Invalid discount.');
    r.del = num(q.del, 'delivery charge'); r.oth = num(q.oth, 'other charge'); r.terms = terms(q.terms);
    if ((r.del !== (old?.del ?? 0) || r.oth !== (old?.oth ?? 0)) && (r.del || r.oth) && (!hasPermission(user, 'quotation.additional_charges') || (user.role !== 'Administrator' && !state.set.allowAdditionalCharges))) fail('Additional quotation charges are not permitted.', 403);
    r.items = records(q.items, 'quotation item', item => {
      const config = cfg(item.cfg), notes = text(item.notes, 'item notes', 4000);
      const saved = source?.items.find(i => i.id === item.id);
      const sameSaved = saved && saved.pid === item.pid && equal(cfg(saved.cfg), config) && !q._refreshPrices;
      if (sameSaved && equal(item.override, saved.override)) return { ...structuredClone(saved), notes };
      const p = state.products.find(x => x.id === item.pid);
      if (!p || !p.on || !state.cats.find(c => c.id === p.cat)?.on) fail('Select an active product from an active category.');
      const result = sameSaved ? { sub: saved.override?.originalSub ?? saved.sub } : DP.calc(p, config); if (result.err) fail(result.err);
      if (!Number.isSafeInteger(result.sub) || result.sub > 1000000000000) fail('Item amount exceeds the supported limit.');
      const computed = sameSaved ? { ...structuredClone(saved), notes } : DP.mkItem(p, config, item.id, notes);
      if (sameSaved && saved.override) { computed.sub = saved.override.originalSub; computed.base = saved.override.originalBase; computed.L = structuredClone(saved.override.originalLines); delete computed.override; }
      if (item.override !== undefined) {
        object(item.override, 'manual price override');
        if (!hasPermission(user, 'pricing.override')) fail('Manual pricing override permission is required.', 403);
        const amount = num(item.override.amount, 'overridden item price'), reason = str(item.override.reason, 'override reason', 1000, true);
        computed.override = { amount, reason, originalSub: computed.sub, originalBase: computed.base, originalLines: structuredClone(computed.L), by: user.id || user.name, at: now };
        computed.sub = DP.R(amount); computed.base = Math.min(computed.base, computed.sub);
        computed.L.push(['Authorized price adjustment', computed.sub - computed.override.originalSub]);
      } else if (saved?.override && !hasPermission(user, 'pricing.override')) fail('Manual pricing override permission is required.', 403);
      return computed;
    });
    if (!r.items.length && !['Draft', 'Cancelled'].includes(r.status)) fail('Add an item before changing status.');
    let totals;
    try { totals = DP.totals(r, state.set); }
    catch (error) { fail(error.message); }
    if ((!old || !equal(r.disc, old.disc) || !equal(r.items, old.items)) && !hasPermission(user, 'quotation.discount_unlimited')) {
      if (totals.disc > Math.round(totals.isub * state.set.employeeDiscountLimit / 100) || (state.set.employeeDiscountMax > 0 && totals.disc > DP.R(state.set.employeeDiscountMax))) fail('Discount exceeds the authorized employee limit.', 403);
    }
    if (totals.warn) fail('Discount cannot exceed the product subtotal.');
    if (!Number.isSafeInteger(totals.grand) || totals.grand < 0 || totals.grand > 10000000000000) fail('Quotation total exceeds the supported limit.');
    r.hist = old ? structuredClone(old.hist) : [{ f: '—', t: 'Draft', d: now, u: user.name }];
    if (old && old.status !== r.status) r.hist.push({ f: old.status, t: r.status, d: now, u: user.name, remarks: text(q._statusRemarks, 'status remarks', 2000) });
    return r;
  });
  state.log = structuredClone(previous.log);
  const descriptions = [];
  for (const key of ['cats', 'products', 'customers', 'set']) if (!equal(state[key], previous[key])) descriptions.push(`Updated ${ { cats: 'categories', products: 'catalog/pricing', customers: 'customers', set: 'company settings' }[key]}`);
  for (const q of state.quotes) if (!equal(q, oldQuotes.get(q.id))) descriptions.push(`${oldQuotes.has(q.id) ? 'Updated' : 'Created'} ${q.no} (${q.status})`);
  for (const q of previous.quotes) if (!state.quotes.some(x => x.id === q.id)) descriptions.push(`Deleted ${q.no}`);
  state.log = [...descriptions.map(x => ({ t: now, x, u: user.name })), ...state.log].slice(0, 100);
  return state;
}
module.exports = { validateState, fail, str, date, id, num, settings, cfg };
