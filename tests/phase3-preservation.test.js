'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DP = require('../shared/domain');
const { cfg, validateState } = require('../server/validation');

const existingProduct = code => DP.seed({ demo: false }).products.find(product => product.code === code);
const admin = { id: 'phase3-audit', name: 'Phase 3 Audit', role: 'Administrator' };

test('Phase 3 gift assignment preserves all existing option prices across quantity tier boundaries', () => {
  let compared = 0;
  const template = DP.giftTemplate();
  for (const code of ['PG-PB', 'PG-KC', 'PG-MG', 'PG-TC', 'PG-ST']) {
    const original = existingProduct(code);
    const untouched = structuredClone(original);
    const raw = DP.phase3Product(original, template);
    const effective = DP.resolveGiftProduct(raw, template);
    assert.deepEqual(original, untouched, code + ': preparation must not mutate its input');
    assert.deepEqual(raw.f, original.f, code + ': existing fields and rates remain authoritative');
    assert.equal(new Set(effective.f.map(field => field.k)).size, effective.f.length);
    let configurations = [DP.defCfg(original)];
    for (const field of original.f.filter(field => field.t === 'sel')) {
      configurations = configurations.flatMap(configuration => field.o.map(option => ({ ...configuration, [field.k]: option[0] })));
    }
    const thresholds = [original.minQty, original.tiers.at(-1)[0], original.tiers.at(-1)[0] + 1];
    for (const configuration of configurations) {
      for (const qty of thresholds) {
        const before = DP.calc(original, { ...configuration, qty });
        const after = DP.calc(effective, { ...configuration, qty });
        assert.equal(before.err, null, code + ': existing fixture must be quoteable');
        for (const key of ['err', 'qty', 'base', 'sub', 'tax', 'taxable', 'gst', 'grand']) {
          assert.deepEqual(after[key], before[key], JSON.stringify({ code, configuration, qty, key }));
        }
        compared++;
      }
    }
  }
  assert.equal(compared, 192);
});

test('Phase 3 named print locations apply each supported configured basis and accessory quantity exactly once', () => {
  const product = DP.phase3Product(existingProduct('PG-TS'));
  product.f.push({ k: 'printDimensions', l: 'Print dimensions', t: 'dim' });
  product.f.push({ k: 'sleeveCopies', l: 'Sleeve copies', t: 'num', min: 1, max: 5, integer: true });
  const locations = product.f.find(field => field.k === 'printLocations');
  const approved = [
    ['Front', 'f', 12.34],
    ['Back', 'u', 2.03],
    ['Left Chest', 'p', 2.5],
    ['Right Chest', 'a', 1.11],
    ['Sleeve', 'q', 0.07],
    ['Neck Label', 'f', 0]
  ];
  for (const [name, basis, rate] of approved) {
    locations.o.find(option => option[0] === name).splice(1, 2, basis, rate);
    Object.assign(locations.optionMeta[name], { enabled: true, approved: true });
  }
  locations.optionMeta.Sleeve.quantityKey = 'sleeveCopies';
  const configuration = { ...DP.defCfg(product), qty: 10, sz: { S: 10 }, w: 2, h: 3, u: 'ft', sleeveCopies: 3, printLocations: approved.map(row => row[0]) };
  const result = DP.calc(product, configuration);
  assert.equal(result.err, null);
  assert.equal(result.base, 260000);
  // 12.34 fixed + (2.03 x 10) + 2.5% of 2600 + (1.11 x 6 sq ft x 10)
  // + (0.07 x 3 copies x 10). The explicitly approved zero rate adds no line.
  assert.deepEqual(result.L.filter(row => row[0].startsWith('Print Locations:')).map(row => row[1]), [1234, 2030, 6500, 6660, 210]);
  assert.equal(result.sub, 276634);
  assert.equal(DP.calc(product, cfg(configuration, product)).sub, result.sub);
  assert.match(DP.calc(product, { ...configuration, sleeveCopies: 0 }).err, /quantity|numeric/i);
  assert.match(DP.calc(product, { ...configuration, printLocations: ['Front', 'Front'] }).err, /Invalid option/);
  assert.match(DP.calc(product, { ...configuration, qty: 11 }).err, /must match/);
});

test('Phase 3 preparation preserves Admin size definitions and historical snapshots after subsequent catalog changes', () => {
  const initial = DP.seed({ demo: true });
  const input = structuredClone(initial);
  const shirt = input.products.find(product => product.code === 'PG-TS');
  const customSizes = { k: 'garmentSizes', l: 'Admin size list', t: 'SIZE_BREAKDOWN', required: true, show_on_customer_pdf: true, sizes: [
    { key: 'kids_6_8', label: 'Kids 6-8', enabled: true, price: 3.45 },
    { key: '5XL', label: '5XL', enabled: false, price: 7.89 }
  ] };
  shirt.f.push(customSizes);
  const prepared = DP.phase3Product(shirt);
  assert.deepEqual(prepared.f.find(field => field.t === 'SIZE_BREAKDOWN'), customSizes);
  assert.equal(prepared.f.filter(field => field.t === 'SIZE_BREAKDOWN').length, 1);
  input.products = input.products.map(product => product.id === prepared.id ? prepared : product);
  input.set.giftTemplate = DP.giftTemplate();
  input.products = input.products.map(product => ['PG-PB', 'PG-KC', 'PG-MG', 'PG-TC', 'PG-ST'].includes(product.code) ? DP.phase3Product(product, input.set.giftTemplate) : product);
  const saved = validateState(input, initial, admin, () => 'UNUSED');
  const edited = structuredClone(saved);
  edited.set.giftTemplate.f.find(field => field.k === 'artwork').show_on_customer_pdf = false;
  edited.products.find(product => product.code === 'PG-TS').f.find(field => field.t === 'SIZE_BREAKDOWN').sizes[0].price = 99;
  const restored = validateState(edited, saved, admin, () => 'UNUSED');
  for (let index = 0; index < initial.quotes.length; index++) {
    assert.deepEqual(restored.quotes[index].items, initial.quotes[index].items);
    assert.deepEqual(restored.quotes[index].companySnapshot, saved.quotes[index].companySnapshot);
    assert.deepEqual(DP.totals(restored.quotes[index]), DP.totals(saved.quotes[index]));
  }
});
