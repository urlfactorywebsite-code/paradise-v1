'use strict';
const crypto = require('node:crypto');
const { fail } = require('./validation');
const DP = require('../shared/domain');

// Built-in IDs remain protected even when a demo record has been renamed or
// edited. Read the canonical seed identities; never insert or recreate seeds.
const seed = DP.seed({ demo: true });
const seedCustomerIds = seed.customers.map(record => record.id);
const seedQuoteIds = seed.quotes.map(record => record.id);
const resetOptions = ['quotations', 'customers', 'deliveryAddresses'];
function selectionInput(value) {
  if (!Array.isArray(value) || !value.length || value.length > resetOptions.length ||
      new Set(value).size !== value.length || value.some(key => !resetOptions.includes(key)))
    fail('Select at least one supported data type to reset.', 422);
  if (value.includes('customers') && !value.includes('deliveryAddresses'))
    fail('Select delivery addresses too when resetting customers.', 422);
  return resetOptions.filter(key => value.includes(key));
}
async function resetPlan(db, selection) {
  const customerIds = selection.includes('customers')
    ? (await db.query('SELECT id FROM customers WHERE NOT(id=ANY($1::text[]))', [seedCustomerIds])).rows.map(row => row.id) : [];
  const quoteIds = selection.includes('quotations')
    ? (await db.query('SELECT id FROM quotations WHERE NOT(id=ANY($1::text[]))', [seedQuoteIds])).rows.map(row => row.id) : [];
  const linked = await db.query('SELECT count(*) AS n FROM quotations WHERE customer_id=ANY($1::text[]) AND NOT(id=ANY($2::text[]))', [customerIds, quoteIds]);
  if (linked.rows[0].n)
    fail('Some customers have quotations that will be kept. Select quotations too, or resolve links from protected demo quotations before resetting customers.', 409);
  const addresses = selection.includes('deliveryAddresses')
    ? (await db.prepare('SELECT count(*) AS n FROM customer_delivery_addresses').get()).n : 0;
  const sharing = (await db.query('SELECT count(*) AS n FROM whatsapp_message_logs WHERE quotation_id=ANY($1::text[])', [quoteIds])).rows[0].n;
  return { customerIds, quoteIds, counts: { quotations: quoteIds.length, customers: customerIds.length, deliveryAddresses: addresses, sharingHistory: sharing } };
}

async function clearSelectedData(store, actor, selection, plan) {
  const db = store.db;
  if (selection.includes('quotations')) {
    // Quote children and analytics cascade; sharing PDFs must be removed first.
    await db.query('DELETE FROM whatsapp_message_logs WHERE quotation_id=ANY($1::text[])', [plan.quoteIds]);
    await db.query('DELETE FROM quotations WHERE id=ANY($1::text[])', [plan.quoteIds]);
  }
  if (selection.includes('deliveryAddresses')) {
    // Clear only live address-book pointers. Historical quotation/customer
    // snapshots remain intact when their quotations were not selected.
    await db.prepare("UPDATE customers SET body=(body::jsonb - 'deliveryAddresses' - 'deliveryAddressId')::text,version=version+1,updated_at=? WHERE id IN (SELECT customer_id FROM customer_delivery_addresses) OR body::jsonb->>'deliveryAddressId' IS NOT NULL")
      .run(new Date().toISOString());
    await db.exec('DELETE FROM customer_delivery_addresses');
  }
  if (selection.includes('customers'))
    await db.query('DELETE FROM customers WHERE id=ANY($1::text[])', [plan.customerIds]);
  await db.prepare('UPDATE workspace SET revision=revision+1,pricing_import_key=?,updated_at=? WHERE id=1')
    .run(crypto.randomBytes(32).toString('hex'), new Date().toISOString());
  // Revoke other sign-ins; the revision increment also rejects stale tab saves.
  await db.prepare('DELETE FROM sessions WHERE token_hash<>?').run(actor.token_hash);
  await store.audit(actor, 'workspace.data_reset', 'workspace', '', {
    message: 'Selected created records cleared. Demo/seed records and configuration retained.',
    selection, deleted: plan.counts,
  });
}

function createDataReset({ store, body, json }) {
  const db = store.db;
  const sign = (payload, key) => crypto.createHmac('sha256', key).update(payload).digest('base64url');
  const encode = (claim, key) => {
    const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
    return payload + '.' + sign(payload, key);
  };
  function decode(token, key) {
    if (typeof token !== 'string' || token.length > 2000) fail('Start the reset confirmation again.', 403);
    const [payload, signature, extra] = token.split('.');
    const expected = sign(payload || '', key);
    if (extra !== undefined || !/^[A-Za-z0-9_-]{43}$/.test(signature || '') ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
      fail('Start the reset confirmation again.', 403);
    try { return JSON.parse(Buffer.from(payload, 'base64url').toString()); }
    catch { fail('Start the reset confirmation again.', 403); }
  }
  return async function handle(req, res, url, actor) {
    if (!['/api/data/reset/prepare', '/api/data/reset/confirm'].includes(url.pathname)) return false;
    if (req.method !== 'POST') fail('Use POST for data reset.', 405);
    if (actor.role !== 'Administrator') fail('Only administrators may reset data.', 403);
    const input = await body(req);
    const result = await store.transaction(async () => {
      // Recheck access after acquiring the shared workspace mutation lock.
      const fresh = await db.prepare('SELECT users.role,users.active,users.must_change_password FROM users JOIN sessions ON sessions.user_id=users.id WHERE users.id=? AND sessions.token_hash=? AND sessions.expires>?')
        .get(actor.id, actor.token_hash, Date.now());
      if (!fresh?.active || fresh.role !== 'Administrator' || fresh.must_change_password)
        fail('An active administrator session is required.', 403);
      const workspace = await db.prepare('SELECT revision,pricing_import_key FROM workspace WHERE id=1').get();
      const fields = await db.prepare('SELECT revision FROM field_configuration_state WHERE id=1').get();
      if (url.pathname.endsWith('/prepare')) {
        if (!Number.isInteger(input.revision)) fail('Workspace revision is required.', 428);
        if (input.revision !== workspace.revision) fail('Data changed. Reload before starting the reset.', 409);
        const selection = selectionInput(input.selection);
        const plan = await resetPlan(db, selection);
        return { token: encode({ session: actor.session_id, revision: workspace.revision,
          fieldsRevision: fields.revision, step: 0, expires: Date.now() + 5 * 60 * 1000,
          selection, counts: plan.counts,
          nonce: crypto.randomBytes(16).toString('hex') }, workspace.pricing_import_key), selection, counts: plan.counts };
      }
      const claim = decode(input.token, workspace.pricing_import_key);
      if (claim.session !== actor.session_id || !Number.isFinite(claim.expires) || claim.expires <= Date.now())
        fail('Reset confirmation expired. Start again.', 403);
      if (claim.revision !== workspace.revision || claim.fieldsRevision !== fields.revision)
        fail('Data changed during confirmation. Reload and review the reset again.', 409);
      if (!Number.isInteger(input.step) || input.step < 1 || input.step > 3 || input.step !== claim.step + 1)
        fail('Confirm all three warnings in order.', 422);
      const selection = selectionInput(claim.selection);
      if (input.selection !== undefined && JSON.stringify(selectionInput(input.selection)) !== JSON.stringify(selection))
        fail('The reset selection changed. Start the confirmations again.', 422);
      if (input.step < 3)
        return { token: encode({ ...claim, step: input.step }, workspace.pricing_import_key), selection, counts: claim.counts };
      const plan = await resetPlan(db, selection);
      if (JSON.stringify(plan.counts) !== JSON.stringify(claim.counts))
        fail('The selected data changed during confirmation. Start the reset again.', 409);
      await clearSelectedData(store, actor, selection, plan);
      return { ok: true, selection, deleted: plan.counts };
    });
    json(res, 200, result);
    return true;
  };
}
module.exports = { createDataReset };
