'use strict';
const crypto = require('node:crypto');
const { fail, str, date } = require('./validation');
const { quotationPdf } = require('./pdf');
const { requirePermission, hasPermission, requireQuoteAccess } = require('./access');
const DEFAULT_SETTINGS = Object.freeze({ enabled: true, mode: 'manual',
  messageTemplate: 'Hello {customerName}, here is quotation {quotationNumber} from {companyName}. Total: INR {total}. Valid until {validUntil}. Please review and let us know if you have any questions.' });
const STATUSES = Object.freeze(['Prepared', 'Manually Confirmed', 'Failed']);
const instruction = 'Download the prepared PDF, attach it in the opened WhatsApp chat, then review and send it. Opening the chat does not send or attach the PDF. Confirm sharing only after you have sent it. Delivery is not verified.';
function number(value) {
  const raw = str(value, 'WhatsApp number', 30, true).trim();
  if (!/^\+?[0-9 ()-]+$/.test(raw)) fail('Use a WhatsApp number with an international country code.');
  const digits = raw.replace(/[^0-9]/g, '');
  if (!/^[1-9][0-9]{7,14}$/.test(digits) || (!raw.startsWith('+') && digits.length < 11))
    fail('Use a WhatsApp number with an international country code, for example +919876543210.');
  return '+' + digits;
}
const publicLog = (r) => ({ id: r.id, quotationId: r.quotation_id,
  quotationNumber: r.quotation_number, quotationVersion: r.quotation_version,
  customerId: r.customer_id, customerName: r.customer_name, number: r.destination,
  actorId: r.actor_id, actorName: r.actor_name, createdAt: r.created_at,
  updatedAt: r.updated_at, status: r.status, mode: r.mode, message: r.message,
  notes: r.notes, retryOf: r.retry_of, pdfSha256: r.pdf_sha256,
  pdfUrl: `/api/whatsapp/history/${r.id}/pdf`, providerMessageId: null });
function createWhatsApp({ store, body, json }) {
  const db = store.db;
  const logColumns = 'id,quotation_id,quotation_number,quotation_version,customer_id,customer_name,destination,actor_id,actor_name,created_at,updated_at,status,mode,message,pdf_sha256,notes,retry_of';
  async function currentUser(actor) {
    const current = await db.prepare('SELECT * FROM users WHERE id=?').get(actor.id);
    if (!current?.active || (actor.token_hash && !(await db.prepare(
      'SELECT 1 FROM sessions WHERE token_hash=? AND user_id=? AND expires>?',
    ).get(actor.token_hash, actor.id, Date.now())))) fail('Please sign in again.', 401);
    return current;
  }
  async function settings() {
    const row = await db.prepare('SELECT * FROM whatsapp_settings WHERE id=1').get();
    return { data: row ? JSON.parse(row.body) : { ...DEFAULT_SETTINGS }, version: row?.version || 1 };
  }
  async function getLog(id, user) {
    const row = await db.prepare(`SELECT ${logColumns} FROM whatsapp_message_logs WHERE id=?`).get(id);
    if (!row) fail('Sharing attempt not found.', 404);
    requireQuoteAccess(user, (await store.get('quotes', row.quotation_id)).data);
    return row;
  }
  const handoff = (row) => ({ data: publicLog(row),
    clickToChatUrl: `https://wa.me/${row.destination.slice(1)}?text=${encodeURIComponent(row.message)}`,
    pdfUrl: `/api/whatsapp/history/${row.id}/pdf`, instructions: instruction,
    automatedDelivery: false });
  async function prepare(user, quotationId, input, retryOf) {
    user = await currentUser(user);
    requirePermission(user, 'quotation.share_whatsapp');
    requirePermission(user, 'quotation.download_pdf');
    const record = await store.get('quotes', quotationId);
    requireQuoteAccess(user, record.data);
    if (!Number.isInteger(input.version)) fail('A current quotation version is required.', 428);
    if (input.version !== record.version) fail('Quotation changed. Reload before sharing.', 409);
    if (!record.data.items.length) fail('Add an item and save the quotation before sharing.');
    if (['Cancelled', 'Expired'].includes(record.data.status)) fail('Cancelled or expired quotations cannot be shared.');
    const config = await settings();
    if (!config.data.enabled) fail('WhatsApp sharing is disabled by the administrator.', 409);
    const { state } = await store.readState(), q = record.data,
      customer = state.customers.find((c) => c.id === q.cid),
      savedNumber = q.contact?.wa !== undefined ? q.contact.wa : (q.customerSnapshot?.wa ?? customer?.wa ?? ''),
      destination = number(input.number || savedNumber),
      variables = { customerName: q.customerSnapshot?.name || customer?.name || '',
        quotationNumber: q.no, companyName: q.companySnapshot?.name || state.set.name,
        total: (require('../shared/domain').totals(q).grand / 100).toFixed(2), validUntil: q.valid };
    if (input.number && destination !== (savedNumber ? number(savedNumber) : '') && !hasPermission(user, 'customer.edit'))
      fail('Customer edit permission is required to change the sharing recipient.', 403);
    const aliases = { customer_name: variables.customerName, quotation_number: q.no,
      company_name: variables.companyName, grand_total: variables.total, valid_until: q.valid, quotation_date: q.date };
    const message = str(input.message === undefined ? config.data.messageTemplate
      .replace(/\{\{(\w+)\}\}/g, (token, key) => aliases[key] ?? variables[key] ?? token)
      .replace(/\{(\w+)\}/g, (token, key) => variables[key] ?? aliases[key] ?? token)
      : input.message, 'WhatsApp message', 4000, true);
    if (input.saveNumber !== undefined && typeof input.saveNumber !== 'boolean') fail('Save number must be true or false.');
    if (input.saveNumber) {
      requirePermission(user, 'customer.edit');
      await store.mutate(user, (candidate) => {
        const target = candidate.customers.find((c) => c.id === q.cid);
        if (!target) fail('Customer not found.', 404);
        target.wa = destination;
      });
    }
    // Generate and retain the exact document for this attempt. It stays behind authenticated access.
    const pdf = quotationPdf(q, state), now = new Date().toISOString(),
      row = { id: crypto.randomUUID(), quotation_id: q.id, quotation_number: q.no,
        quotation_version: record.version, customer_id: q.cid, customer_name: variables.customerName,
        destination, actor_id: user.id, actor_name: user.name, created_at: now, updated_at: now,
        status: 'Prepared', mode: 'manual', message, pdf,
        pdf_sha256: crypto.createHash('sha256').update(pdf).digest('hex'), notes: '', retry_of: retryOf || null };
    const columns = Object.keys(row);
    await db.prepare(`INSERT INTO whatsapp_message_logs(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`).run(...Object.values(row));
    await store.audit(user, 'whatsapp.prepared', 'quotes', q.id, { attemptId: row.id, mode: 'manual', retryOf: retryOf || null });
    return handoff(row);
  }
  return async function handle(req, res, url, user) {
    const route = url.pathname, method = req.method;
    const send = (status, value) => { json(res, status, value); return true; };
    if (route === '/api/whatsapp/config' && method === 'GET') {
      requirePermission(user, 'quotation.share_whatsapp');
      return send(200, { data: (await settings()).data, automatedDelivery: false, instructions: instruction });
    }
    if (route === '/api/whatsapp/settings') {
      if (method === 'GET') {
        if (!hasPermission(user, 'settings.manage')) requirePermission(user, 'quotation.share_whatsapp');
        return send(200, { ...await settings(), automatedDelivery: false, instructions: instruction });
      }
      requirePermission(user, 'settings.manage');
      if (method === 'PATCH') {
        const input = await body(req);
        const result = await store.transaction(async () => {
          requirePermission(await currentUser(user), 'settings.manage');
          const current = await settings();
          if (!Number.isInteger(input.version)) fail('Settings version is required.', 428);
          if (input.version !== current.version) fail('WhatsApp settings changed. Reload before saving.', 409);
          const next = { ...current.data };
          if (input.mode !== undefined && input.mode !== 'manual') fail('Automated document delivery requires a configured provider. Only manual mode is available.');
          if (input.enabled !== undefined) {
            if (typeof input.enabled !== 'boolean') fail('Enabled must be true or false.');
            next.enabled = input.enabled;
          }
          if (input.messageTemplate !== undefined) next.messageTemplate = str(input.messageTemplate, 'message template', 4000, true);
          if (Object.keys(input).some((key) => !['version', 'mode', 'enabled', 'messageTemplate'].includes(key))) fail('Unsupported WhatsApp settings field.');
          await db.prepare('INSERT INTO whatsapp_settings(id,body,version) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,version=excluded.version')
            .run(JSON.stringify(next), current.version + 1);
          await store.audit(user, 'whatsapp.settings_updated', 'settings', 'whatsapp');
          return { data: next, version: current.version + 1 };
        });
        return send(200, result);
      }
      fail('Method not allowed.', 405);
    }
    if (route === '/api/whatsapp/history' && method === 'GET') {
      const clauses = [], values = [];
      if (!hasPermission(user, 'quotation.view_all')) {
        requirePermission(user, 'quotation.view_own'); clauses.push('q.owner_id=?'); values.push(user.id);
      }
      const bindings = { quotationId: 'l.quotation_id', customerId: 'l.customer_id', status: 'l.status', actorId: 'l.actor_id' };
      for (const [parameter, column] of Object.entries(bindings)) if (url.searchParams.get(parameter)) {
        if (parameter === 'status' && !STATUSES.includes(url.searchParams.get(parameter))) fail('Invalid sharing status.');
        clauses.push(column + '=?'); values.push(url.searchParams.get(parameter));
      }
      for (const [parameter, operator] of [['from', '>='], ['to', '<=']]) if (url.searchParams.get(parameter)) {
        clauses.push(`substring(l.created_at,1,10)${operator}?`); values.push(date(url.searchParams.get(parameter)));
      }
      const pageValue = (key, fallback, max) => {
        const v = url.searchParams.get(key); if (v === null) return fallback;
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > max) fail('Invalid pagination.'); return Number(v);
      };
      const page = pageValue('page', 1, 1000000), pageSize = pageValue('pageSize', 25, 100),
        where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '',
        from = ' FROM whatsapp_message_logs l JOIN quotations q ON q.id=l.quotation_id' + where,
        total = (await db.prepare('SELECT count(*) AS n' + from).get(...values)).n,
        rows = await db.prepare(`SELECT ${logColumns.split(',').map((c) => 'l.' + c).join(',')}${from} ORDER BY l.created_at DESC,l.id DESC LIMIT ? OFFSET ?`).all(...values, pageSize, (page - 1) * pageSize);
      return send(200, { data: rows.map(publicLog), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }, automatedDelivery: false });
    }
    const shareMatch = /^\/api\/quotations\/([A-Za-z0-9_-]+)\/whatsapp$/.exec(route);
    if (shareMatch && method === 'POST') {
      const input = await body(req);
      return send(201, await store.transaction(() => prepare(user, shareMatch[1], input)));
    }
    const logMatch = /^\/api\/whatsapp\/history\/([A-Za-z0-9_-]+)(?:\/(status|retry|pdf))?$/.exec(route);
    if (!logMatch) return false;
    const [, logId, action] = logMatch;
    if (method === 'GET' && !action) return send(200, { data: publicLog(await getLog(logId, user)) });
    if (method === 'GET' && action === 'pdf') {
      requirePermission(user, 'quotation.download_pdf');
      const log = await getLog(logId, user), { pdf } = await db.prepare('SELECT pdf FROM whatsapp_message_logs WHERE id=?').get(logId);
      await store.audit(user, 'whatsapp.pdf_downloaded', 'quotes', log.quotation_id, { attemptId: log.id });
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${log.quotation_number.replace(/[^A-Za-z0-9_-]/g, '-')}.pdf"` });
      res.end(pdf); return true;
    }
    if (method === 'POST' && ['status', 'retry'].includes(action)) {
      requirePermission(user, 'quotation.share_whatsapp');
      const input = await body(req);
      const result = await store.transaction(async () => {
        const actor = await currentUser(user);
        requirePermission(actor, 'quotation.share_whatsapp');
        const row = await getLog(logId, actor);
        if (action === 'retry') {
          if (row.status !== 'Failed') fail('Only failed attempts may be retried. Create a new sharing attempt to share again.', 409);
          if (await db.prepare('SELECT id FROM whatsapp_message_logs WHERE retry_of=? LIMIT 1').get(row.id))
            fail('This attempt has already been retried. Review its newer sharing attempt.', 409);
          if ((await store.get('quotes', row.quotation_id)).version !== row.quotation_version)
            fail('Quotation changed since this failed attempt. Start a new sharing attempt and review the updated quotation and message.', 409);
          return prepare({ ...actor, token_hash: user.token_hash }, row.quotation_id,
            { ...input, number: input.number || row.destination, message: input.message ?? row.message }, row.id);
        }
        if (row.status !== 'Prepared') fail('This sharing attempt already has a recorded result.', 409);
        if (!['Manually Confirmed', 'Failed'].includes(input.status)) fail('Manual sharing supports only Manually Confirmed or Failed results. Delivery cannot be verified.');
        if (row.actor_id !== actor.id && !hasPermission(actor, 'quotation.edit_all')) fail('Only the sharing employee or an administrator may record this result.', 403);
        row.status = input.status; row.notes = str(input.notes ?? '', 'sharing notes', 2000);
        row.updated_at = new Date().toISOString();
        await db.prepare('UPDATE whatsapp_message_logs SET status=?,notes=?,updated_at=? WHERE id=?').run(row.status, row.notes, row.updated_at, row.id);
        await store.audit(user, row.status === 'Failed' ? 'whatsapp.failed' : 'whatsapp.manually_confirmed', 'quotes', row.quotation_id, { attemptId: row.id, verifiedDelivery: false });
        return { data: publicLog(row), automatedDelivery: false };
      });
      return send(action === 'retry' ? 201 : 200, result);
    }
    fail('Method not allowed.', 405);
  };
}
module.exports = { createWhatsApp, number, STATUSES };
