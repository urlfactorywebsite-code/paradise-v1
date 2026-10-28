'use strict';
const { integer } = require('./queries');
const { fail } = require('./validation');
const { hasPermission } = require('./access');
const Readiness = require('../shared/pricing-readiness');

// Display-only projection of the existing activation/quotation contract. Scan
// in bounded batches; neither full definitions nor prices travel to the table.
async function productCatalog(store, params, user) {
  if (!store.db.inTransaction)
    return store.transaction(() => productCatalog(store, params, user));
  const requested = integer(params.get('page'), 1, 1000000);
  const pageSize = integer(params.get('pageSize'), 25, 100);
  const q = (params.get('q') || '').trim().toLocaleLowerCase();
  if (q.length > 200) fail('Search is too long.');
  const category = params.get('category') || '', active = params.get('active');
  if (active !== null && !['0', '1'].includes(active)) fail('Active must be 0 or 1.');
  const readiness = params.get('readiness') || '';
  if (!['', 'ready', 'attention', 'configuration', 'pricing'].includes(readiness))
    fail('Invalid readiness filter.');
  const workspace = await store.db.prepare('SELECT settings FROM workspace WHERE id=1').get();
  if (!workspace) fail('Complete administrator setup first.', 409);
  const settings = JSON.parse(workspace.settings);
  const cats = (await store.db.prepare('SELECT body FROM categories ORDER BY name,id').all()).map(r => JSON.parse(r.body));
  const categoryNames = new Map(cats.map(c => [c.id, c.name]));
  const pricingVisible = hasPermission(user, 'pricing.view') || hasPermission(user, 'pricing.manage');
  const summary = { total: 0, attention: 0 };
  let total = 0, cursor, rows = [], lastPage = [];
  for (;;) {
    const batch = await store.db.prepare(`SELECT name,id,body FROM products ${cursor ? 'WHERE (name,id)>(?,?)' : ''} ORDER BY name,id LIMIT 100`).all(...(cursor || []));
    if (!batch.length) break;
    for (const record of batch) {
      const p = JSON.parse(record.body), eligibility = Readiness.eligibility(p, settings, cats);
      const configurationReady = !eligibility.errors.some(c => ['PRODUCT','CATEGORY','TEMPLATE','CONFIGURATION'].includes(c.code));
      const pricingReady = !eligibility.errors.some(c => !['PRODUCT','CATEGORY','TEMPLATE','CONFIGURATION'].includes(c.code)) && eligibility.checks.some(c => c.code === 'BASE_RATE');
      const ready = !!p.on && eligibility.eligible;
      summary.total++;
      if (!ready) summary.attention++;
      if (q && ![p.name, p.code].some(v => String(v || '').toLocaleLowerCase().includes(q))) continue;
      if (category && p.cat !== category || active !== null && Number(!!p.on) !== Number(active)) continue;
      if (readiness === 'ready' && !ready || readiness === 'attention' && ready || readiness === 'configuration' && configurationReady || readiness === 'pricing' && pricingReady) continue;
      const row = { id:p.id, code:p.code, name:p.name, cat:p.cat, category:categoryNames.get(p.cat) || 'Missing category', m:p.m,
        tiered:p.m === 'tier' || p.m === 'unit' && !!p.tiers?.length, on:!!p.on,
        tax:pricingVisible ? p.tax ?? null : null, taxMode:pricingVisible ? p.taxMode ?? 'exclusive' : null, pricingVisible,
        configurationReady, pricingReady, ready };
      total++;
      if (total > (requested - 1) * pageSize && total <= requested * pageSize) rows.push(row);
      if ((total - 1) % pageSize === 0) lastPage = [];
      lastPage.push(row);
    }
    const last = batch.at(-1); cursor = [last.name, last.id];
  }
  const totalPages = Math.ceil(total / pageSize), page = Math.min(requested, Math.max(1, totalPages));
  if (page !== requested) rows = lastPage;
  return { data:rows, summary, categories:cats.map(({id,name}) => ({id,name})), pagination:{page,pageSize,total,totalPages} };
}
module.exports = { productCatalog };
