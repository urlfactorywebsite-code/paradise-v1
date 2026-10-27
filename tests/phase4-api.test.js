'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createApp}=require('../server'),{testDatabase}=require('./database-helper');
const DP=require('../shared/domain');
async function fixture(t){
 const database=await testDatabase(),app=await createApp(database);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await app.close();await database.destroy()});
 const base=`http://127.0.0.1:${app.server.address().port}`;let cookie='',csrf='';
 async function request(route,method='GET',body,expected=200){
  const response=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  const data=response.headers.get('content-type')?.includes('application/json')?await response.json():Buffer.from(await response.arrayBuffer());if(data.csrfToken)csrf=data.csrfToken;
  assert.equal(response.status,expected,`${method} ${route}: ${Buffer.isBuffer(data)?'PDF':JSON.stringify(data)}`);return data;
 }
 const password='Fixture-'+crypto.randomUUID();await request('/api/auth/setup','POST',{name:'Phase Four Admin',username:'phase4admin',password,demo:true},201);
 const initial=await request('/api/state');await request('/api/state','PUT',{revision:initial.revision,state:initial.state});
 return{request,app,password};
}
async function prepare(request,apply=true){const initial=await request('/api/state');return request('/api/catalog/prepare','POST',{revision:initial.revision,apply});}
function priceFields(raw,settings){const effective=DP.resolveProduct(raw,settings);for(const field of effective.f){if(['sel','multi'].includes(field.t)){const value='Approved '+field.k;field.o=[[value,'f',0]];field.optionMeta={[value]:{label:value,enabled:true,approved:true}};field.required=field.k!=='binding';}}return DP.stripProduct(effective,settings);}

test('Phase 4 HTTP catalog: backend checklist counts, safe aliases, missing records, preview/apply and repeatability preserve data',async t=>{
 const {request}=await fixture(t),before=await request('/api/state'),list=await request('/api/catalog/checklist?pageSize=5');
 assert.equal(list.counts.required,40);assert.equal(list.counts.active,12);assert.equal(list.counts.inactive,28);assert.equal(list.counts.missing,0);assert.equal(list.rows.length,5);assert.equal(list.pagination.total,40);
 const filtered=await request('/api/catalog/checklist?q=Envelope&status=Inactive%20(Price%20Pending)');assert.equal(filtered.rows.length,1);assert.equal(filtered.rows[0].code,'GD-EN');assert.deepEqual(filtered.counts,list.counts);
 assert.deepEqual((await request('/api/catalog/checklist?q=Envelope&status=price_pending')).rows,filtered.rows);const unassigned=await request('/api/catalog/checklist?template=none');assert.equal(unassigned.pagination.total,40);assert.equal((await request('/api/catalog/checklist?status=Conflict')).rows.length,0);
 const original=await request('/api/products/p13');await request('/api/products/p13','DELETE',{version:original.version});
 const missing=await request('/api/catalog/checklist?q=Envelope');assert.equal(missing.rows[0].status,'Missing');assert.equal(missing.counts.missing,1);
 const state=await request('/api/state'),preview=await request('/api/catalog/prepare','POST',{revision:state.revision});assert.equal(preview.applied,false);assert.ok(preview.changes.length);assert.equal((await request('/api/state')).revision,state.revision);assert.equal((await request('/api/catalog/checklist?q=Envelope')).rows[0].status,'Missing');
 const applied=await request('/api/catalog/prepare','POST',{revision:state.revision,apply:true});assert.equal(applied.applied,true);assert.equal(applied.report.counts.missing,0);
 const envelope=applied.state.products.find(p=>p.code==='GD-EN');assert.ok(envelope);assert.equal(envelope.rate,null);assert.equal(envelope.tax,null);assert.equal(envelope.priceConfigured,false);assert.equal(envelope.on,0);
 const repeat=await prepare(request);assert.equal(repeat.changes.length,0);assert.equal(repeat.state.products.length,40);assert.equal(repeat.state.products.find(p=>p.code==='GD-EN').id,envelope.id);
 for(const original of before.state.products.filter(p=>p.on)){const saved=repeat.state.products.find(p=>p.id===original.id);assert.deepEqual(saved,original);}
 assert.deepEqual(repeat.state.quotes,before.state.quotes);assert.deepEqual(repeat.state.customers,before.state.customers);
 await request('/api/catalog/prepare','POST',{revision:state.revision,apply:true},409);
});

test('Phase 4 HTTP templates: four definitions share the existing engine, overrides are isolated and invalid assignments reject atomically',async t=>{
 const {request}=await fixture(t),templates=await request('/api/configuration-templates');assert.deepEqual(new Set(templates.data.map(t=>t.id)),new Set(['print_product','area_product','promotional_gift','stationery_product']));
 const applied=await prepare(request);let p=await request('/api/products/p13');assert.equal(p.data.catalogTemplate.id,'print_product');assert.ok(p.data.catalogTemplate.required.includes('finish'));assert.ok(!p.data.catalogTemplate.overrides.finish,'Requiredness alone must retain label inheritance');
 let template=await request('/api/configuration-templates/print-product'),changed=structuredClone(template.data);changed.f.find(f=>f.k==='finish').l='Shared finish instructions';
 template=await request('/api/configuration-templates/print-product','PUT',{revision:template.revision,data:changed});
 const state=(await request('/api/state')).state,effective=DP.resolveProduct(p.data,state.set);assert.equal(effective.f.find(f=>f.k===(p.data.catalogTemplate.map.finish||'finish')).l,'Shared finish instructions');
 const local=DP.resolveProduct(p.data,state.set);local.f.find(f=>f.k===(p.data.catalogTemplate.map.finish||'finish')).l='Envelope finish only';const raw=DP.stripProduct(local,state.set);p=await request('/api/products/'+p.data.id,'PUT',{version:p.version,data:raw});
 assert.equal((await request('/api/configuration-templates/print-product')).data.f.find(f=>f.k==='finish').l,'Shared finish instructions');
 assert.equal(DP.resolveProduct((await request('/api/products/p15')).data,state.set).f.find(f=>f.k==='finish').l,'Shared finish instructions');
 for(const mutate of [x=>x.catalogTemplate.id='unknown',x=>x.catalogTemplate.parent='print_product',x=>x.giftTemplate={id:'promotional_gift'},x=>x.catalogTemplate.order=['finish','finish'],x=>x.catalogTemplate.required=['finish','finish'],x=>x.catalogTemplate.required=['unknown'],x=>x.__templateRaw={...x,rate:999}]){
  const forged=structuredClone(p.data);mutate(forged);await request('/api/products/'+p.data.id,'PUT',{version:p.version,data:forged},422);
 }
 assert.deepEqual((await request('/api/products/'+p.data.id)).data,p.data);assert.equal(applied.state.products.filter(p=>p.on).length,12);
});

test('Phase 4 HTTP configuration: all seven print products validate, save, reopen and print approved fixture selections',async t=>{
 const {request}=await fixture(t);await prepare(request);
 for(const code of ['GD-EN','GD-ID','GD-BB','GD-CT','GD-IN','GD-DG','GD-MN']){
  const state=(await request('/api/state')).state,raw=state.products.find(p=>p.code===code),current=await request('/api/products/'+raw.id),priced=priceFields(raw,state.set);Object.assign(priced,{rate:1.25,tax:18,priceConfigured:true,on:1});
  const saved=await request('/api/products/'+raw.id,'PUT',{version:current.version,data:priced}),effective=DP.resolveProduct(saved.data,(await request('/api/state')).state.set),cfg={...DP.defCfg(effective),qty:4};
  for(const field of effective.f.filter(f=>f.t==='num'&&f.required))cfg[field.k]=2;
  const calculated=await request('/api/pricing/calculate','POST',{productId:raw.id,cfg});assert.equal(calculated.sub,500);assert.equal(calculated.gst,90);
  const option=effective.f.find(f=>f.t==='sel');await request('/api/pricing/calculate','POST',{productId:raw.id,cfg:{...cfg,[option.k]:'INVALID'}},422);
  const quote=await request('/api/quotations','POST',{data:{cid:'C1',items:[{pid:raw.id,cfg,sub:1,notes:'PHASE4-PRIVATE'}]}},201);assert.equal(quote.data.items[0].sub,500);assert.deepEqual((await request('/api/quotations/'+quote.data.id)).data.items[0].cfg,quote.data.items[0].cfg);
  const pdf=(await request('/api/quotations/'+quote.data.id+'/pdf')).toString('latin1');assert.ok(pdf.includes('Approved'));assert.ok(!pdf.includes('PHASE4-PRIVATE'));
 }
});

test('Phase 4 HTTP pricing: inactive and unconfigured products cannot bypass activation or null-price guards',async t=>{
 const {request}=await fixture(t);await prepare(request);let p=await request('/api/products/p13');
 await request('/api/pricing/calculate','POST',{productId:p.data.id,cfg:{qty:10}},422);
 await request('/api/quotations','POST',{data:{cid:'C1',items:[{pid:p.data.id,cfg:{qty:10}}]}},422);
 for(const data of [{on:1},{on:1,priceConfigured:true,rate:null,tax:null},{priceConfigured:true,rate:null,tax:18}])await request('/api/products/'+p.data.id,'PATCH',{version:p.version,data},422);
 const original=await request('/api/products/p2'),changed={...original.data,on:0,priceConfigured:true};await request('/api/products/p2','PUT',{version:original.version,data:changed});const report=await request('/api/catalog/checklist?q=Logo');assert.equal(report.rows[0].status,'Inactive');assert.equal(report.rows[0].pricingReadiness.ready,true);
});

test('Phase 4 HTTP permissions: catalog verification/templates and price mutations retain independent authorization',async t=>{
 const {request,password}=await fixture(t);await prepare(request);const userPassword='User-'+crypto.randomUUID();
 for(const [username,permissions] of [['ordinary',['product.view']],['catalog',['product.view','product.manage']],['pricing',['product.view','pricing.view','pricing.manage']]])await request('/api/users','POST',{name:username,username:'phase4'+username,password:userPassword,role:'Employee',permissions},201);
 await request('/api/auth/login','POST',{username:'phase4ordinary',password:userPassword});for(const route of ['/api/catalog/checklist','/api/configuration-templates','/api/configuration-templates/print-product'])await request(route,'GET',undefined,403);
 await request('/api/catalog/prepare','POST',{revision:1,apply:true},403);
 await request('/api/auth/login','POST',{username:'phase4catalog',password:userPassword});let template=await request('/api/configuration-templates/print-product'),change=structuredClone(template.data);change.f.find(f=>f.k==='finish').l='Catalog label';template=await request('/api/configuration-templates/print-product','PUT',{revision:template.revision,data:change});
 change=structuredClone(template.data);change.f.find(f=>f.k==='size').o[0][2]=10;await request('/api/configuration-templates/print-product','PUT',{revision:template.revision,data:change},403);const current=await request('/api/state');await request('/api/catalog/prepare','POST',{revision:current.revision,apply:true},403);
 await request('/api/auth/login','POST',{username:'phase4pricing',password:userPassword});template=await request('/api/configuration-templates/print-product');change=structuredClone(template.data);change.f.find(f=>f.k==='finish').l='Forbidden label';await request('/api/configuration-templates/print-product','PUT',{revision:template.revision,data:change},403);
 await request('/api/auth/login','POST',{username:'phase4admin',password});await request('/api/catalog/checklist');
});

test('Phase 4 HTTP selective reads: checklist/template/catalog do not load historical quotation state',async t=>{
 const {request,app}=await fixture(t),original=app.store.readState;app.store.readState=async()=>{throw Error('Full history loading is forbidden for catalog read endpoints')};
 try{await request('/api/catalog/checklist?page=2&pageSize=5');await request('/api/configuration-templates');await request('/api/configuration-templates/area-product');await request('/api/catalog');}finally{app.store.readState=original;}
 for(const route of ['/api/catalog/checklist?pageSize=0','/api/catalog/checklist?status=INVALID','/api/catalog/checklist?template=INVALID'])await request(route,'GET',undefined,422);
});

test('Phase 4 HTTP private pricing: catalog-only reads redact master prices and safe edits preserve them',async t=>{
 const {request,password}=await fixture(t);await prepare(request);
 let shared=await request('/api/configuration-templates/print-product'),changed=structuredClone(shared.data);
 const size=changed.f.find(f=>f.k==='size');size.o=[['Business approved size','u',83.49]];size.optionMeta={'Business approved size':{label:'Business approved size',enabled:true,approved:true}};
 shared=await request('/api/configuration-templates/print-product','PUT',{revision:shared.revision,data:changed});
 const before=(await request('/api/state')).state,privatePassword='Private-'+crypto.randomUUID();
 await request('/api/users','POST',{name:'Catalog without rates',username:'phase4private',password:privatePassword,role:'Employee',permissions:['product.view','product.manage','customer.view','quotation.view_all']},201);
 await request('/api/auth/login','POST',{username:'phase4private',password:privatePassword});
 const check=value=>{
  if(Array.isArray(value)){for(const item of value)check(item);return;}
  if(!value||typeof value!=='object')return;
  if(value.code&&value.cat&&Array.isArray(value.f))for(const key of ['rate','min','tax','taxMode','tiers','charges'])assert.ok(!(key in value),'Hidden product '+key);
  if(value.k&&value.t){if(value.o)for(const option of value.o)assert.equal(option.length,1);assert.ok(!('customCharge' in value));for(const item of value.sizes||[])assert.ok(!('price' in item));for(const metadata of Object.values(value.optionMeta||{}))assert.ok(!('approved' in metadata));if(value.eyeletPolicy)assert.ok(!('approved' in value.eyeletPolicy));}
  if(value.prefix&&Array.isArray(value.terms))for(const key of ['tax','employeeDiscountLimit','employeeDiscountMax'])assert.ok(!(key in value));
  for(const item of Object.values(value))check(item);
 };
 for(const route of ['/api/state','/api/catalog','/api/products/p1','/api/products?pageSize=40','/api/settings','/api/configuration-templates','/api/configuration-templates/print-product','/api/configuration-templates/promotional-gift','/api/quotations/Q1'])check(await request(route));
 const quote=await request('/api/quotations/Q1');assert.equal(quote.data.items[0].sub,before.quotes.find(q=>q.id==='Q1').items[0].sub);
 let p=await request('/api/products/p1'),schema=structuredClone(p.data);schema.f.find(f=>f.k==='mat').l='Catalog material label';p=await request('/api/products/p1','PUT',{version:p.version,data:schema});check(p);
 await request('/api/products/p1','PATCH',{version:p.version,data:{rate:99}},403);
 schema=structuredClone(p.data);schema.f.push({k:'catalogOption',l:'Pending catalog choice',t:'sel',required:false,o:[['New unpriced choice']]});p=await request('/api/products/p1','PUT',{version:p.version,data:schema});check(p);
 shared=await request('/api/configuration-templates/print-product');changed=structuredClone(shared.data);changed.f.find(f=>f.k==='size').l='Catalog size label';shared=await request('/api/configuration-templates/print-product','PUT',{revision:shared.revision,data:changed});check(shared);
 changed=structuredClone(shared.data);changed.f.find(f=>f.k==='size').o[0]=['Business approved size','u',12];await request('/api/configuration-templates/print-product','PUT',{revision:shared.revision,data:changed},403);
 const safe=await request('/api/state');await request('/api/state','PUT',{revision:safe.revision,state:safe.state});
 await request('/api/auth/login','POST',{username:'phase4admin',password});
 const after=(await request('/api/state')).state,oldProduct=before.products.find(p=>p.id==='p1'),actual=after.products.find(p=>p.id==='p1');
 for(const key of ['rate','min','tax','taxMode','tiers','charges'])assert.deepEqual(actual[key],oldProduct[key]);
 for(const field of actual.f)if(field.o&&field.k!=='catalogOption')assert.deepEqual(field.o,oldProduct.f.find(f=>f.k===field.k).o);
 assert.deepEqual(actual.f.find(f=>f.k==='catalogOption').o,[['New unpriced choice','f',null]]);assert.equal(actual.f.find(f=>f.k==='catalogOption').optionMeta['New unpriced choice'].approved,false);assert.equal(DP.activeOptions(actual.f.find(f=>f.k==='catalogOption')).length,0);
 assert.equal(actual.f.find(f=>f.k==='mat').l,'Catalog material label');assert.equal(after.set.catalogTemplates.print_product.f.find(f=>f.k==='size').o[0][2],83.49);assert.deepEqual(after.quotes,before.quotes);
});

test('Phase 4 HTTP prepare validates stale and malformed requests without partial writes',async t=>{
 const {request,app}=await fixture(t),before=await request('/api/state');
 await request('/api/catalog/prepare','POST',{apply:true},428);
 await request('/api/catalog/prepare','POST',{revision:before.revision,apply:'true'},422);
 await request('/api/catalog/prepare','POST',{revision:before.revision+1,apply:true},409);
 assert.deepEqual((await request('/api/state')).state,before.state);
 const original=app.store.db.prepare;let queries=0;
 app.store.db.prepare=function(sql){if(/^SELECT\s/i.test(sql))queries++;return original.call(this,sql)};
 try{const catalog=await app.store.readCatalogConfiguration();assert.equal(catalog.state.products.length,40);assert.equal(queries,3);}finally{app.store.db.prepare=original;}
});

test('Phase 4 HTTP new duplicate quotes cannot bypass inactive products or categories; historical edits keep snapshots',async t=>{
 const {request,app}=await fixture(t);let product=await request('/api/products/p2');
 let quote=await request('/api/quotations','POST',{data:{cid:'C1',items:[{pid:'p2',cfg:DP.defCfg(product.data)}]}},201);
 const items=structuredClone(quote.data.items),before=(await request('/api/state')).state.quotes,sequence=await app.store.db.prepare('SELECT * FROM quote_sequences ORDER BY year').all();
 product=await request('/api/products/p2','PATCH',{version:product.version,data:{on:0}});
 await request('/api/quotations/'+quote.data.id+'/duplicate','POST',{version:quote.version},422);
 await request('/api/quotations/preview','POST',{data:{cid:'C1',items:[{pid:'p2',cfg:items[0].cfg}]}},422);
 assert.deepEqual((await request('/api/state')).state.quotes,before);assert.deepEqual(await app.store.db.prepare('SELECT * FROM quote_sequences ORDER BY year').all(),sequence);
 quote=await request('/api/quotations/'+quote.data.id,'PATCH',{version:quote.version,data:{subject:'Historical specification review'}});assert.deepEqual(quote.data.items,items);
 product=await request('/api/products/p2','PATCH',{version:product.version,data:{on:1}});const category=await request('/api/categories/'+product.data.cat);
 await request('/api/categories/'+product.data.cat,'PATCH',{version:category.version,data:{on:0}});await request('/api/quotations/'+quote.data.id+'/duplicate','POST',{version:quote.version},422);
 await request('/api/products/p2','DELETE',{version:product.version});await request('/api/quotations/'+quote.data.id+'/duplicate','POST',{version:quote.version},422);
 assert.deepEqual((await request('/api/quotations/'+quote.data.id)).data.items,items);assert.deepEqual(await app.store.db.prepare('SELECT * FROM quote_sequences ORDER BY year').all(),sequence);
});
