'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {testDatabase}=require('./database-helper'),{connectDatabase}=require('../server/database'),{createStore}=require('../server/store'),DP=require('../shared/domain');
const {quotationPdf}=require('../server/pdf'),{backupDatabase}=require('../server/backup'),{restore}=require('../scripts/restore');

test('release: populated schema 6 upgrade, failure rollback and backup restore preserve every legacy business row',async()=>{
 const database=await testDatabase(),db=connectDatabase(database),directory=fs.mkdtempSync(path.join(os.tmpdir(),'paradise-release-migration-'));let restored;
 const restoreName='release_restore_'+crypto.randomBytes(10).toString('hex');
 try{
  for(const file of ['schema.sql','migrations/004-access-whatsapp.sql','migrations/005-product-configuration.sql','migrations/006-pricing-imports.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../server',file),'utf8'));
  await db.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);INSERT INTO schema_migrations VALUES(6,'legacy');");
  const state=DP.seed({demo:true}),stamp='2026-11-01T00:00:00Z';state.customers[0].on=0;state.quotes=state.quotes.slice(0,1);
  await db.prepare('INSERT INTO users(id,name,username,password_hash,role) VALUES(?,?,?,?,?)').run('release_owner','Legacy owner','legacy_owner','synthetic-test-hash','Administrator');
  await db.prepare('INSERT INTO workspace(id,revision,settings,settings_version,updated_at,pricing_import_key) VALUES(1,?,?,?,?,?)').run(25,JSON.stringify(state.set),7,stamp,crypto.randomBytes(32).toString('hex'));
  for(const [position,c] of state.cats.entries())await db.prepare('INSERT INTO categories(id,name,active,body,version,position,updated_at) VALUES(?,?,?,?,?,?,?)').run(c.id,c.name,c.on,JSON.stringify(c),3,position,stamp);
  for(const [position,p] of state.products.entries())await db.prepare('INSERT INTO products(id,category_id,name,code,active,body,version,position,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(p.id,p.cat,p.name,p.code,p.on,JSON.stringify(p),4,position,stamp);
  for(const [position,c] of state.customers.entries())await db.prepare('INSERT INTO customers(id,name,mobile,email,body,version,position,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(c.id,c.name,c.mob,c.email,JSON.stringify(c),8,position,stamp);
  const q=state.quotes[0];q.createdBy='release_owner';q.customerSnapshot=structuredClone(state.customers[0]);q.companySnapshot=structuredClone(state.set);
  const body={...q};delete body.items;delete body.hist;const total=DP.totals(q).grand;
  await db.prepare('INSERT INTO quotations(id,number,customer_id,date,valid_until,status,salesperson,total,body,version,position,updated_at,owner_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(q.id,q.no,q.cid,q.date,q.valid,q.status,q.sales,total,JSON.stringify(body),9,0,stamp,q.createdBy);
  for(const [position,item] of q.items.entries())await db.prepare('INSERT INTO quotation_items(quotation_id,id,product_id,quantity,subtotal,body,position) VALUES(?,?,?,?,?,?,?)').run(q.id,item.id,item.pid,item.qty,item.sub,JSON.stringify(item),position);
  for(const [position,entry] of q.hist.entries())await db.prepare('INSERT INTO quotation_history(quotation_id,position,body) VALUES(?,?,?)').run(q.id,position,JSON.stringify(entry));
  await db.prepare('INSERT INTO quote_sequences(year,value) VALUES(?,?)').run(q.date.slice(0,4),120);
  const pdf=quotationPdf(q,state),digest=crypto.createHash('sha256').update(pdf).digest('hex');
  await db.prepare('INSERT INTO whatsapp_message_logs(id,quotation_id,quotation_number,quotation_version,customer_id,customer_name,destination,actor_id,actor_name,created_at,updated_at,status,message,pdf,pdf_sha256) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('legacy_handoff',q.id,q.no,9,q.cid,q.customerSnapshot.name,'+919000000001',q.createdBy,'Legacy owner',stamp,stamp,'Prepared','Historical handoff',pdf,digest);
  const tables=['users','workspace','categories','products','customers','quotations','quotation_items','quotation_history','quote_sequences','whatsapp_message_logs'],columns={};
  for(const table of tables)columns[table]=(await db.prepare('SELECT column_name FROM information_schema.columns WHERE table_schema=? AND table_name=? ORDER BY ordinal_position').all('public',table)).map(c=>c.column_name);
  const fingerprint=async connection=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,crypto.createHash('sha256').update(JSON.stringify(await connection.prepare('SELECT '+columns[table].join(',')+' FROM '+table+' ORDER BY 1,2').all())).digest('hex')])));
  const before=await fingerprint(db),exec=db.exec;
  db.exec=async sql=>{const result=await exec(sql);if(sql.includes('CREATE TABLE customer_category_logos'))throw Error('Injected combined migration failure');return result;};
  await assert.rejects(createStore(db),/Injected combined migration failure/);db.exec=exec;
  assert.deepEqual(await fingerprint(db),before);assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n,6);assert.equal((await db.prepare("SELECT to_regclass('public.customer_categories') AS name").get()).name,null);
  const store=await createStore(db);await createStore(db);assert.deepEqual(await fingerprint(db),before);assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n,13);assert.equal((await db.prepare('SELECT count(*) AS n FROM customer_categories').get()).n,8);
  const saved=await store.get('quotes',q.id);assert.deepEqual(saved.data,q);assert.equal(DP.totals(saved.data).grand,total);
  const backup=await backupDatabase(db,directory);assert.equal(fs.readFileSync(path.join(directory,backup.name)).subarray(0,5).toString(),'PGDMP');await restore(path.join(directory,backup.name),restoreName,database);
  const url=new URL(database.databaseUrl);url.pathname='/'+restoreName;restored=connectDatabase({databaseUrl:url.href});await createStore(restored);assert.deepEqual(await fingerprint(restored),before);
  assert.equal((await restored.prepare('SELECT pdf_sha256 FROM whatsapp_message_logs WHERE id=?').get('legacy_handoff')).pdf_sha256,digest);
 }finally{
  if(restored)await restored.close();await db.exec(`DROP DATABASE IF EXISTS "${restoreName}" WITH (FORCE)`);await db.close();await database.destroy();
  if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('paradise-release-migration-'))throw Error('Unexpected test directory');fs.rmSync(directory,{recursive:true,force:true});
 }
});
