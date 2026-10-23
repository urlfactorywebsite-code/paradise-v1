'use strict';
const path = require('node:path');
const { connectDatabase } = require('../server/database');
const { backupDatabase } = require('../server/backup');
(async () => {
  const db = connectDatabase();
  try {
    const result = await backupDatabase(
      db,
      path.resolve(process.env.BACKUP_DIR || './data/backups'),
    );
    console.log(
      `Backup saved: ${path.join(process.env.BACKUP_DIR || './data/backups', result.name)}`,
    );
  } finally {
    await db.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
