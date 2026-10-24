'use strict';
const { isDeepStrictEqual: equal } = require('node:util');
const path = require('node:path');
const fs = require('node:fs');
const DP = require('../shared/domain');
const { validateState, fail } = require('./validation');
const { authorizeChanges, scopeState, permissionOverrides, effectivePermissions } = require('./access');
const TABLES = Object.freeze({
  cats: 'categories',
  products: 'products',
  customers: 'customers',
  quotes: 'quotations',
});
const timestamp = () => new Date().toISOString();

async function createStore(db) {
  const transaction = (fn) => db.transaction(fn);
  await transaction(async () => {
    await db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
    );
    const schema = await db
      .prepare('SELECT max(version) AS version FROM schema_migrations')
      .get();
    if (schema.version > 4)
      throw new Error(
        'Database schema is newer than this server. Refusing to downgrade.',
      );
    if (!schema.version) {
      await db.exec(
        fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'),
      );
      await db
        .prepare('INSERT INTO schema_migrations VALUES(3,?)')
        .run(timestamp());
    }
    if ((schema.version || 3) < 4) {
      await db.exec(fs.readFileSync(path.join(__dirname, 'migrations', '004-access-whatsapp.sql'), 'utf8'));
      await db.prepare('INSERT INTO schema_migrations VALUES(4,?)').run(timestamp());
    }
  });
  async function audit(
    actor,
    action,
    type,
    id,
    details = {},
    at = timestamp(),
  ) {
    await db
      .prepare(
        'INSERT INTO audit_events(at,actor_id,actor_name,action,entity_type,entity_id,details) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        at,
        actor.id || null,
        actor.name || 'System',
        action,
        type,
        String(id),
        JSON.stringify(details),
      );
  }
  async function readState() {
    if (!db.inTransaction) return transaction(async () => await readState());
    const workspace = await db
      .prepare('SELECT * FROM workspace WHERE id=1')
      .get();
    if (!workspace) fail('Complete administrator setup first.', 409);
    const state = { set: JSON.parse(workspace.settings) };
    for (const [key, table] of Object.entries(TABLES))
      state[key] = (
        await db.prepare(`SELECT body FROM ${table} ORDER BY position,id`).all()
      ).map((row) => JSON.parse(row.body));
    const items = new Map(),
      history = new Map();
    for (const row of await db
      .prepare(
        'SELECT quotation_id,body FROM quotation_items ORDER BY position',
      )
      .all()) {
      if (!items.has(row.quotation_id)) items.set(row.quotation_id, []);
      items.get(row.quotation_id).push(JSON.parse(row.body));
    }
    for (const row of await db
      .prepare(
        'SELECT quotation_id,body FROM quotation_history ORDER BY position',
      )
      .all()) {
      if (!history.has(row.quotation_id)) history.set(row.quotation_id, []);
      history.get(row.quotation_id).push(JSON.parse(row.body));
    }
    state.quotes.forEach((q) => {
      q.items = items.get(q.id) || [];
      q.hist = history.get(q.id) || [];
    });
    state.log = (
      await db
        .prepare(
          "SELECT at,actor_id,actor_name,action,entity_type,entity_id,details FROM audit_events WHERE entity_type IN ('workspace','cats','products','customers','quotes','settings') ORDER BY id DESC LIMIT 100",
        )
        .all()
    ).map((e) => ({
      t: e.at,
      u: e.actor_name,
      actorId: e.actor_id,
      entityType: e.entity_type,
      entityId: e.entity_id,
      x:
        JSON.parse(e.details).message ||
        `${e.action}${e.entity_id ? ' - ' + e.entity_id : ''}`,
    }));
    return { state, revision: workspace.revision };
  }
  async function writeState(state, previous, revision) {
    const now = timestamp();
    // Insert/update parents first, then remove children before parents. Snapshots
    // have no product FK because a removed product must remain on old quotations.
    for (const [key, table] of Object.entries(TABLES)) {
      const old = new Map((previous?.[key] || []).map((x) => [x.id, x]));
      for (const [index, record] of state[key].entries()) {
        if (old.has(record.id) && equal(old.get(record.id), record)) {
          await db
            .prepare(`UPDATE ${table} SET position=? WHERE id=?`)
            .run(index, record.id);
          continue;
        }
        const version =
          ((
            await db
              .prepare(`SELECT version FROM ${table} WHERE id=?`)
              .get(record.id)
          )?.version || 0) + 1;
        const body = { ...record };
        if (key === 'quotes') {
          delete body.items;
          delete body.hist;
        }
        const values = [record.id];
        let extra;
        if (key === 'cats') {
          extra = ['name', 'active'];
          values.push(record.name, record.on ? 1 : 0);
        }
        if (key === 'products') {
          extra = ['category_id', 'name', 'code', 'active'];
          values.push(record.cat, record.name, record.code, record.on ? 1 : 0);
        }
        if (key === 'customers') {
          extra = ['name', 'mobile', 'email'];
          values.push(record.name, record.mob, record.email);
        }
        if (key === 'quotes') {
          extra = [
            'number',
            'customer_id',
            'date',
            'valid_until',
            'status',
            'salesperson',
            'owner_id',
            'total',
          ];
          values.push(
            record.no,
            record.cid,
            record.date,
            record.valid,
            record.status,
            record.sales,
            record.createdBy || null,
            DP.totals(record, state.set).grand,
          );
        }
        const columns = [...extra, 'body', 'version', 'position', 'updated_at'];
        values.push(JSON.stringify(body), version, index, now);
        await db
          .prepare(
            `INSERT INTO ${table}(id,${columns.join(',')}) VALUES(${values.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${columns.map((c) => `${c}=excluded.${c}`).join(',')}`,
          )
          .run(...values);
        if (key === 'quotes') {
          await db
            .prepare('DELETE FROM quotation_items WHERE quotation_id=?')
            .run(record.id);
          for (const [position, i] of record.items.entries()) {
            await db
              .prepare('INSERT INTO quotation_items VALUES(?,?,?,?,?,?,?)')
              .run(
                record.id,
                i.id,
                i.pid,
                i.qty,
                i.sub,
                JSON.stringify(i),
                position,
              );
          }
          await db
            .prepare('DELETE FROM quotation_history WHERE quotation_id=?')
            .run(record.id);
          for (const [position, h] of record.hist.entries()) {
            await db
              .prepare('INSERT INTO quotation_history VALUES(?,?,?)')
              .run(record.id, position, JSON.stringify(h));
          }
        }
      }
    }
    for (const key of ['quotes', 'products', 'customers', 'cats']) {
      const retained = new Set(state[key].map((x) => x.id));
      for (const old of previous?.[key] || [])
        if (!retained.has(old.id))
          await db.prepare(`DELETE FROM ${TABLES[key]} WHERE id=?`).run(old.id);
    }
    const settingsChanged = previous && !equal(state.set, previous.set);
    await db
      .prepare(
        'INSERT INTO workspace VALUES(1,?,?,1,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,settings=excluded.settings,updated_at=excluded.updated_at,settings_version=workspace.settings_version+?',
      )
      .run(revision, JSON.stringify(state.set), now, settingsChanged ? 1 : 0);
  }
  async function initialize(state, actor) {
    for (const q of state.quotes) q.createdBy = actor.id;
    for (const c of state.customers) c.createdBy = actor.id;
    await writeState(state, null, 1);
    for (const q of state.quotes) {
      const match = /\/(\d{4})\/(\d+)$/.exec(q.no);
      if (match)
        await db
          .prepare(
            'INSERT INTO quote_sequences VALUES(?,?) ON CONFLICT(year) DO UPDATE SET value=greatest(quote_sequences.value,excluded.value)',
          )
          .run(match[1], Number(match[2]));
    }
    await audit(actor, 'workspace.created', 'workspace', '', {
      message: state.customers.length
        ? 'Workspace created with demonstration data'
        : 'Workspace created with sample catalog',
    });
  }
  async function allocateNumber(date, prefix, sequenceStart = 1) {
    const year = date.slice(0, 4);
    await db
      .prepare(
        'INSERT INTO quote_sequences VALUES(?,?) ON CONFLICT(year) DO UPDATE SET value=greatest(quote_sequences.value+1,excluded.value)',
      )
      .run(year, sequenceStart);
    return `${prefix}/${year}/${String((await db.prepare('SELECT value FROM quote_sequences WHERE year=?').get(year)).value).padStart(4, '0')}`;
  }
  async function commit(candidate, previous, actor, options) {
    authorizeChanges(candidate, previous.state, actor);
    const retained = new Set(candidate.quotes.map((q) => q.id));
    for (const old of previous.state.quotes) if (!retained.has(old.id) &&
      await db.prepare('SELECT id FROM whatsapp_message_logs WHERE quotation_id=? LIMIT 1').get(old.id))
      fail('Quotations with sharing history must be retained. Cancel the quotation instead.', 409);
    // Validate synchronously first; allocate real numbers only for valid new
    // quotations inside the same PostgreSQL transaction as their records.
    const state = validateState(
      candidate,
      previous.state,
      actor,
      () => 'UNSAVED',
      options,
    );
    const existing = new Set(previous.state.quotes.map((q) => q.id));
    for (const q of state.quotes)
      if (!existing.has(q.id))
        q.no = await allocateNumber(q.date, state.set.prefix, state.set.sequenceStart || 1);
    await writeState(state, previous.state, previous.revision + 1);
    for (const key of Object.keys(TABLES)) {
      const old = new Map(previous.state[key].map((x) => [x.id, x]));
      for (const record of state[key]) {
        if (!equal(record, old.get(record.id)))
          await audit(
            actor,
            `${key}.${old.has(record.id) ? 'updated' : 'created'}`,
            key,
            record.id,
            {
              message: `${old.has(record.id) ? 'Updated' : 'Created'} ${record.no || record.name}`,
              ...(key === 'quotes'
                ? {
                    status: record.status,
                    previousStatus: old.get(record.id)?.status || null,
                  }
                : {}),
            },
          );
        old.delete(record.id);
      }
      for (const record of old.values())
        await audit(actor, `${key}.deleted`, key, record.id, {
          message: `Deleted ${record.no || record.name}`,
        });
    }
    if (!equal(state.set, previous.state.set))
      await audit(actor, 'settings.updated', 'settings', 'company');
    return await readState();
  }
  function mutate(actor, fn, revision, options) {
    return transaction(async () => {
      const currentActor = await db
        .prepare('SELECT * FROM users WHERE id=?')
        .get(actor.id);
      if (
        !currentActor?.active ||
        (actor.token_hash &&
          !(await db
            .prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires>?')
            .get(actor.token_hash, Date.now())))
      )
        fail('Please sign in again.', 401);
      if (currentActor.role !== actor.role)
        fail('Account access changed. Sign in again.', 403);
      actor = { ...actor, ...currentActor, permissionOverrides: permissionOverrides(currentActor),
        permissions: effectivePermissions(currentActor) };
      const previous = await readState();
      if (
        revision !== undefined &&
        (!Number.isInteger(revision) || revision !== previous.revision)
      )
        fail(
          'Changes were saved in another session. Reload the latest data before retrying.',
          409,
        );
      const candidate = structuredClone(previous.state);
      await fn(candidate, previous);
      return scopeState(await commit(candidate, previous, actor, options), actor);
    });
  }
  async function get(key, id) {
    if (!db.inTransaction) return transaction(() => get(key, id));
    if (!TABLES[key]) fail('Unknown resource.', 404);
    const row = await db
      .prepare(`SELECT body,version,updated_at FROM ${TABLES[key]} WHERE id=?`)
      .get(id);
    if (!row) fail('Record not found.', 404);
    const data = JSON.parse(row.body);
    if (key === 'quotes') {
      data.items = (
        await db
          .prepare(
            'SELECT body FROM quotation_items WHERE quotation_id=? ORDER BY position',
          )
          .all(id)
      ).map((x) => JSON.parse(x.body));
      data.hist = (
        await db
          .prepare(
            'SELECT body FROM quotation_history WHERE quotation_id=? ORDER BY position',
          )
          .all(id)
      ).map((x) => JSON.parse(x.body));
    }
    return { data, version: row.version, updatedAt: row.updated_at };
  }
  async function expectVersion(key, id, version, actor) {
    if (!Number.isInteger(version) || version < 1)
      fail('A current record version is required.', 428);
    const current = await get(key, id);
    if (key === 'quotes' && actor) require('./access').requireQuoteAccess(actor, current.data);
    if (current.version !== version)
      fail(
        'This record changed in another session. Reload before saving.',
        409,
      );
    return current.data;
  }
  return {
    db,
    readState,
    writeState,
    initialize,
    mutate,
    commit,
    get,
    expectVersion,
    transaction,
    audit,
    allocateNumber,
  };
}
module.exports = { createStore, TABLES };
