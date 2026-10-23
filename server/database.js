'use strict';
const { Pool, types } = require('pg');
const { AsyncLocalStorage } = require('node:async_hooks');

// Business amounts and millisecond timestamps stay within JavaScript's safe range.
for (const oid of [20, 1700])
  types.setTypeParser(oid, (value) => {
    const number = Number(value);
    if (!Number.isSafeInteger(number))
      throw new Error('Database number exceeds the supported integer range.');
    return number;
  });

function parameters(sql) {
  let index = 0,
    quoted = false;
  return sql.replace(/''|'|\?/g, (token) => {
    if (token === "''") return token;
    if (token === "'") {
      quoted = !quoted;
      return token;
    }
    return quoted ? token : `$${++index}`;
  });
}

function connectDatabase(options = {}) {
  let connectionString = options.databaseUrl || process.env.DATABASE_URL;
  if (
    !connectionString &&
    process.env.PGHOST &&
    process.env.PGDATABASE &&
    process.env.PGUSER &&
    process.env.PGPASSWORD
  ) {
    const url = new URL('postgresql://localhost');
    url.hostname = process.env.PGHOST;
    url.port = process.env.PGPORT || '5432';
    url.username = process.env.PGUSER;
    url.password = process.env.PGPASSWORD;
    url.pathname = '/' + process.env.PGDATABASE;
    connectionString = url.href;
  }
  if (!connectionString)
    throw new Error(
      'DATABASE_URL is required. Start PostgreSQL with Docker Compose or configure a PostgreSQL connection.',
    );
  if (!/^postgres(ql)?:\/\//.test(connectionString))
    throw new Error('DATABASE_URL must be a PostgreSQL URL.');
  const schema = options.schema || 'public';
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
    throw new Error('Invalid database schema.');
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    options: `-c search_path=${schema} -c statement_timeout=30000 -c idle_in_transaction_session_timeout=30000`,
  });
  pool.on('error', (error) =>
    console.error('PostgreSQL pool error:', error.code || error.name),
  );
  const context = new AsyncLocalStorage();
  const query = (sql, values = []) =>
    (context.getStore() || pool).query(sql, values);
  const db = {
    connectionString,
    schema,
    query,
    get inTransaction() {
      return Boolean(context.getStore());
    },
    prepare(sql) {
      const text = parameters(sql);
      return {
        async get(...values) {
          return (await query(text, values)).rows[0];
        },
        async all(...values) {
          return (await query(text, values)).rows;
        },
        async run(...values) {
          return { changes: (await query(text, values)).rowCount };
        },
      };
    },
    exec: (sql) => query(sql),
    async transaction(fn) {
      if (context.getStore()) return fn();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // The application writes a single company workspace. Serialize its
        // mutations across processes before reading versions or allocating numbers.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), 1)', [
          schema,
        ]);
        const result = await context.run(client, fn);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
  return db;
}
module.exports = { connectDatabase };
