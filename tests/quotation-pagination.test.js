'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const {createApp}=require('../server'),{testDatabase}=require('./database-helper');
async function fixture(t){
 const database=await testDatabase(),app=await createApp({...database,staticDir:path.resolve('public')});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();await database.destroy();});
 const base='http://127.0.0.1:'+app.server.address().port,password='Export-test-'+crypto.randomUUID();
 function client(){let cookie='',csrf='';return {raw:async(route,method,value,withCsrf=false)=>fetch(base+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json',...(withCsrf?{'X-CSRF-Token':csrf}:{})},body:JSON.stringify(value)}),async request(route,method='GET',value,status=200){const response=await fetch(base+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(value===undefined?{}:{'Content-Type':'application/json'})},...(value===undefined?{}:{body:JSON.stringify(value)})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const csv=response.headers.get('content-type')?.startsWith('text/csv'),data=csv?await response.text():await response.json();if(data.csrfToken)csrf=data.csrfToken;assert.equal(response.status,status,route+': '+JSON.stringify(data));return data;}};}
 const admin=client();await admin.request('/api/auth/setup','POST',{name:'Export Admin',username:'exportadmin',password,demo:false},201);
 const c1=(await admin.request('/api/customers','POST',{name:'தமிழ், "Customer"',co:'Company\nLine two',person:'Buyer',contactPersonPhone:'+442079460958',mob:'9876543210',wa:'+919876543210',email:'buyer@example.test',categoryId:'cc_other',customCategoryName:'Local club',addr:'One, "Street"\nSalem',deliveryAddresses:[{label:'Factory',line1:'First street',country:'India',isDefault:true},{label:'Store',line1:'Second street',country:'India'}]},201)).data;
 const c2=(await admin.request('/api/customers','POST',{name:'Second Customer',mob:'9876543211',categoryId:'cc_bni'},201)).data;
 const product=(await admin.request('/api/products','POST',{id:'export_product',code:'EXPORT1',name:'Export Product',cat:'c1',m:'unit',rate:100,tax:18,min:0,minQty:1,on:1,priceConfigured:true,f:[]},201)).data;
 const make=(customer=c1,extra={},session=admin)=>session.request('/api/quotations','POST',{cid:customer.id,date:'2026-11-01',valid:'2026-12-01',sales:'Export sales',items:[{pid:product.id,cfg:{qty:2}}],...extra},201);
 return {database,app,admin,client,password,c1,c2,product,make};
}
async function bulk(f,n){
 const q=(await f.make()).data;
 await f.app.db.prepare(`INSERT INTO quotations(id,number,customer_id,date,valid_until,status,salesperson,owner_id,total,body,version,position,updated_at)
 SELECT 'PageBulk'||i,'PAGE/'||i,?,date,valid_until,status,salesperson,owner_id,total,(body::jsonb||jsonb_build_object('id','PageBulk'||i,'no','PAGE/'||i))::text,1,i,updated_at FROM quotations CROSS JOIN generate_series(1,?) i WHERE id=?`).run(q.cid,n-1,q.id);
 return q;
}
const page=(f,query='')=>f.admin.request('/api/quotation-list'+(query?'?'+query:''));
test('page sizes 10/20/30/40 preserve position ordering and report exact ranges',async t=>{
 const f=await fixture(t);await bulk(f,83);
 for(const size of [10,20,30,40]){
  const first=await page(f,'pageSize='+size),last=await page(f,'pageSize='+size+'&page=999999999');
  assert.equal(first.data.length,size);assert.equal(first.pagination.page,1);assert.equal(first.pagination.total,83);assert.equal(first.pagination.from,1);assert.equal(first.pagination.to,size);
  assert.equal(last.pagination.page,Math.ceil(83/size));assert.equal(last.pagination.totalPages,Math.ceil(83/size));assert.equal(last.pagination.to,83);assert.equal(last.data.at(-1).no,'PAGE/82');
  const again=await page(f,'pageSize='+size);assert.deepEqual(first,again);
 }
 assert.equal((await page(f)).data.length,10);
});
test('invalid pages, sizes, duplicate keys, foreign scope parameters and invalid filters are rejected',async t=>{
 const f=await fixture(t);
 for(const query of ['page=0','page=-1','page=1.5','page=1e2','page=1000000000','pageSize=100','pageSize=0','pageSize=10&pageSize=20','status=Draft&status=Approved','tenantId=foreign','__proto__=ignored','from=2026-02-30','min=5&max=4',"q=bad%00",'customer[]=x'])await f.admin.request('/api/quotation-list?'+query,'GET',undefined,422);
 await f.admin.request('/api/quotation-list','POST',{},405);
});
test('empty and single-page sets remain navigable and deleted last pages clamp safely',async t=>{
 const f=await fixture(t),empty=await page(f,'page=999');assert.deepEqual(empty.pagination,{page:1,pageSize:10,total:0,totalPages:1,from:0,to:0});assert.deepEqual(empty.data,[]);
 await bulk(f,11);const last=await page(f,'page=2');assert.equal(last.data.length,1);await f.app.db.prepare('DELETE FROM quotations WHERE id=?').run(last.data[0].id);
 const clamped=await page(f,'page=2');assert.equal(clamped.pagination.page,1);assert.equal(clamped.pagination.total,10);assert.equal(clamped.pagination.totalPages,1);assert.equal(clamped.data.length,10);
});
test('all combined filters and stored GST totals match the export query across pages',async t=>{
 const f=await fixture(t),q=(await f.make(f.c1,{discountSource:'manual',disc:{t:'p',v:10}})).data;await f.make(f.c2,{date:'2026-10-31'});
 const filters={q:f.c1.name,status:'Draft',salesperson:'Export sales',customer:f.c1.id,from:'2026-11-01',to:'2026-11-01',min:'212.40',max:'212.40',customerCategory:'cc_other',product:f.product.id};
 const result=await page(f,new URLSearchParams(filters)),preview=await f.admin.request('/api/quotation-export/preview','POST',{filters});assert.equal(result.pagination.total,preview.rows);assert.deepEqual(result.data.map(q=>q.id),[q.id]);assert.equal(result.display[q.id].total,21240);assert.deepEqual(result.display[q.id].customer,{name:f.c1.name,co:f.c1.co});assert.equal(result.data[0].items.length,1);assert.deepEqual(result.data[0],q);
 for(const filters of [{q:'%'},{q:'_'},{q:"' OR 1=1 --"},{product:'foreign'},{status:'Cancelled'},{customer:f.c2.id,from:'2026-11-01'}])assert.equal((await page(f,new URLSearchParams(filters))).pagination.total,0);
});
test('owner access is enforced before counts and rows, customer categories require permission',async t=>{
 const f=await fixture(t),other=(await f.make()).data;
 const account=await f.admin.request('/api/users','POST',{name:'Page only',username:'pageonly',password:f.password,role:'Employee',permissions:['quotation.view_own','quotation.create']},201),employee=f.client();await employee.request('/api/auth/login','POST',{username:account.user.username,password:f.password});
 const own=(await f.make(f.c2,{},employee)).data,result=await employee.request('/api/quotation-list');assert.equal(result.pagination.total,1);assert.deepEqual(result.data.map(q=>q.id),[own.id]);assert.ok(!JSON.stringify(result).includes(other.id));assert.deepEqual(result.display[own.id].customer,{name:'',co:''});
 await employee.request('/api/quotation-list?customerCategory=cc_bni','GET',undefined,403);
 const account2=await f.admin.request('/api/users','POST',{name:'No pages',username:'nopages',password:f.password,role:'Employee',permissions:[]},201),none=f.client();await none.request('/api/auth/login','POST',{username:account2.user.username,password:f.password});await none.request('/api/quotation-list','GET',undefined,403);await f.client().request('/api/quotation-list','GET',undefined,401);
});
test('company databases never share counts or records',async t=>{
 const a=await fixture(t),b=await fixture(t),foreign=(await b.make()).data;assert.equal((await page(a)).pagination.total,0);assert.equal((await page(a,'customer='+foreign.cid)).data.length,0);assert.equal((await page(b)).pagination.total,1);
});
test('equal positions use ID tie breakers without missing or repeating records between pages',async t=>{
 const f=await fixture(t);await bulk(f,21);await f.app.db.exec('UPDATE quotations SET position=7');
 const expected=(await f.app.db.prepare('SELECT id FROM quotations ORDER BY position,id').all()).map(q=>q.id),seen=[];
 for(const number of [1,2,3])seen.push(...(await page(f,'page='+number)).data.map(q=>q.id));
 assert.deepEqual(seen,expected);assert.equal(new Set(seen).size,21);
});
test('concurrent deletion cannot split the page count, records and child snapshots',async t=>{
 const f=await fixture(t),q=await bulk(f,11);
 const writer=require('../server/database').connectDatabase(f.database),prepare=f.app.db.prepare;let removed=false;
 try{
  f.app.db.prepare=sql=>{const statement=prepare(sql);if(!sql.startsWith('SELECT count(*) AS total FROM ('))return statement;return {...statement,get:async(...values)=>{const result=await statement.get(...values);if(!removed){removed=true;await writer.prepare('DELETE FROM quotations WHERE id=?').run(q.id);}return result;}};};
  const snapshot=await page(f);assert.equal(snapshot.pagination.total,11);assert.equal(snapshot.pagination.page,1);assert.deepEqual(snapshot.data.find(row=>row.id===q.id),q);assert.equal(snapshot.data.find(row=>row.id===q.id).items.length,1);
  const current=await page(f,'page=2');assert.equal(current.pagination.total,10);assert.equal(current.pagination.page,1);assert.equal(current.data.length,10);
 }finally{f.app.db.prepare=prepare;await writer.close();}
});
test('repeated product lines and archived/renamed products keep historical page records readable',async t=>{
 const f=await fixture(t),q=(await f.make(f.c1,{items:[{pid:f.product.id,cfg:{qty:1}},{pid:f.product.id,cfg:{qty:2}}]})).data;
 const product=await f.admin.request('/api/products/'+f.product.id);await f.admin.request('/api/products/'+f.product.id,'PATCH',{version:product.version,data:{...product.data,name:'Renamed archived product',on:0}});
 const result=await page(f,'product='+f.product.id);assert.equal(result.pagination.total,1);assert.equal(result.data.length,1);assert.equal(result.data[0].items.length,2);assert.deepEqual(result.data[0],q);assert.equal(result.display[q.id].total,35400);
});
test('10,001 actual records use one snapshot and four bounded queries',async t=>{
 const f=await fixture(t),q=await bulk(f,10001);let statements=0,snapshots=0;
 const prepare=f.app.db.prepare,read=f.app.db.readTransaction;
 f.app.db.prepare=sql=>{if(/SELECT/.test(sql))statements++;return prepare(sql);};f.app.db.readTransaction=fn=>{snapshots++;return read(fn);};
 const started=performance.now(),result=await page(f,'page=1001'),elapsedMs=performance.now()-started;f.app.db.prepare=prepare;f.app.db.readTransaction=read;
 // Authentication makes its own queries; count only the explicit page transaction below.
 const executed=[];f.app.db.prepare=sql=>{const statement=prepare(sql);return {...statement,get:async(...values)=>{executed.push({sql,values});return statement.get(...values);},all:async(...values)=>{executed.push({sql,values});return statement.all(...values);}};};const direct=await require('../server/quotation-list').quotationPage(f.app.store,new URLSearchParams('pageSize=40&page=250'),{id:q.createdBy,role:'Administrator'});f.app.db.prepare=prepare;const queries=executed.length;assert.equal(queries,4);assert.equal(direct.data.length,40);
 assert.equal(result.pagination.total,10001);assert.equal(result.data.length,1);assert.equal(result.pagination.from,10001);assert.equal(snapshots,1);assert.ok(statements>=4);
 const selected=executed[1],plan=await prepare('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+selected.sql).all(...selected.values);
 const fs=require('node:fs');fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/quotation-pagination-performance.json',JSON.stringify({rows:10001,elapsedMs,statements,queries,directRows:direct?.data?.length,plan},null,2));
});
