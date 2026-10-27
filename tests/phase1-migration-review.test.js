'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {testDatabase}=require('./database-helper');
const {connectDatabase}=require('../server/database');
const {createStore}=require('../server/store');

test('review: concurrent fresh startups apply Phase 1 migrations once',async()=>{
 const database=await testDatabase(),a=connectDatabase(database),b=connectDatabase(database);
 try{
  await Promise.all([createStore(a),createStore(b)]);
  assert.deepEqual((await a.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).map(row=>row.version),[3,4,5,6]);
  assert.equal((await a.prepare("SELECT count(*) AS n FROM pg_constraint WHERE conname IN ('products_configuration_shape','quotation_items_configuration_shape')").get()).n,2);
 }finally{await a.close();await b.close();await database.destroy();}
});

test('review: failed Phase 1 migration rolls back DDL and version and permits safe retry',async()=>{
 const database=await testDatabase(),db=connectDatabase(database);
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'../server/schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../server/migrations/004-access-whatsapp.sql'),'utf8'));
  await db.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);INSERT INTO schema_migrations VALUES(4,'legacy');");
  const exec=db.exec;
  db.exec=async sql=>{const result=await exec(sql);if(sql.includes('CREATE OR REPLACE FUNCTION paradise_product_fields_valid'))throw new Error('Injected migration failure');return result;};
  await assert.rejects(createStore(db),/Injected migration failure/);
  db.exec=exec;
  assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n,4);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM pg_constraint WHERE conname IN ('products_configuration_shape','quotation_items_configuration_shape')").get()).n,0);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM pg_proc WHERE proname='paradise_product_fields_valid'").get()).n,0);
  await createStore(db);
  assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n,6);
  await db.exec("INSERT INTO schema_migrations VALUES(7,'future');");
  await assert.rejects(createStore(db),/newer than this server/);
 }finally{await db.close();await database.destroy();}
});
