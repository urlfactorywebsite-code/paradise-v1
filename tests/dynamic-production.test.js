'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server'),{testDatabase}=require('./database-helper'),{connectDatabase}=require('../server/database'),DP=require('../shared/domain');
async function fixture(t){
 const database=await testDatabase(),apps=[],app=await createApp(database);apps.push(app);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{for(const instance of apps)await instance.close();await database.destroy();});
 const base='http://127.0.0.1:'+app.server.address().port,password=crypto.randomUUID()+'-Production';
 function client(origin=base){let cookie='',csrf='';return {async request(route,method='GET',data){const response=await fetch(origin+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const body=await response.json();if(body.csrfToken)csrf=body.csrfToken;return {status:response.status,body};},async call(route,method='GET',data,status=200){const r=await this.request(route,method,data);assert.equal(r.status,status,route+': '+JSON.stringify(r.body));return r.body;}};}
 const admin=client();await admin.call('/api/auth/setup','POST',{name:'Production validation',username:'productionfields',password,demo:true},201);
 const create=(pageKey='customers',extra={})=>admin.call('/api/configurable-fields','POST',{data:{pageKey,fieldKey:'custom_safety_'+crypto.randomBytes(5).toString('hex'),fieldType:'dropdown',label:'Production choice',options:[{value:'first',label:'First'},{value:'second',label:'Second'}],...extra}},201);
 return {database,apps,app,admin,client,password,create};
}

test('production fields: two administrators on separate app instances have one version winner and an accurate audit actor',async t=>{
 const f=await fixture(t),second=await createApp(f.database);f.apps.push(second);await new Promise(resolve=>second.server.listen(0,'127.0.0.1',resolve));
 const user=(await f.admin.call('/api/users','POST',{name:'Second administrator',username:'secondproductionadmin',password:f.password,role:'Administrator'},201)).user;
 const other=f.client('http://127.0.0.1:'+second.server.address().port);await other.call('/api/auth/login','POST',{username:'secondproductionadmin',password:f.password});
 const field=await f.create(),route='/api/configurable-fields/'+field.data.id+'/editor',before=await f.admin.call('/api/state');
 const attempts=await Promise.all([f.admin.request(route,'PUT',{version:field.version,data:{label:'Owner winner'}}),other.request(route,'PUT',{version:field.version,data:{label:'Second winner'}})]);
 assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);const saved=(await f.admin.call('/api/configurable-fields/'+field.data.id)).data;assert.equal(saved.version,2);
 const history=await f.admin.call('/api/configurable-fields/'+field.data.id+'/audit');assert.equal(history.pagination.total,2);const edit=history.data.find(row=>row.action!=='created');assert.ok(edit);assert.equal(edit.afterValue.label,saved.label);assert.equal(edit.actorUserId===user.id,saved.label==='Second winner');
 assert.deepEqual(await f.admin.call('/api/state'),before);
 await other.call(route,'PUT',{data:{label:'Missing version'}},428);assert.equal((await other.call('/api/configurable-fields/'+field.data.id)).data.version,2);
});

test('production fields: an archived choice rejects a stale new selection without records or forged history, while saved references remain valid',async t=>{
 const f=await fixture(t),field=await f.create(),data={name:'Saved production customer',mob:'9876543770',customFields:{[field.data.id]:'first'}};
 let saved=await f.admin.call('/api/customers','POST',data,201);const snapshots=structuredClone(saved.data.customFieldSnapshots),before=await f.admin.call('/api/state');
 await f.admin.call('/api/configurable-fields/'+field.data.id+'/options/'+field.data.options[0].id,'DELETE',{version:field.version});
 for(const extra of [{},{customFieldSnapshots:snapshots}])await f.admin.call('/api/customers','POST',{...data,name:'Unsaved stale selection',mob:'9876543771',...extra},422);
 assert.deepEqual(await f.admin.call('/api/state'),before);
 saved=await f.admin.call('/api/customers/'+saved.data.id,'PATCH',{version:saved.version,data:{co:'Unrelated edit'}});assert.deepEqual(saved.data.customFieldSnapshots,snapshots);assert.equal(saved.data.customFields[field.data.id],'first');
 const corrected=await f.admin.call('/api/customers','POST',{...data,name:'Corrected selection',mob:'9876543772',customFields:{[field.data.id]:'second'}},201);assert.equal(corrected.data.customFields[field.data.id],'second');
});

test('production fields: concurrent archival and customer creation serialize to one of the two safe outcomes',async t=>{
 const f=await fixture(t),field=await f.create(),route='/api/configurable-fields/'+field.data.id;
 const [archive,creation]=await Promise.all([f.admin.request(route+'/options/'+field.data.options[0].id,'DELETE',{version:field.version}),f.admin.request('/api/customers','POST',{name:'Archive race',mob:'9876543773',customFields:{[field.data.id]:'first'}})]);
 assert.equal(archive.status,200);assert.ok([201,422].includes(creation.status));
 if(creation.status===201){const saved=await f.admin.call('/api/customers/'+creation.body.data.id);assert.equal(saved.data.customFields[field.data.id],'first');assert.equal(saved.data.customFieldSnapshots[field.data.id].options[0].label,'First');}
 const current=(await f.admin.call(route)).data;assert.ok(current.options[0].archivedAt);await f.admin.call('/api/customers','POST',{name:'After archive',mob:'9876543774',customFields:{[field.data.id]:'first'}},422);
});

test('production fields: schema-13 backup and restore preserve definitions, options, bindings, audit and finalized quotation snapshots',async t=>{
 const f=await fixture(t),field=await f.create('products',{scopeType:'product',scopeId:'p1'}),state=(await f.admin.call('/api/state')).state;
 await f.admin.call('/api/products/p1/field-configuration','POST',{});
 let quote=await f.admin.call('/api/quotations','POST',{cid:state.customers[0].id,items:[{pid:'p1',cfg:DP.defCfg(DP.resolveProduct(state.products[0],state.set)),customFields:{[field.data.id]:'first'}}]},201);
 quote=await f.admin.call('/api/quotations/'+quote.data.id+'/status','POST',{version:quote.version,status:'Customer Approved'});
 await f.admin.call('/api/configurable-fields/'+field.data.id+'/options/'+field.data.options[0].id,'DELETE',{version:field.version});
 const tables=['configurable_fields','configurable_field_options','product_field_bindings','field_configuration_audit_logs','field_configuration_state','customers','customer_delivery_addresses','products','quotations','quotation_items','quotation_history','quotation_item_analytics'];
 const fingerprint=async db=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,await db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()]))),before=await fingerprint(f.app.db);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'paradise-field-backup-')),name='paradise_test_'+crypto.randomBytes(12).toString('hex');let restored;
 try{
  const backup=await require('../server/backup').backupDatabase(f.app.db,dir);assert.ok(backup.bytes>0);await require('../scripts/restore').restore(path.join(dir,backup.name),name,{databaseUrl:f.app.db.connectionString});
  const url=new URL(f.app.db.connectionString);url.pathname='/'+name;restored=connectDatabase({databaseUrl:url.href});assert.deepEqual(await fingerprint(restored),before);assert.equal((await restored.prepare('SELECT count(*) AS n FROM sessions').get()).n,0);
  const candidate=await createApp({databaseUrl:url.href});try{assert.deepEqual(await fingerprint(candidate.db),before);}finally{await candidate.close();}
  await assert.rejects(require('../scripts/restore').restore(path.join(dir,backup.name),name,{databaseUrl:f.app.db.connectionString}),/unused database name/);assert.deepEqual(await fingerprint(restored),before);
 }finally{if(restored)await restored.close();await f.app.db.exec('DROP DATABASE IF EXISTS "'+name+'" WITH (FORCE)');assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
});
