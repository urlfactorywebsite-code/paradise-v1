'use strict';
const { isDeepStrictEqual: equal } = require('node:util');
const deny = (message = 'You do not have permission for this action.', status = 403) => {
  throw Object.assign(new Error(message), { status });
};
const PERMISSIONS = Object.freeze([
  'quotation.create', 'quotation.view_own', 'quotation.view_all',
  'quotation.edit_own', 'quotation.edit_all', 'quotation.approve',
  'quotation.delete', 'quotation.download_pdf', 'quotation.share_whatsapp',
  'quotation.status', 'quotation.additional_charges', 'quotation.discount_unlimited',
  'customer.view', 'customer.create', 'customer.edit', 'customer.delete',
  'product.view', 'product.manage', 'pricing.view', 'pricing.manage', 'pricing.override',
  'reports.view_own', 'reports.view_all', 'users.manage', 'settings.manage', 'audit.view',
]);
const EMPLOYEE_PERMISSIONS = Object.freeze([
  'quotation.create', 'quotation.view_own', 'quotation.edit_own',
  'quotation.download_pdf', 'quotation.share_whatsapp', 'quotation.status',
  'quotation.additional_charges', 'customer.view', 'customer.create', 'customer.edit',
  'product.view', 'pricing.view', 'reports.view_own',
]);
function permissionInput(input) {
  if (input === null || input === undefined) return null;
  if (!Array.isArray(input) || input.length > PERMISSIONS.length ||
      input.some((p) => !PERMISSIONS.includes(p)) || new Set(input).size !== input.length)
    deny('Permissions must be a unique list of supported permission names.', 422);
  return [...input].sort();
}
function permissionOverrides(user) {
  if (Array.isArray(user?.permissionOverrides)) return user.permissionOverrides;
  if (user?.permissions_json) {
    try { return permissionInput(JSON.parse(user.permissions_json)); } catch { return []; }
  }
  return null;
}
function effectivePermissions(user) {
  if (!user) return [];
  if (user.role === 'Administrator') return [...PERMISSIONS];
  return Array.isArray(user.permissions) ? user.permissions :
    permissionOverrides(user) || [...EMPLOYEE_PERMISSIONS];
}
function hasPermission(user, permission) {
  return Boolean(user && (user.role === 'Administrator' || effectivePermissions(user).includes(permission)));
}
function requirePermission(user, permission) {
  if (!hasPermission(user, permission)) deny();
}
const canReadPricing = user => hasPermission(user, 'pricing.view') || hasPermission(user, 'pricing.manage');
const privateProductKeys = ['rate', 'min', 'tax', 'taxMode', 'tiers', 'charges', 'pricingApproval'];
const privateSettingsKeys = ['tax', 'employeeDiscountLimit', 'employeeDiscountMax'];
function scopeCatalogData(value, user) {
  if (canReadPricing(user)) return value;
  const visit = current => {
    if (Array.isArray(current)) return current.map(visit);
    if (!current || typeof current !== 'object') return current;
    const result = Object.fromEntries(Object.entries(current).map(([key, item]) => [key, visit(item)]));
    if (current.code && current.cat && Array.isArray(current.f))
      for (const key of privateProductKeys) delete result[key];
    if (current.k && current.t) {
      if (Array.isArray(current.o)) result.o = current.o.map(option => [option[0]]);
      if (Array.isArray(result.sizes)) for (const size of result.sizes) if (size && typeof size === 'object') delete size.price;
      delete result.customCharge;
      for (const metadata of Object.values(result.optionMeta || {})) if (metadata && typeof metadata === 'object') delete metadata.approved;
      if (result.eyeletPolicy) delete result.eyeletPolicy.approved;
    }
    if (Array.isArray(current.terms) && typeof current.prefix === 'string')
      for (const key of privateSettingsKeys) delete result[key];
    return result;
  };
  return visit(value);
}
// A catalog manager can round-trip the safe schema without ever receiving the
// master prices. Only omitted values are restored: explicitly supplied price
// changes still reach the independent pricing authorization checks below.
function restorePrivatePricing(candidate, previous, user) {
  if (canReadPricing(user)) return;
  const DP = require('../shared/domain'), own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const omitted = (value, old, keys) => {
    if (!value || !old || typeof value !== 'object' || Array.isArray(value)) return;
    for (const key of keys) if (!own(value, key) && own(old, key)) value[key] = structuredClone(old[key]);
  };
  const restoreFields = (fields, oldFields = []) => {
    if (!Array.isArray(fields)) return;
    for (const field of fields) {
      const old = (Array.isArray(oldFields) ? oldFields : []).find(value => value.k === field?.k);
      if (!field || typeof field !== 'object') continue;
      if (Array.isArray(field.o)) field.o = field.o.map(option => {
        const saved = old?.o?.find(value => value[0] === option?.[0]);
        if (!Array.isArray(option) || option.length !== 1) return option;
        if (saved) return structuredClone(saved);
        if (typeof option[0] !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(option[0])) deny('Invalid option key.', 422);
        // A new name has no known commercial rate. Preserve that distinction
        // rather than filling the hidden amount with a free zero price.
        if (!field.optionMeta || typeof field.optionMeta !== 'object' || Array.isArray(field.optionMeta)) field.optionMeta = {};
        field.optionMeta[option[0]] = { ...field.optionMeta[option[0]], approved: false };
        return [option[0], 'f', null];
      });
      if (!old) continue;
      omitted(field, old, ['customCharge']);
      if (Array.isArray(field.sizes)) for (const size of field.sizes)
        omitted(size, old.sizes?.find(value => value.key === size?.key), ['price']);
      for (const [key, metadata] of Object.entries(field.optionMeta || {}))
        omitted(metadata, old.optionMeta?.[key], ['approved']);
      omitted(field.eyeletPolicy, old.eyeletPolicy, ['approved']);
    }
  };
  const restoreSettings = (settings, old = {}) => {
    omitted(settings, old, privateSettingsKeys);
    if (settings?.giftTemplate) restoreFields(settings.giftTemplate.f, old.giftTemplate?.f || DP.giftTemplate().f);
    for (const [key, template] of Object.entries(settings?.catalogTemplates || {}))
      if (DP.CATALOG_TEMPLATE_IDS.includes(key)) restoreFields(template?.f, old.catalogTemplates?.[key]?.f || DP.catalogTemplate(key).f);
  };
  restoreSettings(candidate.set, previous.set);
  for (const product of Array.isArray(candidate.products) ? candidate.products : []) {
    const old = previous.products?.find(value => value.id === product?.id);
    if (!product || typeof product !== 'object') continue;
    if (!old) { restoreFields(product.f); continue; }
    omitted(product, old, privateProductKeys);
    let effective = old.f;
    try { effective = DP.resolveProduct(old, previous.set).f; } catch { /* Validation reports malformed assignments. */ }
    restoreFields(product.f, [...(old.f || []), ...(effective || [])]);
    for (const key of ['phase3LegacyFields', 'catalogLegacyFields']) restoreFields(product[key], old[key]);
    for (const key of ['giftTemplate', 'catalogTemplate']) {
      const assignment = product[key];
      for (const [semantic, field] of Object.entries(assignment?.overrides || {})) {
        const saved = old[key]?.overrides?.[semantic] || effective?.find(value => value.k === field?.k);
        restoreFields([field], saved ? [saved] : []);
      }
    }
  }
  for (const quote of Array.isArray(candidate.quotes) ? candidate.quotes : []) {
    const old = previous.quotes?.find(value => value.id === quote?.id);
    if (!old || !quote) continue;
    restoreSettings(quote.companySnapshot, old.companySnapshot);
    for (const item of Array.isArray(quote.items) ? quote.items : [])
      restoreFields(item?.fieldSnapshot, old.items?.find(value => value.id === item?.id)?.fieldSnapshot);
  }
}
const ownsQuote = (user, quote) => Boolean(user?.id && quote?.createdBy === user.id);
function canViewQuote(user, quote) {
  return hasPermission(user, 'quotation.view_all') ||
    (hasPermission(user, 'quotation.view_own') && ownsQuote(user, quote));
}
function requireQuoteAccess(user, quote) {
  // A missing/hidden quotation has the same response to prevent ID enumeration.
  if (!quote || !canViewQuote(user, quote)) deny('Quotation not found.', 404);
}
const editableFields = (q) => Object.fromEntries(Object.entries(q).filter(([k]) =>
  !['status', 'hist', 'no', 'by', 'createdBy', 'customerSnapshot', 'companySnapshot', 'chargeTax', '_statusRemarks'].includes(k)));
const productPriceKeys = new Set(['m','rate','min','minQty','tax','taxMode','tiers','charges','compatibility','priceConfigured','pricingApproval']);
const productMetadata = (product) => ({...Object.fromEntries(Object.entries(product).filter(([key]) => !['f','giftTemplate','catalogTemplate','phase3LegacyFields','catalogLegacyFields'].includes(key) && !productPriceKeys.has(key))),...Object.fromEntries(['giftTemplate','catalogTemplate'].filter(key=>product[key]).map(key=>[key,Object.fromEntries(Object.entries(product[key]).filter(([name])=>name!=='overrides'))]))});
const fieldSchema = (fields = []) => fields.map((field) => ({ ...field,
  ...(Array.isArray(field?.o) ? { o: field.o.map((option) => Array.isArray(option) ? option[0] : option) } : {}),
  ...(Array.isArray(field?.sizes) ? { sizes: field.sizes.map(value=>value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>key!=='price')):value) } : {}),
  ...(field?.optionMeta&&typeof field.optionMeta==='object'&&!Array.isArray(field.optionMeta)?{optionMeta:Object.fromEntries(Object.entries(field.optionMeta).map(([key,m])=>[key,m&&typeof m==='object'?Object.fromEntries(Object.entries(m).filter(([k])=>k!=='approved')):m]))}:{}),
  ...(field?.eyeletPolicy?{eyeletPolicy:{...field.eyeletPolicy,approved:undefined}}:{}),
  ...(field?.customCharge?{customCharge:undefined}:{}),
}));
function optionPricesChanged(fields = [], previous = []) {
  // Adding a free specification is catalog work. Adding/removing a priced
  // option, or changing an existing option's charge, changes master pricing.
  const priceOptions = (values) => new Map(values.flatMap((field) => [
    ...(Array.isArray(field?.o) ? field.o.map((option) => {const m=field?.optionMeta?.[option?.[0]]||{};return [JSON.stringify([field.k, option?.[0]]), [option?.[1], option?.[2],m.approved??true,m.geometry??null,m.quantityKey??null,m.quantityRule??null,m.includesEyelets??false]];}) : []),
    ...(Array.isArray(field?.sizes) ? field.sizes.map(size=>[JSON.stringify([field.k,'size',size?.key]),['u',size?.price??0]]) : []),
  ]));
  const current = priceOptions(fields), old = priceOptions(previous);
  const customPrices = values => values.filter(f => f.customCharge).map(f => [f.k, f.customCharge])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  if(!equal(customPrices(fields),customPrices(previous)))return true;
  for (const key of new Set([...current.keys(), ...old.keys()])) {
    const a = current.get(key), b = old.get(key);
    if (a && b ? !equal(a,b) : (a || b)?.[1] !== 0 && !((a || b)?.[1] === null && (a || b)?.[2] === false)) return true;
  }
  return false;
}
// Derived quantity policies and replacement rate bases are pricing authority,
// including on templates that have not yet been assigned to any product.
const fieldPricingRules = (fields = []) => fields.map(f => ({
  key: f?.k, quantityRule: f?.quantityRule, eyeletPolicy: f?.eyeletPolicy, rateBasis: f?.rateBasis,
})).filter(f => f.quantityRule || f.eyeletPolicy || f.rateBasis)
  .sort((a, b) => String(a.key).localeCompare(String(b.key)));
const fieldPricingChanged = (fields, previous) => optionPricesChanged(fields, previous) ||
  !equal(fieldPricingRules(fields), fieldPricingRules(previous));
function authorizeProductChanges(products, previous, user, templates={}, previousTemplates={}) {
  if (!Array.isArray(products) || products.some((p) => !p || typeof p !== 'object' || Array.isArray(p) || (p.f !== undefined && (!Array.isArray(p.f)||p.f.some(f=>!f||typeof f!=='object'||Array.isArray(f))))))
    deny('Invalid products records.', 422);
  const metadataPermission = () => { if (!hasPermission(user, 'product.manage')) deny('Product management permission is required.'); };
  const pricingPermission = () => { if (!hasPermission(user, 'pricing.manage')) deny('Pricing management permission is required.'); };
  const old = new Map(previous.map((p) => [p.id,p]));
  if (!equal(products.map((p) => p.id), previous.map((p) => p.id))) metadataPermission();
  for (const product of products) {
    const saved = old.get(product.id);
    if (!saved) { metadataPermission(); pricingPermission(); continue; }
    let currentFields=product.f,oldFields=saved.f;
    try{const DP=require('../shared/domain'),settings=value=>value?.id==='promotional_gift'?{giftTemplate:value}:value;currentFields=DP.resolveProduct(product,settings(templates)).f;oldFields=DP.resolveProduct(saved,settings(previousTemplates)).f;}catch(error){deny(error.message,422);}
    const assignment=p=>p.giftTemplate||p.catalogTemplate;
    const rawFields=p=>assignment(p)?(p.f||[]).map(field=>({...field,k:'@raw:'+field.k})):[];
    const inactiveOverrides=p=>(assignment(p)?.disabled||[]).flatMap(key=>assignment(p)?.overrides?.[key]?[{...assignment(p).overrides[key],k:'@disabled:'+key}]:[]);
    const legacyFields=p=>['phase3LegacyFields','catalogLegacyFields'].flatMap(key=>{const fields=p[key]||[];if(!Array.isArray(fields)||fields.some(f=>!f||typeof f!=='object'||Array.isArray(f)))deny('Invalid legacy product fields.',422);return fields.map((field,index)=>({...field,k:'@'+key+':'+index+':'+field.k}));});
    currentFields=[...(currentFields||[]),...legacyFields(product),...rawFields(product),...inactiveOverrides(product)];oldFields=[...(oldFields||[]),...legacyFields(saved),...rawFields(saved),...inactiveOverrides(saved)];
    if (!equal(productMetadata(product), productMetadata(saved)) || !equal(fieldSchema(currentFields), fieldSchema(oldFields))) metadataPermission();
    if(!equal(product.phase2,saved.phase2))pricingPermission();
    if(!equal(product.phase3,saved.phase3))pricingPermission();
    if ([...productPriceKeys].some((key) => !equal(product[key],saved[key])) || fieldPricingChanged(currentFields, oldFields)) pricingPermission();
    old.delete(product.id);
  }
  if (old.size) { metadataPermission(); pricingPermission(); }
}
function authorizeSettingsChanges(settings, previous, user){
 const company=value=>Object.fromEntries(Object.entries(value||{}).filter(([key])=>!['giftTemplate','catalogTemplates'].includes(key)));
 if(!equal(company(settings),company(previous)))requirePermission(user,'settings.manage');
 if(!equal(settings?.giftTemplate,previous?.giftTemplate)){
  const DP=require('../shared/domain'),current=settings?.giftTemplate===undefined?DP.giftTemplate():settings.giftTemplate,saved=previous?.giftTemplate===undefined?DP.giftTemplate():previous.giftTemplate;
  const fields=current?.f||[],old=saved?.f||[];
  if(!Array.isArray(fields)||!Array.isArray(old)||[...fields,...old].some(f=>!f||typeof f!=='object'||Array.isArray(f)))deny('Invalid promotional gift template.',422);
  if(!equal(fieldSchema(fields),fieldSchema(old))||!equal(current?.id,saved?.id)||!equal(current?.version,saved?.version)||!equal(current?.name,saved?.name))requirePermission(user,'product.manage');
  if(fieldPricingChanged(fields,old))requirePermission(user,'pricing.manage');
 }
 if(!equal(settings?.catalogTemplates,previous?.catalogTemplates)){
  const DP=require('../shared/domain'),current=settings?.catalogTemplates,saved=previous?.catalogTemplates;
  for(const value of [current,saved])if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['print_product','area_product','stationery_product'].includes(key))))deny('Invalid catalog templates.',422);
  for(const key of ['print_product','area_product','stationery_product']){
   const a=current?.[key]||DP.catalogTemplate(key),b=saved?.[key]||DP.catalogTemplate(key),fields=a?.f,old=b?.f;
   if(!Array.isArray(fields)||!Array.isArray(old)||[...fields,...old].some(f=>!f||typeof f!=='object'||Array.isArray(f)))deny('Invalid catalog template.',422);
   if(!equal(fieldSchema(fields),fieldSchema(old))||!equal(a?.id,b?.id)||!equal(a?.version,b?.version)||!equal(a?.name,b?.name))requirePermission(user,'product.manage');
   if(fieldPricingChanged(fields,old))requirePermission(user,'pricing.manage');
  }
 }
}
function authorizeChanges(input, previous, user) {
  for (const key of ['cats', 'products', 'customers', 'quotes']) {
    if (!Array.isArray(input[key]) || input[key].some((record) => !record || typeof record !== 'object' || Array.isArray(record)))
      deny(`Invalid ${key} records.`, 422);
  }
  authorizeSettingsChanges(input.set,previous.set,user);
  if (!equal(input.cats, previous.cats)) requirePermission(user, 'product.manage');
  authorizeProductChanges(input.products, previous.products, user,input.set,previous.set);
  const oldCustomers = new Map(previous.customers.map((c) => [c.id, c]));
  for (const customer of input.customers || []) {
    const old = oldCustomers.get(customer.id);
    if (!old) requirePermission(user, 'customer.create');
    else if (!equal(customer, old)) requirePermission(user, 'customer.edit');
    oldCustomers.delete(customer.id);
  }
  if (oldCustomers.size) requirePermission(user, 'customer.delete');
  const oldQuotes = new Map(previous.quotes.map((q) => [q.id, q]));
  for (const quote of input.quotes || []) {
    const old = oldQuotes.get(quote.id);
    if (!old) requirePermission(user, 'quotation.create');
    else if (!equal(quote, old)) {
      requireQuoteAccess(user, old);
      if (!equal(editableFields(quote), editableFields(old))) {
        if (!hasPermission(user, 'quotation.edit_all') &&
            !(ownsQuote(user, old) && hasPermission(user, 'quotation.edit_own'))) deny();
        if (!hasPermission(user, 'quotation.edit_all') && old.status !== 'Draft')
          deny('Only draft quotations may be edited. Duplicate this quotation to revise it.');
      }
      if (quote.status !== old.status) {
        if (quote.status === 'Approved Internally') {
          requirePermission(user, 'quotation.approve');
          if ((input.set.independentApproval ?? true) && ownsQuote(user, old))
            deny('An independent approver must approve this quotation.');
        } else requirePermission(user, 'quotation.status');
        if (!hasPermission(user, 'quotation.edit_all') && !ownsQuote(user, old) &&
            !hasPermission(user, 'quotation.approve')) deny();
      }
    }
    oldQuotes.delete(quote.id);
  }
  for (const quote of oldQuotes.values()) {
    requireQuoteAccess(user, quote);
    requirePermission(user, 'quotation.delete');
  }
}
function scopeState(result, user) {
  if (!result?.state) return result;
  const state = structuredClone(result.state);
  state.quotes = state.quotes.filter((q) => canViewQuote(user, q));
  if (!hasPermission(user, 'audit.view')) {
    const visible = new Set(state.quotes.map((q) => q.id));
    state.log = state.log.filter((e) => e.entityType === 'quotes'
      ? visible.has(e.entityId) : e.actorId === user.id);
  }
  if (!hasPermission(user, 'customer.view')) state.customers = [];
  if (!['product.view','product.manage','pricing.manage'].some((permission) => hasPermission(user, permission))) { state.products = []; state.cats = []; }
  return { ...result, state: scopeCatalogData(state, user) };
}
module.exports = { PERMISSIONS, EMPLOYEE_PERMISSIONS, permissionInput, permissionOverrides,
  effectivePermissions, hasPermission, requirePermission, ownsQuote, canViewQuote,
  requireQuoteAccess, authorizeProductChanges, authorizeSettingsChanges, authorizeChanges, scopeState,
  canReadPricing, scopeCatalogData, restorePrivatePricing };
