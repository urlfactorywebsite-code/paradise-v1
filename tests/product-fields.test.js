'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),DP=require('../shared/domain');
const {createApp}=require('../server'),{testDatabase}=require('./database-helper');
async function fixture(t){
 const database=await testDatabase(),app=await createApp(database);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();await database.destroy();});const base='http://127.0.0.1:'+app.server.address().port,password='Product-fields-'+crypto.randomUUID();
 function client(){let cookie='',csrf='';return {async call(route,method='GET',data,status=200){const r=await fetch(base+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();if(value.csrfToken)csrf=value.csrfToken;assert.equal(r.status,status,route+': '+JSON.stringify(value));return value;}};}
 const admin=client();await admin.call('/api/auth/setup','POST',{name:'Product fields owner',username:'productfieldsowner',password,demo:true},201);const state=(await admin.call('/api/state')).state;
 const create=(pid='p1',type='dropdown',extra={})=>admin.call('/api/configurable-fields','POST',{data:{pageKey:'products',scopeType:'product',scopeId:pid,fieldKey:'custom_job_'+crypto.randomBytes(5).toString('hex'),label:'Job '+type,fieldType:type,...(['dropdown','multi_select'].includes(type)?{options:[{value:'first',label:'First'},{value:'second',label:'Second'}]}:{}),...extra}},201);
 const quote=(pid='p1',customFields,extra={},status=201)=>admin.call('/api/quotations','POST',{cid:state.customers[0].id,items:[{pid,cfg:DP.defCfg(DP.resolveProduct(state.products.find(p=>p.id===pid),state.set)),...(customFields===undefined?{}:{customFields})}],...extra},status);
 const edit=(field,data,status=200)=>admin.call('/api/configurable-fields/'+field.id+'/editor','PUT',{version:field.version,data},status);
 return {database,app,admin,state,create,quote,edit,password,client};
}
test('product fields: native initialization is idempotent and cannot change product, pricing or quotation records',async t=>{
 const f=await fixture(t),before=await f.admin.call('/api/state'),prepared=await f.admin.call('/api/products/p1/field-configuration','POST',{});
 assert.equal(prepared.data.filter(field=>field.native).length,f.state.products[0].f.length);const again=await f.admin.call('/api/products/p1/field-configuration','POST',{});assert.deepEqual(again,prepared);assert.deepEqual(await f.admin.call('/api/state'),before);
 const mat=prepared.data.find(field=>field.native?.key==='mat');assert.ok(mat.native.optionValues[mat.options[0].value]);assert.ok(!JSON.stringify(mat).includes('"rate"'));
 assert.deepEqual(mat.options.map(option=>mat.native.optionValues[option.value]),f.state.products[0].f.find(field=>field.k==='mat').o.map(option=>option[0]));
 const other=await f.admin.call('/api/products/p2/field-configuration');assert.ok(!other.data.some(field=>field.id===mat.id));
});
test('product fields: product-owned roots share keys safely, keep immutable identities and enforce required values',async t=>{
 const f=await fixture(t),a=await f.create('p1','dropdown',{fieldKey:'custom_finish',isRequired:true}),b=await f.create('p2','text',{fieldKey:'custom_finish'});
 assert.deepEqual(a.data.options.map(option=>option.value),['first','second']);
 assert.notEqual(a.data.id,b.data.id);assert.equal((await f.admin.call('/api/products/p1/field-configuration')).data.filter(field=>field.id===b.data.id).length,0);
 await f.quote('p1',undefined,{},422);const quote=await f.quote('p1',{[a.data.id]:'first'});assert.equal(quote.data.items[0].customFields[a.data.id],'first');assert.ok(DP.customerSpecifications(quote.data.items[0]).includes('Job dropdown: First'));
 await f.quote('p1',{[b.data.id]:'Other product'}, {},422);await f.admin.call('/api/configurable-fields/'+a.data.id,'PATCH',{version:1,data:{fieldKey:'custom_changed'}},422);
 await f.admin.call('/api/configurable-fields','POST',{data:{baseFieldId:a.data.id,pageKey:'products',scopeType:'product',scopeId:'p2',label:'Cross product'}},422);
});
test('product fields: native labels/order/archive preserve canonical price keys and reject new unpriced variants',async t=>{
 const f=await fixture(t),prepared=await f.admin.call('/api/products/p1/field-configuration','POST',{}),native=prepared.data.find(field=>field.native?.key==='mat'),field=(await f.admin.call('/api/configurable-fields/'+native.id)).data,before=await f.admin.call('/api/products/p1');
 const options=field.options.map((option,index)=>({id:option.id,value:option.value,label:index===0?'Premium named board':option.label,isActive:index!==1,archived:index===1})).reverse();
 const result=await f.edit(field,{label:'Board stock',options});assert.equal(result.data.options[0].id,field.options.at(-1).id);assert.deepEqual(await f.admin.call('/api/products/p1'),before);
 await f.edit(result.data,{isRequired:false},409);await f.edit(result.data,{isActive:false},409);await f.admin.call('/api/configurable-fields/'+field.id+'/options','POST',{version:result.version,data:{value:'free_variant',label:'Free variant'}},409);
 const cfg=DP.defCfg(DP.resolveProduct(before.data,f.state.set));cfg.mat=native.native.optionValues[field.options[0].value];const q=await f.quote('p1',undefined,{items:[{pid:'p1',cfg}]}),item=q.data.items[0],canonical=DP.mkItem(DP.resolveProduct(before.data,f.state.set),item.cfg,'oracle','',2);assert.equal(item.sub,canonical.sub);assert.equal(item.cfg.mat,cfg.mat);assert.ok(DP.customerSpecifications(item).includes('Board stock: Premium named board'));
});
test('product fields: all seven types persist as line metadata and never enter canonical price configuration',async t=>{
 const f=await fixture(t),values={};for(const [type,value]of Object.entries({text:'Text',textarea:'Line one\nLine two',number:7.5,date:'2026-11-05',checkbox:true,dropdown:'first',multi_select:['first','second']})){const field=await f.create('p1',type);values[field.data.id]=value;}
 const quote=await f.quote('p1',values),item=quote.data.items[0];assert.deepEqual(item.customFields,values);assert.equal(Object.keys(item.customFieldSnapshots).length,7);assert.equal(item.sub,DP.mkItem(DP.resolveProduct(f.state.products[0],f.state.set),item.cfg,'oracle','',2).sub);assert.ok(!Object.keys(item.cfg).some(key=>Object.hasOwn(values,key)));
 const invalid={...values,[Object.keys(values)[2]]:'not a number'};await f.quote('p1',invalid,{},422);
});
test('product fields: configuration changes, archival and current price changes cannot rewrite saved/finalized snapshots',async t=>{
 const f=await fixture(t),field=await f.create(),prepared=await f.admin.call('/api/products/p1/field-configuration','POST',{});let quote=await f.quote('p1',{[field.data.id]:'first'});const original=structuredClone(quote.data.items[0]);
 const current=(await f.admin.call('/api/configurable-fields/'+field.data.id)).data;await f.edit(current,{label:'Renamed current label',options:current.options.map(option=>({id:option.id,value:option.value,label:'Current '+option.label,isActive:option.value!=='first',archived:option.value==='first'}))});
 const p=await f.admin.call('/api/products/p1');await f.admin.call('/api/products/p1','PATCH',{version:p.version,data:{tiers:p.data.tiers.map(([qty,price])=>[qty,price+1])}});
 quote=await f.admin.call('/api/quotations/'+quote.data.id,'PATCH',{version:quote.version,data:{project:'Ordinary edit'}});assert.deepEqual(quote.data.items[0],original);
 const values={...quote.data.items[0].customFields,[field.data.id]:'second'};quote=await f.admin.call('/api/quotations/'+quote.data.id,'PATCH',{version:quote.version,data:{items:[{...quote.data.items[0],customFields:values}]}});assert.equal(quote.data.items[0].sub,original.sub);assert.equal(quote.data.items[0].customFields[field.data.id],'second');
 quote=await f.admin.call('/api/quotations/'+quote.data.id+'/status','POST',{version:quote.version,status:'Customer Approved'});const final=structuredClone(quote.data.items[0]);await f.admin.call('/api/quotations/'+quote.data.id,'PATCH',{version:quote.version,data:{items:[{...final,customFields:{[field.data.id]:'first'}}]}},409);assert.deepEqual((await f.admin.call('/api/quotations/'+quote.data.id)).data.items[0],final);
 await f.admin.call('/api/quotations/'+quote.data.id,'PATCH',{version:quote.version,data:{items:[{...final,id:crypto.randomUUID(),customFields:{[field.data.id]:'second'}}]}},409);
 const preview=await f.admin.call('/api/quotations/preview','POST',quote.data);assert.ok(preview.quotation.items[0].sp.includes('Renamed current label: Current Second'));
});
test('product fields: atomic field ordering, concurrent edits, deactivation and tenant/role isolation',async t=>{
 const f=await fixture(t),a=await f.create(),b=await f.create('p1','text');let list=(await f.admin.call('/api/products/p1/field-configuration')).data.filter(field=>field.scopeType==='product');
 const input={fields:list.toReversed().map(field=>({id:field.id,version:field.version}))};const ordered=await f.admin.call('/api/products/p1/field-order','POST',input);assert.deepEqual(ordered.data.filter(field=>field.scopeType==='product').map(field=>field.id),input.fields.map(field=>field.id));await f.admin.call('/api/products/p1/field-order','POST',input,409);
 const field=(await f.admin.call('/api/configurable-fields/'+a.data.id)).data;await f.edit(field,{isActive:false});await f.quote('p1',{[a.data.id]:'first'}, {},422);await f.quote();
 await f.admin.call('/api/users','POST',{name:'Staff',username:'productstaff',password:f.password,role:'Employee'},201);const staff=f.client();await staff.call('/api/auth/login','POST',{username:'productstaff',password:f.password});await staff.call('/api/products/p1/field-configuration','POST',{},403);await staff.call('/api/products/p1/field-order','POST',input,403);await staff.call('/api/configurable-fields/'+b.data.id+'/editor','PUT',{version:1,data:{label:'Forbidden'}},403);
 const other=await fixture(t);await other.admin.call('/api/configurable-fields/'+a.data.id,'GET',undefined,404);await f.admin.call('/api/products/p1/field-configuration?tenant_id=other','GET',undefined,422);
});

test('product fields: explicit repricing and duplication use current canonical rates while retaining archived custom values',async t=>{
 const f=await fixture(t),custom=await f.create(),prepared=await f.admin.call('/api/products/p1/field-configuration','POST',{}),native=prepared.data.find(field=>field.native?.key==='mat');let q=await f.quote('p1',{[custom.data.id]:'first'});const old=q.data.items[0];
 await f.edit(native,{label:'Current material label'});await f.edit(custom.data,{label:'Current custom label',options:custom.data.options.map(option=>({id:option.id,value:option.value,label:'Current '+option.label,isActive:option.value!=='first',archived:option.value==='first'}))});
 const product=await f.admin.call('/api/products/p1');await f.admin.call('/api/products/p1','PATCH',{version:product.version,data:{tiers:product.data.tiers.map(([qty,rate])=>[qty,rate+1])}});
 q=await f.admin.call('/api/quotations/'+q.data.id+'/reprice','POST',{version:q.version});assert.ok(q.data.items[0].sub>old.sub);assert.equal(q.data.items[0].fieldSnapshot.find(field=>field.k==='mat').l,'Current material label');assert.deepEqual(q.data.items[0].customFieldSnapshots,old.customFieldSnapshots);
 const copy=await f.admin.call('/api/quotations/'+q.data.id+'/duplicate','POST',{version:q.version},201);assert.equal(copy.data.items[0].customFields[custom.data.id],'first');assert.deepEqual(copy.data.items[0].customFieldSnapshots,old.customFieldSnapshots);assert.equal(copy.data.items[0].sub,q.data.items[0].sub);
 await f.quote('p1',{[custom.data.id]:'first'},{items:[{pid:'p1',cfg:old.cfg,customFields:{[custom.data.id]:'first'},customFieldSnapshots:old.customFieldSnapshots}]},422);
});

test('product fields: failed field ordering rolls back all orders, versions, audit entries and configuration revision',async t=>{
 const f=await fixture(t);await f.create();await f.create('p1','text');await f.create('p1','number');const before=await f.admin.call('/api/products/p1/field-configuration'),db=f.app.db,prepare=db.prepare;let writes=0;
 db.prepare=function(sql){const statement=prepare(sql);if(sql.startsWith('UPDATE configurable_fields SET display_order=')){const run=statement.run;statement.run=async(...args)=>{if(++writes===2)throw Error('Injected ordering failure');return run(...args);};}return statement;};
 try{await f.admin.call('/api/products/p1/field-order','POST',{fields:before.data.filter(field=>field.scopeType==='product').toReversed().map(field=>({id:field.id,version:field.version}))},500);}finally{db.prepare=prepare;}
 assert.deepEqual(await f.admin.call('/api/products/p1/field-configuration'),before);
 const audit=await db.prepare("SELECT count(*) AS n FROM field_configuration_audit_logs WHERE action='field_reordered'").get();assert.equal(audit.n,0);
});

test('product fields: schema 13 upgrade is non-destructive, transactional and retryable from schema 12',async t=>{
 const f=await fixture(t),db=f.app.db,{createStore}=require('../server/store');await f.admin.call('/api/configurable-fields','POST',{data:{pageKey:'products',fieldKey:'custom_shared',fieldType:'text',label:'Shared field'}},201);const state=await f.admin.call('/api/state'),definitions=await f.admin.call('/api/configurable-fields'),exec=db.exec;
 await db.transaction(async()=>{await db.exec("DROP TABLE product_field_bindings;DROP INDEX configurable_fields_product_key;DROP INDEX configurable_fields_root_key;CREATE UNIQUE INDEX configurable_fields_root_key ON configurable_fields(page_key,field_key) WHERE base_field_id IS NULL;ALTER TABLE configurable_fields DROP CONSTRAINT configurable_fields_scope_shape;ALTER TABLE configurable_fields ADD CONSTRAINT configurable_fields_check CHECK ((scope_type='global' AND page_key='global' AND scope_id='' AND base_field_id IS NULL) OR (scope_type='page' AND page_key<>'global' AND scope_id=page_key) OR (scope_type='product' AND page_key<>'global' AND length(scope_id)>0 AND base_field_id IS NOT NULL));DELETE FROM schema_migrations WHERE version=13;");});
 const migration=require('node:fs').readFileSync(require('node:path').join(__dirname,'../server/migrations/013-product-dynamic-fields.sql'),'utf8');db.exec=async sql=>{const result=await exec(sql);if(sql===migration)throw Error('Injected migration 13 failure');return result;};
 try{await assert.rejects(createStore(db),/Injected migration 13 failure/);}finally{db.exec=exec;}
 assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n,12);assert.equal((await db.prepare("SELECT to_regclass('product_field_bindings') AS name").get()).name,null);assert.deepEqual(await f.admin.call('/api/state'),state);
 await createStore(db);await createStore(db);assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n,13);assert.deepEqual(await f.admin.call('/api/state'),state);assert.deepEqual(await f.admin.call('/api/configurable-fields'),definitions);
});

test('product fields: new priced variants synchronize stable bindings without resetting display customizations',async t=>{
 const f=await fixture(t),prepared=await f.admin.call('/api/products/p1/field-configuration','POST',{}),native=prepared.data.find(field=>field.native?.key==='mat');await f.edit(native,{label:'Custom board label'});
 const product=await f.admin.call('/api/products/p1'),fields=structuredClone(product.data.f),material=fields.find(field=>field.k==='mat');material.o.push(['New approved stock','u',1.25]);material.optionMeta={...material.optionMeta,'New approved stock':{enabled:true,approved:true}};await f.admin.call('/api/products/p1','PATCH',{version:product.version,data:{f:fields}});
 const first=await f.admin.call('/api/products/p1/field-configuration','POST',{}),field=first.data.find(field=>field.id===native.id),option=field.options.find(option=>option.label==='New approved stock');assert.equal(field.label,'Custom board label');assert.equal(field.native.optionValues[option.value],'New approved stock');assert.deepEqual(await f.admin.call('/api/products/p1/field-configuration','POST',{}),first);
 const cfg={...DP.defCfg(DP.resolveProduct(product.data,f.state.set)),mat:'New approved stock'},q=await f.quote('p1',undefined,{items:[{pid:'p1',cfg}]});assert.equal(q.data.items[0].sub,DP.mkItem(DP.resolveProduct({...product.data,f:fields},f.state.set),cfg,'oracle','',2).sub);
});

test('product fields: every real catalog product supports a safe field-management initialization',async t=>{
 const f=await fixture(t),before=await f.admin.call('/api/state');for(const product of f.state.products)await f.admin.call('/api/products/'+product.id+'/field-configuration','POST',{});assert.deepEqual(await f.admin.call('/api/state'),before);
});

test('product fields: native option ordering preserves catalog display order and central overrides take effect without changing prices',async t=>{
 const f=await fixture(t),original=await f.admin.call('/api/products/p1'),fields=structuredClone(original.data.f),material=fields.find(field=>field.k==='mat');material.optionMeta=Object.fromEntries(material.o.map((option,index)=>[option[0],{enabled:true,approved:true,order:material.o.length-index-1}]));const product=await f.admin.call('/api/products/p1','PATCH',{version:original.version,data:{f:fields}}),p=DP.resolveProduct(product.data,f.state.set),expected=DP.activeOptions(p.f.find(field=>field.k==='mat')).map(option=>option[0]);
 const before=await f.admin.call('/api/products/p1');const initialized=await f.admin.call('/api/products/p1/field-configuration','POST',{}),native=initialized.data.find(field=>field.native?.key==='mat');assert.deepEqual(native.options.map(option=>native.native.optionValues[option.value]),expected);
 const edited=await f.edit(native,{options:native.options.toReversed().map(option=>({id:option.id,value:option.value,label:'Display '+option.label,isActive:true,archived:false}))}),configuration=(await f.admin.call('/api/products/p1/field-configuration')).data,presented=require('../shared/product-fields').present(p,configuration,true),ordered=DP.activeOptions(presented.f.find(field=>field.k==='mat')).map(option=>option[0]);assert.deepEqual(ordered,expected.toReversed());assert.equal(edited.version,native.version+1);assert.deepEqual(await f.admin.call('/api/products/p1'),before);
 const cfg={...DP.defCfg(p),mat:ordered[0]},q=await f.quote('p1',undefined,{items:[{pid:'p1',cfg}]});assert.equal(q.data.items[0].sub,DP.mkItem(p,cfg,'oracle','',2).sub);assert.deepEqual(DP.activeOptions(q.data.items[0].fieldSnapshot.find(field=>field.k==='mat')).map(option=>option[0]),ordered);
});
