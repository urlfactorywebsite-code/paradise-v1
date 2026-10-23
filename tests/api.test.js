'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createApp } = require('../server');
const { testDatabase } = require('./database-helper');

const ADMIN_PASSWORD = 'Local-admin-test-password-2026';
const EMPLOYEE_PASSWORD = 'Local-employee-test-password-2026';
const clone = (value) => JSON.parse(JSON.stringify(value));

async function start(databaseUrl) {
  const app = await createApp({ databaseUrl });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  return { app, base: `http://127.0.0.1:${app.server.address().port}` };
}

async function stop(running) {
  if (!running) return;
  if (running.app.server.listening) {
    await new Promise((resolve, reject) => {
      running.app.server.close((error) => (error ? reject(error) : resolve()));
      running.app.server.closeAllConnections();
    });
  }
  await running.app.close();
}

function client(base) {
  return {
    base,
    cookie: '',
    csrfToken: '',
    async request(
      route,
      { method = 'GET', body, csrf = true, origin, headers = {} } = {},
    ) {
      const requestHeaders = { ...headers };
      if (this.cookie) requestHeaders.Cookie = this.cookie;
      if (body !== undefined)
        requestHeaders['Content-Type'] = 'application/json';
      if (csrf && this.csrfToken)
        requestHeaders['X-CSRF-Token'] = this.csrfToken;
      if (origin !== undefined) requestHeaders.Origin = origin;
      const response = await fetch(`${this.base}${route}`, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      const cookie = response.headers.get('set-cookie');
      if (cookie) this.cookie = cookie.split(';')[0];
      if (data && typeof data === 'object' && data.csrfToken)
        this.csrfToken = data.csrfToken;
      return { status: response.status, data, headers: response.headers };
    },
  };
}

function success(result, message) {
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${message || 'Request failed'}: HTTP ${result.status} ${JSON.stringify(result.data)}`,
  );
  return result.data;
}

async function fixture(t, { initialize = true } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'paradise-api-test-'));
  const database = await testDatabase();
  const dbPath = database.databaseUrl;
  let running = await start(dbPath);
  t.after(async () => {
    await stop(running);
    await database.destroy();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const admin = client(running.base);
  if (initialize) {
    success(
      await admin.request('/api/auth/setup', {
        method: 'POST',
        body: {
          name: 'Test Administrator',
          username: 'admin',
          password: ADMIN_PASSWORD,
          demo: true,
        },
      }),
      'Initialize administrator',
    );
  }
  return {
    admin,
    dbPath,
    anonymous: () => client(running.base),
    async restart() {
      await stop(running);
      running = null;
      running = await start(dbPath);
      admin.base = running.base;
      admin.cookie = '';
      admin.csrfToken = '';
    },
  };
}

async function readState(account) {
  return success(await account.request('/api/state'), 'Read state');
}

async function saveState(account, current, state = current.state) {
  return account.request('/api/state', {
    method: 'PUT',
    body: { state, revision: current.revision },
  });
}

function newQuote(state, id = 'test_quote_1') {
  const product =
    state.products.find((item) => item.id === 'p1') ||
    state.products.find((item) => item.m === 'unit');
  assert.ok(product, 'Demo catalog must include a per-unit product');
  assert.ok(state.customers.length, 'Demo data must include a customer');
  const qty = product.tiers[0][0];
  const cfg = {
    qty,
    w: 4,
    h: 3,
    u: 'ft',
    sz: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 },
  };
  for (const field of product.f)
    if (field.t === 'sel') cfg[field.k] = field.o[0][0];
  return {
    id,
    no: 'CLIENT-SUPPLIED-NUMBER',
    date: '2026-10-23',
    valid: '2026-11-07',
    cid: state.customers[0].id,
    sales: 'Test Administrator',
    ref: '',
    project: 'Integration test',
    subject: 'Saved quotation',
    req: '',
    items: [
      {
        id: `${id}_item`,
        pid: product.id,
        cfg,
        notes: 'Snapshot note',
        name: 'Forged product name',
        qty,
        L: [['Forged amount', 1]],
        sp: ['Forged specifications'],
        sub: 1,
        base: 1,
        tax: 0,
      },
    ],
    disc: { t: 'p', v: 0 },
    del: 0,
    oth: 0,
    status: 'Draft',
    terms: clone(state.set.terms),
    by: 'Forged author',
    hist: [],
  };
}

async function createEmployee(admin, anonymous) {
  success(
    await admin.request('/api/users', {
      method: 'POST',
      body: {
        name: 'Test Employee',
        username: 'employee',
        password: EMPLOYEE_PASSWORD,
        role: 'Employee',
      },
    }),
    'Create employee',
  );
  const employee = anonymous();
  success(
    await employee.request('/api/auth/login', {
      method: 'POST',
      body: { username: 'employee', password: EMPLOYEE_PASSWORD },
    }),
    'Employee login',
  );
  return employee;
}

test('initial setup is single-use, uses secure session attributes, and protects private data', async (t) => {
  const { admin, anonymous } = await fixture(t, { initialize: false });
  const health = success(await admin.request('/api/health'));
  assert.equal(health.ok, true);
  const before = success(await admin.request('/api/auth/status'));
  assert.equal(before.initialized, false);
  assert.equal(before.user, null);
  assert.equal((await admin.request('/api/state')).status, 401);
  assert.equal((await admin.request('/api/users')).status, 401);

  const weak = await admin.request('/api/auth/setup', {
    method: 'POST',
    body: { name: 'Admin', username: 'admin', password: 'short', demo: true },
  });
  assert.equal(weak.status, 422);
  assert.equal(
    success(await admin.request('/api/auth/status')).initialized,
    false,
  );
  const setup = await admin.request('/api/auth/setup', {
    method: 'POST',
    body: {
      name: 'Test Administrator',
      username: 'admin',
      password: ADMIN_PASSWORD,
      demo: true,
    },
  });
  const auth = success(setup);
  assert.equal(auth.user.role, 'Administrator');
  assert.ok(auth.csrfToken);
  assert.match(setup.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(setup.headers.get('set-cookie'), /SameSite=Strict/i);
  assert.equal(
    success(await admin.request('/api/auth/status')).initialized,
    true,
  );
  assert.ok((await readState(admin)).state.products.length);
  const second = await anonymous().request('/api/auth/setup', {
    method: 'POST',
    body: { name: 'Other Admin', username: 'other', password: ADMIN_PASSWORD },
  });
  assert.ok([403, 409].includes(second.status));
  assert.equal((await anonymous().request('/api/state')).status, 401);
});

test('bad credentials fail and logout invalidates a copied session cookie', async (t) => {
  const { admin, anonymous } = await fixture(t);
  const login = anonymous();
  assert.equal(
    (
      await login.request('/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: 'wrong-password-value' },
      })
    ).status,
    401,
  );
  assert.equal((await login.request('/api/state')).status, 401);
  success(
    await login.request('/api/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: ADMIN_PASSWORD },
    }),
  );
  const stolen = anonymous();
  stolen.cookie = login.cookie;
  await readState(stolen);
  success(
    await login.request('/api/auth/logout', { method: 'POST', body: {} }),
  );
  assert.equal((await stolen.request('/api/state')).status, 401);
  await readState(admin);
});

test('authenticated writes require CSRF and reject a foreign Origin without changing state', async (t) => {
  const { admin } = await fixture(t);
  const current = await readState(admin);
  const changed = clone(current.state);
  changed.set.name = 'Rejected company name';
  const body = { state: changed, revision: current.revision };
  assert.equal(
    (await admin.request('/api/state', { method: 'PUT', body, csrf: false }))
      .status,
    403,
  );
  assert.equal(
    (
      await admin.request('/api/state', {
        method: 'PUT',
        body,
        csrf: false,
        headers: { 'X-CSRF-Token': 'incorrect-token' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await admin.request('/api/state', {
        method: 'PUT',
        body,
        origin: 'https://untrusted.example',
      })
    ).status,
    403,
  );
  const after = await readState(admin);
  assert.equal(after.revision, current.revision);
  assert.equal(after.state.set.name, current.state.set.name);
  success(
    await admin.request('/api/state', {
      method: 'PUT',
      body,
      origin: admin.base,
    }),
  );
});

test('simultaneous writes reject stale revisions and cannot overwrite the winning change', async (t) => {
  const { admin } = await fixture(t);
  const current = await readState(admin);
  const first = clone(current.state);
  const second = clone(current.state);
  first.set.name = 'First writer';
  second.set.name = 'Second writer';
  const results = await Promise.all([
    saveState(admin, current, first),
    saveState(admin, current, second),
  ]);
  assert.equal(
    results.filter((result) => result.status >= 200 && result.status < 300)
      .length,
    1,
  );
  assert.equal(results.filter((result) => result.status === 409).length, 1);
  const after = await readState(admin);
  assert.equal(after.revision, current.revision + 1);
  assert.equal(
    after.state.set.name,
    results[0].status === 409 ? 'Second writer' : 'First writer',
  );
});

test('new quotes receive server prices, identity, numbering, and status history', async (t) => {
  const { admin } = await fixture(t);
  const current = await readState(admin);
  const candidate = newQuote(current.state);
  candidate.status = 'Customer Approved';
  candidate.hist = [
    {
      f: 'Draft',
      t: 'Customer Approved',
      d: '2020-01-01T00:00:00Z',
      u: 'Forged reviewer',
    },
  ];
  const product = current.state.products.find(
    (item) => item.id === candidate.items[0].pid,
  );
  current.state.quotes.push(candidate);
  assert.equal((await saveState(admin, current)).status, 422);
  assert.equal((await readState(admin)).revision, current.revision);
  candidate.status = 'Draft';
  success(await saveState(admin, current));
  const saved = (await readState(admin)).state.quotes.find(
    (quote) => quote.id === candidate.id,
  );
  assert.ok(saved);
  assert.notEqual(saved.no, candidate.no);
  assert.match(saved.no, /\/2026\/\d+$/);
  assert.equal(saved.status, 'Draft');
  assert.equal(saved.by, 'Test Administrator');
  assert.equal(saved.items[0].name, product.name);
  assert.equal(
    saved.items[0].base,
    Math.round(product.tiers[0][1] * 100) * candidate.items[0].cfg.qty,
  );
  assert.ok(saved.items[0].sub >= saved.items[0].base);
  assert.equal(saved.items[0].tax, product.tax);
  assert.ok(
    saved.hist.some(
      (entry) => entry.t === 'Draft' && entry.u === 'Test Administrator',
    ),
  );
  assert.ok(saved.hist.every((entry) => entry.u !== 'Forged reviewer'));
  assert.ok(!saved.items[0].sp.includes('Forged specifications'));
});

test('saved item snapshots resist tampering and catalog changes until explicit refresh', async (t) => {
  const { admin } = await fixture(t);
  let current = await readState(admin);
  current.state.quotes.push(newQuote(current.state));
  success(await saveState(admin, current));
  current = await readState(admin);
  const original = clone(
    current.state.quotes.find((quote) => quote.id === 'test_quote_1').items[0],
  );
  const product = current.state.products.find(
    (item) => item.id === original.pid,
  );
  product.tiers = product.tiers.map(([qty, rate]) => [qty, rate * 2]);
  const quote = current.state.quotes.find((item) => item.id === 'test_quote_1');
  quote.items[0].sub = 1;
  quote.items[0].base = 1;
  quote.items[0].tax = 0;
  quote.items[0].name = 'Forged snapshot';
  quote.no = 'CLIENT-RENAMED-NUMBER';
  quote.hist = [
    {
      f: 'Draft',
      t: 'Customer Approved',
      d: '2020-01-01T00:00:00Z',
      u: 'Forged reviewer',
    },
  ];
  success(await saveState(admin, current));
  current = await readState(admin);
  const retained = current.state.quotes.find(
    (item) => item.id === 'test_quote_1',
  );
  assert.equal(retained.items[0].sub, original.sub);
  assert.equal(retained.items[0].base, original.base);
  assert.equal(retained.items[0].tax, original.tax);
  assert.equal(retained.items[0].name, original.name);
  assert.notEqual(retained.no, 'CLIENT-RENAMED-NUMBER');
  assert.ok(retained.hist.every((entry) => entry.u !== 'Forged reviewer'));
  retained._refreshPrices = true;
  success(await saveState(admin, current));
  const refreshed = (await readState(admin)).state.quotes.find(
    (item) => item.id === 'test_quote_1',
  );
  assert.equal(refreshed.items[0].base, original.base * 2);
  assert.ok(refreshed.items[0].sub > original.sub);
  assert.equal(refreshed._refreshPrices, undefined);
});

test('invalid state is rejected atomically for negative, non-finite, invalid IDs and missing references', async (t) => {
  const { admin } = await fixture(t);
  const current = await readState(admin);
  const cases = [
    (state) => {
      state.products[0].rate = -1;
    },
    (state) => {
      state.products[0].tax = Infinity;
    },
    (state) => {
      state.customers[0].id = '<script>';
    },
    (state) => {
      state.products[0].cat = 'missing_category';
    },
    (state) => {
      const quote = newQuote(state);
      quote.del = -1;
      state.quotes.push(quote);
    },
    (state) => {
      const quote = newQuote(state);
      quote.items[0].cfg.qty = -10;
      state.quotes.push(quote);
    },
    (state) => {
      const quote = newQuote(state);
      quote.cid = 'missing_customer';
      state.quotes.push(quote);
    },
    (state) => {
      state.customers.push(clone(state.customers[0]));
    },
  ];
  for (const [index, mutate] of cases.entries()) {
    const invalid = clone(current.state);
    invalid.set.name = `Must not commit invalid case ${index}`;
    mutate(invalid);
    const result = await saveState(admin, current, invalid);
    assert.equal(
      result.status,
      422,
      `Invalid case ${index}: ${JSON.stringify(result.data)}`,
    );
    const after = await readState(admin);
    assert.equal(
      after.revision,
      current.revision,
      `Invalid case ${index} advanced revision`,
    );
    assert.deepEqual(
      after.state,
      current.state,
      `Invalid case ${index} partially committed`,
    );
  }
});

test('employee role can save customers but cannot administer users, catalog, settings or approvals', async (t) => {
  const { admin, anonymous } = await fixture(t);
  const employee = await createEmployee(admin, anonymous);
  assert.equal((await employee.request('/api/users')).status, 403);
  assert.equal(
    (
      await employee.request('/api/users', {
        method: 'POST',
        body: {
          name: 'Bad Admin',
          username: 'badadmin',
          password: ADMIN_PASSWORD,
          role: 'Administrator',
        },
      })
    ).status,
    403,
  );
  const current = await readState(employee);
  const prohibited = [
    (state) => {
      state.set.name = 'Unauthorized company';
    },
    (state) => {
      state.products[0].rate += 10;
    },
    (state) => {
      state.cats[0].name = 'Unauthorized category';
    },
    (state) => {
      state.quotes.find((quote) => quote.status === 'Draft').status =
        'Approved Internally';
    },
    (state) => {
      state.quotes = state.quotes.filter(
        (quote) => quote.status === 'Draft' || quote.status === 'Cancelled',
      );
    },
  ];
  for (const mutate of prohibited) {
    const state = clone(current.state);
    mutate(state);
    assert.equal((await saveState(employee, current, state)).status, 403);
    assert.equal((await readState(employee)).revision, current.revision);
  }
  current.state.customers[0].notes = 'Employee customer update';
  success(await saveState(employee, current));
  assert.equal(
    (await readState(admin)).state.customers[0].notes,
    'Employee customer update',
  );
  const users = success(await admin.request('/api/users'));
  assert.doesNotMatch(
    JSON.stringify(users),
    /passwordHash|password_hash|scrypt|Local-employee-test-password/,
  );
});

test('password changes verify the current password and reject the old password', async (t) => {
  const { admin, anonymous } = await fixture(t);
  const newPassword = 'Changed-local-admin-password-2026';
  const wrong = await admin.request('/api/auth/password', {
    method: 'POST',
    body: { currentPassword: 'incorrect-password', password: newPassword },
  });
  assert.ok([400, 401, 403].includes(wrong.status));
  assert.equal(
    (
      await admin.request('/api/auth/password', {
        method: 'POST',
        body: { currentPassword: ADMIN_PASSWORD, password: 'too-short' },
      })
    ).status,
    422,
  );
  success(
    await admin.request('/api/auth/password', {
      method: 'POST',
      body: { currentPassword: ADMIN_PASSWORD, password: newPassword },
    }),
  );
  const fresh = anonymous();
  assert.equal(
    (
      await fresh.request('/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: ADMIN_PASSWORD },
      })
    ).status,
    401,
  );
  success(
    await fresh.request('/api/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: newPassword },
    }),
  );
  await readState(fresh);
});

test('PostgreSQL preserves saved quotations, revisions and credentials across application restart', async (t) => {
  const fixtureState = await fixture(t);
  const { admin } = fixtureState;
  const current = await readState(admin);
  current.state.customers[0].notes = 'Persisted customer note';
  current.state.quotes.push(newQuote(current.state, 'persistent_quote'));
  success(await saveState(admin, current));
  const before = await readState(admin);
  assert.equal(
    success(await admin.request('/api/health')).database,
    'postgresql',
  );
  await fixtureState.restart();
  assert.equal(
    success(await admin.request('/api/auth/status')).initialized,
    true,
  );
  success(
    await admin.request('/api/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: ADMIN_PASSWORD },
    }),
  );
  const after = await readState(admin);
  assert.equal(after.revision, before.revision);
  assert.deepEqual(after.state, before.state);
});
