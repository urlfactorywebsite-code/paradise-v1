'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const DP = require('../shared/domain');

test('sample records use contextual customer addresses and quotation descriptions', () => {
  const state = DP.seed();
  assert.doesNotMatch(JSON.stringify(state), /\[\s*placeholder\b[^\]]*\]/i);
  for (const customer of state.customers) {
    assert.match(customer.addr, /Salem, Tamil Nadu \d{6}$/);
    assert.doesNotMatch(customer.addr, /Demo address/);
    assert.ok(customer.person.trim().includes(' '));
  }
  for (const quote of state.quotes) {
    assert.doesNotMatch(quote.project + quote.subject, /Demo project|Quotation \(demonstration data\)/);
    assert.ok(quote.project.length > 15);
    assert.ok(quote.subject.length > 15);
  }
});

test('legacy company labels render as contextual examples without modifying saved settings', () => {
  const source = {
    ...DP.seed({ demo: false }).set,
    name: '[Placeholder]', tag: '[PLACEHOLDER: Tagline]', addr: '[Placeholder address]',
    phone: '[ Placeholder phone ]', email: '[Placeholder Email]', web: '[Placeholder website]',
    gstin: '[Placeholder GSTIN]', prefix: '[Placeholder prefix]',
    signature: '[Placeholder signatory]', footer: '[Placeholder footer]',
    customerNotes: '[Placeholder customer note]', terms: ['[Placeholder terms]'],
  };
  const before = structuredClone(source), details = DP.companyDetails(source);
  assert.doesNotMatch(JSON.stringify(details), /\[\s*placeholder\b[^\]]*\]/i);
  assert.equal(details.addr, '12 Gandhi Road, Salem, Tamil Nadu 636001');
  assert.equal(details.signature, 'Design Paradise Team');
  assert.match(details.footer, /Thank you/);
  assert.match(details.customerNotes, /approve the final artwork/);
  assert.equal(details.terms[0], DP.TERMS[0]);
  assert.deepEqual(source, before);
});

test('legacy markers are removed while customized company content and intentional blanks survive', () => {
  const source = {
    ...DP.seed({ demo: false }).set,
    addr: '42 Custom Road [Placeholder]', phone: '+91 95555 12345 [Placeholder phone]',
    name: '  Customer supplied brand  ', signature: '', footer: 'Artwork approved by the customer.',
    customerNotes: '', terms: ['  Delivery within 10 days  ', 'Artwork approval required [Placeholder]'],
  };
  const details = DP.companyDetails(source);
  assert.equal(details.addr, '42 Custom Road');
  assert.equal(details.phone, '+91 95555 12345');
  assert.equal(details.name, source.name);
  assert.equal(details.signature, '');
  assert.equal(details.customerNotes, '');
  assert.equal(details.footer, source.footer);
  assert.deepEqual(details.terms, ['  Delivery within 10 days  ', 'Artwork approval required']);
});
