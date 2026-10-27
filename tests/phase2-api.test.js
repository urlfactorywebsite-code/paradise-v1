'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createApp}=require('../server'),{testDatabase}=require('./database-helper');
const DP=require('../shared/domain');
async function fixture(t){
 const database=await testDatabase(),app=await createApp(database);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.close();await database.destroy()});
 const base=`http://127.0.0.1:${app.server.address().port}`;let cookie='',csrf='';
 async function request(route,method='GET',body,expected=200){const r=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const data=r.headers.get('content-type')?.includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer());if(data.csrfToken)csrf=data.csrfToken;assert.equal(r.status,expected,`${method} ${route}: ${Buffer.isBuffer(data)?'binary':JSON.stringify(data)}`);return data;}
 await request('/api/auth/setup','POST',{name:'Phase Two Admin',username:'phase2admin',password:'Fixture-'+crypto.randomUUID(),demo:true},201);
 return{request,app,database};
}
async function setup(request,id){const old=await request('/api/products/'+id),draft=DP.phase2Product(old.data);return request('/api/products/'+id,'PUT',{version:old.version,data:draft});}
function priceFlex(p){for(const[key,value,rate]of[['material','220 GSM',2],['printing','Solvent',3],['eyelets','Corners Only',1.5],['eyelets','Every 2 Feet',1.5],['eye','Ropes',3]]){const f=p.f.find(f=>f.k===key);f.o.find(o=>o[0]===value)[2]=rate;Object.assign(f.optionMeta[value],{enabled:true,approved:true});}p.f.find(f=>f.k==='eyelets').eyeletPolicy.approved=true;return p;}

test('Phase 2 HTTP A/C: Visiting Card configuration, required details, structured rules, edit, PDF and server pricing',async t=>{
 const {request}=await fixture(t),historic=await request('/api/quotations/Q1'),p=await setup(request,'p1');assert.equal(p.data.phase2,'visiting_card');assert.equal(p.data.compatibility.length,3);
 assert.deepEqual((await request('/api/quotations/Q1')).data.items,historic.data.items);
 let cfg={...DP.defCfg(p.data),fin:'Custom'};
 for(const route of['/api/pricing/calculate','/api/quotations/preview'])await request(route,'POST',route.includes('pricing')?{productId:'p1',cfg}:{cid:'C1',items:[{pid:'p1',cfg}]},422);
 await request('/api/pricing/calculate','POST',{productId:'p1',cfg:{...cfg,shape:'Square',customFinish:'OK'}},422);
 cfg={...cfg,customFinish:'FINISH-APPROVED',shape:'Custom',size:'Custom',w:3,h:2,u:'in'};
 const preview=await request('/api/quotations/preview','POST',{cid:'C1',items:[{pid:'p1',cfg}]}),created=await request('/api/quotations','POST',{data:{cid:'C1',items:[{id:'line',pid:'p1',cfg,sub:1,sp:['FORGED']}]}},201);
 assert.equal(created.data.items[0].sub,50000);assert.equal(DP.totals(created.data).grand,preview.totals.grand);assert.equal(created.data.items[0].cfg.customFinish,'FINISH-APPROVED');
 assert.ok((await request('/api/quotations/'+created.data.id+'/pdf')).toString('latin1').includes('FINISH-APPROVED'));
 const saved=await request('/api/quotations/'+created.data.id);cfg.customFinish='EDITED-FINISH';const edited=await request('/api/quotations/'+created.data.id,'PATCH',{version:saved.version,data:{items:[{id:'line',pid:'p1',cfg}]}});assert.equal(edited.data.items[0].cfg.customFinish,'EDITED-FINISH');assert.equal(edited.data.items[0].cfg.w,3);
 const repeat=await request('/api/products/p1','PUT',{version:p.version,data:DP.phase2Product(p.data)});assert.equal(repeat.data.compatibility.length,3);
});

test('Phase 2 HTTP B/D: approved Flex components, computed counts, historical snapshots, unavailable choices and repricing',async t=>{
 const {request}=await fixture(t),historic=await request('/api/quotations/Q2'),initial=await request('/api/products/p5'),original=structuredClone(initial.data),legacyDefault=structuredClone(initial.data);legacyDefault.f.find(f=>f.k==='material').default='Previous stock reference';await request('/api/products/p5','PUT',{version:initial.version,data:legacyDefault});let p=await setup(request,'p5');assert.equal(p.data.f.find(f=>f.k==='material').legacyTextDefault,'Previous stock reference');
 assert.deepEqual((await request('/api/quotations/Q2')).data.items,historic.data.items);
 await request('/api/pricing/calculate','POST',{productId:'p5',cfg:DP.defCfg(p.data)},422);
 p=await request('/api/products/p5','PUT',{version:p.version,data:priceFlex(structuredClone(p.data))});
 const cfg={...DP.defCfg(p.data),w:2,h:3,u:'ft',qty:2,eyelets:'Corners Only'};
 const calculated=await request('/api/pricing/calculate','POST',{productId:'p5',cfg});assert.equal(calculated.sub,37200);assert.equal(calculated.computed.eyelets.total,8);
 await request('/api/pricing/calculate','POST',{productId:'p5',cfg:{...cfg,fin:'Hemming & Eyelets'}},422);
 const preview=await request('/api/quotations/preview','POST',{cid:'C1',items:[{pid:'p5',cfg}]}),q=await request('/api/quotations','POST',{data:{cid:'C1',items:[{id:'flex-line',pid:'p5',cfg,sub:1,computed:{eyelets:{total:999}},notes:'PRIVATE-FLEX-NOTE'}]}},201);
 assert.equal(q.data.items[0].sub,37200);assert.equal(q.data.items[0].computed.eyelets.total,8);assert.equal(DP.totals(q.data).grand,preview.totals.grand);
 const pdf=(await request('/api/quotations/'+q.data.id+'/pdf')).toString('latin1');assert.ok(pdf.includes('8 eyelets'));assert.ok(!pdf.includes('PRIVATE-FLEX-NOTE'));
 const changed=structuredClone(p.data);changed.f.find(f=>f.k==='material').optionMeta['220 GSM'].enabled=false;await request('/api/products/p5','PUT',{version:p.version,data:changed});
 const saved=await request('/api/quotations/'+q.data.id);const unchanged=await request('/api/quotations/'+q.data.id,'PATCH',{version:saved.version,data:{subject:'Historical rate preserved'}});assert.deepEqual(unchanged.data.items,q.data.items);
 await request('/api/pricing/calculate','POST',{productId:'p5',cfg},422);await request('/api/quotations/'+q.data.id+'/reprice','POST',{version:unchanged.version},422);
 // Historical edits retain snapshots, but a new duplicate must have currently available approved options.
 await request('/api/quotations/'+q.data.id+'/duplicate','POST',{version:unchanged.version},422);assert.deepEqual((await request('/api/quotations/'+q.data.id)).data.items,q.data.items);
 assert.equal((await request('/api/ready')).schemaVersion,6);
 let current=await request('/api/products/p5');const extended=structuredClone(current.data),longKey='B'.repeat(200),fin=extended.f.find(f=>f.k==='fin');fin.o.push([longKey,'f',0]);fin.optionMeta[longKey]={label:'Long-key bundle fixture',enabled:true,approved:true,includesEyelets:true};current=await request('/api/products/p5','PUT',{version:current.version,data:extended});current=await request('/api/products/p5','PUT',{version:current.version,data:current.data});
 const restored=await request('/api/products/p5','PUT',{version:current.version,data:original});assert.equal(restored.data.phase2,undefined);assert.deepEqual((await request('/api/quotations/'+q.data.id)).data.items,q.data.items);assert.deepEqual((await request('/api/quotations/Q2')).data.items,historic.data.items);
});

test('Phase 2 HTTP validation: malformed approval, geometry, policy, contradictions and invalid references are rejected',async t=>{
 const {request}=await fixture(t),p=await setup(request,'p5');
 for(const mutate of[
  x=>x.f.find(f=>f.k==='material').optionMeta['220 GSM'].approved=true,
  x=>x.f.find(f=>f.k==='material').optionMeta['220 GSM'].enabled='yes',
  x=>x.f.find(f=>f.k==='eyelets').eyeletPolicy.corners=5,
  x=>x.f.find(f=>f.k==='material').when={key:'type',equals:'Star Flex'},
  x=>x.compatibility.push({when:{key:'material',equals:'Missing'},field:'eye',allowed:['None']}),
  x=>x.compatibility.push({when:{key:'fin',equals:'Hemming & Eyelets'},field:'eyelets',allowed:['Corners Only']}),
 ]){const bad=structuredClone(p.data);mutate(bad);await request('/api/products/p5','PUT',{version:p.version,data:bad},422);}
 const c=await setup(request,'p1'),bad=structuredClone(c.data);bad.f.find(f=>f.k==='size').optionMeta[bad.f.find(f=>f.k==='size').o[0][0]].geometry={w:-1,h:2,u:'in'};await request('/api/products/p1','PUT',{version:c.version,data:bad},422);
 const state=await request('/api/state'),invalid=structuredClone(p.data);invalid.f.find(f=>f.k==='material').required=false;
 await request('/api/changes','POST',{revision:state.revision,changes:[{collection:'products',action:'upsert',id:'p5',record:invalid}]},422);
 const replacement=structuredClone(state.state);replacement.products[replacement.products.findIndex(x=>x.id==='p5')]=invalid;await request('/api/state','PUT',{revision:state.revision,state:replacement},422);assert.equal((await request('/api/state')).revision,state.revision);
 assert.equal((await request('/api/catalog')).products.find(x=>x.id==='p5').phase2,'flex');
});

test('Phase 2 HTTP permissions: rate/policy approval and catalog labels retain independent authorization',async t=>{
 const {request}=await fixture(t);let p=await setup(request,'p5');const password='Access-'+crypto.randomUUID();
 for(const[username,permissions]of[['phase2catalog',['product.view','product.manage']],['phase2pricing',['product.view','pricing.view','pricing.manage']]])await request('/api/users','POST',{name:username,username,password,role:'Employee',permissions},201);
 await request('/api/auth/login','POST',{username:'phase2catalog',password});let changed=structuredClone(p.data);changed.f.find(f=>f.k==='material').optionMeta['220 GSM'].approved=true;changed.f.find(f=>f.k==='material').o[0][2]=2;await request('/api/products/p5','PATCH',{version:p.version,data:{f:changed.f}},403);
 const unmarked=structuredClone(p.data);delete unmarked.phase2;await request('/api/products/p5','PUT',{version:p.version,data:unmarked},403);
 changed=structuredClone(p.data);delete changed.f.find(f=>f.k==='eye').optionMeta.Ropes.quantityKey;await request('/api/products/p5','PATCH',{version:p.version,data:{f:changed.f}},403);
 changed=structuredClone(p.data);changed.f.find(f=>f.k==='material').optionMeta['220 GSM'].label='Display name only';p=await request('/api/products/p5','PATCH',{version:p.version,data:{f:changed.f}});
 await request('/api/auth/login','POST',{username:'phase2pricing',password});p=await request('/api/products/p5');changed=structuredClone(p.data);changed.f.find(f=>f.k==='material').o[0][2]=2;changed.f.find(f=>f.k==='material').optionMeta['220 GSM'].approved=true;changed.f.find(f=>f.k==='eyelets').eyeletPolicy.approved=true;p=await request('/api/products/p5','PATCH',{version:p.version,data:{f:changed.f}});
 changed=structuredClone(p.data);changed.f.find(f=>f.k==='material').optionMeta['220 GSM'].label='Forbidden rename';await request('/api/products/p5','PATCH',{version:p.version,data:{f:changed.f}},403);
});
