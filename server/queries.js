'use strict';
const { TABLES } = require('./store');
const { fail, date } = require('./validation');
const DP = require('../shared/domain');
const { hasPermission, requirePermission, canViewQuote } = require('./access');
function integer(value, fallback, max) {
  if (value === null || value === undefined) return fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > max)
    fail('Invalid pagination.');
  return Number(value);
}
const like = (text) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;
function filters(key, params, user, reportScope = false) {
  const clauses = [],
    values = [];
  const q = params.get('q');
  if (key === 'quotes' && user) {
    const all = reportScope ? 'reports.view_all' : 'quotation.view_all',
      own = reportScope ? 'reports.view_own' : 'quotation.view_own';
    if (!hasPermission(user, all)) {
      requirePermission(user, own);
      clauses.push('owner_id=?');
      values.push(user.id);
    }
  }
  if (q) {
    if (q.length > 200) fail('Search is too long.');
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(q)) fail('Invalid search.');
    clauses.push("body ILIKE ? ESCAPE '\\'");
    values.push(like(q));
  }
  const bindings =
    key === 'quotes'
      ? {
          status: 'status',
          customer: 'customer_id',
          salesperson: 'salesperson',
          employee: 'owner_id',
        }
      : key === 'products'
        ? { category: 'category_id' }
        : {};
  for (const [parameter, column] of Object.entries(bindings))
    if (params.get(parameter)) {
      if (params.get(parameter).length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(params.get(parameter)))
        fail('Invalid '+parameter+' filter.');
      clauses.push(`${column}=?`);
      values.push(params.get(parameter));
    }
  if (key === 'quotes') {
    // Reports and their CSV export share calendar filters with product analytics.
    // These are additive report filters; quotation-list semantics stay unchanged.
    if (reportScope) {
      const year = params.get('year'), month = params.get('month');
      if (params.has('year')) {
        if (params.getAll('year').length !== 1 || !/^\d{4}$/.test(year) || Number(year) < 1000) fail('Invalid report year.');
        clauses.push('substring(date,1,4)=?'); values.push(year);
      }
      if (params.has('month')) {
        if (params.getAll('month').length !== 1 || !/^\d{1,2}$/.test(month) || Number(month) < 1 || Number(month) > 12) fail('Invalid report month.');
        clauses.push('substring(date,6,2)=?'); values.push(month.padStart(2,'0'));
      }
    }
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
async function listing(store, key, params, user) {
  if (!store.db.inTransaction)
    return store.transaction(() => listing(store, key, params, user));
  const table = TABLES[key];
  if (!table) fail('Unknown resource.', 404);
  const page = integer(params.get('page'), 1, 1000000),
    pageSize = integer(params.get('pageSize'), 25, 100);
  const { where, values } = filters(key, params, user);
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
      `SELECT ${key === 'products' ? 'body,version,updated_at' : 'id'} FROM ${table}${where} ORDER BY ${sort} ${direction},id LIMIT ? OFFSET ?`,
    )
    .all(...values, pageSize, (page - 1) * pageSize);
  const data = [];
  // Catalog pages already have every stored product column they need. Avoid
  // one additional round trip per row while retaining the existing response.
  if (key === 'products') {
    for (const row of rows)
      data.push({ ...JSON.parse(row.body), version: row.version, updatedAt: row.updated_at });
  } else {
    // Transaction reads share one pg client and must be awaited serially.
    for (const row of rows) {
      const r = await store.get(key, row.id);
      data.push({ ...r.data, version: r.version, updatedAt: r.updatedAt });
    }
  }
  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
const reportParameters = new Set(['q','from','to','year','month','customer','employee','salesperson','status','min','max']);
function reportScope(params,user) {
  if (!hasPermission(user,'reports.view_all')) requirePermission(user,'reports.view_own');
  // Fail closed instead of silently ignoring misspelled, duplicate or tenant
  // selectors. Listing endpoints retain their existing parameter conventions.
  for (const key of params.keys()) {
    if (!reportParameters.has(key)) fail('Unknown report parameter.');
    if (params.getAll(key).length !== 1 || !params.get(key)) fail('Invalid '+key+' filter.');
  }
  const result = filters('quotes',params,user,true);
  if (params.has('min') && params.has('max') && Number(params.get('min')) > Number(params.get('max')))
    fail('Minimum amount must not exceed maximum amount.');
  return { sql:`WITH scoped AS (SELECT id,number,date,status,total,owner_id,customer_id,salesperson FROM quotations${result.where})`, values:result.values };
}
function reportNumber(value) {
  const number=Number(value);
  if (!Number.isSafeInteger(number)||number<0) fail('Report totals exceed the supported numeric range. Narrow the filters.');
  return number;
}
async function report(store, params, user) {
  if (!store.db.inTransaction)
    return store.db.readTransaction(() => report(store, params, user));
  const db=store.db,{sql,values}=reportScope(params,user);
  const total=await db.prepare(`${sql} SELECT count(*) AS count,coalesce(sum(total),0)::text AS "quotedValue" FROM scoped`).get(...values);
  total.quotedValue=reportNumber(total.quotedValue);
  // One scan produces all five existing breakdowns without hydrating bodies,
  // configuration snapshots or quotation history for every matching document.
  const groups=await db.prepare(`${sql} SELECT
    CASE WHEN grouping(status)=0 THEN 'byStatus' WHEN grouping(date)=0 THEN 'byDate' WHEN grouping(salesperson)=0 THEN 'bySalesperson' WHEN grouping(owner_id)=0 THEN 'byEmployee' ELSE 'byCustomer' END AS kind,
    CASE WHEN grouping(status)=0 THEN status WHEN grouping(date)=0 THEN date WHEN grouping(salesperson)=0 THEN salesperson WHEN grouping(owner_id)=0 THEN owner_id ELSE customer_id END AS key,
    count(*) AS count,coalesce(sum(total),0)::text AS "quotedValue"
    FROM scoped GROUP BY GROUPING SETS ((status),(date),(salesperson),(owner_id),(customer_id))
    ORDER BY kind,sum(total) DESC,key`).all(...values);
  const grouped={byStatus:[],byDate:[],bySalesperson:[],byEmployee:[],byCustomer:[]};
  for (const {kind,...row} of groups) {row.quotedValue=reportNumber(row.quotedValue);grouped[kind].push(row);}
  const labels=await db.prepare(`${sql},latest AS (SELECT DISTINCT ON (owner_id) owner_id,id FROM scoped ORDER BY owner_id,date DESC,number DESC,id)
    SELECT 'employee' AS kind,l.owner_id AS key,q.body::jsonb->>'by' AS name FROM latest l JOIN quotations q ON q.id=l.id
    UNION ALL SELECT 'customer',c.id,c.name FROM customers c WHERE c.id IN (SELECT customer_id FROM scoped)`).all(...values);
  const employeeNames=new Map(labels.filter(r=>r.kind==='employee').map(r=>[r.key,r.name])),customerNames=new Map(labels.filter(r=>r.kind==='customer').map(r=>[r.key,r.name]));
  grouped.byEmployee=grouped.byEmployee.map(row=>({...row,name:row.key&&employeeNames.get(row.key)||'Legacy / unassigned'}));
  grouped.byCustomer=grouped.byCustomer.map(row=>({...row,name:customerNames.get(row.key)}));
  const byMonthStatus=await db.prepare(`${sql} SELECT substring(date,1,7) AS period,status,count(*) AS count FROM scoped GROUP BY substring(date,1,7),status ORDER BY period,status`).all(...values);
  const products=await db.prepare(`${sql},stats AS (
    SELECT i.product_id,count(*) AS "timesQuoted",count(DISTINCT i.quotation_id) AS "quotationCount",sum(i.quantity)::text AS quantity
    FROM quotation_items i JOIN scoped q ON q.id=i.quotation_id GROUP BY i.product_id
  ),latest AS (
    SELECT DISTINCT ON (i.product_id) i.product_id,i.quotation_id,i.id,q.date,q.number,i.position FROM quotation_items i JOIN scoped q ON q.id=i.quotation_id
    ORDER BY i.product_id,q.date DESC,q.number DESC,q.id,i.position,i.id
  ) SELECT s.product_id AS id,i.body::jsonb->>'name' AS name,s."timesQuoted",s."quotationCount",s.quantity
    FROM stats s JOIN latest l ON l.product_id=s.product_id JOIN quotation_items i ON i.quotation_id=l.quotation_id AND i.id=l.id
    ORDER BY s."timesQuoted" DESC,l.date DESC,l.number DESC,l.position,s.product_id`).all(...values);
  for (const product of products) product.quantity=reportNumber(product.quantity);
  const expired=await db.prepare(`${sql} SELECT q.number,coalesce(nullif(q.body::jsonb->'customerSnapshot'->>'name',''),c.name) AS customer,q.total AS "quotedValue"
    FROM scoped s JOIN quotations q ON q.id=s.id LEFT JOIN customers c ON c.id=s.customer_id WHERE s.status='Expired' ORDER BY s.date DESC,s.number DESC,s.id`).all(...values);
  const sharingStatuses=await db.prepare(`${sql} SELECT w.status AS key,count(*) AS count FROM whatsapp_message_logs w JOIN scoped q ON q.id=w.quotation_id GROUP BY w.status`).all(...values);
  const sharingCount=status=>sharingStatuses.find(row=>row.key===status)?.count||0;
  let sharingQuotationIds=[];
  if (hasPermission(user,'quotation.share_whatsapp')&&(hasPermission(user,'quotation.view_all')||hasPermission(user,'quotation.view_own'))) {
    const own=!hasPermission(user,'quotation.view_all');
    const ids=await db.prepare(`${sql} SELECT id,owner_id FROM scoped${own?' WHERE owner_id=?':''} ORDER BY date DESC,number DESC,id`).all(...values,...(own?[user.id]:[]));
    sharingQuotationIds=ids.filter(row=>canViewQuote(user,{createdBy:row.owner_id})).map(row=>row.id);
  }
  return {...total,currency:'INR',moneyUnit:'paise',...grouped,byMonthStatus,products,expired,sharingQuotationIds,
    whatsapp:{attempts:sharingStatuses.reduce((sum,row)=>sum+row.count,0),prepared:sharingCount('Prepared'),manuallyConfirmed:sharingCount('Manually Confirmed'),failed:sharingCount('Failed'),automatedDelivery:false}};
}
const MAX_REPORT_EXPORT_ROWS=50000;
async function reportExport(store,params,user) {
  if (!store.db.inTransaction) return store.db.readTransaction(()=>reportExport(store,params,user));
  const {sql,values}=reportScope(params,user);
  const rows=await store.db.prepare(`${sql},counts AS (SELECT i.quotation_id,count(*) AS items FROM quotation_items i JOIN scoped s ON s.id=i.quotation_id GROUP BY i.quotation_id)
    SELECT q.number AS no,q.date,coalesce(nullif(q.body::jsonb->'customerSnapshot'->>'name',''),c.name,'') AS customer,q.salesperson AS sales,q.status,coalesce(n.items,0) AS items,q.total AS grand
    FROM scoped s JOIN quotations q ON q.id=s.id LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN counts n ON n.quotation_id=s.id
    ORDER BY s.date DESC,s.number DESC,s.id LIMIT ?`).all(...values,MAX_REPORT_EXPORT_ROWS+1);
  if (rows.length>MAX_REPORT_EXPORT_ROWS) fail('CSV export exceeds 50,000 quotations. Narrow the report filters.');
  return {count:rows.length,rows};
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
    ...data.rows.map((q) => [
      q.no,
      q.date,
      q.customer,
      q.sales,
      q.status,
      q.items,
      String(BigInt(q.grand)/100n)+'.'+String(BigInt(q.grand)%100n).padStart(2,'0'),
    ]),
  ];
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
module.exports = { listing, report, reportExport, csvExport, integer, filters };
