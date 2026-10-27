'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { connectDatabase } = require('./server/database');
const DP = require('./shared/domain');
const { createStore } = require('./server/store');
const { createResources } = require('./server/resources');
const { createAccounts } = require('./server/accounts');
const { fail, str } = require('./server/validation');
const { PERMISSIONS, EMPLOYEE_PERMISSIONS, effectivePermissions, permissionOverrides, permissionInput,
  requirePermission, hasPermission, canViewQuote, scopeState } = require('./server/access');
const scrypt = promisify(crypto.scrypt);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const cookieName = 'paradise_session';
const publicUser = (u) =>
  u
    ? {
        id: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        active: u.active !== 0,
        mustChangePassword: Boolean(u.must_change_password),
        version: u.version || 1,
        permissions: effectivePermissions(u),
        permissionOverrides: permissionOverrides(u),
      }
    : null;
const sessionLifetime = 12 * 60 * 60 * 1000;
async function passwordHash(password) {
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 128
  )
    fail('Use a password between 12 and 128 characters.');
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = await scrypt(password, salt, 64);
  return `${salt}:${digest.toString('hex')}`;
}
async function matches(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, digest] = stored.split(':');
  const actual = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(digest, 'hex'));
}
function userInput(body) {
  const name = str(body.name, 'name', 100, true).trim();
  const username = str(body.username, 'username', 64, true)
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9._@-]{2,63}$/.test(username))
    fail(
      'Use a username of 3-64 letters, numbers, dots, @, dashes or underscores.',
    );
  return { name, username };
}
async function createApp(options = {}) {
  const db = connectDatabase(options);
  let store;
  try {
    store = await createStore(db);
  } catch (error) {
    await db.close();
    throw error;
  }
  const staticDir = path.resolve(
    options.staticDir ||
      (fs.existsSync(path.join(__dirname, 'dist', 'index.html'))
        ? path.join(__dirname, 'dist')
        : path.join(__dirname, 'public')),
  );
  const appOrigin = process.env.APP_ORIGIN
    ? new URL(process.env.APP_ORIGIN).origin
    : null;
  const secureCookie =
    options.secureCookie ?? process.env.COOKIE_SECURE === 'true';
  const initialized = async () =>
    Boolean(await db.prepare('SELECT id FROM users LIMIT 1').get());
  const readState = store.readState,
    transaction = store.transaction;
  async function currentSession(req) {
    const cookies = (req.headers.cookie || '').split(';').map((x) => x.trim());
    const raw = cookies
      .find((x) => x.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
    const row = await db
      .prepare(
        'SELECT users.*, sessions.csrf, sessions.token_hash, sessions.id AS session_id FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires>? AND users.active=1',
      )
      .get(hash(raw), Date.now());
    if (row)
      await db
        .prepare('UPDATE sessions SET last_seen=? WHERE token_hash=?')
        .run(new Date().toISOString(), row.token_hash);
    return row || null;
  }
  async function issueSession(res, user) {
    const raw = crypto.randomBytes(32).toString('hex'),
      csrfToken = crypto.randomBytes(32).toString('hex');
    await db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    await db
      .prepare(
        'INSERT INTO sessions(token_hash,user_id,csrf,expires,id,created_at,last_seen) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        hash(raw),
        user.id,
        csrfToken,
        Date.now() + sessionLifetime,
        crypto.randomUUID(),
        new Date().toISOString(),
        new Date().toISOString(),
      );
    res.setHeader(
      'Set-Cookie',
      `${cookieName}=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionLifetime / 1000}${secureCookie ? '; Secure' : ''}`,
    );
    return { user: publicUser(user), csrfToken };
  }
  async function limit(req, username) {
    const now = Date.now();
    await db.prepare('DELETE FROM auth_attempts WHERE expires<?').run(now);
    const key = hash(
      `${req.socket.remoteAddress}:${String(username || '')
        .trim()
        .toLowerCase()
        .slice(0, 80)}`,
    );
    const ipKey = hash(`ip:${req.socket.remoteAddress}`);
    for (const [bucket, max] of [
      [key, 15],
      [ipKey, 120],
    ]) {
      await db
        .prepare(
          'INSERT INTO auth_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=auth_attempts.count+1',
        )
        .run(bucket, now + 15 * 60 * 1000);
      if (
        (
          await db
            .prepare('SELECT count FROM auth_attempts WHERE key=?')
            .get(bucket)
        ).count > max
      )
        fail('Too many attempts. Please try again in 15 minutes.', 429);
    }
    return key;
  }
  function sameOrigin(req) {
    if (req.headers['sec-fetch-site'] === 'cross-site')
      fail('Cross-site requests are not allowed.', 403);
    if (req.headers.origin) {
      let origin;
      try {
        origin = new URL(req.headers.origin);
      } catch {
        fail('Invalid origin.', 403);
      }
      const expected = appOrigin;
      if (
        expected
          ? origin.origin !== expected
          : origin.host !== req.headers.host ||
            !['http:', 'https:'].includes(origin.protocol)
      )
        fail('Origin does not match this application.', 403);
    }
  }
  async function body(req) {
    if (
      req.method === 'DELETE' &&
      req.headers['if-match'] &&
      !req.headers['content-length'] &&
      !req.headers['transfer-encoding']
    )
      return {};
    if (
      (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !==
      'application/json'
    )
      fail('Send application/json.', 415);
    if (Number(req.headers['content-length']) > 10 * 1024 * 1024) {
      req.resume();
      fail('Request is too large (10 MB limit).', 413);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 10 * 1024 * 1024)
        fail('Request is too large (10 MB limit).', 413);
      chunks.push(chunk);
    }
    let parsed;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      fail('Invalid JSON request.', 400);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      fail('Send a JSON object.', 400);
    return parsed;
  }
  const json = (res, status, value) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    res.end(JSON.stringify(value));
  };
  const accounts = createAccounts({
    store,
    body,
    json,
    publicUser,
    userInput,
    passwordHash,
    matches,
  });
  const resources = createResources({
    store,
    body,
    json,
    publicUser,
    backupDir: path.resolve(
      options.backupDir ||
        process.env.BACKUP_DIR ||
        path.join(__dirname, 'data', 'backups'),
    ),
  });
  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    try {
      const host = req.headers.host;
      if (!host) fail('Host header is required.', 400);
      const hostname = new URL(`http://${host}`).hostname;
      const allowedHosts = [
        'localhost',
        '127.0.0.1',
        '[::1]',
        ...(appOrigin ? [new URL(appOrigin).hostname] : []),
      ];
      if (
        ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
          req.socket.localAddress,
        ) &&
        !allowedHosts.includes(hostname)
      )
        fail('Use the configured application host.', 403);
      const url = new URL(req.url, `http://${host}`),
        route = url.pathname;
      if (
        ['/api/health', '/api/ready'].includes(route) &&
        req.method === 'GET'
      ) {
        await db.prepare('SELECT 1').get();
        return json(res, 200, {
          ok: true,
          database: 'postgresql',
          schemaVersion: (
            await db
              .prepare('SELECT max(version) AS version FROM schema_migrations')
              .get()
          ).version,
        });
      }
      const session = await currentSession(req);
      if (route === '/api/auth/status' && req.method === 'GET')
        return json(res, 200, {
          initialized: await initialized(),
          user: publicUser(session),
          csrfToken: session?.csrf || null,
        });
      if (route.startsWith('/api/')) {
        sameOrigin(req);
        if (route === '/api/auth/setup' && req.method === 'POST') {
          if (await initialized())
            fail('Administrator setup is already complete.', 409);
          const input = await body(req);
          await limit(req, 'setup');
          const details = userInput(input),
            encoded = await passwordHash(input.password);
          const user = {
            id: crypto.randomUUID(),
            ...details,
            role: 'Administrator',
          };
          const auth = await transaction(async () => {
            if (await initialized())
              fail('Administrator setup is already complete.', 409);
            await db
              .prepare(
                'INSERT INTO users(id,name,username,password_hash,role) VALUES(?,?,?,?,?)',
              )
              .run(user.id, user.name, user.username, encoded, user.role);
            const state = DP.seed({ demo: input.demo === true });
            delete state.user;
            delete state.role;
            for (const q of state.quotes) q.chargeTax = state.set.tax;
            state.log = [
              {
                t: new Date().toISOString(),
                x:
                  input.demo === true
                    ? 'Workspace created with demonstration data'
                    : 'Workspace created with sample catalog',
                u: user.name,
              },
            ];
            await store.initialize(state, user);
            return issueSession(res, user);
          });
          return json(res, 201, auth);
        }
        if (route === '/api/auth/login' && req.method === 'POST') {
          const input = await body(req),
            key = await limit(req, input.username);
          const username =
            typeof input.username === 'string'
              ? input.username.trim().toLowerCase()
              : '';
          const user = await db
            .prepare('SELECT * FROM users WHERE username=?')
            .get(username);
          const dummy = `${'00'.repeat(16)}:${'00'.repeat(64)}`;
          const valid = await matches(
            input.password,
            user?.password_hash || dummy,
          );
          const auth = await transaction(async () => {
            const fresh =
              user &&
              (await db.prepare('SELECT * FROM users WHERE id=?').get(user.id));
            if (
              !user ||
              !valid ||
              !fresh?.active ||
              fresh.password_hash !== user.password_hash
            )
              fail('Username or password is incorrect.', 401);
            await db.prepare('DELETE FROM auth_attempts WHERE key=?').run(key);
            await store.audit(user, 'auth.login', 'users', user.id);
            return issueSession(res, fresh);
          });
          return json(res, 200, auth);
        }
        if (!session) fail('Please sign in to continue.', 401);
        if (
          !['GET', 'HEAD'].includes(req.method) &&
          req.headers['x-csrf-token'] !== session.csrf
        )
          fail('Session verification failed. Reload and try again.', 403);
        if (route === '/api/auth/logout' && req.method === 'POST') {
          await db
            .prepare('DELETE FROM sessions WHERE token_hash=?')
            .run(session.token_hash);
          await store.audit(session, 'auth.logout', 'users', session.id);
          res.setHeader(
            'Set-Cookie',
            `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie ? '; Secure' : ''}`,
          );
          return json(res, 200, { ok: true });
        }
        if (route === '/api/auth/password' && req.method === 'POST') {
          const input = await body(req);
          await limit(req, `password:${session.id}`);
          if (!(await matches(input.currentPassword, session.password_hash)))
            fail('Current password is incorrect.', 401);
          const encoded = await passwordHash(input.password);
          const auth = await transaction(async () => {
            const current = await db
              .prepare('SELECT password_hash,active FROM users WHERE id=?')
              .get(session.id);
            if (
              !current?.active ||
              current.password_hash !== session.password_hash ||
              !(await currentSession(req))
            )
              fail('Account changed. Sign in again.', 401);
            await db
              .prepare(
                'UPDATE users SET password_hash=?,must_change_password=0,version=version+1 WHERE id=?',
              )
              .run(encoded, session.id);
            await store.audit(
              session,
              'auth.password_changed',
              'users',
              session.id,
            );
            await db
              .prepare('DELETE FROM sessions WHERE user_id=?')
              .run(session.id);
            return issueSession(
              res,
              await db
                .prepare('SELECT * FROM users WHERE id=?')
                .get(session.id),
            );
          });
          return json(res, 200, auth);
        }
        if (route === '/api/state' && req.method === 'GET')
          return json(res, 200, {
            ...scopeState(await readState(), session),
            user: publicUser(session),
          });
        if (
          session.must_change_password &&
          !['GET', 'HEAD'].includes(req.method)
        )
          fail('Change your temporary password before making changes.', 403);
        if (route === '/api/state' && req.method === 'PUT') {
          const input = await body(req);
          if (!Number.isInteger(input.revision))
            fail('Workspace revision is required.', 428);
          const result = await store.mutate(
            session,
            (candidate) => {
              if (!input.state || typeof input.state !== 'object')
                fail('State is required.');
              for (const key of [
                'cats',
                'products',
                'customers',
                'quotes',
                'set',
              ])
                if (key === 'quotes' && Array.isArray(input.state.quotes)) {
                  const hidden = candidate.quotes.filter((q) => !canViewQuote(session, q));
                  const ids = new Set(input.state.quotes.map((q) => q?.id));
                  candidate.quotes = [...input.state.quotes, ...hidden.filter((q) => !ids.has(q.id))];
                } else candidate[key] = input.state[key];
            },
            input.revision,
          );
          return json(res, 200, { ...result, user: publicUser(session) });
        }
        if (route === '/api/users') {
          requirePermission(session, 'users.manage');
          if (req.method === 'GET')
            return json(res, 200, {
              users: (
                await db.prepare('SELECT * FROM users ORDER BY name').all()
              ).map(publicUser),
            });
          if (req.method === 'POST') {
            const input = await body(req),
              details = userInput(input);
            if (!['Administrator', 'Employee'].includes(input.role))
              fail('Invalid user role.');
            if (session.role !== 'Administrator' && input.role === 'Administrator')
              fail('Only administrators may manage administrator accounts.', 403);
            const permissions = permissionInput(input.permissions);
            if (session.role !== 'Administrator' && effectivePermissions({ role: input.role, permissions_json: permissions === null ? null : JSON.stringify(permissions) }).some((p) => !hasPermission(session, p)))
              fail('You cannot grant permissions you do not hold.', 403);
            const encoded = await passwordHash(input.password),
              user = { id: crypto.randomUUID(), ...details, role: input.role, permissions_json: permissions === null ? null : JSON.stringify(permissions) };
            await transaction(async () => {
              const creator = await db
                .prepare('SELECT * FROM users WHERE id=?')
                .get(session.id);
              if (
                !creator?.active ||
                !hasPermission(creator, 'users.manage') ||
                !(await currentSession(req))
              )
                fail('Administrator access is required.', 403);
              if (
                await db
                  .prepare('SELECT id FROM users WHERE username=?')
                  .get(user.username)
              )
                fail('Username already exists.', 409);
              await db
                .prepare(
                  'INSERT INTO users(id,name,username,password_hash,role,permissions_json) VALUES(?,?,?,?,?,?)',
                )
                .run(user.id, user.name, user.username, encoded, user.role, user.permissions_json);
              await store.audit(session, 'user.created', 'users', user.id, {
                role: user.role,
              });
            });
            return json(res, 201, { user: publicUser(user) });
          }
        }
        if (route === '/api/permissions' && req.method === 'GET') {
          requirePermission(session, 'users.manage');
          return json(res, 200, { permissions: PERMISSIONS, employeeDefaults: EMPLOYEE_PERMISSIONS });
        }
        if (route === '/api/openapi.json' && req.method === 'GET')
          return json(res, 200, require('./server/openapi'));
        if (await accounts(req, res, url, session)) return;
        if (await resources(req, res, url, session)) return;
        fail('API endpoint not found.', 404);
      }
      if (!['GET', 'HEAD'].includes(req.method))
        fail('Method not allowed.', 405);
      let requested;
      try {
        requested = decodeURIComponent(route);
      } catch {
        fail('Invalid URL.', 400);
      }
      if (requested.includes('\0') || requested.includes('\\'))
        fail('File not found.', 404);
      const special = {
        '/shared/domain.js': path.join(__dirname, 'shared', 'domain.js'),
        '/shared/catalog.js': path.join(__dirname, 'shared', 'catalog.js'),
        '/vendor/jspdf.umd.min.js': path.join(
          __dirname,
          'node_modules',
          'jspdf',
          'dist',
          'jspdf.umd.min.js',
        ),
        '/vendor/jspdf.plugin.autotable.min.js': path.join(
          __dirname,
          'node_modules',
          'jspdf-autotable',
          'dist',
          'jspdf.plugin.autotable.min.js',
        ),
      };
      const target =
        special[requested] ||
        path.resolve(
          staticDir,
          `.${requested === '/' ? '/index.html' : requested}`,
        );
      if (!special[requested] && !target.startsWith(staticDir + path.sep))
        fail('File not found.', 404);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile())
        fail('File not found.', 404);
      const types = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.txt': 'text/plain',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.png': 'image/png',
      };
      const type = types[path.extname(target)];
      if (!type) fail('File not found.', 404);
      res.setHeader('Content-Type', `${type}; charset=utf-8`);
      if (req.method === 'HEAD') return res.end();
      return res.end(fs.readFileSync(target));
    } catch (error) {
      const status = error.status || 500;
      if (status === 500)
        console.error('Request failed:', error.code || error.name);
      if (!res.headersSent)
        json(res, status, {
          error:
            status === 500
              ? 'The server could not complete this request.'
              : error.message,
          requestId,
          ...(status<500&&error.code?{code:error.code}:{}),
          ...(status<500&&error.details?{details:error.details}:{}),
        });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  const close = async () => {
    if (server.listening)
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      });
    await db.close();
  };
  return { server, db, store, close };
}
if (require.main === module) {
  start().catch((error) => {
    console.error('Server could not start:', error.code || error.name);
    process.exitCode = 1;
  });
}
async function start() {
  const app = await createApp();
  const host = process.env.HOST || '127.0.0.1',
    port = Number(process.env.PORT || 6400);
  app.server.on('error', (error) => {
    console.error(`Server could not start: ${error.code || error.message}`);
    process.exitCode = 1;
    app.db.close();
  });
  app.server.listen(port, host, () =>
    console.log(
      `Design Paradise: http://${host}:${port}\nPostgreSQL storage ready. Open the app to sign in or create your administrator account.`,
    ),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => app.close().then(() => process.exit(0)));
}
module.exports = { createApp };
