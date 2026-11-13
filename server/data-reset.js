'use strict';
const crypto = require('node:crypto');
const { fail } = require('./validation');

// Keep accounts, application settings and schema metadata. Never call the setup
// seed here: even its demo:false path installs a sample catalog.
async function clearBusinessData(store, actor) {
  const db = store.db;
  await db.exec('DELETE FROM field_configuration_audit_logs');
  await db.exec("DELETE FROM configurable_field_options WHERE field_id IN (SELECT id FROM configurable_fields WHERE scope_type='product')");
  await db.exec('DELETE FROM product_field_bindings');
  await db.exec("DELETE FROM configurable_fields WHERE scope_type='product'");
  await db.exec('UPDATE customer_categories SET logo_storage_key=NULL');
  for (const table of [
    'whatsapp_message_logs', 'quotation_item_analytics', 'quotation_history',
    'quotation_items', 'quotations', 'customer_delivery_addresses', 'customers',
    'customer_category_logos', 'customer_categories', 'products', 'categories',
    'pricing_imports', 'quote_sequences', 'audit_events',
  ]) await db.exec(`DELETE FROM ${table}`);
  await db.prepare('UPDATE workspace SET revision=revision+1,pricing_import_key=?,updated_at=? WHERE id=1')
    .run(crypto.randomBytes(32).toString('hex'), new Date().toISOString());
  await db.exec('UPDATE field_configuration_state SET revision=revision+1 WHERE id=1');
  // Revoke other sign-ins; the revision increment also rejects stale tab saves.
  await db.prepare('DELETE FROM sessions WHERE token_hash<>?').run(actor.token_hash);
  await store.audit(actor, 'workspace.data_reset', 'workspace', '', {
    message: 'Business data cleared without sample data. Accounts and settings retained.',
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
        return { token: encode({ session: actor.session_id, revision: workspace.revision,
          fieldsRevision: fields.revision, step: 0, expires: Date.now() + 5 * 60 * 1000,
          nonce: crypto.randomBytes(16).toString('hex') }, workspace.pricing_import_key) };
      }
      const claim = decode(input.token, workspace.pricing_import_key);
      if (claim.session !== actor.session_id || !Number.isFinite(claim.expires) || claim.expires <= Date.now())
        fail('Reset confirmation expired. Start again.', 403);
      if (claim.revision !== workspace.revision || claim.fieldsRevision !== fields.revision)
        fail('Data changed during confirmation. Reload and review the reset again.', 409);
      if (!Number.isInteger(input.step) || input.step < 1 || input.step > 3 || input.step !== claim.step + 1)
        fail('Confirm all three warnings in order.', 422);
      if (input.step < 3)
        return { token: encode({ ...claim, step: input.step }, workspace.pricing_import_key) };
      await clearBusinessData(store, actor);
      return { ok: true };
    });
    json(res, 200, result);
    return true;
  };
}
module.exports = { createDataReset };
