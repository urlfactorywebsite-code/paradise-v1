'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { connectDatabase } = require('../server/database');
const { backupDatabase } = require('../server/backup');
async function hiddenPassword() {
  if (!process.stdin.isTTY) {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 1024) throw new Error('Password input is too long.');
    }
    return input.replace(/[\r\n]+$/, '');
  }
  process.stdout.write('New administrator password (hidden): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const done = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off('data', onData);
      process.stdout.write('\n');
    };
    function onData(chunk) {
      for (const char of chunk) {
        if (char === '\u0003') {
          done();
          reject(new Error('Cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          done();
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    }
    process.stdin.on('data', onData);
  });
}
(async () => {
  const username = process.argv[2]?.trim().toLowerCase();
  if (!username)
    throw new Error(
      'Usage: npm run recover-admin -- <existing-admin-username>',
    );
  const db = connectDatabase();
  try {
    const user = await db
      .prepare("SELECT * FROM users WHERE username=? AND role='Administrator'")
      .get(username);
    if (!user) throw new Error('Administrator account not found.');
    const password = await hiddenPassword();
    if (password.length < 12 || password.length > 128)
      throw new Error('Use 12–128 characters.');
    await backupDatabase(
      db,
      path.resolve(process.env.BACKUP_DIR || './data/backups'),
    );
    const salt = crypto.randomBytes(16).toString('hex'),
      digest = await promisify(crypto.scrypt)(password, salt, 64);
    await db.transaction(async () => {
      await db
        .prepare(
          'UPDATE users SET password_hash=?,active=1,must_change_password=0,version=version+1 WHERE id=?',
        )
        .run(`${salt}:${digest.toString('hex')}`, user.id);
      await db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      await db
        .prepare(
          'INSERT INTO audit_events(at,actor_id,actor_name,action,entity_type,entity_id,details) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          new Date().toISOString(),
          user.id,
          user.name,
          'auth.offline_recovery',
          'users',
          user.id,
          '{}',
        );
    });
    console.log(
      'Administrator password recovered. Existing sessions were revoked.',
    );
  } finally {
    await db.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
