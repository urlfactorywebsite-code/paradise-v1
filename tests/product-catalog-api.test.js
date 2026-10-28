'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createApp}=require('../server'),{testDatabase}=require('./database-helper');
const DP=require('../shared/domain'),Readiness=require('../shared/pricing-readiness');
async function fixture(t){
 const db=await testDatabase(),app=await createApp(db);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();await db.destroy();});
 const base='http://127.0.0.1:'+app.server.address().port,password='Catalog-'+crypto.randomUUID();
 function client(){let cookie='',csrf='';return{async request(route,method='GET',body,status=200){const response=await fetch(base+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const data=await response.json();if(data.csrfToken)csrf=data.csrfToken;assert.equal(response.status,status,route+': '+JSON.stringify(data));return data;}};}
 const admin=client();await admin.request('/api/auth/setup','POST',{name:'Catalog QA',username:'catalogqa',password,demo:true},201);await admin.request('/api/state','PUT',await admin.request('/api/state'));
 const user=async(name,permissions)=>{const {user}=await admin.request('/api/users','POST',{name,username:name,password,role:'Employee',permissions},201),account=client();await account.request('/api/auth/login','POST',{username:name,password});return{account,user};};
 return{app,admin,user,client};
}
const route='/api/products?view=catalog';
test('Catalog readiness distinguishes approved free choices, partial approvals, disabled choices and inactive status',async t=>{
 const {admin}=await fixture(t);
 const p=await admin.request('/api/products','POST',{data:{code:'READINESS-FIXTURE',name:'Readiness fixture',cat:'c1',m:'unit',rate:0,tax:18,taxMode:'exempt',min:0,on:0,priceConfigured:true,f:[{k:'choice',l:'Required choice',t:'sel',required:true,o:[['Free','f',0],['Pending','f',null]],optionMeta:{Free:{enabled:true,approved:true},Pending:{enabled:true,approved:false}}}]}},201);
 let row=(await admin.request(route+'&q=READINESS-FIXTURE')).data[0];assert.equal(row.configurationReady,true);assert.equal(row.pricingReady,true);assert.equal(row.ready,false);assert.equal(row.tax,18);assert.equal(row.taxMode,'exempt');
 let record=await admin.request('/api/products/'+p.data.id),f=structuredClone(record.data.f);f[0].optionMeta.Free.approved=false;
 await admin.request('/api/products/'+p.data.id,'PATCH',{version:record.version,data:{f}});
 row=(await admin.request(route+'&q=READINESS-FIXTURE')).data[0];assert.equal(row.configurationReady,true);assert.equal(row.pricingReady,false);
 record=await admin.request('/api/products/'+p.data.id);await admin.request('/api/products/'+p.data.id,'PATCH',{version:record.version,data:{on:1}},422);
 f[0].optionMeta.Free.enabled=false;f[0].optionMeta.Pending.enabled=false;
 await admin.request('/api/products/'+p.data.id,'PATCH',{version:record.version,data:{f}});
 // The canonical generic-product contract classifies unavailable approved choices under pricing.
 row=(await admin.request(route+'&q=READINESS-FIXTURE')).data[0];assert.equal(row.configurationReady,true);assert.equal(row.pricingReady,false);
 const attention=await admin.request(route+'&q=READINESS-FIXTURE&readiness=attention');assert.equal(attention.pagination.total,1);
});
test('Catalog projection uses all real products, canonical eligibility, unique attention and no writes',async t=>{
 const {app,admin}=await fixture(t),s=(await admin.request('/api/state')).state,before=await app.db.prepare('SELECT revision,settings FROM workspace').get(),quotes=structuredClone(s.quotes);
 const result=await admin.request(route+'&pageSize=100');assert.equal(result.summary.total,s.products.length);
 assert.equal(result.summary.attention,s.products.filter(p=>!p.on||!Readiness.eligibility(p,s.set,s.cats).eligible).length);
 for(const row of result.data){const p=s.products.find(p=>p.id===row.id),e=Readiness.eligibility(p,s.set,s.cats);assert.equal(row.ready,!!p.on&&e.eligible);assert.equal(row.tax,p.tax);assert.equal(row.taxMode,p.taxMode??'exclusive');assert.equal(row.category,s.cats.find(c=>c.id===p.cat).name);assert.equal(Object.hasOwn(row,'f'),false);assert.equal(Object.hasOwn(row,'rate'),false);}
 assert.deepEqual(await app.db.prepare('SELECT revision,settings FROM workspace').get(),before);assert.deepEqual((await admin.request('/api/state')).state.quotes,quotes);
 assert.ok((await admin.request('/api/products?pageSize=5')).data.every(p=>Array.isArray(p.f))); // Legacy API unchanged.
});
test('Catalog search is trimmed name/code only; filters AND together; paging and validation are bounded',async t=>{
 const {admin}=await fixture(t),all=await admin.request(route+'&pageSize=100'),p=all.data.find(p=>p.on),s=(await admin.request('/api/state')).state;
 const found=await admin.request(route+'&q='+encodeURIComponent('  '+p.code.toLowerCase()+'  ')+'&category='+p.cat+'&active=1');assert.equal(found.pagination.total,1);assert.equal(found.data[0].id,p.id);assert.deepEqual(found.summary,all.summary);
 assert.equal((await admin.request(route+'&q='+encodeURIComponent(p.code)+'&active=0')).pagination.total,0);
 assert.equal((await admin.request(route+'&q=Internal%20Notes')).pagination.total,0);
 for(const [filter,predicate]of [['ready',r=>r.ready],['attention',r=>!r.ready],['configuration',r=>!r.configurationReady],['pricing',r=>!r.pricingReady]]){const r=await admin.request(route+'&pageSize=100&readiness='+filter);assert.deepEqual(r.data.map(r=>r.id),all.data.filter(predicate).map(r=>r.id));}
 const end=await admin.request(route+'&pageSize=10&page=999');assert.equal(end.pagination.page,4);assert.equal(end.data.length,10);assert.equal(new Set(all.data.map(r=>r.id)).size,s.products.length);
 for(const suffix of ['&pageSize=101','&page=0','&active=yes','&readiness=made-up','&q='+('a'.repeat(201))])await admin.request(route+suffix,'GET',undefined,422);
});
test('Catalog future products cross batch boundaries; zero approved prices stay ready; category state and pending rates stay distinct',async t=>{
 const {admin}=await fixture(t),snapshot=await admin.request('/api/state');for(let i=0;i<115;i++)snapshot.state.products.push({id:'future'+i,code:'FUTURE-'+i,name:'Future '+String(i).padStart(3,'0'),cat:'c1',m:'unit',rate:0,min:0,minQty:1,tax:0,on:i===114?0:1,priceConfigured:true,f:[],tiers:null});await admin.request('/api/state','PUT',snapshot);
 const r=await admin.request(route+'&q=future&pageSize=100');assert.equal(r.pagination.total,115);assert.equal(r.data.length,100);assert.ok(r.data.every(p=>p.configurationReady&&p.pricingReady&&p.ready));
 const last=await admin.request(route+'&q=future&pageSize=100&page=2');assert.equal(last.data.length,15);assert.equal(new Set([...r.data,...last.data].map(p=>p.id)).size,115);assert.equal(last.data.at(-1).ready,false);assert.equal(last.data.at(-1).pricingReady,true);
 const p=await admin.request('/api/products/future0');await admin.request('/api/products/future0','PATCH',{version:p.version,data:{on:0,rate:null,priceConfigured:false}});
 const pending=(await admin.request(route+'&q=FUTURE-0')).data[0];assert.equal(pending.configurationReady,true);assert.equal(pending.pricingReady,false);
 const cat=await admin.request('/api/categories/c1');await admin.request('/api/categories/c1','PATCH',{version:cat.version,data:{on:0}});
 assert.equal((await admin.request(route+'&q=FUTURE-1')).data[0].configurationReady,false);
});
test('Catalog read permissions and price restrictions are enforced; forged edits fail independently of UI',async t=>{
 const {admin,user,client}=await fixture(t);await client().request(route,'GET',undefined,401);
 const denied=await user('nocatalog',[]);await denied.account.request(route,'GET',undefined,403);
 const limited=await user('catalogreadonly',['product.view']);const page=await limited.account.request(route+'&pageSize=100');assert.equal(page.summary.total,40);assert.ok(page.data.every(p=>p.tax===null&&p.pricingVisible===false));assert.ok(!JSON.stringify(page).includes('pricingApproval'));
 const p=await admin.request('/api/products/p1');for(const method of ['PATCH','DELETE'])await limited.account.request('/api/products/p1',method,{version:p.version,data:{name:'Forged'}},403);
 const manager=await user('catalogmanager',['product.view','product.manage']);await manager.account.request('/api/products/p1','PATCH',{version:p.version,data:{rate:12345}},403);assert.deepEqual((await admin.request('/api/products/p1')).data,p.data);
});
test('Catalog read refresh reflects price/status/removal changes without changing saved quotation snapshots',async t=>{
 const {admin}=await fixture(t),before=(await admin.request('/api/state')).state.quotes;
 let p=await admin.request('/api/products/p2');await admin.request('/api/products/p2','PATCH',{version:p.version,data:{rate:0,tax:0,on:0}});
 const row=(await admin.request(route+'&q='+encodeURIComponent(p.data.code))).data[0];assert.equal(row.pricingReady,true);assert.equal(row.on,false);assert.equal(row.tax,0);assert.equal(row.ready,false);
 p=await admin.request('/api/products/p2');await admin.request('/api/products/p2','DELETE',{version:p.version});assert.equal((await admin.request(route)).summary.total,39);assert.deepEqual((await admin.request('/api/state')).state.quotes,before);assert.ok(before.some(q=>q.items.some(i=>i.pid==='p2')));
 assert.equal(DP.totals(before[0]).grand,DP.totals((await admin.request('/api/quotations/'+before[0].id)).data).grand);
});
