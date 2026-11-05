'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createApp}=require('../server');
const {createStore}=require('../server/store');
const {connectDatabase}=require('../server/database');
const {testDatabase}=require('./database-helper');
const DP=require('../shared/domain');
async function fixture(t){
 const database=await testDatabase(),app=await createApp({...database,staticDir:path.resolve('public')});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await app.close();await database.destroy();});
 const base='http://127.0.0.1:'+app.server.address().port,password='Customer-test-'+crypto.randomUUID();
 function client(){let cookie='',csrf='';return {async request(route,method='GET',value,status=200){const response=await fetch(base+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(value===undefined?{}:{'Content-Type':'application/json'})},...(value===undefined?{}:{body:JSON.stringify(value)})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const data=await response.json();if(data.csrfToken)csrf=data.csrfToken;assert.equal(response.status,status,method+' '+route+': '+JSON.stringify(data));return data;}};}
 const admin=client();await admin.request('/api/auth/setup','POST',{name:'Customer QA',username:'customerqa',password,demo:false},201);
 return {app,database,admin,client,password};
}
const address=(label='Warehouse',isDefault=true)=>({label,line1:'12 Test street',line2:'Unit 4',city:'Salem',state:'Tamil Nadu',postalCode:'636001',country:'India',isDefault});
const customer=(extra={})=>({name:'Customer',mob:'9876543210',addr:'Preserved billing address',...extra});

test('refinement: an explicitly cleared delivery address stays cleared during later edits',async t=>{
 const f=await fixture(t),created=await f.admin.request('/api/customers','POST',customer({deliveryAddresses:[address()]}),201);
 const cleared=await f.admin.request('/api/customers/'+created.data.id,'PATCH',{version:created.version,data:{deliveryAddressId:null}});
 const edited=await f.admin.request('/api/customers/'+created.data.id,'PUT',{version:cleared.version,data:{name:created.data.name,mob:created.data.mob,date:created.data.date,addr:created.data.addr,co:'Unrelated company edit'}});
 assert.equal(edited.data.deliveryAddressId,null);
 assert.equal(edited.data.deliveryAddresses[0].isDefault,true);
 await f.admin.request('/api/customers/'+created.data.id+'/delivery-addresses/%ZZ','GET',undefined,422);
});

test('refinement: reference IDs have strict types and client category metadata cannot create managed categories',async t=>{
 const f=await fixture(t);
 for(const categoryId of [false,0,[],{}])await f.admin.request('/api/customers','POST',customer({categoryId}),422);
 for(const deliveryAddressId of [false,0,[],{}])await f.admin.request('/api/customers','POST',customer({deliveryAddressId}),422);
 const state=await f.admin.request('/api/state');state.state.customerCategories.push({id:'forged',name:'Forged',active:true});
 state.state.customers.push({id:'ForgedCustomer',date:'2026-11-04',...customer({categoryId:'forged'})});
 await f.admin.request('/api/state','PUT',state,422);
 assert.equal((await f.admin.request('/api/customer-categories')).data.length,8);
 assert.equal((await f.admin.request('/api/customers')).pagination.total,0);
});

test('refinement: SQL failure after customer insertion rolls back customer, addresses, audit and revision',async t=>{
 const f=await fixture(t),before=await f.admin.request('/api/state'),audit=(await f.app.db.prepare('SELECT count(*) AS n FROM audit_events').get()).n,prepare=f.app.db.prepare;
 f.app.db.prepare=sql=>sql.startsWith('INSERT INTO customer_delivery_addresses')?{run:async()=>{throw Error('Injected address write failure');}}:prepare(sql);
 try{await f.admin.request('/api/customers','POST',customer({deliveryAddresses:[address()]}),500);}finally{f.app.db.prepare=prepare;}
 assert.equal((await f.admin.request('/api/state')).revision,before.revision);
 for(const table of ['customers','customer_delivery_addresses'])assert.equal((await f.app.db.prepare('SELECT count(*) AS n FROM '+table).get()).n,0);
 assert.equal((await f.app.db.prepare('SELECT count(*) AS n FROM audit_events').get()).n,audit);
});

test('refinement: users without customer access cannot enumerate or mutate known or missing address paths',async t=>{
 const f=await fixture(t),c=await f.admin.request('/api/customers','POST',customer({deliveryAddresses:[address()]}),201),a=c.data.deliveryAddresses[0];
 const account=await f.admin.request('/api/users','POST',{name:'No customer access',username:'nocustomeraccess',password:f.password,role:'Employee',permissions:[]},201),restricted=f.client();
 await restricted.request('/api/auth/login','POST',{username:account.user.username,password:f.password});
 for(const id of [c.data.id,'MissingCustomer']){
  await restricted.request('/api/customers/'+id+'/delivery-addresses','GET',undefined,403);
  await restricted.request('/api/customers/'+id+'/delivery-addresses/'+a.id,'GET',undefined,403);
  await restricted.request('/api/customers/'+id+'/delivery-addresses/'+a.id,'PATCH',{version:c.version,data:{line1:'Forbidden'}},403);
 }
 await restricted.request('/api/customer-categories','GET',undefined,403);
 const state=await restricted.request('/api/state');assert.deepEqual(state.state.customers,[]);assert.deepEqual(state.state.customerCategories,[]);
 const adminState=await f.admin.request('/api/state');
 await restricted.request('/api/changes','POST',{revision:adminState.revision,changes:[{collection:'customers',action:'upsert',id:c.data.id,record:{...c.data,deliveryAddresses:[{...a,line1:'Forbidden'}]}}]},403);
 assert.equal((await f.admin.request('/api/customers/'+c.data.id)).data.deliveryAddresses[0].line1,a.line1);
});

test('refinement: separate company databases isolate customer and delivery address records',async t=>{
 const first=await fixture(t),second=await fixture(t),a=await first.admin.request('/api/customers','POST',customer({deliveryAddresses:[address('Company A')]}),201),b=await second.admin.request('/api/customers','POST',customer({deliveryAddresses:[address('Company B')]}),201);
 await first.admin.request('/api/customers/'+b.data.id+'/delivery-addresses','GET',undefined,404);
 await first.admin.request('/api/customers/'+a.data.id+'/delivery-addresses/'+b.data.deliveryAddressId,'GET',undefined,404);
 await first.admin.request('/api/customers/'+a.data.id+'/delivery-addresses','POST',{version:a.version,data:{...address('Foreign'),customerId:b.data.id}},404);
 const rows=await first.admin.request('/api/customers/'+a.data.id+'/delivery-addresses?tenantId='+second.database.name);
 assert.deepEqual(rows.data.map(a=>a.label),['Company A']);
 assert.deepEqual((await second.admin.request('/api/customers/'+b.data.id+'/delivery-addresses')).data.map(a=>a.label),['Company B']);
});

test('refinement: duplicating a historical quotation preserves its archived delivery snapshot without allowing new selection',async t=>{
 const f=await fixture(t),c=await f.admin.request('/api/customers','POST',customer({deliveryAddresses:[address()]}),201),q=await f.admin.request('/api/quotations','POST',{cid:c.data.id},201);
 await f.admin.request('/api/customers/'+c.data.id+'/delivery-addresses/'+c.data.deliveryAddressId,'PATCH',{version:c.version,data:{archived:true}});
 await f.admin.request('/api/quotations','POST',{cid:c.data.id,deliveryAddressId:c.data.deliveryAddressId},422);
 const duplicate=await f.admin.request('/api/quotations/'+q.data.id+'/duplicate','POST',{version:q.version},201);
 assert.deepEqual(duplicate.data.deliveryAddressSnapshot,q.data.deliveryAddressSnapshot);assert.notEqual(duplicate.data.no,q.data.no);
 assert.deepEqual((await f.admin.request('/api/quotations/'+q.data.id)).data,q.data);
});

test('customers can be created without status and managed categories use relational IDs',async t=>{
 const f=await fixture(t),categories=await f.admin.request('/api/customer-categories');
 assert.deepEqual(categories.data.map(c=>c.name),['BNI','YES','JCI','JCOM','Rotary','RMB','Icon Circle','Other']);
 const created=await f.admin.request('/api/customers','POST',customer({categoryId:'cc_bni'}),201);
 assert.equal(created.data.on,1);assert.equal(created.data.categoryId,'cc_bni');
 const row=await f.app.db.prepare('SELECT category_id,custom_category_name FROM customers WHERE id=?').get(created.data.id);
 assert.equal(row.category_id,'cc_bni');assert.equal(row.custom_category_name,null);
 const other=await f.admin.request('/api/customers','POST',customer({mob:'9876543211'}),201);
 assert.equal(other.data.categoryId,undefined);
 await f.admin.request('/api/customer-categories','POST',{name:'Other'},422);
});

test('Other custom text and contact person number roundtrip independently and category edits clear custom text',async t=>{
 const f=await fixture(t),created=await f.admin.request('/api/customers','POST',customer({categoryId:'cc_other',customCategoryName:'Local association',person:'Buyer',contactPersonPhone:'+44 (20) 7946-0958'}),201);
 assert.equal(created.data.customCategoryName,'Local association');assert.equal(created.data.contactPersonPhone,'+442079460958');assert.equal(created.data.mob,'9876543210');assert.equal(created.data.person,'Buyer');
 const edited=await f.admin.request('/api/customers/'+created.data.id,'PATCH',{version:created.version,data:{categoryId:'cc_jci',contactPersonPhone:'+919876543211'}});
 assert.equal(edited.data.categoryId,'cc_jci');assert.equal(edited.data.customCategoryName,null);assert.equal(edited.data.contactPersonPhone,'+919876543211');
 const cleared=await f.admin.request('/api/customers/'+created.data.id,'PATCH',{version:edited.version,data:{categoryId:null,contactPersonPhone:null}});
 assert.equal(cleared.data.categoryId,null);assert.equal(cleared.data.contactPersonPhone,null);
 assert.equal((await f.admin.request('/api/customer-categories')).data.length,8);
});

test('invalid categories, malformed optional phone numbers and incomplete addresses fail without partial customers',async t=>{
 const f=await fixture(t),before=await f.admin.request('/api/state');
 for(const extra of [{categoryId:'unknown'},{categoryId:'cc_other'},{categoryId:'cc_other',customCategoryName:'x'.repeat(201)},{contactPersonPhone:'call me'},{contactPersonPhone:'++12345678'},{contactPersonPhone:'+0123456789'},{contactPersonPhone:'123'},{contactPersonPhone:'1'.repeat(16)},{deliveryAddresses:[address(),{...address('Incomplete',false),line1:''}]},{deliveryAddresses:[address(),address('Duplicate default')]}])
  await f.admin.request('/api/customers','POST',customer(extra),422);
 const after=await f.admin.request('/api/state');assert.equal(after.revision,before.revision);assert.equal(after.state.customers.length,0);
 assert.equal((await f.app.db.prepare('SELECT count(*) AS n FROM customer_delivery_addresses').get()).n,0);
});

test('new customer and addresses persist together; legacy PUT preserves metadata, addresses, billing and inactive status',async t=>{
 const f=await fixture(t),created=await f.admin.request('/api/customers','POST',customer({on:0,categoryId:'cc_other',customCategoryName:'Association',contactPersonPhone:'+919876543219',deliveryAddresses:[address()]}),201),q=created.data;
 assert.equal(q.deliveryAddresses.length,1);assert.equal(q.deliveryAddressId,q.deliveryAddresses[0].id);
 assert.equal(q.deliveryAddresses[0].customerId,q.id);assert.equal(q.addr,'Preserved billing address');
 assert.equal((await f.app.db.prepare('SELECT customer_id FROM customer_delivery_addresses WHERE id=?').get(q.deliveryAddressId)).customer_id,q.id);
 const updated=await f.admin.request('/api/customers/'+q.id,'PUT',{version:created.version,data:{name:q.name,mob:q.mob,date:q.date,addr:q.addr}});
 for(const key of ['categoryId','customCategoryName','contactPersonPhone','deliveryAddresses','deliveryAddressId','on','addr'])assert.deepEqual(updated.data[key],q[key],key);
 const stored=await f.admin.request('/api/customers/'+q.id);assert.deepEqual(stored.data.deliveryAddresses,q.deliveryAddresses);
 assert.equal((await f.admin.request('/api/customers')).data[0].deliveryAddresses.length,1);
});

test('address CRUD paginates per customer, switches default atomically, archives and preserves omitted rows',async t=>{
 const f=await fixture(t),created=await f.admin.request('/api/customers','POST',customer({deliveryAddresses:[address()]}),201),id=created.data.id,a=created.data.deliveryAddressId;
 const second=await f.admin.request('/api/customers/'+id+'/delivery-addresses','POST',{version:created.version,data:address('Branch',false)},201),b=second.data.id;
 const defaulted=await f.admin.request('/api/customers/'+id+'/delivery-addresses/'+b,'PATCH',{version:second.version,data:{isDefault:true,line1:'New branch street'}});
 let list=await f.admin.request('/api/customers/'+id+'/delivery-addresses?pageSize=1&page=2');assert.equal(list.pagination.total,2);assert.equal(list.data.length,1);
 let stored=await f.admin.request('/api/customers/'+id);assert.equal(stored.data.deliveryAddresses.filter(a=>a.isDefault).length,1);assert.equal(stored.data.deliveryAddresses.find(a=>a.id===b).isDefault,true);
 const selected=await f.admin.request('/api/customers/'+id,'PATCH',{version:defaulted.version,data:{deliveryAddressId:b,deliveryAddresses:[stored.data.deliveryAddresses.find(a=>a.id===b)]}});
 assert.equal(selected.data.deliveryAddresses.length,2);
 const archived=await f.admin.request('/api/customers/'+id+'/delivery-addresses/'+b,'PATCH',{version:selected.version,data:{archived:true}});
 assert.equal(archived.data.isDefault,false);assert.equal((await f.admin.request('/api/customers/'+id)).data.deliveryAddressId,null);
 assert.equal((await f.admin.request('/api/customers/'+id+'/delivery-addresses')).data[0].id,a);
 assert.equal((await f.admin.request('/api/customers/'+id+'/delivery-addresses?includeArchived=true')).pagination.total,2);
 await f.admin.request('/api/customers/'+id,'PATCH',{version:archived.version,data:{deliveryAddressId:b}},422);
 await f.admin.request('/api/customers/'+id+'/delivery-addresses?pageSize=0','GET',undefined,422);
});

test('address IDs cannot be read, reassigned, edited or selected through a different customer',async t=>{
 const f=await fixture(t),a=await f.admin.request('/api/customers','POST',customer({deliveryAddresses:[address()]}),201),b=await f.admin.request('/api/customers','POST',customer({mob:'9876543211',deliveryAddresses:[address('Other customer')]}),201),foreign=a.data.deliveryAddresses[0];
 const route='/api/customers/'+b.data.id+'/delivery-addresses';
 await f.admin.request(route+'/'+foreign.id,'GET',undefined,404);
 await f.admin.request(route+'/'+foreign.id,'PATCH',{version:b.version,data:{line1:'Forbidden edit'}},404);
 await f.admin.request(route,'POST',{version:b.version,data:{...foreign,customerId:b.data.id}},404);
 await f.admin.request('/api/customers/'+b.data.id,'PATCH',{version:b.version,data:{deliveryAddresses:[{...foreign,customerId:b.data.id}]}},404);
 await f.admin.request('/api/customers/'+b.data.id,'PATCH',{version:b.version,data:{deliveryAddressId:foreign.id}},422);
 const state=await f.admin.request('/api/state');
 await f.admin.request('/api/changes','POST',{revision:state.revision,changes:[{collection:'customers',action:'upsert',id:b.data.id,record:{...b.data,deliveryAddresses:[{...foreign,customerId:b.data.id}]}}]},404);
 assert.equal((await f.admin.request('/api/customers/'+a.data.id)).data.deliveryAddresses[0].line1,foreign.line1);
 assert.equal((await f.admin.request('/api/customers/'+b.data.id+'/delivery-addresses')).data.length,1);
});

test('address/customer writes enforce permissions, authentication, version conflicts and duplicate review',async t=>{
 const f=await fixture(t),created=await f.admin.request('/api/customers','POST',customer(),201),id=created.data.id;
 const account=await f.admin.request('/api/users','POST',{name:'Reader',username:'customerreader',password:f.password,role:'Employee',permissions:['customer.view']},201),reader=f.client();
 await reader.request('/api/auth/login','POST',{username:account.user.username,password:f.password});
 await reader.request('/api/customers/'+id+'/delivery-addresses');
 await reader.request('/api/customers/'+id+'/delivery-addresses','POST',{version:created.version,data:address()},403);
 await reader.request('/api/customers/'+id,'PATCH',{version:created.version,data:{categoryId:'cc_bni'}},403);
 await f.client().request('/api/customers/'+id+'/delivery-addresses','GET',undefined,401);
 const results=await Promise.allSettled([address('One'),address('Two')].map(data=>f.admin.request('/api/customers/'+id+'/delivery-addresses','POST',{version:created.version,data},201)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.actual,409);
 const saved=results.find(r=>r.status==='fulfilled').value;
 await f.admin.request('/api/customers/'+id+'/delivery-addresses','POST',{version:created.version,data:address('Stale')},409);
 await f.admin.request('/api/customers','POST',customer(),409);
 const current=await f.admin.request('/api/state'),duplicate={...created.data,id:'DuplicateCustomer'};
 await f.admin.request('/api/changes','POST',{revision:current.revision,changes:[{collection:'customers',action:'upsert',id:duplicate.id,record:duplicate}]},409);
 const allowed=await f.admin.request('/api/changes','POST',{revision:current.revision,changes:[{collection:'customers',action:'upsert',id:duplicate.id,record:duplicate,allowDuplicate:true}]});
 assert.equal(allowed.state.customers.length,2);assert.equal(saved.version,2);
});

test('delivery selection in quotations is customer-scoped and snapshots survive address edits and archives',async t=>{
 const f=await fixture(t),c=await f.admin.request('/api/customers','POST',customer({deliveryAddresses:[address()]}),201),other=await f.admin.request('/api/customers','POST',customer({mob:'9876543211',deliveryAddresses:[address('Foreign')]}),201),state=(await f.admin.request('/api/state')).state,p=state.products.find(p=>p.id==='p2');
 const draft={cid:c.data.id,items:[{pid:p.id,cfg:DP.defCfg(p)}]};
 await f.admin.request('/api/quotations','POST',{...draft,deliveryAddressId:other.data.deliveryAddressId},422);
 const q=await f.admin.request('/api/quotations','POST',draft,201),snapshot=q.data.deliveryAddressSnapshot;
 assert.equal(snapshot.line1,address().line1);assert.equal(q.data.customerSnapshot.deliveryAddresses,undefined);
 await f.admin.request('/api/customers/'+c.data.id+'/delivery-addresses/'+c.data.deliveryAddressId,'PATCH',{version:c.version,data:{line1:'Changed street',archived:true}});
 const changed=await f.admin.request('/api/quotations/'+q.data.id,'PATCH',{version:q.version,data:{project:'Edited quote',deliveryAddressSnapshot:{line1:'Forged'}}});
 assert.deepEqual(changed.data.deliveryAddressSnapshot,snapshot);
 assert.equal(changed.data.customerSnapshot.addr,c.data.addr);
 const preview=await f.admin.request('/api/quotations/preview','POST',changed.data);
 assert.equal(preview.quotation.deliveryAddressSnapshot.line1,snapshot.line1);
});

test('migration 7 preserves legacy customer bodies, versions and statuses, repeats safely and rolls back on failure',async t=>{
 const database=await testDatabase(),db=connectDatabase(database);t.after(async()=>{await db.close();await database.destroy();});
 for(const file of ['schema.sql','migrations/004-access-whatsapp.sql','migrations/005-product-configuration.sql','migrations/006-pricing-imports.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../server',file),'utf8'));
 await db.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);INSERT INTO schema_migrations VALUES(6,'legacy');");
 const body=JSON.stringify({id:'legacy',name:'Legacy customer',mob:'9876543210',on:0,addr:'Legacy billing'});
 await db.prepare('INSERT INTO customers(id,name,mobile,email,body,version,position,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('legacy','Legacy customer','9876543210','',body,8,0,'legacy');
 const before=await db.prepare('SELECT body,version,updated_at FROM customers').all(),exec=db.exec;
 db.exec=async sql=>{const result=await exec(sql);if(sql.includes('CREATE TABLE customer_categories'))throw Error('Injected migration failure');return result;};
 await assert.rejects(createStore(db),/Injected migration failure/);db.exec=exec;
 assert.equal((await db.prepare('SELECT max(version) AS v FROM schema_migrations').get()).v,6);
 assert.equal((await db.prepare("SELECT to_regclass('public.customer_categories') AS name").get()).name,null);
 await createStore(db);await createStore(db);
 assert.deepEqual(await db.prepare('SELECT body,version,updated_at FROM customers').all(),before);
 assert.equal((await db.prepare('SELECT category_id,contact_person_phone FROM customers').get()).category_id,null);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM customer_categories').get()).n,8);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM schema_migrations WHERE version=7').get()).n,1);
 await assert.rejects(db.prepare("UPDATE customers SET category_id='missing'").run(),/foreign key/);
 await assert.rejects(db.prepare('INSERT INTO customer_delivery_addresses(id,customer_id,label,line1,country,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('orphan','missing','Label','Street','India','now','now'),/foreign key/);
});

test('schema 7 backups restore category relations, phone numbers, delivery addresses and selections',async t=>{
 const f=await fixture(t),created=await f.admin.request('/api/customers','POST',customer({categoryId:'cc_other',customCategoryName:'Association',contactPersonPhone:'+919876543219',deliveryAddresses:[address()]}),201);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'paradise-customer-backup-')),name='customer_restore_'+crypto.randomBytes(10).toString('hex'),url=new URL(f.database.databaseUrl);url.pathname='/'+name;
 let restored;
 try {
  const backup=await require('../server/backup').backupDatabase(f.app.db,dir);
  await require('../scripts/restore').restore(path.join(dir,backup.name),name,f.database);
  restored=connectDatabase({databaseUrl:url.href});const store=await createStore(restored);
  const current=await store.get('customers',created.data.id);assert.deepEqual(current.data,created.data);assert.equal(current.version,created.version);
  assert.equal((await restored.prepare('SELECT count(*) AS n FROM customer_categories').get()).n,8);
  assert.equal((await restored.prepare('SELECT count(*) AS n FROM sessions').get()).n,0);
 } finally {
  if(restored)await restored.close();
  await f.app.db.exec(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('paradise-customer-backup-'))throw Error('Unexpected test directory');
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
