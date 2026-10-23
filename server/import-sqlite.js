'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { connectDatabase } = require('./database');
const { createStore } = require('./store');

async function importSqlite(source, options = {}) {
  // Loaded only by the offline importer, never by the HTTP server.
  const { DatabaseSync, backup } = require('node:sqlite');
  const file = path.resolve(source);
  if (!fs.existsSync(file)) throw new Error('SQLite source does not exist.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'paradise-import-'));
  const copy = path.join(directory, 'source.sqlite');
  let legacy, db;
  try {
    const original = new DatabaseSync(file, { readOnly: true });
    try {
      await backup(original, copy);
    } finally {
      original.close();
    }
    legacy = new DatabaseSync(copy);
    if (legacy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
      throw new Error('SQLite integrity check failed.');
    const version = legacy.prepare('PRAGMA user_version').get().user_version;
    if (![1, 2].includes(version))
      throw new Error('Only SQLite schema v1 or v2 can be imported.');
    // Upgrade only the temporary snapshot. The source file is never changed.
    const oldStore = require('./legacy-sqlite-store').createStore(legacy, copy);
    const originalState = oldStore.readState();
    if (legacy.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('SQLite foreign keys are invalid.');
    db = connectDatabase(options);
    const store = await createStore(db);
    return await store.transaction(async () => {
      const tables = [
        'users',
        'workspace',
        'categories',
        'products',
        'customers',
        'quotations',
        'quotation_items',
        'quotation_history',
        'quote_sequences',
        'audit_events',
      ];
      for (const table of [...tables, 'sessions', 'auth_attempts']) {
        if ((await db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).n)
          throw new Error(
            'Import destination is not empty. Existing data was preserved.',
          );
      }
      const counts = {};
      for (const table of tables) {
        const rows = legacy.prepare(`SELECT * FROM ${table}`).all();
        for (const row of rows) {
          const columns = Object.keys(row);
          await db
            .prepare(
              `INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
            )
            .run(...Object.values(row));
        }
        counts[table] = rows.length;
        if (
          (await db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).n !==
          rows.length
        )
          throw new Error('Imported row counts differ.');
      }
      await db.exec(
        "SELECT setval(pg_get_serial_sequence('audit_events','id'), coalesce((SELECT max(id) FROM audit_events),0)+1, false)",
      );
      const imported = await store.readState();
      for (const key of ['cats', 'products', 'customers', 'quotes', 'set']) {
        if (!isDeepStrictEqual(originalState.state[key], imported.state[key]))
          throw new Error('Imported business data differs.');
      }
      if (imported.revision !== originalState.revision)
        throw new Error('Imported revision differs.');
      await store.audit(
        { name: 'System' },
        'database.imported_sqlite',
        'workspace',
        '',
        { sourceSchema: version, counts },
      );
      return counts;
    });
  } finally {
    if (db) await db.close();
    if (legacy) legacy.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
module.exports = { importSqlite };
