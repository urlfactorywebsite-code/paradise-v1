'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createApp}=require('../server'),{testDatabase}=require('./database-helper');
const DP=require('../shared/domain');

test('Phase 3 review: price and template reads use a consistent selective catalog snapshot without quotation history',async t=>{
 const database=await testDatabase(),app=await createApp(database);
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await app.close();await database.destroy()});
 const base=`http://127.0.0.1:${app.server.address().port}`;let cookie='',csrf='';
 async function request(route,method='GET',body,expected=200){
  const response=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  const value=await response.json();if(value.csrfToken)csrf=value.csrfToken;
  assert.equal(response.status,expected,JSON.stringify(value));return value;
 }
 await request('/api/auth/setup','POST',{name:'Review Admin',username:'reviewadmin',password:'Fixture-'+crypto.randomUUID(),demo:true},201);
 const before=await request('/api/products/p10'),template=await request('/api/configuration-templates/promotional-gift');
 const gift=DP.phase3Product(before.data,template.data);
 await request('/api/products/p10','PUT',{version:before.version,data:gift});
 const effective=DP.resolveGiftProduct(gift,template.data),cfg=DP.defCfg(effective),expected=DP.calc(effective,cfg);
 const originalRead=app.store.readState;
 app.store.readState=async()=>{throw new Error('Pricing/template reads must not load quotation history.')};
 try{
  const read=await request('/api/configuration-templates/promotional-gift');assert.deepEqual(read.data,template.data);assert.ok(read.revision>template.revision);
  const priced=await request('/api/pricing/calculate','POST',{productId:gift.id,cfg});assert.equal(priced.sub,expected.sub);assert.equal(priced.grand,expected.grand);
  await request('/api/pricing/calculate','POST',{productId:'missing',cfg},404);
 }finally{app.store.readState=originalRead;}
 const cat=await app.store.get('cats',gift.cat);
 await request('/api/categories/'+gift.cat,'PATCH',{version:cat.version,data:{on:0}});
 await request('/api/pricing/calculate','POST',{productId:gift.id,cfg},422);
});
