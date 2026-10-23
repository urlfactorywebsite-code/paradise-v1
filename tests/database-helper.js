'use strict';
const crypto = require('node:crypto');
const { connectDatabase } = require('../server/database');
async function testDatabase() {
  const admin = connectDatabase();
  const name = 'paradise_test_' + crypto.randomBytes(12).toString('hex');
  try {
    await admin.exec(`CREATE DATABASE "${name}" TEMPLATE template0`);
  } catch (error) {
    await admin.close();
    throw error;
  }
  const url = new URL(admin.connectionString);
  url.pathname = '/' + name;
  return {
    databaseUrl: url.href,
    name,
    async destroy() {
      try {
        await admin.exec(`DROP DATABASE "${name}" WITH (FORCE)`);
      } finally {
        await admin.close();
      }
    },
  };
}
module.exports = { testDatabase };
