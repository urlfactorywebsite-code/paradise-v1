'use strict';
const { importSqlite } = require('../server/import-sqlite');
if (!process.argv[2]) {
  console.error('Usage: npm run migrate:sqlite -- <source.sqlite>');
  process.exitCode = 1;
} else
  importSqlite(process.argv[2])
    .then((counts) =>
      console.log(
        'SQLite import complete. Accounts, records, snapshots and numbering preserved; sign in again.',
        counts,
      ),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
