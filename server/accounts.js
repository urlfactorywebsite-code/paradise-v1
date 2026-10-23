'use strict';
const { fail } = require('./validation');
function createAccounts({
  store,
  body,
  json,
  publicUser,
  userInput,
  passwordHash,
  matches,
}) {
  const db = store.db;
  async function currentUser(actor) {
    const fresh = await db
      .prepare('SELECT * FROM users WHERE id=?')
      .get(actor.id);
    if (
      !fresh?.active ||
      !(await db
        .prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires>?')
        .get(actor.token_hash, Date.now()))
    )
      fail('Please sign in again.', 401);
    return fresh;
  }
  async function admin(actor) {
    if ((await currentUser(actor)).role !== 'Administrator')
      fail('Administrator access is required.', 403);
  }
  async function target(id, version) {
    const u = await db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!u) fail('Account not found.', 404);
    if (!Number.isInteger(version)) fail('Account version is required.', 428);
    if (u.version !== version)
      fail('Account changed. Reload before retrying.', 409);
    return u;
  }
  async function lastAdmin(u, change) {
    if (
      u.active &&
      u.role === 'Administrator' &&
      (!change.active || change.role !== 'Administrator') &&
      (
        await db
          .prepare(
            "SELECT count(*) AS n FROM users WHERE active=1 AND role='Administrator'",
          )
          .get()
      ).n <= 1
    )
      fail('Keep at least one active administrator.', 409);
  }
  return async function handle(req, res, url, user) {
    const route = url.pathname,
      method = req.method;
    const send = (status, value) => {
      json(res, status, value);
      return true;
    };
    if (route === '/api/auth/me' && method === 'GET')
      return send(200, { user: publicUser(await currentUser(user)) });
    if (route === '/api/auth/sessions' && method === 'GET')
      return send(200, {
        sessions: (
          await db
            .prepare(
              'SELECT id,created_at,last_seen,expires FROM sessions WHERE user_id=? AND expires>? ORDER BY created_at DESC',
            )
            .all(user.id, Date.now())
        ).map((s) => ({
          id: s.id,
          createdAt: s.created_at,
          lastSeen: s.last_seen,
          expiresAt: new Date(s.expires).toISOString(),
          current: s.id === user.session_id,
        })),
      });
    if (route === '/api/auth/sessions' && method === 'DELETE') {
      await db
        .prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?')
        .run(user.id, user.token_hash);
      await store.audit(user, 'auth.other_sessions_revoked', 'users', user.id);
      return send(200, { ok: true });
    }
    const sessionMatch = /^\/api\/auth\/sessions\/([A-Za-z0-9_-]+)$/.exec(
      route,
    );
    if (sessionMatch && method === 'DELETE') {
      const s = await db
        .prepare('SELECT id FROM sessions WHERE id=? AND user_id=?')
        .get(sessionMatch[1], user.id);
      if (!s) fail('Session not found.', 404);
      if (s.id === user.session_id)
        fail('Use Sign out to close the current session.');
      await db
        .prepare('DELETE FROM sessions WHERE id=? AND user_id=?')
        .run(s.id, user.id);
      await store.audit(user, 'auth.session_revoked', 'users', user.id);
      return send(200, { ok: true });
    }
    const match =
      /^\/api\/users\/([A-Za-z0-9_-]+)(?:\/(reset-password))?$/.exec(route);
    if (!match) return false;
    await admin(user);
    const targetId = match[1];
    if (method === 'GET' && !match[2]) {
      const u = await db
        .prepare('SELECT * FROM users WHERE id=?')
        .get(targetId);
      if (!u) fail('Account not found.', 404);
      return send(200, { user: publicUser(u) });
    }
    if (match[2] === 'reset-password' && method === 'POST') {
      const input = await body(req);
      await target(targetId, input.version);
      if (targetId === user.id)
        fail('Use Change password for your own account.');
      const encoded = await passwordHash(input.password);
      await store.transaction(async () => {
        await admin(user);
        await target(targetId, input.version);
        await db
          .prepare(
            'UPDATE users SET password_hash=?,must_change_password=1,version=version+1 WHERE id=?',
          )
          .run(encoded, targetId);
        await db.prepare('DELETE FROM sessions WHERE user_id=?').run(targetId);
        await store.audit(user, 'user.password_reset', 'users', targetId);
      });
      return send(200, {
        user: publicUser(
          await db.prepare('SELECT * FROM users WHERE id=?').get(targetId),
        ),
      });
    }
    if (method === 'PATCH' && !match[2]) {
      const input = await body(req);
      await store.transaction(async () => {
        await admin(user);
        const old = await target(targetId, input.version),
          details = userInput({
            name: input.name ?? old.name,
            username: input.username ?? old.username,
          });
        const role = input.role ?? old.role,
          active = input.active === undefined ? old.active : input.active;
        if (
          !['Administrator', 'Employee'].includes(role) ||
          ![true, false, 0, 1].includes(active)
        )
          fail('Invalid account role or active flag.');
        await lastAdmin(old, { role, active });
        if (targetId === user.id && !active)
          fail('You cannot deactivate your current account.');
        if (
          await db
            .prepare('SELECT id FROM users WHERE username=? AND id<>?')
            .get(details.username, targetId)
        )
          fail('Username already exists.', 409);
        await db
          .prepare(
            'UPDATE users SET name=?,username=?,role=?,active=?,version=version+1 WHERE id=?',
          )
          .run(details.name, details.username, role, active ? 1 : 0, targetId);
        if (old.role !== role || !active || old.username !== details.username)
          await db
            .prepare('DELETE FROM sessions WHERE user_id=?')
            .run(targetId);
        await store.audit(user, 'user.updated', 'users', targetId, {
          role,
          active: Boolean(active),
        });
      });
      return send(200, {
        user: publicUser(
          await db.prepare('SELECT * FROM users WHERE id=?').get(targetId),
        ),
      });
    }
    if (method === 'DELETE' && !match[2]) {
      const input = await body(req);
      await store.transaction(async () => {
        await admin(user);
        const old = await target(targetId, input.version);
        await lastAdmin(old, { active: false });
        if (targetId === user.id)
          fail('You cannot remove your current account.');
        await db.prepare('DELETE FROM users WHERE id=?').run(targetId);
        await store.audit(user, 'user.deleted', 'users', targetId, {
          name: old.name,
        });
      });
      return send(200, { ok: true });
    }
    fail('Method not allowed.', 405);
  };
}
module.exports = { createAccounts };
