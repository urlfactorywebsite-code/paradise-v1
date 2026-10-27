'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createApp}=require('../server'),{testDatabase}=require('./database-helper');
const DP=require('../shared/domain');
const templateRoute='/api/configuration-templates/promotional-gift';
async function fixture(t){
 const database=await testDatabase(),app=await createApp(database);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await app.close();await database.destroy()});
 const base=`http://127.0.0.1:${app.server.address().port}`;let cookie='',csrf='';
 async function request(route,method='GET',body,expected=200){
  const response=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  const data=response.headers.get('content-type')?.includes('application/json')?await response.json():Buffer.from(await response.arrayBuffer());
  if(data.csrfToken)csrf=data.csrfToken;
  assert.equal(response.status,expected,`${method} ${route}: ${Buffer.isBuffer(data)?'PDF':JSON.stringify(data)}`);return data;
 }
 const password='Review-'+crypto.randomUUID();
 await request('/api/auth/setup','POST',{name:'Phase 3 Review Admin',username:'reviewadmin',password,demo:true},201);
 const state=await request('/api/state');await request('/api/state','PUT',{revision:state.revision,state:state.state});
 return{request,app,database,password};
}
async function setup(request,id){const original=await request('/api/products/'+id),template=(await request(templateRoute)).data;return request('/api/products/'+id,'PUT',{version:original.version,data:DP.phase3Product(original.data,template)});}

test('Phase 3 review security: forged projection metadata cannot alter master rates, IDs or snapshots through any write path',async t=>{
 const {request}=await fixture(t),gift=await setup(request,'p8'),plain=await request('/api/products/p2');
 const before=await request('/api/state'),password='Catalog-'+crypto.randomUUID();
 // Immutable master comparisons require rate-read access; pricing.manage stays absent.
 await request('/api/users','POST',{name:'Catalog Reviewer',username:'reviewcatalog',password,role:'Employee',permissions:['product.view','product.manage','pricing.view']},201);
 await request('/api/auth/login','POST',{username:'reviewcatalog',password});
 for(const marker of ['__giftRaw','__giftBase']){
  const data={...structuredClone(gift.data),[marker]:{...structuredClone(gift.data),id:'replaced-product',rate:999,cat:'c1',f:[]}};
  await request('/api/products/p8','PUT',{version:gift.version,data},422);
  const state=await request('/api/state'),replacement=structuredClone(state.state);replacement.products[replacement.products.findIndex(p=>p.id==='p8')]=data;
  await request('/api/state','PUT',{revision:state.revision,state:replacement},422);
  await request('/api/changes','POST',{revision:state.revision,changes:[{collection:'products',action:'upsert',id:'p8',record:data}]},422);
  await request('/api/products/p2','PATCH',{version:plain.version,data:{[marker]:{...plain.data,rate:999}}},422);
 }
 const retained=await request('/api/products/p8');assert.deepEqual(retained.data,gift.data);assert.equal(retained.version,gift.version);assert.equal(retained.updatedAt,gift.updatedAt);assert.deepEqual(await request('/api/products/p2'),plain);
 const after=await request('/api/state');assert.equal(after.revision,before.revision);assert.deepEqual(after.state.products,before.state.products);
});

test('Phase 3 review validation: unapproved custom rates and malformed inactive definitions are rejected atomically',async t=>{
 const {request}=await fixture(t),gift=await setup(request,'p8');let shared=await request(templateRoute);
 const pending=structuredClone(shared.data),color=pending.f.find(f=>f.k==='color');color.allowCustom=true;color.customCharge={type:'u',amount:null,approved:false};
 shared=await request(templateRoute,'PUT',{revision:shared.revision,data:pending});
 const invalid=structuredClone(shared.data);invalid.f.find(f=>f.k==='color').customCharge.approved=true;
 await request(templateRoute,'PUT',{revision:shared.revision,data:invalid},422);
 const current=await request('/api/products/p8'),before=await request('/api/state');
 for(const field of [
  {k:'color',l:'Colour',t:'multi',required:false,minSelections:4,maxSelections:2,o:[['Blue','f',0]]},
  {k:'color',l:'Colour',t:'multi',required:false,allowCustom:true,o:[['Blue','f',0]]},
  {k:'color',l:'Colour',t:'sel',required:false,o:[['Blue','f',0]],optionMeta:{Missing:{approved:true,enabled:true}}},
  {k:'color',l:'Colour',t:'sel',required:false,o:[['Blue','u',2]],optionMeta:{Blue:{approved:true,enabled:true,quantityKey:'missingQuantity'}}},
 ]){
  const draft=structuredClone(current.data);draft.giftTemplate.disabled=['color'];draft.giftTemplate.overrides.color=field;
  await request('/api/products/p8','PUT',{version:current.version,data:draft},422);
 }
 assert.deepEqual(await request('/api/products/p8'),current);assert.equal((await request('/api/state')).revision,before.revision);
 assert.equal((await request(templateRoute)).data.f.find(f=>f.k==='color').customCharge.approved,false);
 assert.equal(gift.data.rate,current.data.rate);
 const reordered=structuredClone(current.data);reordered.tiers.reverse();
 const sorted=await request('/api/products/p8','PUT',{version:current.version,data:reordered});assert.deepEqual(sorted.data.tiers,current.data.tiers);
});

test('Phase 3 review security: overridden, disabled and archived master rates retain HTTP authorization',async t=>{
 const {request,password:adminPassword}=await fixture(t);let mug=await setup(request,'p10');const shirt=await setup(request,'p7'),template=(await request(templateRoute)).data;
 const effective=DP.resolveGiftProduct(mug.data,template);effective.f.find(f=>f.k==='type').o[1][2]=90;
 mug=await request('/api/products/p10','PUT',{version:mug.version,data:DP.stripGiftProduct(effective,template)});
 // Readable master rates do not authorize rate changes, including hidden/archived fields.
 const password='Catalog-'+crypto.randomUUID();await request('/api/users','POST',{name:'Rate Reviewer',username:'reviewrates',password,role:'Employee',permissions:['product.view','product.manage','pricing.view']},201);
 await request('/api/auth/login','POST',{username:'reviewrates',password});
 const shadowed=structuredClone(mug.data);shadowed.f.find(f=>f.k==='type').o[1][2]=999;
 await request('/api/products/p10','PUT',{version:mug.version,data:shadowed},403);
 const archived=structuredClone(shirt.data);archived.phase3LegacyFields[0].o[1][2]=999;
 await request('/api/products/p7','PUT',{version:shirt.version,data:archived},403);
 let retained=await request('/api/products/p10');assert.deepEqual(retained.data,mug.data);assert.equal(retained.version,mug.version);retained=await request('/api/products/p7');assert.deepEqual(retained.data,shirt.data);assert.equal(retained.version,shirt.version);
 await request('/api/auth/login','POST',{username:'reviewadmin',password:adminPassword});
 const disabled=structuredClone(mug.data);disabled.giftTemplate.disabled=['model'];mug=await request('/api/products/p10','PUT',{version:mug.version,data:disabled});
 await request('/api/auth/login','POST',{username:'reviewrates',password});
 const disabledRaw=structuredClone(mug.data);disabledRaw.f.find(f=>f.k==='type').o[1][2]=999;await request('/api/products/p10','PUT',{version:mug.version,data:disabledRaw},403);
 retained=await request('/api/products/p10');assert.deepEqual(retained.data,mug.data);assert.equal(retained.version,mug.version);
});
