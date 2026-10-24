'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DP = require('../shared/domain');
const { quotationPdf } = require('../server/pdf');

function fixture() {
  const state = DP.seed(), quote = state.quotes[0];
  quote.customerSnapshot = { ...state.customers[0], name: 'SAVED-CUSTOMER-NAME', person: 'Customer contact', wa: '+919000000001', notes: 'PRIVATE-CUSTOMER-NOTE' };
  quote.companySnapshot = { ...state.set, showNotes: true, signature: 'Design Paradise Team', footer: 'CUSTOMER-FOOTER', customerNotes: 'CUSTOMER-PUBLIC-NOTE' };
  quote.ref = 'CUSTOMER-REFERENCE'; quote.req = 'CUSTOMER-REQUIREMENTS';
  quote.items[0].notes = 'PRIVATE-ITEM-NOTE';
  return { state, quote };
}

test('customer PDFs include public quotation details and never internal notes', () => {
  const { state, quote } = fixture();
  const before = JSON.stringify({ state, quote });
  const pdf = quotationPdf(quote, state), content = pdf.toString('latin1');
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  for (const expected of ['CUSTOMER-REFERENCE', 'CUSTOMER-REQUIREMENTS', 'Customer contact', '+919000000001', 'CUSTOMER-PUBLIC-NOTE', 'CUSTOMER-FOOTER', 'Design Paradise Team', DP.rs(DP.totals(quote, state.set).grand)]) assert.ok(content.includes(expected), expected);
  assert.ok(!content.includes('PRIVATE-ITEM-NOTE'));
  assert.ok(!content.includes('PRIVATE-CUSTOMER-NOTE'));
  assert.equal(JSON.stringify({ state, quote }), before, 'PDF generation does not mutate business data');
});

test('saved quotation company, customer and product snapshots survive catalog changes', () => {
  const { state, quote } = fixture();
  const total = DP.totals(quote, state.set).grand;
  state.set.name = 'NEW-COMPANY-NAME'; state.set.taxDisplay = 'igst';
  state.customers[0].name = 'NEW-CUSTOMER-NAME';
  state.products[0].name = 'NEW-PRODUCT-NAME'; state.products[0].tiers = [[1, 9999]];
  const content = quotationPdf(quote, state).toString('latin1');
  for (const unexpected of ['NEW-COMPANY-NAME', 'NEW-CUSTOMER-NAME', 'NEW-PRODUCT-NAME']) assert.ok(!content.includes(unexpected));
  assert.ok(content.includes(quote.customerSnapshot.name));
  assert.ok(content.includes(DP.rs(total)));
  assert.ok(content.includes('CGST'));
  assert.ok(!content.includes('IGST'));
});

test('IGST and split GST use the same saved financial totals', () => {
  const { state, quote } = fixture();
  quote.taxDisplay = 'igst';
  const integrated = quotationPdf(quote, state).toString('latin1');
  assert.ok(integrated.includes('IGST 18%'));
  assert.ok(!integrated.includes('CGST'));
  assert.ok(!integrated.includes('SGST'));
  quote.taxDisplay = 'split';
  const split = quotationPdf(quote, state).toString('latin1');
  assert.ok(split.includes('CGST 9%'));
  assert.ok(split.includes('SGST 9%'));
  assert.ok(split.includes(DP.rs(DP.totals(quote, state.set).grand)));
  assert.ok(integrated.includes(DP.rs(DP.totals(quote, state.set).grand)));
});

test('long specifications and many items produce numbered multipage quotation PDFs', () => {
  const { state, quote } = fixture();
  quote.items = Array.from({ length: 28 }, (_, index) => ({ ...quote.items[0], id: `long-${index}`, name: `Product batch ${index + 1}`, sp: [...quote.items[0].sp, 'Long customer-facing specification. '.repeat(30)] }));
  const content = quotationPdf(quote, state).toString('latin1');
  const pages = (content.match(/\/Type \/Page\b/g) || []).length;
  assert.ok(pages > 2, 'Long quotation spans multiple pages');
  for (let page = 1; page <= pages; page++) assert.ok(content.includes(`Page ${page} of ${pages}`), `Page ${page} has a page number`);
  assert.ok(content.includes('Product batch 28'));
  assert.ok(content.includes('Terms and conditions'));
  assert.ok(content.includes('Customer Acceptance'));
  assert.ok(!content.includes('PRIVATE-ITEM-NOTE'));
});

test('missing optional terms and invalid legacy logos cannot prevent PDF downloads', () => {
  const { state, quote } = fixture();
  quote.terms = [];
  quote.companySnapshot.logo = 'data:image/png;base64,aW52YWxpZA==';
  assert.equal(quotationPdf(quote, state).subarray(0, 5).toString(), '%PDF-');
});

test('company logo is embedded as an image in the quotation PDF', () => {
  const { state, quote } = fixture();
  quote.companySnapshot.logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAF0lEQVR4nGPkDk1gIASYCKoYVTQAQQAAYcYA2KoDDxwAAAAASUVORK5CYII=';
  assert.ok(quotationPdf(quote, state).toString('latin1').includes('/Subtype /Image'));
});

test('all standard sample quotations fit on one page with their complete terms and signatures', () => {
  const state = DP.seed();
  for (const quote of state.quotes) {
    const content = quotationPdf(quote, state).toString('latin1');
    assert.equal((content.match(/\/Type \/Page\b/g) || []).length, 1, quote.no);
    assert.ok(content.includes('Page 1 of 1'));
    assert.ok(content.includes('GRAND TOTAL'));
    assert.ok(content.includes(DP.rs(DP.totals(quote, state.set).grand)));
    for (let index = 0; index < quote.terms.length; index++) {
      assert.ok(content.includes(`${index + 1}. ${quote.terms[index].split(' ').slice(0, 3).join(' ')}`), `Term ${index + 1}`);
    }
    assert.ok(content.includes('Authorized Signatory'));
    assert.ok(content.includes('Customer Acceptance'));
  }
});

test('dense quotations fit five fully specified items without dropping nonzero charges or notes', () => {
  const state = DP.seed(), quote = state.quotes[0];
  quote.items = Array.from({ length: 5 }, (_, index) => ({ ...quote.items[0], id: `dense-${index}`, name: `Print batch ${index + 1}` }));
  quote.del = 500; quote.oth = 150;
  quote.companySnapshot = { ...state.set, customerNotes: 'Approve the artwork before printing.', signature: 'Design Paradise Team' };
  const before = JSON.stringify({ state, quote });
  const content = quotationPdf(quote, state).toString('latin1');
  assert.equal((content.match(/\/Type \/Page\b/g) || []).length, 1);
  for (const expected of ['Print batch 5', 'Delivery charges', 'Other charges', 'Rs. 500.00', 'Rs. 150.00', 'Discount', 'Notes for the customer', 'Design Paradise Team', DP.rs(DP.totals(quote, state.set).grand)]) assert.ok(content.includes(expected), expected);
  assert.equal(JSON.stringify({ state, quote }), before);
});

test('legacy company and saved term labels are replaced in PDFs without changing the saved quotation', () => {
  const { state, quote } = fixture();
  quote.companySnapshot.name = '[Placeholder company]';
  quote.companySnapshot.addr = '[Placeholder: Address]';
  quote.companySnapshot.signature = '[Placeholder]';
  quote.companySnapshot.footer = '[Placeholder Footer]';
  quote.companySnapshot.customerNotes = '[Placeholder Notes]';
  quote.terms = ['[Placeholder Terms]'];
  const before = JSON.stringify(quote), content = quotationPdf(quote, state).toString('latin1');
  assert.doesNotMatch(content, /\[\s*placeholder\b/i);
  for (const expected of ['DESIGN PARADISE', '12 Gandhi Road', 'Design Paradise Team', 'Thank you for choosing', '1. This quotation']) assert.ok(content.includes(expected), expected);
  assert.equal(JSON.stringify(quote), before);
});

test('lengthy notes and terms can continue beside totals without losing their final text', () => {
  const { state, quote } = fixture();
  quote.companySnapshot.customerNotes = 'Review production specifications before approval. '.repeat(70) + 'CUSTOMER-NOTES-END';
  quote.terms = Array.from({ length: 12 }, (_, index) => `TERM-${index + 1}: ${'Approval and delivery schedule to be confirmed. '.repeat(12)}TERM-END-${index + 1}`);
  const content = quotationPdf(quote, state).toString('latin1');
  const pages = (content.match(/\/Type \/Page\b/g) || []).length;
  assert.ok(pages > 1);
  assert.ok(content.includes('CUSTOMER-NOTES-END'));
  for (let index = 1; index <= quote.terms.length; index++) assert.ok(content.includes(`TERM-END-${index}`));
  assert.ok(content.includes(DP.rs(DP.totals(quote, state.set).grand)));
  assert.ok(content.includes('Customer Acceptance'));
});
