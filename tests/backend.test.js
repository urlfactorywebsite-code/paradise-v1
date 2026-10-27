'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { testDatabase } = require('./database-helper');
const { connectDatabase } = require('../server/database');
const { restore } = require('../scripts/restore');
const { createApp } = require('../server');
const DP = require('../shared/domain');
const password = 'Test-' + crypto.randomUUID();
async function fixture(t, demo = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paradise-v2-test-'));
  const database = await testDatabase();
  const app = await createApp({
    databaseUrl: database.databaseUrl,
    backupDir: path.join(dir, 'backups'),
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await app.close();
    await database.destroy();
    if (
      !path
        .resolve(dir)
        .startsWith(path.resolve(os.tmpdir()) + path.sep + 'paradise-v2-test-')
    )
      throw new Error('Unsafe cleanup path');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  function client() {
    let cookie = '',
      token = '';
    return {
      async call(route, method = 'GET', body, expected = 200, headers = {}) {
        const response = await fetch(base + route, {
          method,
          headers: {
            ...(cookie ? { Cookie: cookie } : {}),
            ...(token ? { 'X-CSRF-Token': token } : {}),
            ...(body !== undefined
              ? { 'Content-Type': 'application/json' }
              : {}),
            ...headers,
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        const data = response.headers
          .get('content-type')
          ?.includes('application/json')
          ? await response.json()
          : Buffer.from(await response.arrayBuffer());
        if (data.csrfToken) token = data.csrfToken;
        const message = `${method} ${route}: ${Buffer.isBuffer(data) ? 'binary' : JSON.stringify(data)}`;
        if (Array.isArray(expected)) {
          assert.ok(expected.includes(response.status), message);
          return { status: response.status, data };
        }
        assert.equal(response.status, expected, message);
        return data;
      },
    };
  }
  const admin = client();
  const auth = await admin.call(
    '/api/auth/setup',
    'POST',
    { name: 'Test Admin', username: 'admin', password, demo },
    201,
  );
  return { app, database, dir, base, admin, auth, client };
}
const freshQuote = (state, extra = {}) => ({
  cid: state.customers[0].id,
  project: 'Backend test',
  items: [
    {
      pid: 'p1',
      cfg: DP.defCfg(state.products.find((p) => p.id === 'p1')),
      notes: '',
    },
  ],
  ...extra,
});
async function employee(f) {
  const { user } = await f.admin.call(
    '/api/users',
    'POST',
    { name: 'Employee', username: 'employee', password, role: 'Employee' },
    201,
  );
  const account = f.client();
  await account.call('/api/auth/login', 'POST', {
    username: 'employee',
    password,
  });
  return { account, user };
}
test('dedicated customer CRUD supports duplicate review, versions, search, paging, and dependencies', async (t) => {
  const f = await fixture(t),
    a = f.admin;
  const created = await a.call(
    '/api/customers',
    'POST',
    {
      data: {
        name: 'Unique Customer',
        mob: '9123456789',
        email: 'unique@example.test',
      },
    },
    201,
  );
  assert.equal(created.version, 1);
  await a.call(
    '/api/customers',
    'POST',
    { name: 'Copy', mob: '9123456789' },
    409,
  );
  const allowed = await a.call(
    '/api/customers',
    'POST',
    {
      data: { name: 'Reviewed copy', mob: '9123456789' },
      allowDuplicate: true,
    },
    201,
  );
  const found = await a.call('/api/customers?q=Unique%20Customer&pageSize=1');
  assert.equal(found.pagination.total, 1);
  assert.equal(found.data[0].id, created.data.id);
  const changed = await a.call('/api/customers/' + created.data.id, 'PATCH', {
    version: 1,
    data: { notes: 'Persist me' },
    allowDuplicate: true,
  });
  assert.equal(changed.version, 2);
  await a.call(
    '/api/customers/' + created.data.id,
    'PATCH',
    { version: 1, data: { notes: 'stale' } },
    409,
  );
  await a.call('/api/customers/' + created.data.id, 'DELETE', {}, 428);
  await a.call('/api/customers/' + created.data.id, 'DELETE', { version: 2 });
  await a.call('/api/customers/' + created.data.id, 'GET', undefined, 404);
  await a.call('/api/customers/' + allowed.data.id, 'DELETE', { version: 1 });
  const referenced = await a.call('/api/customers/C1');
  await a.call(
    '/api/customers/C1',
    'DELETE',
    { version: referenced.version },
    409,
  );
  await a.call('/api/customers?pageSize=0', 'GET', undefined, 422);
  await a.call(
    '/api/customers?sort=name%3BDROP%20TABLE%20users',
    'GET',
    undefined,
    422,
  );
});
test('catalog/category APIs validate pricing, dependencies, inactive choices, and admin access', async (t) => {
  const f = await fixture(t),
    a = f.admin,
    { account } = await employee(f);
  const category = await a.call(
    '/api/categories',
    'POST',
    { name: 'New category' },
    201,
  );
  const product = await a.call(
    '/api/products',
    'POST',
    {
      name: 'Area service',
      code: 'AREA-NEW',
      cat: category.data.id,
      m: 'area',
      rate: 10,
    },
    201,
  );
  const price = await a.call('/api/pricing/calculate', 'POST', {
    productId: product.data.id,
    cfg: { qty: 2, w: 2.5, h: 4, u: 'ft' },
  });
  assert.equal(price.sub, 20000);
  await a.call(
    '/api/pricing/calculate',
    'POST',
    { productId: product.data.id, cfg: { qty: -1, w: 2.5, h: 4, u: 'ft' } },
    422,
  );
  await a.call(
    '/api/categories/' + category.data.id,
    'DELETE',
    { version: 1 },
    409,
  );
  await account.call(
    '/api/products/' + product.data.id,
    'PATCH',
    { version: 1, data: { rate: 0 } },
    403,
  );
  await a.call(
    '/api/products',
    'POST',
    {
      name: 'Duplicate code',
      code: 'AREA-NEW',
      cat: category.data.id,
      m: 'fixed',
    },
    422,
  );
  await a.call('/api/products/' + product.data.id, 'PATCH', {
    version: 1,
    data: { on: 0 },
  });
  await a.call(
    '/api/pricing/calculate',
    'POST',
    { productId: product.data.id, cfg: { qty: 1, w: 1, h: 1, u: 'ft' } },
    422,
  );
  await a.call('/api/products/' + product.data.id, 'DELETE', { version: 2 });
  await a.call('/api/categories/' + category.data.id, 'DELETE', { version: 1 });
});
test('quotation CRUD, preview, status, copy, repricing and historical document snapshots are authoritative', async (t) => {
  const f = await fixture(t),
    a = f.admin;
  const policy = await a.call('/api/settings');
  await a.call('/api/settings', 'PATCH', { version: policy.version, data: { independentApproval: false } });
  const initial = await a.call('/api/state');
  const input = freshQuote(initial.state),
    preview = await a.call('/api/quotations/preview', 'POST', input);
  assert.equal(preview.totals.grand, 59000);
  assert.equal((await a.call('/api/state')).state.quotes.length, 5);
  const created = await a.call('/api/quotations', 'POST', input, 201),
    id = created.data.id;
  assert.equal(created.data.items[0].sub, 50000);
  assert.equal(created.data.no, 'DP/QTN/2026/0006');
  const itemCount = (
    await f.app.db
      .prepare('SELECT count(*) AS n FROM quotation_items WHERE quotation_id=?')
      .get(id)
  ).n;
  assert.equal(itemCount, 1);
  const changed = await a.call('/api/quotations/' + id, 'PATCH', {
    version: created.version,
    data: { status: 'Customer Approved', subject: 'Updated' },
  });
  assert.equal(changed.data.status, 'Draft');
  const approved = await a.call('/api/quotations/' + id + '/status', 'POST', {
    version: changed.version,
    status: 'Approved Internally',
  });
  assert.equal(approved.data.hist.at(-1).u, 'Test Admin');
  const company = await a.call('/api/settings');
  await a.call('/api/settings', 'PATCH', {
    version: company.version,
    data: { name: 'New Company' },
  });
  const customer = await a.call('/api/customers/C1');
  await a.call('/api/customers/C1', 'PATCH', {
    version: customer.version,
    data: { name: 'Changed Customer' },
  });
  const product = await a.call('/api/products/p1');
  const tiers = product.data.tiers.map(([qty, price]) => [qty, price + 1]);
  await a.call('/api/products/p1', 'PATCH', {
    version: product.version,
    data: { tiers },
  });
  const latest = await a.call('/api/quotations/' + id);
  assert.equal(
    latest.data.customerSnapshot.name,
    initial.state.customers[0].name,
  );
  assert.equal(latest.data.companySnapshot.name, initial.state.set.name);
  const copy = await a.call(
    '/api/quotations/' + id + '/duplicate',
    'POST',
    { version: latest.version },
    201,
  );
  assert.equal(copy.data.items[0].sub, 60000);
  assert.equal(latest.data.items[0].sub, 50000);
  assert.equal(copy.data.status, 'Draft');
  assert.notEqual(copy.data.no, latest.data.no);
  const repriced = await a.call('/api/quotations/' + id + '/reprice', 'POST', {
    version: latest.version,
  });
  assert.equal(repriced.data.items[0].sub, 60000);
  await a.call(
    '/api/quotations/' + id,
    'PUT',
    { version: repriced.version, data: { subject: 'invalid' } },
    422,
  );
  const history = await a.call('/api/quotations/' + id + '/history');
  assert.equal(history.data.at(-1).t, 'Approved Internally');
  const pdf = await a.call('/api/quotations/' + id + '/pdf');
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 5000);
});
test('record versions permit unrelated concurrent edits and reject lost updates on the same record', async (t) => {
  const f = await fixture(t),
    a = f.admin;
  const c1 = await a.call('/api/customers/C1'),
    c2 = await a.call('/api/customers/C2');
  await Promise.all([
    a.call('/api/customers/C1', 'PATCH', {
      version: c1.version,
      data: { notes: 'One' },
    }),
    a.call('/api/customers/C2', 'PATCH', {
      version: c2.version,
      data: { notes: 'Two' },
    }),
  ]);
  const current = await a.call('/api/customers/C1');
  const responses = await Promise.all([
    a.call('/api/customers/C1', 'PATCH', {
      version: current.version,
      data: { notes: 'winner A' },
    }, [200, 409]),
    a.call(
      '/api/customers/C1',
      'PATCH',
      { version: current.version, data: { notes: 'winner B' } },
      [200, 409],
    ),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const winner = responses.find(response => response.status === 200);
  const retained = await a.call('/api/customers/C1');
  assert.equal(retained.version, current.version + 1);
  assert.equal(retained.data.notes, winner.data.data.notes);
});
test('atomic change API rolls back all operations and keeps a durable audit trail', async (t) => {
  const f = await fixture(t),
    a = f.admin,
    before = await a.call('/api/state');
  await a.call(
    '/api/changes',
    'POST',
    {
      revision: before.revision,
      changes: [
        {
          collection: 'customers',
          action: 'upsert',
          id: 'C1',
          record: { ...before.state.customers[0], name: 'Should rollback' },
        },
        {
          collection: 'products',
          action: 'upsert',
          id: 'p1',
          record: { ...before.state.products[0], tax: -1 },
        },
      ],
    },
    422,
  );
  assert.equal((await a.call('/api/state')).revision, before.revision);
  const saved = await a.call('/api/changes', 'POST', {
    revision: before.revision,
    changes: [
      {
        collection: 'customers',
        action: 'upsert',
        id: 'C1',
        record: { ...before.state.customers[0], name: 'Audited name' },
      },
    ],
  });
  assert.equal(saved.state.customers[0].name, 'Audited name');
  const audit = await a.call('/api/audit?entityType=customers&entityId=C1');
  assert.equal(audit.data[0].action, 'customers.updated');
  await a.call(
    '/api/changes',
    'POST',
    {
      revision: before.revision,
      changes: [
        { collection: 'set', action: 'upsert', record: before.state.set },
      ],
    },
    409,
  );
  assert.ok(
    (await f.app.db.prepare('SELECT count(*) AS n FROM audit_events').get()).n >
      1,
  );
});
test('reports use persisted prices, apply date/customer filters, and produce escaped CSV', async (t) => {
  const f = await fixture(t),
    a = f.admin,
    state = (await a.call('/api/state')).state;
  const summary = await a.call('/api/reports/summary');
  assert.equal(summary.count, state.quotes.length);
  assert.equal(
    summary.quotedValue,
    state.quotes.reduce((sum, q) => sum + DP.totals(q, state.set).grand, 0),
  );
  const filtered = await a.call('/api/reports/summary?customer=C1');
  assert.equal(filtered.count, 1);
  await a.call(
    '/api/reports/summary?from=2026-12-01&to=2026-01-01',
    'GET',
    undefined,
    422,
  );
  const created = await a.call(
    '/api/quotations',
    'POST',
    freshQuote(state, { sales: '=DANGEROUS()', project: 'CSV' }),
    201,
  );
  const csv = await a.call('/api/reports/quotations.csv?q=CSV');
  assert.match(csv.toString(), /'=DANGEROUS\(\)/);
  assert.match(csv.toString(), /Grand total \(INR\)/);
  const dash = await a.call('/api/dashboard');
  assert.equal(dash.count, 6);
  const recent = await a.call('/api/customers/C1/quotations');
  assert.ok(recent.data.some((q) => q.id === created.data.id));
});
test('employee restrictions cover resources, approval, audits, backups, settings and exports', async (t) => {
  const f = await fixture(t),
    { account } = await employee(f);
  for (const route of [
    '/api/audit',
    '/api/backups',
    '/api/data/export',
    '/api/users',
  ])
    await account.call(route, 'GET', undefined, 403);
  await account.call('/api/categories', 'POST', { name: 'Forbidden' }, 403);
  await account.call(
    '/api/settings',
    'PATCH',
    { version: 1, data: { tax: 0 } },
    403,
  );
  await account.call('/api/quotations/Q3', 'GET', undefined, 404);
  const state = (await account.call('/api/state')).state;
  assert.equal(state.quotes.length, 0);
  const own = await account.call('/api/quotations', 'POST', freshQuote(state), 201);
  await account.call(
    '/api/quotations/' + own.data.id + '/status',
    'POST',
    {
      version: own.version,
      status: 'Approved Internally',
    },
    403,
  );
  await account.call(
    '/api/quotations/' + own.data.id,
    'DELETE',
    { version: own.version },
    403,
  );
  await account.call('/api/quotations/expire', 'POST', {}, 403);
  assert.equal((await account.call('/api/reports/summary')).count, 1);
});
test('team lifecycle protects the last administrator, revokes sessions and requires temporary-password replacement', async (t) => {
  const f = await fixture(t),
    a = f.admin,
    { account, user } = await employee(f);
  await a.call(
    '/api/users/' + f.auth.user.id,
    'PATCH',
    { version: 1, role: 'Employee' },
    409,
  );
  await a.call('/api/users/' + f.auth.user.id, 'DELETE', { version: 1 }, 409);
  const disabled = await a.call('/api/users/' + user.id, 'PATCH', {
    version: user.version,
    active: false,
  });
  assert.equal(disabled.user.active, false);
  await account.call('/api/state', 'GET', undefined, 401);
  await account.call(
    '/api/auth/login',
    'POST',
    { username: 'employee', password },
    401,
  );
  const active = await a.call('/api/users/' + user.id, 'PATCH', {
    version: disabled.user.version,
    active: true,
  });
  const temporary = 'Temporary-' + crypto.randomUUID();
  const reset = await a.call(
    '/api/users/' + user.id + '/reset-password',
    'POST',
    { version: active.user.version, password: temporary },
  );
  assert.equal(reset.user.mustChangePassword, true);
  const login = await account.call('/api/auth/login', 'POST', {
    username: 'employee',
    password: temporary,
  });
  assert.equal(login.user.mustChangePassword, true);
  await account.call(
    '/api/customers',
    'POST',
    { name: 'Blocked until reset', mob: '9111111111' },
    403,
  );
  const replacement = 'Replacement-' + crypto.randomUUID();
  await account.call('/api/auth/password', 'POST', {
    currentPassword: temporary,
    password: replacement,
  });
  await account.call(
    '/api/customers',
    'POST',
    { name: 'Allowed after reset', mob: '9111111111' },
    201,
  );
  const latest = await a.call('/api/users/' + user.id);
  await a.call('/api/users/' + user.id, 'DELETE', {
    version: latest.user.version,
  });
  await account.call('/api/state', 'GET', undefined, 401);
});
test('users can inspect and revoke only their own sessions', async (t) => {
  const f = await fixture(t),
    a = f.admin,
    second = f.client(),
    { account } = await employee(f);
  await second.call('/api/auth/login', 'POST', { username: 'admin', password });
  const sessions = await a.call('/api/auth/sessions');
  assert.equal(sessions.sessions.length, 2);
  const other = sessions.sessions.find((s) => !s.current);
  assert.ok(other);
  await account.call(
    '/api/auth/sessions/' + other.id,
    'DELETE',
    undefined,
    404,
  );
  await a.call('/api/auth/sessions/' + other.id, 'DELETE');
  await second.call('/api/state', 'GET', undefined, 401);
  await a.call('/api/auth/sessions', 'DELETE');
  assert.equal((await a.call('/api/auth/sessions')).sessions.length, 1);
});
test('PostgreSQL backups restore to a new database, preserve records, revoke sessions, and refuse overwrite', async (t) => {
  const f = await fixture(t),
    a = f.admin;
  const exported = await a.call('/api/data/export');
  assert.equal(exported.format, 'design-paradise-workspace');
  assert.equal(exported.state.customers.length, 5);
  assert.ok(!JSON.stringify(exported).includes('password_hash'));
  const result = await a.call('/api/backups', 'POST', {}, 201);
  const downloaded = await a.call('/api/backups/' + result.name);
  assert.equal(downloaded.subarray(0, 5).toString(), 'PGDMP');
  const source = path.join(f.dir, 'backups', result.name),
    name = 'restored_' + crypto.randomBytes(10).toString('hex');
  const url = new URL(f.database.databaseUrl);
  url.pathname = '/' + name;
  await restore(source, name, { databaseUrl: f.database.databaseUrl });
  const db = connectDatabase({ databaseUrl: url.href });
  try {
    assert.equal(
      (await db.prepare('SELECT count(*) AS n FROM sessions').get()).n,
      0,
    );
    assert.equal(
      (await db.prepare('SELECT count(*) AS n FROM quotations').get()).n,
      5,
    );
    assert.deepEqual(
      await db.prepare('SELECT number FROM quotations ORDER BY number').all(),
      await f.app.db
        .prepare('SELECT number FROM quotations ORDER BY number')
        .all(),
    );
    await assert.rejects(
      restore(source, name, { databaseUrl: f.database.databaseUrl }),
      /refused/,
    );
    assert.equal((await a.call('/api/backups')).data.length, 1);
  } finally {
    await db.close();
    await f.app.db.exec(`DROP DATABASE "${name}" WITH (FORCE)`);
  }
});

test('OpenAPI enumerates working resources and rejects unauthenticated documentation requests', async (t) => {
  const f = await fixture(t),
    spec = await f.admin.call('/api/openapi.json');
  assert.equal(spec.openapi, '3.1.0');
  for (const route of [
    '/api/quotations/{id}/pdf',
    '/api/auth/sessions',
    '/api/backups',
    '/api/changes',
    '/api/users/{id}/reset-password',
  ])
    assert.ok(spec.paths[route]);
  await f.client().call('/api/openapi.json', 'GET', undefined, 401);
});

test('expiry action is selective and does not add repeated status history', async (t) => {
  const f = await fixture(t),
    a = f.admin;
  const first = await a.call('/api/quotations/expire', 'POST', {
    asOf: '2030-01-01',
  });
  assert.equal(first.count, 1);
  assert.equal((await a.call('/api/quotations/Q1')).data.status, 'Expired');
  assert.equal(
    (await a.call('/api/quotations/Q2')).data.status,
    'Customer Approved',
  );
  assert.equal((await a.call('/api/quotations/Q3')).data.status, 'Draft');
  const history = (await a.call('/api/quotations/Q1/history')).data;
  assert.equal(
    (await a.call('/api/quotations/expire', 'POST', { asOf: '2030-01-01' }))
      .count,
    0,
  );
  assert.deepEqual((await a.call('/api/quotations/Q1/history')).data, history);
  assert.ok(
    (await a.call('/api/reports/summary')).expired.some(
      (q) => q.number === 'DP/QTN/2026/0001',
    ),
  );
});

test('login throttling persists across a separately started server connection', async (t) => {
  const f = await fixture(t),
    anonymous = f.client();
  for (let n = 0; n < 15; n++)
    await anonymous.call(
      '/api/auth/login',
      'POST',
      { username: 'admin', password: 'invalid' },
      401,
    );
  await anonymous.call(
    '/api/auth/login',
    'POST',
    { username: 'admin', password: 'invalid' },
    429,
  );
  const second = await createApp({ databaseUrl: f.database.databaseUrl });
  try {
    await new Promise((resolve) =>
      second.server.listen(0, '127.0.0.1', resolve),
    );
    const response = await fetch(
      `http://127.0.0.1:${second.server.address().port}/api/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'invalid' }),
      },
    );
    assert.equal(response.status, 429);
    assert.ok(
      (
        await second.db
          .prepare('SELECT max(count) AS n FROM auth_attempts')
          .get()
      ).n >= 16,
    );
  } finally {
    await second.close();
  }
});

test('audit history outlives the recent-activity window and rejects forged client events', async (t) => {
  const f = await fixture(t),
    a = f.admin;
  for (let i = 0; i < 125; i++)
    await f.app.store.audit(
      { id: f.auth.user.id, name: 'Test Admin' },
      'test.audit_retention',
      'workspace',
      String(i),
    );
  const before = await a.call('/api/state');
  assert.equal(before.state.log.length, 100);
  before.state.log.unshift({
    t: new Date().toISOString(),
    u: 'Forged',
    x: 'Forged client event',
  });
  await a.call('/api/state', 'PUT', before);
  const audit = await a.call('/api/audit?page=2&pageSize=100');
  assert.ok(audit.pagination.total > 100);
  assert.ok(audit.data.length > 0);
  assert.equal(
    (
      await f.app.db
        .prepare(
          "SELECT count(*) AS n FROM audit_events WHERE actor_name='Forged'",
        )
        .get()
    ).n,
    0,
  );
});

test('request limits, private files, unknown routes and header-based deletion fail safely', async (t) => {
  const f = await fixture(t),
    a = f.admin;
  await a.call(
    '/api/changes',
    'POST',
    { revision: 1, changes: [], oversized: 'x'.repeat(10 * 1024 * 1024) },
    413,
  );
  await a.call(
    '/api/customers',
    'POST',
    { name: 'bad type', mob: '9000012312' },
    415,
    { 'Content-Type': 'text/plain' },
  );
  await a.call('/data/paradise.sqlite', 'GET', undefined, 404);
  await a.call('/.env', 'GET', undefined, 404);
  await a.call('/api/does-not-exist', 'GET', undefined, 404);
  const created = await a.call(
    '/api/customers',
    'POST',
    { name: 'Header delete', mob: '9000012312' },
    201,
  );
  await a.call('/api/customers/' + created.data.id, 'DELETE', undefined, 200, {
    'If-Match': '"1"',
  });
  await a.call('/api/customers/' + created.data.id, 'GET', undefined, 404);
});
