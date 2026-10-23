'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

function postgresEnvironment(connectionString) {
  const url = new URL(connectionString);
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  };
  if (url.searchParams.has('sslmode'))
    env.PGSSLMODE = url.searchParams.get('sslmode');
  // A host application's PGOPTIONS must not change a backup or restore's schema.
  delete env.PGOPTIONS;
  return env;
}

async function backupDatabase(db, directory) {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `paradise-${Date.now()}-${crypto.randomUUID()}.dump`;
  const destination = path.join(directory, name),
    temporary = destination + '.partial';
  try {
    await run(
      'pg_dump',
      [
        '--format=custom',
        '--no-owner',
        '--no-acl',
        '--schema',
        db.schema,
        '--file',
        temporary,
      ],
      {
        env: postgresEnvironment(db.connectionString),
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      },
    );
    await fs.promises.chmod(temporary, 0o600);
    await fs.promises.rename(temporary, destination);
    return { name, bytes: (await fs.promises.stat(destination)).size };
  } catch (error) {
    await fs.promises.rm(temporary, { force: true });
    throw new Error(
      error.code === 'ENOENT'
        ? 'PostgreSQL client tools are required. Run this command in the app container.'
        : 'PostgreSQL backup failed. Check database access and client version.',
    );
  }
}
module.exports = { backupDatabase, postgresEnvironment };
