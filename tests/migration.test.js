'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { testDatabase } = require('./database-helper');
const { importSqlite } = require('../server/import-sqlite');
const { connectDatabase } = require('../server/database');
const { createStore } = require('../server/store');
const DP = require('../shared/domain');
function legacy(t, invalid = false) {
  const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'paradise-migration-test-'),
    ),
    file = path.join(dir, 'legacy.sqlite');
  t.after(() => {
    if (
      !path
        .resolve(dir)
        .startsWith(
          path.resolve(os.tmpdir()) + path.sep + 'paradise-migration-test-',
        )
    )
      throw new Error('Unsafe cleanup path');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,username TEXT UNIQUE,password_hash TEXT,role TEXT);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),csrf TEXT,expires INTEGER);
    CREATE TABLE app_state(id INTEGER PRIMARY KEY,revision INTEGER,body TEXT);
    CREATE TABLE quote_sequences(year TEXT PRIMARY KEY,value INTEGER);
    PRAGMA user_version=1;`);
  const password = 'Original-' + crypto.randomUUID(),
    salt = crypto.randomBytes(16).toString('hex'),
    hash = `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
    'admin-id',
    'Preserved Admin',
    'admin',
    hash,
    'Administrator',
  );
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(
    'old-session',
    'admin-id',
    'csrf',
    Date.now() + 3600000,
  );
  const state = DP.seed({ demo: true });
  state.customers[0].notes = 'Customer note to preserve';
  state.quotes[0].project = 'Historical quote';
  if (invalid) state.quotes[0].cid = 'missing';
  db.prepare('INSERT INTO app_state VALUES(1,17,?)').run(JSON.stringify(state));
  db.prepare('INSERT INTO quote_sequences VALUES(?,?)').run('2026', 120);
  db.close();
  return { dir, file, state, password, hash };
}
test('SQLite import preserves credentials, business snapshots, numbering and revisions without changing source', async (t) => {
  const f = legacy(t),
    database = await testDatabase();
  const before = fs.readFileSync(f.file);
  const db = connectDatabase(database);
  try {
    const counts = await importSqlite(f.file, database);
    assert.equal(counts.quotations, 5);
    const store = await createStore(db),
      current = await store.readState();
    assert.equal(current.revision, 17);
    for (const key of ['cats', 'products', 'customers', 'quotes', 'set'])
      assert.deepEqual(current.state[key], f.state[key]);
    assert.equal(
      (await db.prepare('SELECT password_hash FROM users').get()).password_hash,
      f.hash,
    );
    assert.equal(
      (
        await db
          .prepare('SELECT value FROM quote_sequences WHERE year=?')
          .get('2026')
      ).value,
      120,
    );
    assert.equal(
      (await db.prepare('SELECT count(*) AS n FROM sessions').get()).n,
      0,
    );
    assert.deepEqual(fs.readFileSync(f.file), before);
    await assert.rejects(importSqlite(f.file, database), /not empty/);
    assert.equal((await store.readState()).revision, 17);
  } finally {
    await db.close();
    await database.destroy();
  }
});

test('invalid SQLite import rolls back and leaves original source unchanged', async (t) => {
  const f = legacy(t, true),
    database = await testDatabase(),
    before = fs.readFileSync(f.file);
  try {
    await assert.rejects(importSqlite(f.file, database), /FOREIGN KEY/i);
    assert.deepEqual(fs.readFileSync(f.file), before);
  } finally {
    await database.destroy();
  }
});

test('SQLite v2 imports preserve record versions and durable audit events', async (t) => {
  const f = legacy(t),
    database = await testDatabase();
  const sqlite = new DatabaseSync(f.file);
  require('../server/legacy-sqlite-store').createStore(sqlite, f.file);
  sqlite.prepare('UPDATE customers SET version=9 WHERE id=?').run('C1');
  sqlite.close();
  const db = connectDatabase(database);
  try {
    await importSqlite(f.file, database);
    assert.equal(
      (await db.prepare('SELECT version FROM customers WHERE id=?').get('C1'))
        .version,
      9,
    );
    assert.ok(
      (await db.prepare('SELECT count(*) AS n FROM audit_events').get()).n > 1,
    );
  } finally {
    await db.close();
    await database.destroy();
  }
});
