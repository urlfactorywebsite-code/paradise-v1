'use strict';
const { isDeepStrictEqual: equal } = require('node:util');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const DP = require('../shared/domain');
const { validateState, fail } = require('./validation');
const TABLES = Object.freeze({ cats: 'categories', products: 'products', customers: 'customers', quotes: 'quotations' });
const timestamp = () => new Date().toISOString();

function createStore(db, dbPath) {
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const schema = db.prepare('PRAGMA user_version').get().user_version;
  if (schema > 2) throw new Error('Database schema is newer than this server. Refusing to downgrade.');
  if (schema < 2) {
    if (dbPath !== ':memory:' && db.prepare('SELECT count(*) AS n FROM users').get().n) {
      const directory = path.join(path.dirname(path.resolve(dbPath)), 'migration-backups');
      fs.mkdirSync(directory, { recursive: true });
      db.prepare('VACUUM INTO ?').run(path.join(directory, `before-v2-${Date.now()}-${crypto.randomUUID()}.sqlite`));
    }
    transaction(() => {
      db.exec(`
        ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1));
        ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0,1));
        ALTER TABLE users ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE sessions ADD COLUMN id TEXT;
        ALTER TABLE sessions ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
        ALTER TABLE sessions ADD COLUMN last_seen TEXT NOT NULL DEFAULT '';
        CREATE UNIQUE INDEX sessions_public_id ON sessions(id);
        CREATE INDEX sessions_user ON sessions(user_id);
        CREATE INDEX sessions_expiry ON sessions(expires);
        CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, settings TEXT NOT NULL, settings_version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL) STRICT;
        CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL, body TEXT NOT NULL, version INTEGER NOT NULL, position INTEGER NOT NULL, updated_at TEXT NOT NULL) STRICT;
        CREATE TABLE products (id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES categories(id), name TEXT NOT NULL, code TEXT NOT NULL, active INTEGER NOT NULL, body TEXT NOT NULL, version INTEGER NOT NULL, position INTEGER NOT NULL, updated_at TEXT NOT NULL) STRICT;
        CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, mobile TEXT NOT NULL, email TEXT NOT NULL, body TEXT NOT NULL, version INTEGER NOT NULL, position INTEGER NOT NULL, updated_at TEXT NOT NULL) STRICT;
        CREATE TABLE quotations (id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, customer_id TEXT NOT NULL REFERENCES customers(id), date TEXT NOT NULL, valid_until TEXT NOT NULL, status TEXT NOT NULL, salesperson TEXT NOT NULL, total INTEGER NOT NULL, body TEXT NOT NULL, version INTEGER NOT NULL, position INTEGER NOT NULL, updated_at TEXT NOT NULL) STRICT;
        CREATE TABLE quotation_items (quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE, id TEXT NOT NULL, product_id TEXT NOT NULL, quantity INTEGER NOT NULL, subtotal INTEGER NOT NULL, body TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY(quotation_id,id)) STRICT;
        CREATE TABLE quotation_history (quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE, position INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(quotation_id,position)) STRICT;
        CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor_id TEXT, actor_name TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, details TEXT NOT NULL) STRICT;
        CREATE TABLE auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL) STRICT;
        CREATE INDEX products_category ON products(category_id,active);
        CREATE INDEX products_name ON products(name COLLATE NOCASE);
        CREATE INDEX customers_name ON customers(name COLLATE NOCASE);
        CREATE INDEX customers_mobile ON customers(mobile);
        CREATE INDEX customers_email ON customers(email);
        CREATE INDEX quotations_date ON quotations(date);
        CREATE INDEX quotations_status_date ON quotations(status,date);
        CREATE INDEX quotations_customer ON quotations(customer_id,date);
        CREATE INDEX quotations_sales ON quotations(salesperson,date);
        CREATE INDEX audit_entity ON audit_events(entity_type,entity_id,id);
        CREATE INDEX audit_time ON audit_events(at);
      `);
      for (const session of db.prepare('SELECT token_hash FROM sessions').all()) db.prepare('UPDATE sessions SET id=?,created_at=?,last_seen=? WHERE token_hash=?').run(crypto.randomUUID(), timestamp(), timestamp(), session.token_hash);
      const old = db.prepare('SELECT revision,body FROM app_state WHERE id=1').get();
      if (old) {
        const state = JSON.parse(old.body);
        writeState(state, null, old.revision);
        for (const event of [...state.log].reverse()) audit({ name: event.u }, 'legacy.activity', 'workspace', '', { message: event.x }, event.t);
        audit({ name: 'System' }, 'database.migrated', 'workspace', '', { from: 1, to: 2 });
      }
      db.exec('PRAGMA user_version=2');
    });
  }
  function audit(actor, action, type, id, details = {}, at = timestamp()) {
    db.prepare('INSERT INTO audit_events(at,actor_id,actor_name,action,entity_type,entity_id,details) VALUES(?,?,?,?,?,?,?)')
      .run(at, actor.id || null, actor.name || 'System', action, type, String(id), JSON.stringify(details));
  }
  function readState() {
    const workspace = db.prepare('SELECT * FROM workspace WHERE id=1').get();
    if (!workspace) fail('Complete administrator setup first.', 409);
    const state = { set: JSON.parse(workspace.settings) };
    for (const [key, table] of Object.entries(TABLES)) state[key] = db.prepare(`SELECT body FROM ${table} ORDER BY position,id`).all().map(row => JSON.parse(row.body));
    const items = new Map(), history = new Map();
    for (const row of db.prepare('SELECT quotation_id,body FROM quotation_items ORDER BY position').all()) { if (!items.has(row.quotation_id)) items.set(row.quotation_id, []); items.get(row.quotation_id).push(JSON.parse(row.body)); }
    for (const row of db.prepare('SELECT quotation_id,body FROM quotation_history ORDER BY position').all()) { if (!history.has(row.quotation_id)) history.set(row.quotation_id, []); history.get(row.quotation_id).push(JSON.parse(row.body)); }
    state.quotes.forEach(q => { q.items = items.get(q.id) || []; q.hist = history.get(q.id) || []; });
    state.log = db.prepare("SELECT at,actor_name,action,entity_type,entity_id,details FROM audit_events WHERE entity_type IN ('workspace','cats','products','customers','quotes','settings') ORDER BY id DESC LIMIT 100").all()
      .map(e => ({ t: e.at, u: e.actor_name, x: JSON.parse(e.details).message || `${e.action}${e.entity_id ? ' · ' + e.entity_id : ''}` }));
    return { state, revision: workspace.revision };
  }
  function writeState(state, previous, revision) {
    const now = timestamp();
    // Insert/update parents first, then remove children before parents. Snapshots
    // have no product FK because a removed product must remain on old quotations.
    for (const [key, table] of Object.entries(TABLES)) {
      const old = new Map((previous?.[key] || []).map(x => [x.id, x]));
      state[key].forEach((record, index) => {
        if (old.has(record.id) && equal(old.get(record.id), record)) { db.prepare(`UPDATE ${table} SET position=? WHERE id=?`).run(index, record.id); return; }
        const version = (db.prepare(`SELECT version FROM ${table} WHERE id=?`).get(record.id)?.version || 0) + 1;
        const body = { ...record }; if (key === 'quotes') { delete body.items; delete body.hist; }
        const values = [record.id]; let extra;
        if (key === 'cats') { extra = ['name', 'active']; values.push(record.name, record.on ? 1 : 0); }
        if (key === 'products') { extra = ['category_id', 'name', 'code', 'active']; values.push(record.cat, record.name, record.code, record.on ? 1 : 0); }
        if (key === 'customers') { extra = ['name', 'mobile', 'email']; values.push(record.name, record.mob, record.email); }
        if (key === 'quotes') { extra = ['number', 'customer_id', 'date', 'valid_until', 'status', 'salesperson', 'total']; values.push(record.no, record.cid, record.date, record.valid, record.status, record.sales, DP.totals(record, state.set).grand); }
        const columns = [...extra, 'body', 'version', 'position', 'updated_at'];
        values.push(JSON.stringify(body), version, index, now);
        db.prepare(`INSERT INTO ${table}(id,${columns.join(',')}) VALUES(${values.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${columns.map(c => `${c}=excluded.${c}`).join(',')}`).run(...values);
        if (key === 'quotes') {
          db.prepare('DELETE FROM quotation_items WHERE quotation_id=?').run(record.id);
          record.items.forEach((i, position) => db.prepare('INSERT INTO quotation_items VALUES(?,?,?,?,?,?,?)').run(record.id, i.id, i.pid, i.qty, i.sub, JSON.stringify(i), position));
          db.prepare('DELETE FROM quotation_history WHERE quotation_id=?').run(record.id);
          record.hist.forEach((h, position) => db.prepare('INSERT INTO quotation_history VALUES(?,?,?)').run(record.id, position, JSON.stringify(h)));
        }
      });
    }
    for (const key of ['quotes', 'products', 'customers', 'cats']) {
      const retained = new Set(state[key].map(x => x.id));
      for (const old of previous?.[key] || []) if (!retained.has(old.id)) db.prepare(`DELETE FROM ${TABLES[key]} WHERE id=?`).run(old.id);
    }
    const settingsChanged = previous && !equal(state.set, previous.set);
    db.prepare('INSERT INTO workspace VALUES(1,?,?,1,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,settings=excluded.settings,updated_at=excluded.updated_at,settings_version=settings_version+?')
      .run(revision, JSON.stringify(state.set), now, settingsChanged ? 1 : 0);
  }
  function initialize(state, actor) {
    writeState(state, null, 1);
    for (const q of state.quotes) {
      const match = /\/(\d{4})\/(\d+)$/.exec(q.no);
      if (match) db.prepare('INSERT INTO quote_sequences VALUES(?,?) ON CONFLICT(year) DO UPDATE SET value=max(value,excluded.value)').run(match[1], Number(match[2]));
    }
    audit(actor, 'workspace.created', 'workspace', '', { message: state.customers.length ? 'Workspace created with demonstration data' : 'Workspace created with sample catalog' });
  }
  function allocateNumber(date, prefix) {
    const year = date.slice(0, 4);
    db.prepare('INSERT INTO quote_sequences VALUES(?,1) ON CONFLICT(year) DO UPDATE SET value=value+1').run(year);
    return `${prefix}/${year}/${String(db.prepare('SELECT value FROM quote_sequences WHERE year=?').get(year).value).padStart(4, '0')}`;
  }
  function commit(candidate, previous, actor, options) {
    const state = validateState(candidate, previous.state, actor, allocateNumber, options);
    writeState(state, previous.state, previous.revision + 1);
    for (const key of Object.keys(TABLES)) {
      const old = new Map(previous.state[key].map(x => [x.id, x]));
      for (const record of state[key]) {
        if (!equal(record, old.get(record.id))) audit(actor, `${key}.${old.has(record.id) ? 'updated' : 'created'}`, key, record.id, { message: `${old.has(record.id) ? 'Updated' : 'Created'} ${record.no || record.name}`, ...(key === 'quotes' ? { status: record.status, previousStatus: old.get(record.id)?.status || null } : {}) });
        old.delete(record.id);
      }
      for (const record of old.values()) audit(actor, `${key}.deleted`, key, record.id, { message: `Deleted ${record.no || record.name}` });
    }
    if (!equal(state.set, previous.state.set)) audit(actor, 'settings.updated', 'settings', 'company');
    return readState();
  }
  function mutate(actor, fn, revision, options) {
    return transaction(() => {
      const currentActor = db.prepare('SELECT active,role FROM users WHERE id=?').get(actor.id);
      if (!currentActor?.active || (actor.token_hash && !db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires>?').get(actor.token_hash, Date.now()))) fail('Please sign in again.', 401);
      if (currentActor.role !== actor.role) fail('Account access changed. Sign in again.', 403);
      const previous = readState();
      if (revision !== undefined && (!Number.isInteger(revision) || revision !== previous.revision)) fail('Changes were saved in another session. Reload the latest data before retrying.', 409);
      const candidate = structuredClone(previous.state);
      fn(candidate, previous);
      return commit(candidate, previous, actor, options);
    });
  }
  function get(key, id) {
    if (!TABLES[key]) fail('Unknown resource.', 404);
    const row = db.prepare(`SELECT body,version,updated_at FROM ${TABLES[key]} WHERE id=?`).get(id);
    if (!row) fail('Record not found.', 404);
    const data = JSON.parse(row.body);
    if (key === 'quotes') { data.items = db.prepare('SELECT body FROM quotation_items WHERE quotation_id=? ORDER BY position').all(id).map(x => JSON.parse(x.body)); data.hist = db.prepare('SELECT body FROM quotation_history WHERE quotation_id=? ORDER BY position').all(id).map(x => JSON.parse(x.body)); }
    return { data, version: row.version, updatedAt: row.updated_at };
  }
  function expectVersion(key, id, version) {
    if (!Number.isInteger(version) || version < 1) fail('A current record version is required.', 428);
    const current = get(key, id);
    if (current.version !== version) fail('This record changed in another session. Reload before saving.', 409);
    return current.data;
  }
  return { db, readState, writeState, initialize, mutate, commit, get, expectVersion, transaction, audit, allocateNumber };
}
module.exports = { createStore, TABLES };
