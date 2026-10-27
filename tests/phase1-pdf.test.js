'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DP = require('../shared/domain');
const { quotationPdf } = require('../server/pdf');

function product(fields) {
  return { id: 'phase1-product', code: 'P1-PDF', name: 'Custom garment', cat: 'c3',
    m: 'unit', rate: 20, min: 0, minQty: 1, tax: 18, taxMode: 'exclusive',
    on: 1, f: fields };
}

function fixture(fields, values) {
  const state = DP.seed();
  const configured = product(fields);
  const config = { ...DP.defCfg(configured), ...values };
  const result = DP.calc(configured, config);
  assert.equal(result.err, null);
  const item = DP.mkItem(configured, config, 'pdf-item', 'PRIVATE-ITEM-NOTE');
  const quote = { ...state.quotes[0], items: [item], disc: { t: 'p', v: 0 },
    companySnapshot: { ...state.set, showNotes: true } };
  return { state, quote, item, configured };
}

const contentOf = ({ quote, state }) => quotationPdf(quote, state).toString('latin1');

test('Phase 1 PDFs include flagged text, dropdown and multiselect values with readable labels', () => {
  const data = fixture([
    { k: 'customerMemo', l: 'Memo', t: 'txt', show_on_customer_pdf: true },
    { k: 'designReq', l: 'Design Requirements', t: 'txt', show_on_customer_pdf: true },
    { k: 'finish', l: 'Finish', t: 'sel', o: [['MATTE-FINISH', 'f', 0]], show_on_customer_pdf: true },
    { k: 'services', l: 'Services', t: 'multi', o: [['FOIL-SERVICE', 'f', 0], ['EMBOSS-SERVICE', 'f', 0]], show_on_customer_pdf: true },
  ], { qty: 3, customerMemo: 'CUSTOMER-NOTE', designReq: 'ARTWORK-APPROVED', services: ['FOIL-SERVICE', 'EMBOSS-SERVICE'] });
  const content = contentOf(data);
  assert.ok(content.startsWith('%PDF-'));
  for (const expected of ['Memo:', 'CUSTOMER-NOTE', 'Design Requirements:', 'ARTWORK-APPROVED', 'Finish:', 'MATTE-FINISH', 'Services:', 'FOIL-SERVICE', 'EMBOSS-SERVICE']) {
    assert.ok(content.includes(expected), expected);
  }
  assert.ok(!content.includes('PRIVATE-ITEM-NOTE'));
});

test('Phase 1 PDFs omit hidden, unflagged narrative, empty and conditionally hidden fields', () => {
  const data = fixture([
    { k: 'finish', l: 'Finish', t: 'sel', o: [['Standard', 'f', 0], ['Custom', 'f', 0]] },
    { k: 'hidden', l: 'Hidden text', t: 'txt', show_on_customer_pdf: false },
    { k: 'designReq', l: 'Design Requirements', t: 'txt' },
    { k: 'additionalReq', l: 'Additional Requirements', t: 'txt' },
    { k: 'optional', l: 'Empty optional', t: 'txt', show_on_customer_pdf: true },
    { k: 'details', l: 'Custom Finish Details', t: 'txt', show_on_customer_pdf: true, when: { key: 'finish', equals: 'Custom' } },
  ], { qty: 2, hidden: 'HIDDEN-VALUE', designReq: 'UNFLAGGED-DESIGN', additionalReq: 'UNFLAGGED-ADDITIONAL', optional: '   ', details: 'HIDDEN-CONDITIONAL' });
  const content = contentOf(data);
  for (const unexpected of ['HIDDEN-VALUE', 'UNFLAGGED-DESIGN', 'UNFLAGGED-ADDITIONAL', 'Empty optional', 'HIDDEN-CONDITIONAL', 'Custom Finish Details']) {
    assert.ok(!content.includes(unexpected), unexpected);
  }
});

test('Phase 1 PDFs always exclude internal fields despite forged visibility flags', () => {
  const data = fixture([
    { k: 'productionSecret', l: 'Production record', t: 'txt', internal_only: true, show_on_customer_pdf: true },
    { k: 'note', l: 'Notes', t: 'txt', show_on_customer_pdf: true },
    { k: 'internalNotes', l: 'Instructions', t: 'txt', show_on_customer_pdf: true },
    { k: 'staff', l: 'Staff Notes', t: 'txt', show_on_customer_pdf: true },
    { k: 'privateMemo', l: 'Memo', t: 'txt', show_on_customer_pdf: true },
    { k: 'hiddenChoice', l: 'Internal choice', t: 'sel', o: [['SECRET-CHOICE', 'f', 0]], show_on_customer_pdf: true },
  ], { qty: 1, note:'SECRET-GENERIC-NOTES', productionSecret: 'SECRET-PRODUCTION', internalNotes: 'SECRET-INTERNAL', staff: 'SECRET-STAFF', privateMemo: 'SECRET-PRIVATE' });
  data.item.sp.push('Internal notes: SECRET-FORGED-SPEC');
  data.quote.customerSnapshot = { ...data.state.customers[0], notes: 'SECRET-CUSTOMER' };
  const before = JSON.stringify(data);
  const content = contentOf(data);
  for (const unexpected of ['SECRET-GENERIC-NOTES', 'SECRET-PRODUCTION', 'SECRET-INTERNAL', 'SECRET-STAFF', 'SECRET-PRIVATE', 'SECRET-CHOICE', 'SECRET-FORGED-SPEC', 'SECRET-CUSTOMER', 'PRIVATE-ITEM-NOTE']) {
    assert.ok(!content.includes(unexpected), unexpected);
  }
  assert.equal(JSON.stringify(data), before, 'PDF generation preserves saved quotation data');
});

test('Phase 1 PDFs format reusable size labels, omit zero entries and preserve their total price', () => {
  const data = fixture([
    { k: 'garmentSizes', l: 'Size breakdown', t: 'SIZE_BREAKDOWN', show_on_customer_pdf: true,
      sizes: [
        { key: 'xs', label: 'XS', enabled: true, price: 0 },
        { key: 'kids', label: 'Kids 6-8', enabled: true, price: 2 },
        { key: 'xl', label: 'XL', enabled: true, price: 5 },
        { key: 'disabled', label: 'DISABLED-SIZE', enabled: false, price: 0 },
      ] },
  ], { garmentSizes: { xs: 5, kids: 10, xl: 0 } });
  assert.equal(data.item.qty, 15);
  assert.equal(data.item.sub, 32000);
  const specs = DP.customerSpecifications(data.item).join('; ');
  assert.match(specs, /Size breakdown:/);
  assert.match(specs, /XS\D+5/);
  assert.match(specs, /Kids 6-8\D+10/);
  assert.doesNotMatch(specs, /XL|DISABLED-SIZE/);
  const content = contentOf(data);
  for (const expected of ['Size breakdown:', 'XS', 'Kids 6-8', DP.rs(DP.totals(data.quote, data.state.set).grand)]) assert.ok(content.includes(expected), expected);
  assert.ok(!content.includes('DISABLED-SIZE'));
});

test('Phase 1 PDF field metadata remains a quotation snapshot and cannot change pricing', () => {
  const field = { k: 'reference', l: 'Public', t: 'txt', show_on_customer_pdf: true };
  const data = fixture([field], { qty: 2, reference: 'ONLYONCEMARKER' });
  data.item.sp.push('Public: ONLYONCEMARKER');
  const beforePrice = data.item.sub;
  data.configured.f[0].show_on_customer_pdf = false;
  data.configured.f[0].l = 'RENAMED-AFTER-SAVE';
  data.state.products.push(data.configured);
  const content = contentOf(data);
  assert.ok(content.includes('Public: ONLYONCEMARKER'));
  assert.ok(!content.includes('RENAMED-AFTER-SAVE'));
  assert.equal((content.match(/ONLYONCEMARKER/g) || []).length, 1);
  assert.equal(data.item.sub, beforePrice);
  const hidden = product([{ ...field, show_on_customer_pdf: false }]);
  assert.equal(DP.calc(hidden, { qty: 2, reference: 'ONLYONCEMARKER' }).sub, beforePrice);
});

test('Phase 1 PDFs preserve legacy specifications while sanitizing internal narrative labels', () => {
  const state = DP.seed(), quote = state.quotes[2];
  for (const item of quote.items) delete item.fieldSnapshot;
  quote.items[0].sp.push('Finish: LEGACY-FINISH', 'Finish: LEGACY-FINISH', 'Internal notes: LEGACY-INTERNAL', 'Staff notes: LEGACY-STAFF', 'Production Internal Notes: LEGACY-PRODUCTION', 'Notes: LEGACY-PRIVATE-NOTE');
  quote.items[0].notes = 'LEGACY-ITEM-NOTE';
  const before = JSON.stringify(quote), content = quotationPdf(quote, state).toString('latin1');
  for (const expected of ['T-Shirt Printing', 'LEGACY-FINISH', 'Sizes:', DP.rs(DP.totals(quote, state.set).grand)]) assert.ok(content.includes(expected), expected);
  assert.equal((content.match(/LEGACY-FINISH/g) || []).length, 1);
  for (const unexpected of ['LEGACY-INTERNAL', 'LEGACY-STAFF', 'LEGACY-PRODUCTION', 'LEGACY-PRIVATE-NOTE', 'LEGACY-ITEM-NOTE']) assert.ok(!content.includes(unexpected), unexpected);
  assert.equal(JSON.stringify(quote), before);
});
