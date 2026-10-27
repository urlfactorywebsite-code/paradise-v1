'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const DP = require('../shared/domain');
const { quotationPdf } = require('../server/pdf');
const raw = code => DP.seed({ demo: false }).products.find(p => p.code === code);
function documentFor(product, cfg, notes = 'P3-PRIVATE-ITEM-NOTE') {
 const state = DP.seed(), item = DP.mkItem(product, cfg, 'phase3-pdf-item', notes);
 assert.ok(item, DP.calc(product, cfg).err);
 const quote = { ...state.quotes[0], items: [item], disc: { t: 'p', v: 0 }, companySnapshot: { ...state.set, showNotes: true } };
 return { state, quote, item, content: () => quotationPdf(quote, state).toString('latin1') };
}

test('Phase 3 PDF A: reusable T-shirt sizes, multiple locations and public requirements render once without internal notes', () => {
 const p = DP.phase3Product(raw('PG-TS'), DP.giftTemplate()), loc = p.f.find(f => f.k === 'printLocations'), sizes = p.f.find(f => f.t === 'SIZE_BREAKDOWN');
 for (const value of ['Front', 'Back']) { loc.o.find(o => o[0] === value)[2] = 1; Object.assign(loc.optionMeta[value], { enabled: true, approved: true }); }
 sizes.sizes.push({ key: 'kids', label: 'Kids 6-8', enabled: true, price: 2 });
 const cfg = { ...DP.defCfg(p), sz: { S: 8, kids: 2 }, printLocations: ['Front', 'Back'], designRequirements: 'P3-SHIRT-REQUIREMENTS', note: 'P3-PRIVATE-FIELD-NOTE' };
 const data = documentFor(p, cfg), before = JSON.stringify(data.quote);
 const content = data.content();
 for (const value of ['Print Locations:', 'Front, Back', 'P3-SHIRT-REQUIREMENTS', 'Kids 6-8', 'Size breakdown:']) assert.ok(content.includes(value), value);
 assert.equal((content.match(/P3-SHIRT-REQUIREMENTS/g) || []).length, 1);
 for (const value of ['P3-PRIVATE-FIELD-NOTE', 'P3-PRIVATE-ITEM-NOTE', '1 Location', '2 Locations']) assert.ok(!content.includes(value), value);
 assert.equal(JSON.stringify(data.quote), before);
});

test('Phase 3 PDF B/C: Logo and gift narratives respect visibility, empties and immutable snapshots', () => {
 const template = DP.giftTemplate();
 const logo = DP.phase3Product(raw('GD-LG'), template), visible = documentFor(logo, { ...DP.defCfg(logo), additionalRequirements: 'P3-LOGO-CUSTOMER-DETAIL' });
 assert.ok(visible.content().includes('P3-LOGO-CUSTOMER-DETAIL'));
 logo.f.find(f => f.k === 'additionalRequirements').show_on_customer_pdf = false;
 const hidden = documentFor(logo, { ...DP.defCfg(logo), additionalRequirements: 'P3-LOGO-HIDDEN-DETAIL' });
 assert.ok(!hidden.content().includes('P3-LOGO-HIDDEN-DETAIL'));
 for (const code of ['PG-PB', 'PG-KC', 'PG-MG', 'PG-TC', 'PG-ST']) {
  const p = DP.resolveGiftProduct(DP.phase3Product(raw(code), template), template), cfg = { ...DP.defCfg(p), artwork: 'P3-GIFT-REFERENCE-' + code };
  const data = documentFor(p, cfg), content = data.content();
  assert.ok(content.includes(cfg.artwork), code);
  assert.equal((content.match(new RegExp(cfg.artwork, 'g')) || []).length, 1);
  assert.ok(!content.includes('Colour:;')); assert.ok(!content.includes('P3-PRIVATE-ITEM-NOTE'));
  p.f.find(f => f.k === 'artwork').l = 'Changed after saved quote';
  template.f.find(f => f.k === 'artwork').show_on_customer_pdf = false;
  assert.ok(data.content().includes(cfg.artwork));
  assert.ok(!data.content().includes('Changed after saved quote'));
  template.f.find(f => f.k === 'artwork').show_on_customer_pdf = true;
 }
});

test('Phase 3 PDF D: legacy T-shirt and gift documents remain historically identical after explicit setup', () => {
 const state = DP.seed(), before = structuredClone(state.quotes);
 const specs = state.quotes.map(q => q.items.map(DP.customerSpecifications));
 for (const q of state.quotes) assert.ok(quotationPdf(q, state).toString('latin1').startsWith('%PDF-'));
 state.set.giftTemplate = DP.giftTemplate();
 state.products = state.products.map(p => ['PG-TS', 'GD-LG', 'PG-PB', 'PG-KC', 'PG-MG', 'PG-TC', 'PG-ST'].includes(p.code) ? DP.phase3Product(p, state.set.giftTemplate) : p);
 assert.deepEqual(state.quotes, before);
 assert.deepEqual(state.quotes.map(q => q.items.map(DP.customerSpecifications)), specs);
 const legacy = quotationPdf(state.quotes[2], state).toString('latin1');
 assert.ok(legacy.includes('1 Location')); assert.ok(legacy.includes('T-Shirt Printing'));
 for (const q of state.quotes) assert.ok(quotationPdf(q, state).toString('latin1').startsWith('%PDF-'));
});
