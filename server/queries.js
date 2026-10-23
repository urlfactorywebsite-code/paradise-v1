'use strict';
const { TABLES } = require('./store');
const { fail, date } = require('./validation');
const DP = require('../shared/domain');
function integer(value, fallback, max) {
  if (value === null || value === undefined) return fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > max)
    fail('Invalid pagination.');
  return Number(value);
}
const like = (text) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;
function filters(key, params) {
  const clauses = [],
    values = [];
  const q = params.get('q');
  if (q) {
    if (q.length > 200) fail('Search is too long.');
    clauses.push("body ILIKE ? ESCAPE '\\'");
    values.push(like(q));
  }
  const bindings =
    key === 'quotes'
      ? {
          status: 'status',
          customer: 'customer_id',
          salesperson: 'salesperson',
        }
      : key === 'products'
        ? { category: 'category_id' }
        : {};
  for (const [parameter, column] of Object.entries(bindings))
    if (params.get(parameter)) {
      clauses.push(`${column}=?`);
      values.push(params.get(parameter));
    }
  if (key === 'quotes') {
    if (params.get('status') && !DP.ST.includes(params.get('status')))
      fail('Invalid status filter.');
    for (const [parameter, op] of [
      ['from', '>='],
      ['to', '<='],
    ])
      if (params.get(parameter)) {
        clauses.push(`date${op}?`);
        values.push(date(params.get(parameter)));
      }
    if (
      params.get('from') &&
      params.get('to') &&
      params.get('from') > params.get('to')
    )
      fail('From date must not be after to date.');
    for (const [parameter, op] of [
      ['min', '>='],
      ['max', '<='],
    ])
      if (params.has(parameter)) {
        const amount = Number(params.get(parameter));
        if (!Number.isFinite(amount) || amount < 0 || amount > 100000000000)
          fail('Invalid amount filter.');
        clauses.push(`total${op}?`);
        values.push(Math.round(amount * 100));
      }
  }
  if (['cats', 'products'].includes(key) && params.has('active')) {
    if (!['0', '1'].includes(params.get('active')))
      fail('Active must be 0 or 1.');
    clauses.push('active=?');
    values.push(Number(params.get('active')));
  }
  return {
    where: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}
async function listing(store, key, params) {
  if (!store.db.inTransaction)
    return store.transaction(() => listing(store, key, params));
  const table = TABLES[key];
  if (!table) fail('Unknown resource.', 404);
  const page = integer(params.get('page'), 1, 1000000),
    pageSize = integer(params.get('pageSize'), 25, 100);
  const { where, values } = filters(key, params);
  const allowed =
    key === 'quotes'
      ? ['date', 'number', 'total', 'status', 'updated_at']
      : ['name', 'updated_at'];
  const sort = params.get('sort') || (key === 'quotes' ? 'date' : 'name');
  if (!allowed.includes(sort)) fail('Invalid sort column.');
  const direction = (
    params.get('direction') || (key === 'quotes' ? 'desc' : 'asc')
  ).toLowerCase();
  if (!['asc', 'desc'].includes(direction)) fail('Invalid sort direction.');
  const total = (
    await store.db
      .prepare(`SELECT count(*) AS n FROM ${table}${where}`)
      .get(...values)
  ).n;
  const rows = await store.db
    .prepare(
      `SELECT id FROM ${table}${where} ORDER BY ${sort} ${direction},id LIMIT ? OFFSET ?`,
    )
    .all(...values, pageSize, (page - 1) * pageSize);
  return {
    data: await Promise.all(
      rows.map(async (row) => {
        const r = await store.get(key, row.id);
        return { ...r.data, version: r.version, updatedAt: r.updatedAt };
      }),
    ),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
async function report(store, params) {
  if (!store.db.inTransaction)
    return store.transaction(() => report(store, params));
  const { where, values } = filters('quotes', params);
  const db = store.db,
    total = await db
      .prepare(
        `SELECT count(*) AS count,coalesce(sum(total),0) AS "quotedValue" FROM quotations${where}`,
      )
      .get(...values);
  const group = async (column) =>
    await db
      .prepare(
        `SELECT ${column} AS key,count(*) AS count,coalesce(sum(total),0) AS "quotedValue" FROM quotations${where} GROUP BY ${column} ORDER BY "quotedValue" DESC,key`,
      )
      .all(...values);
  const ids = await db
    .prepare(`SELECT id FROM quotations${where} ORDER BY date DESC,number DESC`)
    .all(...values);
  const quotes = await Promise.all(
      ids.map(async (r) => (await store.get('quotes', r.id)).data),
    ),
    productMap = new Map();
  for (const q of quotes)
    for (const item of q.items) {
      const row = productMap.get(item.pid) || {
        id: item.pid,
        name: item.name,
        timesQuoted: 0,
        quantity: 0,
      };
      row.timesQuoted++;
      row.quantity += item.qty;
      productMap.set(item.pid, row);
    }
  const customers = new Map(
    (await db.prepare('SELECT id,name FROM customers').all()).map((x) => [
      x.id,
      x.name,
    ]),
  );
  return {
    ...total,
    currency: 'INR',
    moneyUnit: 'paise',
    byStatus: await group('status'),
    byDate: await group('date'),
    bySalesperson: await group('salesperson'),
    byCustomer: (await group('customer_id')).map((x) => ({
      ...x,
      name: customers.get(x.key),
    })),
    products: [...productMap.values()].sort(
      (a, b) => b.timesQuoted - a.timesQuoted,
    ),
    expired: quotes
      .filter((q) => q.status === 'Expired')
      .map((q) => ({
        number: q.no,
        customer: q.customerSnapshot?.name || customers.get(q.cid),
        quotedValue: DP.totals(q).grand,
      })),
    quotes,
  };
}
function csvExport(data) {
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const rows = [
    [
      'Quotation',
      'Date',
      'Customer',
      'Salesperson',
      'Status',
      'Items',
      'Grand total (INR)',
    ],
    ...data.quotes.map((q) => [
      q.no,
      q.date,
      q.customerSnapshot?.name ||
        data.byCustomer.find((c) => c.key === q.cid)?.name ||
        '',
      q.sales,
      q.status,
      q.items.length,
      (DP.totals(q).grand / 100).toFixed(2),
    ]),
  ];
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
module.exports = { listing, report, csvExport, integer };
