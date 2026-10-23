'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { connectDatabase } = require('../server/database');
const { postgresEnvironment } = require('../server/backup');
const run = promisify(execFile);
async function restore(source, name, options = {}) {
  if (!source || !/^[a-z][a-z0-9_]{0,62}$/.test(name || ''))
    throw new Error(
      'Usage: npm run restore -- <backup.dump> <new_database_name>',
    );
  const input = path.resolve(source);
  if (!fs.existsSync(input)) throw new Error('Backup file does not exist.');
  const db = connectDatabase(options);
  let created = false;
  try {
    const env = postgresEnvironment(db.connectionString);
    await run('pg_restore', ['--list', input], { env });
    await db.exec(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created = true;
    const url = new URL(db.connectionString);
    url.pathname = '/' + name;
    const empty = connectDatabase({ databaseUrl: url.href });
    try {
      await empty.exec('DROP SCHEMA public');
    } finally {
      await empty.close();
    }
    await run(
      'pg_restore',
      [
        '--exit-on-error',
        '--single-transaction',
        '--no-owner',
        '--no-acl',
        '--dbname',
        name,
        input,
      ],
      { env, timeout: 120000, maxBuffer: 1024 * 1024 },
    );
    const restored = connectDatabase({ databaseUrl: url.href });
    try {
      const version = await restored
        .prepare('SELECT max(version) AS version FROM schema_migrations')
        .get();
      if (version.version !== 3) throw new Error('Unsupported backup schema.');
      await restored.exec('DELETE FROM sessions; DELETE FROM auth_attempts;');
      await restored.prepare('SELECT count(*) FROM quotations').get();
    } finally {
      await restored.close();
    }
    return name;
  } catch {
    throw new Error(
      created
        ? 'Restore failed. The new database is retained for inspection; the source database was not changed.'
        : 'Restore refused or failed before creating a database. Use a valid backup and an unused database name.',
    );
  } finally {
    await db.close();
  }
}
if (require.main === module)
  restore(process.argv[2], process.argv[3])
    .then((name) => {
      console.log(
        `Backup restored to new PostgreSQL database: ${name}. Sessions revoked. Configure the app to use this database and restart. The previous database was not modified.`,
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
module.exports = { restore };
