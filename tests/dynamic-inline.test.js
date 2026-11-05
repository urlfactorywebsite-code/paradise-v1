'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createApp}=require('../server'),{testDatabase}=require('./database-helper');
async function fixture(t){
 const database=await testDatabase(),app=await createApp(database);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.close();await database.destroy();});
 const base='http://127.0.0.1:'+app.server.address().port,password='Inline-fields-'+crypto.randomUUID();
 function client(){let cookie='',csrf='';return {async call(route,method='GET',data,status=200){const response=await fetch(base+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const body=await response.json();if(body.csrfToken)csrf=body.csrfToken;assert.equal(response.status,status,route+': '+JSON.stringify(body));return body;}};}
 const admin=client();await admin.call('/api/auth/setup','POST',{name:'Inline owner',username:'inlineowner',password,demo:true},201);
 const field=(page='customers',type='dropdown',extra={})=>admin.call('/api/configurable-fields','POST',{data:{pageKey:page,fieldKey:'custom_'+crypto.randomBytes(5).toString('hex').replace(/^[0-9]/,'a'),label:'Extra '+type,fieldType:type,...(['dropdown','multi_select'].includes(type)?{options:[{value:'first',label:'First'},{value:'second',label:'Second'}]}:{}),...extra}},201);
 const save=(f,data,status=200)=>admin.call('/api/configurable-fields/'+f.data.id+'/editor','PUT',{version:f.version,data},status);
 const option=(value,extra={})=>({id:value.id,value:value.value,label:value.label,isActive:value.isActive,archived:Boolean(value.archivedAt),...extra});
 return {app,database,admin,field,save,option,password,client};
}
test('inline: one editor save atomically renames, adds, archives and reorders without changing business records',async t=>{
 const f=await fixture(t),field=await f.field(),before=await f.admin.call('/api/state'),[first,second]=field.data.options;
 const saved=await f.save(field,{label:'Renamed field',options:[f.option(second,{label:'Renamed choice'}),f.option(first,{archived:true,isActive:false}),{value:'third',label:'Third',isActive:true,archived:false}]});
 assert.equal(saved.version,2);assert.equal(saved.revision,field.revision+1);assert.deepEqual(saved.data.options.map(value=>value.value),[second.value,first.value,'third']);assert.equal(saved.data.options[0].id,second.id);assert.ok(saved.data.options[1].archivedAt);
 assert.deepEqual((await f.admin.call('/api/state')).state,before.state);
 const audit=await f.admin.call('/api/configurable-fields/'+field.data.id+'/audit');assert.equal(audit.pagination.total,2);assert.ok(audit.data.some(row=>row.action==='editor_saved'));
});

test('inline: the shared typed validator is served in built and source-asset modes',async t=>{
 const f=await fixture(t),app=await createApp({...f.database,staticDir:require('node:path').resolve('public')});
 try{
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const response=await fetch('http://127.0.0.1:'+app.server.address().port+'/shared/dynamic-values.js');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);assert.equal(await response.text(),require('node:fs').readFileSync(require('node:path').join(__dirname,'../shared/dynamic-values.js'),'utf8'));
  const built=await new Promise((resolve,reject)=>{require('node:http').get('http://127.0.0.1:'+f.app.server.address().port+'/shared/dynamic-values.js',r=>{let text='';r.setEncoding('utf8');r.on('data',chunk=>text+=chunk);r.on('end',()=>resolve({status:r.statusCode,text}));}).on('error',reject);});assert.equal(built.status,200);assert.equal(built.text,require('node:fs').readFileSync(require('node:path').join(__dirname,'../shared/dynamic-values.js'),'utf8'));
 }finally{await app.close();}
});
test('inline: immutable keys, omitted/foreign IDs, duplicates, protected fields and stale saves fail atomically',async t=>{
 const f=await fixture(t),field=await f.field(),other=await f.field(),before=await f.admin.call('/api/configurable-fields/'+field.data.id);
 for(const [data,status]of [[{options:[]},422],[{options:[f.option(field.data.options[0],{value:'changed'}),f.option(field.data.options[1])]},422],[{options:[...field.data.options.map(value=>f.option(value)),{value:field.data.options[0].value,label:'Duplicate'}]},422],[{options:[f.option(other.data.options[0]),f.option(field.data.options[1])]},404],[{label:'Bad',options:field.data.options.map(value=>f.option(value,{label:''}))},422]])await f.save(field,data,status);
 assert.deepEqual(await f.admin.call('/api/configurable-fields/'+field.data.id),before);
 const first=await f.save(field,{label:'Winner'});await f.save(field,{label:'Stale'},409);assert.equal(first.version,2);
 await f.save({data:{id:'system_quotations_status'},version:1},{label:'Bypass'},403);
 const label=await f.save({data:{id:'system_customers_name'},version:1},{label:'Client name'});assert.equal(label.data.label,'Client name');await f.save(label,{isRequired:false},422);
 const employee=(await f.admin.call('/api/users','POST',{name:'Staff',username:'inlinestaff',password:f.password,role:'Employee'},201)).user,staff=f.client();assert.ok(employee.id);await staff.call('/api/auth/login','POST',{username:'inlinestaff',password:f.password});await staff.call('/api/configurable-fields/'+field.data.id+'/editor','PUT',{version:2,data:{label:'Forbidden'}},403);
});

test('inline: database failure during a full editor save rolls back label, options, audit and cache revision',async t=>{
 const f=await fixture(t),field=await f.field(),route='/api/configurable-fields/'+field.data.id;
 const before=await f.admin.call(route),audit=await f.admin.call(route+'/audit'),prepare=f.app.db.prepare;let updates=0;
 f.app.db.prepare=sql=>{const statement=prepare(sql);return sql.startsWith('UPDATE configurable_field_options SET label=')?{...statement,run:async(...args)=>{if(++updates===2)throw Error('Injected editor failure');return statement.run(...args);}}:statement;};
 try{await f.save(field,{label:'Must roll back',options:field.data.options.map(value=>f.option(value,{label:'Changed '+value.value}))},500);}finally{f.app.db.prepare=prepare;}
 assert.equal(updates,2);assert.deepEqual(await f.admin.call(route),before);assert.deepEqual(await f.admin.call(route+'/audit'),audit);
});

test('inline: schema 11 upgrade preserves existing records and failed type expansion rolls back safely',async t=>{
 const f=await fixture(t),field=await f.field(),db=f.app.db,{createStore}=require('../server/store');
 const before=await f.admin.call('/api/state'),config=await f.admin.call('/api/configurable-fields/'+field.data.id),exec=db.exec;
 await db.transaction(async()=>{await db.exec("ALTER TABLE configurable_fields DROP CONSTRAINT configurable_fields_field_type_check;ALTER TABLE configurable_fields ADD CONSTRAINT configurable_fields_field_type_check CHECK(field_type IN ('dropdown','text','system'));DELETE FROM schema_migrations WHERE version>=12;DROP TABLE product_field_bindings;DROP INDEX configurable_fields_product_key;ALTER TABLE configurable_fields RENAME CONSTRAINT configurable_fields_scope_shape TO configurable_fields_check;");});
 const migration=require('node:fs').readFileSync(require('node:path').join(__dirname,'../server/migrations/012-inline-field-editor.sql'),'utf8');
 db.exec=async sql=>{const result=await exec(sql);if(sql===migration)throw Error('Injected type expansion failure');return result;};
 try{await assert.rejects(createStore(db),/Injected type expansion failure/);}finally{db.exec=exec;}
 assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n,11);
 assert.doesNotMatch((await db.prepare("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='configurable_fields_field_type_check'").get()).definition,/multi_select/);
 assert.deepEqual(await f.admin.call('/api/state'),before);assert.deepEqual(await f.admin.call('/api/configurable-fields/'+field.data.id),config);
 await createStore(db);await createStore(db);assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n,13);
 assert.deepEqual(await f.admin.call('/api/state'),before);assert.deepEqual(await f.admin.call('/api/configurable-fields/'+field.data.id),config);
 assert.equal((await f.field('customers','multi_select')).data.fieldType,'multi_select');
});
test('inline: all seven custom types persist and validate through customer record creation and editing',async t=>{
 const f=await fixture(t),values={},definitions=[];
 const samples={text:'Short text',textarea:'Line one\nLine two',number:-12.75,date:'2026-11-05',checkbox:true,dropdown:'first',multi_select:['first','second']};
 for(const [type,value]of Object.entries(samples)){const field=await f.field('customers',type);definitions.push(field);values[field.data.id]=value;}
 let customer=await f.admin.call('/api/customers','POST',{name:'Typed customer',mob:'9876543991',customFields:values},201);
 assert.deepEqual(customer.data.customFields,values);assert.equal(Object.keys(customer.data.customFieldSnapshots).length,7);
 const snapshots=structuredClone(customer.data.customFieldSnapshots),dropdown=definitions.find(field=>field.data.fieldType==='dropdown');
 await f.save(dropdown,{label:'A new visible label',options:dropdown.data.options.map(value=>f.option(value,{label:'Changed '+value.value,...(value.value==='first'?{archived:true,isActive:false}:{})}))});
 customer=await f.admin.call('/api/customers/'+customer.data.id,'PATCH',{version:customer.version,data:{notes:'Other customer update'}});
 assert.deepEqual(customer.data.customFields,values);assert.deepEqual(customer.data.customFieldSnapshots,snapshots);
 const updated={...values,[definitions.find(field=>field.data.fieldType==='text').data.id]:'Changed text'};
 customer=await f.admin.call('/api/customers/'+customer.data.id,'PATCH',{version:customer.version,data:{customFields:updated,customFieldSnapshots:{injected:{label:'Spoof'}}}});
 assert.equal(customer.data.customFields[dropdown.data.id],'first');assert.equal(customer.data.customFieldSnapshots[dropdown.data.id].label,snapshots[dropdown.data.id].label);assert.ok(!customer.data.customFieldSnapshots.injected);
 await f.admin.call('/api/customers','POST',{name:'New archived selection',mob:'9876543992',customFields:values},422);
});
test('inline: required and typed values reject invalid or foreign input without partial records',async t=>{
 const f=await fixture(t),number=await f.field('customers','number',{isRequired:true}),multi=await f.field('customers','multi_select'),date=await f.field('customers','date'),check=await f.field('customers','checkbox');
 const count=async()=>(await f.app.db.prepare('SELECT count(*) AS n FROM customers').get()).n,before=await count();
 for(const customFields of [{},{[number.data.id]:'ten'},{[number.data.id]:1,[multi.data.id]:['first','first']},{[number.data.id]:1,[date.data.id]:'2026-02-30'},{[number.data.id]:1,[check.data.id]:'true'},{[number.data.id]:1,'system_customers_name':'Injected'}])await f.admin.call('/api/customers','POST',{name:'Invalid typed record',mob:'9876543993',customFields},422);
 assert.equal(await count(),before);
 const other=await fixture(t),foreign=await other.field('customers','text');await f.admin.call('/api/customers','POST',{name:'Foreign definition',mob:'9876543994',customFields:{[number.data.id]:2,[foreign.data.id]:'Foreign'}},422);
 const customer=await f.admin.call('/api/customers','POST',{name:'Valid required',mob:'9876543995',customFields:{[number.data.id]:0}},201);assert.equal(customer.data.customFields[number.data.id],0);
});
test('inline: quotation values do not affect money or customer output and finalized snapshots cannot change',async t=>{
 const f=await fixture(t),field=await f.field('quotations','textarea'),state=(await f.admin.call('/api/state')).state;
 const payload={cid:state.customers[0].id,date:'2026-11-05',valid:'2026-12-31',items:[{pid:state.products[0].id,cfg:require('../shared/domain').defCfg(state.products[0])}],customFields:{[field.data.id]:'Staff-only dynamic value'}};
 let quote=await f.admin.call('/api/quotations','POST',payload,201);assert.deepEqual(quote.data.customFields,payload.customFields);
 const storedTotal=(await f.app.db.prepare('SELECT total FROM quotations WHERE id=?').get(quote.data.id)).total;
 const preview=await f.admin.call('/api/quotations/preview','POST',{...quote.data,customFields:{[field.data.id]:'Preview draft value'}});assert.equal(preview.totals.grand,storedTotal);assert.ok(!JSON.stringify(preview.quotation).includes('Preview draft value'));
 quote=await f.admin.call('/api/quotations/'+quote.data.id+'/status','POST',{version:quote.version,status:'Customer Approved'});
 const original=structuredClone(quote.data.customFieldSnapshots);await f.save(field,{label:'Current renamed instructions'});
 await f.admin.call('/api/quotations/'+quote.data.id,'PATCH',{version:quote.version,data:{customFields:{[field.data.id]:'Retroactive change'}}},409);
 const saved=await f.admin.call('/api/quotations/'+quote.data.id);assert.deepEqual(saved.data.customFieldSnapshots,original);assert.equal(saved.data.customFields[field.data.id],'Staff-only dynamic value');
});

test('inline: duplicating a quotation retains archived custom selections and trusted label snapshots',async t=>{
 const f=await fixture(t),field=await f.field('quotations'),state=(await f.admin.call('/api/state')).state;
 let quote=await f.admin.call('/api/quotations','POST',{cid:state.customers[0].id,items:[{pid:state.products[0].id,cfg:require('../shared/domain').defCfg(state.products[0])}],customFields:{[field.data.id]:'first'}},201);
 quote=await f.admin.call('/api/quotations/'+quote.data.id+'/status','POST',{version:quote.version,status:'Customer Approved'});
 await f.save(field,{label:'Current finish',options:field.data.options.map(option=>f.option(option,{label:'Current '+option.label,...(option.value==='first'?{archived:true,isActive:false}:{})}))});
 const copy=await f.admin.call('/api/quotations/'+quote.data.id+'/duplicate','POST',{version:quote.version},201);
 assert.equal(copy.data.status,'Draft');assert.notEqual(copy.data.id,quote.data.id);assert.deepEqual(copy.data.customFields,quote.data.customFields);assert.deepEqual(copy.data.customFieldSnapshots,quote.data.customFieldSnapshots);
 const forged=structuredClone(copy.data);delete forged.id;forged.customFieldSnapshots=quote.data.customFieldSnapshots;
 await f.admin.call('/api/quotations','POST',forged,422);
});

test('review: multi-select edits retain saved choices removed by a later scope override without accepting forged history',async t=>{
 const f=await fixture(t),root=await f.field('global','multi_select',{configuration:{pages:['customers']}});
 let customer=await f.admin.call('/api/customers','POST',{name:'Scoped multi customer',mob:'9876543901',customFields:{[root.data.id]:['first']}},201);
 const historical=structuredClone(customer.data.customFieldSnapshots[root.data.id]);
 await f.admin.call('/api/configurable-fields','POST',{data:{baseFieldId:root.data.id,pageKey:'customers',scopeType:'page',label:'Current multi',options:[{value:'current',label:'Current choice'}]}},201);
 customer=await f.admin.call('/api/customers/'+customer.data.id,'PATCH',{version:customer.version,data:{customFields:{[root.data.id]:['first','current']}}});
 assert.deepEqual(customer.data.customFields[root.data.id],['first','current']);assert.deepEqual(customer.data.customFieldSnapshots[root.data.id].options,[{value:'current',label:'Current choice'},...historical.options]);
 await f.admin.call('/api/customers','POST',{name:'Forged scoped selection',mob:'9876543902',customFields:{[root.data.id]:['first','current']},customFieldSnapshots:{[root.data.id]:historical}},422);
 customer=await f.admin.call('/api/customers/'+customer.data.id,'PATCH',{version:customer.version,data:{customFields:{[root.data.id]:['current']}}});
 await f.admin.call('/api/customers/'+customer.data.id,'PATCH',{version:customer.version,data:{customFields:{[root.data.id]:['first','current']}}},422);
});
