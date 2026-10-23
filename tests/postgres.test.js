'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { testDatabase } = require('./database-helper');
const { createApp } = require('../server');
const { postgresEnvironment } = require('../server/backup');

test('separate PostgreSQL app instances serialize revisions and quotation numbers; failed batches roll back', async () => {
  const database = await testDatabase();
  const a = await createApp(database),
    b = await createApp(database);
  async function listen(app) {
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${app.server.address().port}`;
  }
  const origin = await listen(a),
    second = await listen(b);
  let cookie, token;
  async function request(base, route, body) {
    const r = await fetch(base + route, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie, 'X-CSRF-Token': token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await r.json();
    if (r.headers.get('set-cookie'))
      cookie = r.headers.get('set-cookie').split(';')[0];
    if (value.csrfToken) token = value.csrfToken;
    return { status: r.status, value };
  }
  try {
    assert.equal(
      (
        await request(origin, '/api/auth/setup', {
          name: 'Admin',
          username: 'admin',
          password: 'Secret-' + crypto.randomUUID(),
          demo: true,
        })
      ).status,
      201,
    );
    const state = (await request(origin, '/api/state')).value;
    const changes = (name) => ({
      revision: state.revision,
      changes: [
        {
          collection: 'customers',
          action: 'upsert',
          id: 'C1',
          record: { ...state.state.customers.find((c) => c.id === 'C1'), name },
        },
      ],
    });
    const concurrent = await Promise.all([
      request(origin, '/api/changes', changes('First')),
      request(second, '/api/changes', changes('Second')),
    ]);
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
    const quote = { cid: 'C1', items: [] };
    const quotes = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        request(i % 2 ? origin : second, '/api/quotations', quote),
      ),
    );
    assert.ok(
      quotes.every((r) => r.status === 201),
      JSON.stringify(quotes),
    );
    assert.equal(new Set(quotes.map((r) => r.value.data.no)).size, 8);
    const before = await a.store.readState();
    const sequence = await a.db
      .prepare('SELECT * FROM quote_sequences ORDER BY year')
      .all();
    await assert.rejects(
      a.store.mutate(
        { id: before.state.quotes[0].by, role: 'Administrator' },
        () => {},
      ),
      /sign in/,
    );
    const admin = await a.db.prepare('SELECT * FROM users').get();
    await assert.rejects(
      a.store.mutate(admin, (s) => {
        s.quotes = {};
      }),
      (error) => error.status === 422,
    );
    const auditCount = (
      await a.db.prepare('SELECT count(*) AS n FROM audit_events').get()
    ).n;
    await assert.rejects(
      a.store.transaction(async () => {
        await a.store.allocateNumber('2026-10-23', 'TEST');
        await a.store.audit(admin, 'test.rollback', 'workspace', '');
        throw new Error('Rollback after asynchronous SQL writes');
      }),
      /Rollback/,
    );
    assert.equal(
      (await a.db.prepare('SELECT count(*) AS n FROM audit_events').get()).n,
      auditCount,
    );
    await assert.rejects(
      a.store.mutate(admin, (s) => {
        s.quotes.unshift({
          ...s.quotes[0],
          id: 'bad_quote',
          cid: 'missing',
          status: 'Draft',
        });
      }),
      /customer/,
    );
    assert.equal((await a.store.readState()).revision, before.revision);
    assert.deepEqual(
      await a.db.prepare('SELECT * FROM quote_sequences ORDER BY year').all(),
      sequence,
    );
  } finally {
    await a.close();
    await b.close();
    await database.destroy();
  }
});

test('PostgreSQL offline recovery backs up, revokes sessions and preserves business records', async () => {
  const database = await testDatabase(),
    app = await createApp(database);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paradise-pg-recovery-'));
  try {
    const password = 'Recovered-' + crypto.randomUUID(),
      salt = crypto.randomBytes(16).toString('hex');
    await app.db
      .prepare(
        'INSERT INTO users(id,name,username,password_hash,role) VALUES(?,?,?,?,?)',
      )
      .run(
        'admin',
        'Admin',
        'admin',
        `${salt}:${crypto.scryptSync('Original-password', salt, 64).toString('hex')}`,
        'Administrator',
      );
    await app.store.transaction(() =>
      app.store.initialize(require('../shared/domain').seed({ demo: true }), {
        id: 'admin',
        name: 'Admin',
      }),
    );
    await app.db
      .prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)')
      .run('token', 'admin', 'csrf', Date.now() + 100000, 'session', '', '');
    const result = await new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [path.resolve('scripts/recover-admin.js'), 'admin'],
        {
          env: {
            ...postgresEnvironment(database.databaseUrl),
            BACKUP_DIR: dir,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      let output = '';
      child.stdout.on('data', (c) => (output += c));
      child.stderr.on('data', (c) => (output += c));
      child.on('close', (status) => resolve({ status, output }));
      child.stdin.end(password + '\n');
    });
    assert.equal(result.status, 0, result.output);
    assert.ok(!result.output.includes(password));
    const user = await app.db.prepare('SELECT * FROM users').get(),
      [storedSalt, hash] = user.password_hash.split(':');
    assert.equal(
      crypto.scryptSync(password, storedSalt, 64).toString('hex'),
      hash,
    );
    assert.equal(
      (await app.db.prepare('SELECT count(*) AS n FROM sessions').get()).n,
      0,
    );
    assert.equal(
      (await app.db.prepare('SELECT count(*) AS n FROM quotations').get()).n,
      5,
    );
    assert.equal(
      fs.readdirSync(dir).filter((n) => n.endsWith('.dump')).length,
      1,
    );
  } finally {
    await app.close();
    await database.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
