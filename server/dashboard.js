'use strict';

const { filters, integer } = require('./queries');
const { fail, id, str } = require('./validation');
const { hasPermission } = require('./access');

const EXPIRY_WINDOW_DAYS = 7;
const EXPIRABLE_STATUSES = ['Pending Internal Review', 'Approved Internally', 'Sent to Customer'];
const placeholder = (values) => values.map(() => '?').join(',');
const append = (where, clause) => `${where}${where ? ' AND ' : ' WHERE '}${clause}`;
const like = (value) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;

function workspaceTimezone() {
  const configured = process.env.TZ || 'Asia/Kolkata';
  try {
    return new Intl.DateTimeFormat('en', { timeZone: configured }).resolvedOptions().timeZone;
  } catch {
    return 'Asia/Kolkata';
  }
}

function workspaceToday(timezone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function dashboardFilters(params, user) {
  for (const name of ['customer', 'employee']) if (params.get(name)) id(params.get(name));
  if (params.get('salesperson')) str(params.get('salesperson'), 'salesperson filter', 200);
  // Dashboard links and counts use quotation permissions. Report access never
  // broadens quotation visibility, and a user need not have report access just
  // to see their dashboard. Existing report endpoints keep their own scope.
  return filters('quotes', params, user);
}

function displayQuote(row) {
  const quote = JSON.parse(row.body);
  const customer = quote.customerSnapshot || JSON.parse(row.customer_body || '{}');
  return {
    ...quote,
    total: row.total,
    customer: customer.name || '',
    company: customer.co || '',
    creator: quote.by || row.creator_name || '',
    createdAt: row.created_at || null,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

async function hydrateRecent(db, rows) {
  const data = rows.map(displayQuote);
  if (!data.length) return data;
  const ids = data.map((quote) => quote.id);
  const items = await db.prepare(`SELECT quotation_id,body FROM quotation_items WHERE quotation_id IN (${placeholder(ids)}) ORDER BY quotation_id,position`).all(...ids);
  const history = await db.prepare(`SELECT quotation_id,body FROM quotation_history WHERE quotation_id IN (${placeholder(ids)}) ORDER BY quotation_id,position`).all(...ids);
  const records = new Map(data.map((quote) => [quote.id, { ...quote, items: [], hist: [] }]));
  for (const item of items) records.get(item.quotation_id).items.push(JSON.parse(item.body));
  for (const event of history) records.get(event.quotation_id).hist.push(JSON.parse(event.body));
  return [...records.values()];
}

async function dashboard(store, params, user) {
  if (!store.db.inTransaction) return store.transaction(() => dashboard(store, params, user));
  const db = store.db;
  const { where, values } = dashboardFilters(params, user);
  const scoped = `SELECT * FROM quotations${where}`;
  const timezone = workspaceTimezone(), today = workspaceToday(timezone);
  const until = new Date(today + 'T00:00:00Z');
  until.setUTCDate(until.getUTCDate() + EXPIRY_WINDOW_DAYS);
  const expiryThrough = until.toISOString().slice(0, 10);
  const settings = await db.prepare('SELECT settings FROM workspace WHERE id=1').get();
  if (!settings) fail('Complete administrator setup first.', 409);
  const independentApproval = JSON.parse(settings.settings).independentApproval ?? true;

  const aggregate = await db.prepare(`SELECT count(*) AS count,coalesce(sum(total),0) AS "quotedValue",count(*) FILTER (WHERE status='Draft') AS draft,count(*) FILTER (WHERE status='Pending Internal Review') AS pending FROM quotations${where}`).get(...values);
  const group = (column) => db.prepare(`SELECT ${column} AS key,count(*) AS count,coalesce(sum(total),0) AS "quotedValue" FROM quotations${where} GROUP BY ${column} ORDER BY "quotedValue" DESC,key`).all(...values);
  const byStatus = await group('status');
  const byDate = await group('date');
  const bySalesperson = await group('salesperson');
  const byEmployee = await db.prepare(`WITH scoped AS (${scoped}) SELECT owner_id AS key,count(*) AS count,coalesce(sum(total),0) AS "quotedValue",coalesce(max(nullif(body::jsonb->>'by','')),'Legacy / unassigned') AS name FROM scoped GROUP BY owner_id ORDER BY "quotedValue" DESC,key`).all(...values);
  const byCustomer = await db.prepare(`WITH scoped AS (${scoped}) SELECT customer_id AS key,count(*) AS count,coalesce(sum(total),0) AS "quotedValue",max(c.name) AS name FROM scoped q JOIN customers c ON c.id=q.customer_id GROUP BY customer_id ORDER BY "quotedValue" DESC,key`).all(...values);
  const products = await db.prepare(`WITH scoped AS (${scoped}) SELECT i.product_id AS id,max(i.body::jsonb->>'name') AS name,count(*) AS "timesQuoted",coalesce(sum(i.quantity),0) AS quantity FROM quotation_items i JOIN scoped q ON q.id=i.quotation_id GROUP BY i.product_id ORDER BY "timesQuoted" DESC,i.product_id`).all(...values);
  const expired = (await db.prepare(`WITH scoped AS (${scoped}) SELECT q.number,coalesce(q.body::jsonb->'customerSnapshot'->>'name',c.name) AS customer,q.total AS "quotedValue" FROM scoped q JOIN customers c ON c.id=q.customer_id WHERE q.status='Expired' ORDER BY q.date DESC,q.number DESC,q.id DESC`).all(...values));
  const sharing = await db.prepare(`SELECT status AS key,count(*) AS count FROM whatsapp_message_logs WHERE quotation_id IN (SELECT id FROM quotations${where}) GROUP BY status`).all(...values);
  const sharingCount = (status) => sharing.find((row) => row.key === status)?.count || 0;

  const recentRows = await db.prepare(`WITH scoped AS (${scoped}) SELECT q.body,q.total,q.version,q.updated_at,c.body AS customer_body,u.name AS creator_name,(SELECT body::jsonb->>'d' FROM quotation_history WHERE quotation_id=q.id ORDER BY position LIMIT 1) AS created_at FROM scoped q JOIN customers c ON c.id=q.customer_id LEFT JOIN users u ON u.id=q.owner_id ORDER BY q.date DESC,q.number DESC,q.id DESC LIMIT 6`).all(...values);
  const recent = await hydrateRecent(db, recentRows);

  const attentionCondition = `status='Pending Internal Review' OR (status IN (${placeholder(EXPIRABLE_STATUSES)}) AND valid_until>=? AND valid_until<=?)`;
  const attentionValues = [...values, ...EXPIRABLE_STATUSES, today, expiryThrough];
  const attentionTotal = (await db.prepare(`WITH scoped AS (${scoped}) SELECT count(*) AS count FROM scoped WHERE ${attentionCondition}`).get(...attentionValues)).count;
  const attentionRows = await db.prepare(`WITH scoped AS (${scoped}),attention AS (SELECT * FROM scoped WHERE ${attentionCondition}),pending AS (SELECT DISTINCT ON (h.quotation_id) h.quotation_id,h.body::jsonb->>'d' AS pending_since FROM quotation_history h JOIN attention q ON q.id=h.quotation_id WHERE h.body::jsonb->>'t'='Pending Internal Review' ORDER BY h.quotation_id,h.position DESC) SELECT q.body,q.total,q.version,q.updated_at,c.body AS customer_body,u.name AS creator_name,p.pending_since FROM attention q JOIN customers c ON c.id=q.customer_id LEFT JOIN users u ON u.id=q.owner_id LEFT JOIN pending p ON p.quotation_id=q.id ORDER BY CASE WHEN q.status='Pending Internal Review' THEN coalesce(p.pending_since,q.date) ELSE q.valid_until END,q.date,q.number,q.id LIMIT 6`).all(...attentionValues);
  const attention = attentionRows.map((row) => {
    const quote = displayQuote(row);
    const review = quote.status === 'Pending Internal Review';
    return {
      id: quote.id, no: quote.no, cid: quote.cid, customer: quote.customer, company: quote.company,
      status: quote.status, valid: quote.valid, total: quote.total,
      reason: review ? 'review' : 'expiry', pendingSince: review ? row.pending_since || null : null,
      canReview: review && hasPermission(user, 'quotation.approve') && (!independentApproval || quote.createdBy !== user.id),
    };
  });

  const activityClauses = ["entity_type IN ('workspace','cats','products','customers','quotes','settings')"];
  const activityValues = [];
  if (!hasPermission(user, 'audit.view')) {
    activityClauses.push(`((entity_type='quotes' AND entity_id IN (SELECT id FROM quotations${where})) OR (entity_type<>'quotes' AND actor_id=?))`);
    activityValues.push(...values, user.id);
  } else {
    activityClauses.push(`(entity_type<>'quotes' OR entity_id IN (SELECT id FROM quotations${where}))`);
    activityValues.push(...values);
  }
  // Audit timestamps are UTC instants; use the same workspace calendar as the
  // dashboard rather than applying the host/database timezone implicitly.
  if (params.get('from')) { activityClauses.push('(at::timestamptz AT TIME ZONE ?)::date>=?::date'); activityValues.push(timezone, params.get('from')); }
  if (params.get('to')) { activityClauses.push('(at::timestamptz AT TIME ZONE ?)::date<=?::date'); activityValues.push(timezone, params.get('to')); }
  const activity = (await db.prepare(`SELECT at,actor_id,actor_name,action,entity_type,entity_id,details FROM audit_events WHERE ${activityClauses.join(' AND ')} ORDER BY id DESC LIMIT 10`).all(...activityValues)).map((event) => ({
    t: event.at, u: event.actor_name, actorId: event.actor_id, entityType: event.entity_type, entityId: event.entity_id,
    x: JSON.parse(event.details).message || `${event.action}${event.entity_id ? ' - ' + event.entity_id : ''}`,
  }));

  return {
    count: aggregate.count, quotedValue: aggregate.quotedValue, currency: 'INR', moneyUnit: 'paise',
    kpis: { total: aggregate.count, draft: aggregate.draft, pendingReview: aggregate.pending, quotedValue: aggregate.quotedValue },
    byStatus, byDate, bySalesperson, byEmployee, byCustomer, products, expired,
    whatsapp: { attempts: sharing.reduce((sum, row) => sum + row.count, 0), prepared: sharingCount('Prepared'), manuallyConfirmed: sharingCount('Manually Confirmed'), failed: sharingCount('Failed'), automatedDelivery: false },
    recent, activity, attention, attentionTotal, timezone, today, reviewThresholdHours: null, expiryWindowDays: EXPIRY_WINDOW_DAYS,
  };
}

async function search(store, params, user) {
  const page = integer(params.get('page'), 1, 1000000);
  const pageSize = integer(params.get('pageSize'), 5, 10);
  const query = params.get('q') || '';
  str(query, 'search', 200);
  const canQuote = hasPermission(user, 'quotation.view_all') || hasPermission(user, 'quotation.view_own');
  const canCustomer = hasPermission(user, 'customer.view');
  if (!canQuote && !canCustomer) fail('You do not have permission for this action.', 403);
  const empty = { quotations: [], customers: [], pagination: { page, pageSize, total: 0, totalPages: 0 } };
  if (!query.trim()) return empty;
  if (!store.db.inTransaction) return store.transaction(() => search(store, params, user));
  const db = store.db, pattern = like(query.trim());
  let quotations = [], customers = [], quotationTotal = 0, customerTotal = 0;
  if (canQuote) {
    const scope = filters('quotes', new URLSearchParams(), user);
    const where = append(scope.where, "(number ILIKE ? ESCAPE '\\' OR body::jsonb->'customerSnapshot'->>'name' ILIKE ? ESCAPE '\\' OR body::jsonb->'customerSnapshot'->>'co' ILIKE ? ESCAPE '\\')");
    const values = [...scope.values, pattern, pattern, pattern];
    quotationTotal = (await db.prepare(`SELECT count(*) AS count FROM quotations${where}`).get(...values)).count;
    quotations = await db.prepare(`SELECT id,number AS no,date,status,coalesce(body::jsonb->'customerSnapshot'->>'name','') AS customer FROM quotations${where} ORDER BY date DESC,number DESC,id DESC LIMIT ? OFFSET ?`).all(...values, pageSize, (page - 1) * pageSize);
  }
  if (canCustomer) {
    const where = " WHERE (name ILIKE ? ESCAPE '\\' OR body::jsonb->>'co' ILIKE ? ESCAPE '\\')";
    customerTotal = (await db.prepare(`SELECT count(*) AS count FROM customers${where}`).get(pattern, pattern)).count;
    customers = await db.prepare(`SELECT id,name,coalesce(body::jsonb->>'co','') AS co FROM customers${where} ORDER BY name,id LIMIT ? OFFSET ?`).all(pattern, pattern, pageSize, (page - 1) * pageSize);
  }
  // Each result category is bounded independently so one category cannot hide
  // the other. No customer contact details or quotation contents are returned.
  const total = quotationTotal + customerTotal;
  return { quotations, customers, pagination: { page, pageSize, total, totalPages: Math.max(Math.ceil(quotationTotal / pageSize), Math.ceil(customerTotal / pageSize)) } };
}

module.exports = { dashboard, search, workspaceTimezone, workspaceToday };
