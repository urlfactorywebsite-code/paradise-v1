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
const productPriceKeys = new Set(['m','rate','min','minQty','tax','taxMode','tiers','charges','compatibility','priceConfigured']);
const productMetadata = (product) => Object.fromEntries(Object.entries(product).filter(([key]) => key !== 'f' && !productPriceKeys.has(key)));
const fieldSchema = (fields = []) => fields.map((field) => ({ ...field,
  ...(Array.isArray(field?.o) ? { o: field.o.map((option) => Array.isArray(option) ? option[0] : option) } : {}),
}));
function optionPricesChanged(fields = [], previous = []) {
  // Adding a free specification is catalog work. Adding/removing a priced
  // option, or changing an existing option's charge, changes master pricing.
  const priceOptions = (values) => new Map(values.flatMap((field) =>
    Array.isArray(field?.o) ? field.o.map((option) => [JSON.stringify([field.k, option?.[0]]), [option?.[1], option?.[2]]]) : []));
  const current = priceOptions(fields), old = priceOptions(previous);
  for (const key of new Set([...current.keys(), ...old.keys()])) {
    const a = current.get(key), b = old.get(key);
    if (a && b ? !equal(a,b) : (a || b)?.[1] !== 0) return true;
  }
  return false;
}
function authorizeProductChanges(products, previous, user) {
  if (!Array.isArray(products) || products.some((p) => !p || typeof p !== 'object' || Array.isArray(p) || (p.f !== undefined && !Array.isArray(p.f))))
    deny('Invalid products records.', 422);
  const metadataPermission = () => { if (!hasPermission(user, 'product.manage')) deny('Product management permission is required.'); };
  const pricingPermission = () => { if (!hasPermission(user, 'pricing.manage')) deny('Pricing management permission is required.'); };
  const old = new Map(previous.map((p) => [p.id,p]));
  if (!equal(products.map((p) => p.id), previous.map((p) => p.id))) metadataPermission();
  for (const product of products) {
    const saved = old.get(product.id);
    if (!saved) { metadataPermission(); pricingPermission(); continue; }
    if (!equal(productMetadata(product), productMetadata(saved)) || !equal(fieldSchema(product.f), fieldSchema(saved.f))) metadataPermission();
    if ([...productPriceKeys].some((key) => !equal(product[key],saved[key])) || optionPricesChanged(product.f, saved.f)) pricingPermission();
    old.delete(product.id);
  }
  if (old.size) { metadataPermission(); pricingPermission(); }
}
function authorizeChanges(input, previous, user) {
  for (const key of ['cats', 'products', 'customers', 'quotes']) {
    if (!Array.isArray(input[key]) || input[key].some((record) => !record || typeof record !== 'object' || Array.isArray(record)))
      deny(`Invalid ${key} records.`, 422);
  }
  if (!equal(input.set, previous.set)) requirePermission(user, 'settings.manage');
  if (!equal(input.cats, previous.cats)) requirePermission(user, 'product.manage');
  authorizeProductChanges(input.products, previous.products, user);
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
  return { ...result, state };
}
module.exports = { PERMISSIONS, EMPLOYEE_PERMISSIONS, permissionInput, permissionOverrides,
  effectivePermissions, hasPermission, requirePermission, ownsQuote, canViewQuote,
  requireQuoteAccess, authorizeProductChanges, authorizeChanges, scopeState };
