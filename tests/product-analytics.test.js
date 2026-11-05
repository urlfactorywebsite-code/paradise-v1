'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createApp}=require('../server'),{testDatabase}=require('./database-helper'),{createStore}=require('../server/store'),DP=require('../shared/domain');
const endpoint='/api/reports/product-performance';
async function fixture(t){
 const database=await testDatabase(),app=await createApp(database);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await app.close();await database.destroy();});
 const base='http://127.0.0.1:'+app.server.address().port,password='Analytics-'+crypto.randomUUID();
 function client(){let cookie='',csrf='';return {async request(route,method='GET',data,status=200,destination=base){const r=await fetch(destination+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const body=await r.json();if(body.csrfToken)csrf=body.csrfToken;assert.equal(r.status,status,route+': '+JSON.stringify(body));return body;}};}
 const admin=client(),setup=await admin.request('/api/auth/setup','POST',{name:'Analytics owner',username:'analyticsowner',password,demo:false},201);
 for(const [id,name,cat,rate]of [['analytics_a','Original A','c1',100],['analytics_b','Original B','c2',50]])await admin.request('/api/products','POST',{id,code:id,name,cat,m:'unit',rate,tax:18,min:0,minQty:1,on:1,priceConfigured:true,f:[]},201);
 const a=(await admin.request('/api/customers','POST',{name:'Customer A',mob:'9876543201'},201)).data,b=(await admin.request('/api/customers','POST',{name:'Customer B',mob:'9876543202'},201)).data;
 const account=await admin.request('/api/users','POST',{username:'analyticsstaff',name:'Analytics staff',password,role:'Employee'},201),staff=client();await staff.request('/api/auth/login','POST',{username:'analyticsstaff',password});
 const item=(pid='analytics_a',qty=1)=>({pid,cfg:{qty}});
 const quote=async(changes={},user=admin)=>(await user.request('/api/quotations','POST',{cid:a.id,date:'2026-01-31',valid:'2026-12-31',items:[item()],...changes},201));
 return {database,app,base,admin,staff,staffId:account.user.id,adminId:setup.user.id,client,password,a,b,item,quote};
}
test('product analytics distinguishes quotations, repeated lines, quantities and discounted values across zero-filled months',async t=>{
 const f=await fixture(t);
 await f.quote({items:[f.item('analytics_a',3),f.item('analytics_a',2),f.item('analytics_b')],disc:{t:'p',v:10},discountSource:'manual'});
 await f.quote({date:'2026-02-01',items:[f.item(),f.item('analytics_b',4)]},f.staff);
 const report=await f.admin.request(endpoint+'?from=2026-01-01&to=2026-03-31');
 assert.deepEqual(report.periods,['2026-01','2026-02','2026-03']);assert.deepEqual(report.series.map(s=>s.values),[[1,1,0],[1,1,0]]);
 assert.deepEqual(report.totals,{quotationCount:2,lineItemCount:5,quantity:11,quotedValue:93810,productQuotationCount:4,legacyCategoryLines:0,unknownCategoryLines:0});
 const janA=report.monthly.find(r=>r.productId==='analytics_a'&&r.period==='2026-01');assert.deepEqual([janA.quotationCount,janA.lineItemCount,janA.quantity,janA.quotedValue],[1,2,5,53100]);
 const quantity=await f.admin.request(endpoint+'?year=2026&metric=quantity');assert.deepEqual(quantity.series[0].values.slice(0,3),[5,1,0]);
 const value=await f.admin.request(endpoint+'?year=2026&metric=quotedValue');assert.deepEqual(value.series[0].values.slice(0,3),[53100,11800,0]);assert.equal(value.moneyUnit,'paise');
 const zero=await f.admin.request(endpoint+'?year=2025&productIds=analytics_a,analytics_b');assert.equal(zero.periods.length,12);assert.equal(zero.products.length,2);assert.ok(zero.series.every(s=>s.values.every(v=>v===0)));
});
test('product analytics filters compose consistently, include inclusive date boundaries, leap days and owner identity',async t=>{
 const f=await fixture(t);let first=await f.quote({items:[f.item('analytics_a',2),f.item('analytics_b',2)],disc:{t:'f',v:1},discountSource:'manual'});
 first=await f.admin.request('/api/quotations/'+first.data.id+'/status','POST',{version:first.version,status:'Pending Internal Review'});
 await f.quote({date:'2026-02-01',cid:f.b.id},f.staff);await f.quote({date:'2024-02-29',valid:'2024-03-01'},f.staff);
 const byCategory=await f.admin.request(endpoint+'?year=2026&categoryIds=c1&month=1');assert.equal(byCategory.products.length,1);assert.equal(byCategory.totals.quotedValue,23521);assert.deepEqual(byCategory.periods,['2026-01']);
 const scoped=await f.admin.request(endpoint+'?year=2026&from=2026-02-01&to=2026-02-01&productIds=analytics_a&customerId='+f.b.id+'&employeeId='+f.staffId+'&status=Draft');assert.equal(scoped.totals.quotationCount,1);assert.equal(scoped.totals.quantity,1);
 assert.equal((await f.admin.request(endpoint+'?year=2026&status=Pending%20Internal%20Review')).totals.quotationCount,1);
 assert.equal((await f.admin.request(endpoint+'?from=2024-02-29&to=2024-02-29')).totals.quotationCount,1);
 assert.equal((await f.admin.request(endpoint+'?from=2024-03-01&to=2024-03-01')).totals.quotationCount,0);
 assert.deepEqual((await f.admin.request(endpoint+'?from=2026-12-01&to=2027-01-31')).periods,['2026-12','2027-01']);
 const conflicting=await f.admin.request(endpoint+'?from=2026-01-01&to=2026-12-31&year=2025');assert.deepEqual(conflicting.periods,[]);assert.equal(conflicting.totals.quotationCount,0);
});
test('canonical product values conserve net taxable value, inclusive grouping and legacy/exact rounding without double discount',()=>{
 const item=(sub,tax,taxMode)=>({id:crypto.randomUUID(),pid:'x',sub,base:sub,qty:1,tax,taxMode});
 const mixed={items:[item(101,18,'exclusive'),item(118,18,'inclusive'),item(99,0,'exempt')],disc:{t:'p',v:12.34},discountSource:'category',calculationVersion:2,del:1,oth:0,chargeTax:18};
 assert.deepEqual(DP.itemQuotedValues(mixed),[89,87,87]);assert.equal(DP.totals(mixed).taxable,363);
 const inclusive={items:[item(11800,18,'inclusive')],disc:{t:'p',v:0},calculationVersion:2,del:1.18,chargeTax:18,chargeTaxMode:'inclusive'};assert.deepEqual(DP.itemQuotedValues(inclusive),[10000]);
 for(const version of [undefined,2])for(let n=0;n<200;n++){
  const quote={items:[item(101+n,2.3,'inclusive'),item(1003+n,18,'exclusive'),item(87+n,0,'exempt')],disc:{t:'p',v:n%101},calculationVersion:version,del:0,oth:0};
  assert.equal(DP.itemQuotedValues(quote).reduce((a,b)=>a+b,0),DP.totals(quote).taxable);
 }
 assert.deepEqual(DP.itemQuotedValues({...mixed,disc:{t:'p',v:100}}),[0,0,0]);
});
test('product analytics preserves quoted names and category snapshots through rename, archival, recategorization and deletion',async t=>{
 const f=await fixture(t),q=await f.quote();let p=await f.admin.request('/api/products/analytics_a');
 p=await f.admin.request('/api/products/analytics_a','PATCH',{version:p.version,data:{name:'Renamed A',cat:'c2',on:0}});
 let data=await f.admin.request(endpoint+'?year=2026&categoryIds=c1');assert.equal(data.products[0].label,'Original A');assert.equal(data.totals.quotationCount,1);
 await f.admin.request('/api/quotations/'+q.data.id,'PATCH',{version:q.version,data:{project:'Metadata edit'}});
 data=await f.admin.request(endpoint+'?year=2026&categoryIds=c1');assert.equal(data.totals.quotationCount,1);
 await f.admin.request('/api/products/analytics_a','DELETE',{version:p.version});data=await f.admin.request(endpoint+'?year=2026');assert.equal(data.products[0].label,'Original A');assert.equal(data.totals.quotedValue,11800);
});
test('new quotation snapshots retain historical names alongside later names under the same stable product ID',async t=>{
 const f=await fixture(t);await f.quote();const p=await f.admin.request('/api/products/analytics_a');await f.admin.request('/api/products/analytics_a','PATCH',{version:p.version,data:{name:'Later A'}});await f.admin.request('/api/customers/'+f.a.id,'PATCH',{version:1,data:{name:'Later customer A'}});await f.quote({date:'2026-02-01'});
 const data=await f.admin.request(endpoint+'?year=2026');assert.equal(data.products.length,1);assert.equal(data.products[0].label,'Later A');assert.deepEqual(data.products[0].names,['Later A','Original A']);assert.deepEqual(data.monthly.map(r=>r.names),[['Original A'],['Later A']]);
 const january=await f.admin.request(endpoint+'?from=2026-01-01&to=2026-01-31&productIds=analytics_a');assert.equal(january.products[0].label,'Original A');assert.deepEqual(january.products[0].names,['Original A']);
 assert.equal(data.options.products[0].label,'Later A');assert.equal(january.options.products[0].label,'Later A');assert.equal(january.options.customers[0].label,'Later customer A');
});
test('report authorization and filter options cannot broaden own scope or cross company databases',async t=>{
 const f=await fixture(t),other=await fixture(t);await f.quote();await f.quote({},f.staff);
 const own=await f.staff.request(endpoint+'?year=2026');assert.equal(own.scope,'own');assert.equal(own.totals.quotationCount,1);assert.deepEqual(own.options.employees.map(e=>e.id),[f.staffId]);
 await f.staff.request(endpoint+'?employeeId='+f.adminId,'GET',undefined,403);await f.client().request(endpoint,'GET',undefined,401);
 await f.admin.request('/api/users/'+f.staffId,'PATCH',{version:1,permissions:['quotation.view_all']});await f.staff.request(endpoint,'GET',undefined,401);await f.staff.request('/api/auth/login','POST',{username:'analyticsstaff',password:f.password});await f.staff.request(endpoint,'GET',undefined,403);
 assert.equal((await other.admin.request(endpoint+'?year=2026')).totals.quotationCount,0);
 await f.admin.request(endpoint,'GET',undefined,401,other.base);
});
test('analytics validates all parameters, product/month limits and unknown IDs without enumeration',async t=>{
 const f=await fixture(t);
 for(const query of ['from=2026-02-30','from=2026-02-01&to=2026-01-01','from=2020-01-01&to=2026-01-01','year=99','month=13','month=1.5','metric=total;DROP','grouping=day','status=Unknown','employeeId=x%27OR%201=1','productIds=x%00','categoryIds=','tenant_id=other','from=2026-01-01&from=2026-01-02','productIds='+Array.from({length:51},(_,i)=>'p'+i).join(',')])await f.admin.request(endpoint+'?'+query,'GET',undefined,422);
 const empty=await f.admin.request(endpoint+'?year=2026&productIds=UnknownId');assert.equal(empty.products.length,0);assert.equal(empty.totals.quotationCount,0);assert.equal(empty.periods.length,12);
});
test('analytics projection updates atomically with discount edits and cascades with quotation deletion',async t=>{
 const f=await fixture(t);let q=await f.quote();q=await f.admin.request('/api/quotations/'+q.data.id,'PATCH',{version:q.version,data:{disc:{t:'p',v:50},discountSource:'manual'}});
 assert.equal((await f.admin.request(endpoint+'?year=2026')).totals.quotedValue,5900);
 const before=await f.admin.request('/api/state'),prepare=f.app.db.prepare;
 f.app.db.prepare=sql=>sql.startsWith('INSERT INTO quotation_item_analytics')?{run:async()=>{throw Error('Injected analytics failure');}}:prepare(sql);
 try{await f.quote({}, {request:(route,method,data)=>f.admin.request(route,method,data,500)});}finally{f.app.db.prepare=prepare;}
 assert.equal((await f.admin.request('/api/state')).revision,before.revision);assert.equal((await f.admin.request(endpoint+'?year=2026')).totals.quotedValue,5900);
 await f.admin.request('/api/quotations/'+q.data.id,'DELETE',{version:q.version});assert.equal((await f.app.db.prepare('SELECT count(*) AS n FROM quotation_item_analytics').get()).n,0);
});
test('schema 8 analytics backfill and failure rollback preserve historical quotation bodies, versions and amounts',async t=>{
 const f=await fixture(t);await f.quote({disc:{t:'p',v:12.34},discountSource:'manual'});
 const db=f.app.db,before=await db.prepare('SELECT id,body,version,total,updated_at FROM quotations ORDER BY id').all(),items=await db.prepare('SELECT * FROM quotation_items ORDER BY id').all();
 await db.exec('DROP TABLE product_field_bindings;DROP TABLE field_configuration_audit_logs,configurable_field_options,configurable_fields,field_configuration_state;DROP FUNCTION preserve_field_configuration_identity();DROP TABLE quotation_item_analytics;DROP INDEX quotation_items_product_quotation;DELETE FROM schema_migrations WHERE version>=9');
 const prepare=db.prepare;db.prepare=sql=>sql.startsWith('INSERT INTO quotation_item_analytics')?{run:async()=>{throw Error('Injected backfill failure');}}:prepare(sql);
 try{await assert.rejects(createStore(db),/Injected backfill failure/);}finally{db.prepare=prepare;}
 assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n,8);assert.equal((await db.prepare("SELECT to_regclass('quotation_item_analytics') AS name").get()).name,null);
 await createStore(db);await createStore(db);assert.deepEqual(await db.prepare('SELECT id,body,version,total,updated_at FROM quotations ORDER BY id').all(),before);assert.deepEqual(await db.prepare('SELECT * FROM quotation_items ORDER BY id').all(),items);
 const data=await f.admin.request(endpoint+'?year=2026');assert.equal(data.totals.quotedValue,10344);assert.equal(data.totals.legacyCategoryLines,1);
});
test('large datasets aggregate in a constant number of queries without loading quotation records',async t=>{
 const f=await fixture(t),q=await f.quote({items:[f.item(),f.item()]}),db=f.app.db;
 const original=await db.prepare('SELECT * FROM quotations WHERE id=?').get(q.data.id),line=await db.prepare('SELECT body FROM quotation_items WHERE quotation_id=? ORDER BY position LIMIT 1').get(q.data.id),net=DP.itemQuotedValues(q.data)[0],gross=DP.itemQuotedGrossValues(q.data)[0];
 await db.prepare(`INSERT INTO quotations(id,number,customer_id,date,valid_until,status,salesperson,total,body,version,position,updated_at,owner_id)
 SELECT 'large_'||n,'ANALYTICS/LARGE/'||n,?, '2026-'||lpad(((n%12)+1)::text,2,'0')||'-15',?,'Draft',?, ?, (?::jsonb||jsonb_build_object('id','large_'||n))::text,1,n,?,? FROM generate_series(1,3000)n`).run(original.customer_id,original.valid_until,original.salesperson,original.total,original.body,original.updated_at,original.owner_id);
 await db.prepare(`INSERT INTO quotation_items SELECT q.id,'line_'||n,'analytics_a',1,10000,(?::jsonb||jsonb_build_object('id','line_'||n))::text,n FROM quotations q CROSS JOIN generate_series(1,2)n WHERE q.id LIKE 'large_%'`).run(line.body);
 await db.prepare(`INSERT INTO quotation_item_analytics SELECT quotation_id,id,'c1','Graphic Designing','saved',?,? FROM quotation_items WHERE quotation_id LIKE 'large_%'`).run(net,gross);
 const get=f.app.store.get,read=f.app.store.readState,prepare=db.prepare,queries=[];f.app.store.get=f.app.store.readState=async()=>{throw Error('No full quotation reads in analytics.');};db.prepare=sql=>{const statement=prepare(sql);if(!sql.startsWith('WITH '))return statement;return Object.fromEntries(Object.entries(statement).map(([method,execute])=>[method,async(...values)=>{queries.push({sql,values});return execute(...values);}]))};
 let data;const start=Date.now();try{data=await f.admin.request(endpoint+'?year=2026');}finally{f.app.store.get=get;f.app.store.readState=read;db.prepare=prepare;}
 const queryDurationMs=Date.now()-start;
 assert.equal(data.totals.quotationCount,3001);assert.equal(data.totals.lineItemCount,6002);assert.equal(data.totals.quotedValue,70823600);assert.equal(queries.length,4);assert.ok(queryDurationMs<15000);assert.equal(data.monthly.length,12);
 await f.quote({items:[f.item('analytics_b')]});await db.exec('ANALYZE quotation_items;ANALYZE quotations;ANALYZE quotation_item_analytics');
 const plan=await db.prepare("EXPLAIN (FORMAT JSON) SELECT i.id FROM quotation_items i JOIN quotations q ON q.id=i.quotation_id WHERE i.product_id=? AND q.date>=? AND q.date<=?").all('analytics_b','2026-01-01','2026-12-31');assert.ok(JSON.stringify(plan).includes('quotation_items_product_quotation'));
 const categoryPlan=await db.prepare("EXPLAIN (FORMAT JSON) SELECT a.item_id FROM quotation_item_analytics a JOIN quotations q ON q.id=a.quotation_id WHERE a.category_id=? AND q.date>=? AND q.date<=?").all('c2','2026-01-01','2026-12-31');assert.ok(JSON.stringify(categoryPlan).includes('quotation_item_analytics_category'));
 const plans=[];for(const query of queries){const result=await prepare('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+query.sql).all(...query.values);plans.push(result[0]['QUERY PLAN'][0]);}
 const selectivePlans={};
 for(const [name,filter,index]of [['product','productIds=analytics_b','quotation_items_product_quotation'],['category','categoryIds=c2','quotation_item_analytics_category']]){
  const captured=[];db.prepare=sql=>{const statement=prepare(sql);if(!sql.startsWith('WITH '))return statement;return Object.fromEntries(Object.entries(statement).map(([method,execute])=>[method,async(...values)=>{captured.push({sql,values});return execute(...values);}]))};
  let filtered;try{filtered=await f.admin.request(endpoint+'?year=2026&'+filter);}finally{db.prepare=prepare;}
  assert.equal(filtered.totals.quotationCount,1);assert.equal(filtered.totals.quotedValue,5900);
  selectivePlans[name]=[];for(const query of captured.slice(0,3)){const result=await prepare('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+query.sql).all(...query.values);selectivePlans[name].push(result[0]['QUERY PLAN'][0]);}
  assert.ok(selectivePlans[name].every(plan=>JSON.stringify(plan).includes(index)),'actual '+name+' report queries use selective index');
 }
 const fs=require('node:fs');fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/product-analytics-performance.json',JSON.stringify({quotationCount:3001,lineItemCount:6002,queryCount:queries.length,queryDurationMs,productIndexUsed:true,categoryIndexUsed:true},null,2));
 fs.writeFileSync('test-results/product-analytics-review-query-plans.json',JSON.stringify(plans,null,2));
 fs.writeFileSync('test-results/product-analytics-review-selective-plans.json',JSON.stringify(selectivePlans,null,2));
});

// Missing catalog rows are legitimate historical data; never substitute names.
test('All Products refuses excess chart series and selected missing-master products retain their quoted identity',async t=>{
 const f=await fixture(t),q=await f.quote({items:Array.from({length:51},()=>f.item())});
 await f.app.db.prepare("UPDATE quotation_items SET product_id='removed_'||position,body=(body::jsonb||jsonb_build_object('pid','removed_'||position,'name','Historical product '||position))::text WHERE quotation_id=?").run(q.data.id);
 const limited=await f.admin.request(endpoint+'?year=2026','GET',undefined,422);assert.equal(limited.code,'PRODUCT_SERIES_LIMIT');assert.equal(limited.details.options.products.length,51);
 const one=await f.admin.request(endpoint+'?year=2026&productIds=removed_0');assert.equal(one.products.length,1);assert.equal(one.products[0].label,'Historical product 0');assert.equal(one.totals.quotedValue,11800);
});

// Independent reconciliation: do not read projected amounts or call the domain
// calculation helpers when deriving expected values from the persisted records.
function savedMoneyOracle(quote){
 const fraction=value=>{const [whole,decimal='']=String(value).split('.');return [BigInt(whole+decimal),10n**BigInt(decimal.length)];};
 const half=(n,d)=>Number((n*2n+d)/(d*2n));
 const money=value=>{const [n,d]=fraction(value||0);return quote.calculationVersion===2?half(n*100n,d):Math.round((value||0)*100);};
 const allocate=(amount,weights)=>{
  const total=weights.reduce((s,n)=>s+n,0);if(!total)return weights.map(()=>0);
  const rows=weights.map((weight,index)=>({index,value:Number(BigInt(amount)*BigInt(weight)/BigInt(total)),rem:BigInt(amount)*BigInt(weight)%BigInt(total)}));
  const left=amount-rows.reduce((s,r)=>s+r.value,0);
  [...rows].sort((a,b)=>a.rem===b.rem?a.index-b.index:a.rem>b.rem?-1:1).slice(0,left).forEach(r=>r.value++);
  return rows.map(r=>r.value);
 };
 const subtotal=quote.items.reduce((s,i)=>s+i.sub,0),[n,d]=fraction(quote.disc.v);
 const exact=quote.calculationVersion===2||quote.discountSource==='category';
 const discount=Math.min(subtotal,quote.disc.t==='f'?money(quote.disc.v):exact?half(BigInt(subtotal)*n,100n*d):Math.round(subtotal*quote.disc.v/100));
 const reductions=allocate(discount,quote.items.map(i=>i.sub));
 const rows=quote.items.map((item,index)=>({value:item.sub-reductions[index],rate:item.taxMode==='exempt'?0:item.tax,mode:item.taxMode||'exclusive'}));
 const charges=money(quote.del)+money(quote.oth);
 if(charges)rows.push({value:charges,rate:quote.chargeTaxMode==='exempt'?0:quote.chargeTax||0,mode:quote.chargeTaxMode||'exclusive'});
 const values=rows.map(r=>r.value),grossValues=rows.map(r=>r.value),groups=new Map();let gst=0;
 rows.forEach((r,index)=>{const key=r.mode+':'+r.rate;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(index);});
 for(const indices of groups.values()){
  const row=rows[indices[0]],gross=indices.reduce((s,i)=>s+rows[i].value,0),[rate,divisor]=fraction(row.rate);
  if(row.mode==='inclusive'){
   const net=quote.calculationVersion===2?half(BigInt(gross)*100n*divisor,100n*divisor+rate):Math.round(gross*100/(100+row.rate));
   const taxes=allocate(gross-net,indices.map(i=>rows[i].value));indices.forEach((i,n)=>{values[i]-=taxes[n];});gst+=gross-net;
  }else{const tax=quote.calculationVersion===2?half(BigInt(gross)*rate,100n*divisor):Math.round(gross*row.rate/100);gst+=tax;const shares=allocate(tax,indices.map(i=>rows[i].value));indices.forEach((i,n)=>{grossValues[i]+=shares[n];});}
 }
 return {grossValues:grossValues.slice(0,quote.items.length),chargeGross:grossValues[quote.items.length]||0,values:values.slice(0,quote.items.length),chargeNet:values[quote.items.length]||0,grand:values.reduce((s,v)=>s+v,0)+gst,discount,gst};
}

test('independent saved-record oracle reconciles every product/month and combined filter without reallocating discounts',async t=>{
 const f=await fixture(t),category=await f.admin.request('/api/customer-categories/cc_bni');
 await f.admin.request('/api/customer-categories/cc_bni','PATCH',{version:category.data.version,data:{discountPercentage:'12.34'}});
 await f.admin.request('/api/customers/'+f.b.id,'PATCH',{version:1,data:{categoryId:'cc_bni'}});
 let b=await f.admin.request('/api/products/analytics_b');await f.admin.request('/api/products/analytics_b','PATCH',{version:b.version,data:{rate:1.18,taxMode:'inclusive'}});
 await f.admin.request('/api/products','POST',{id:'analytics_c',code:'AC',name:'Exempt C',cat:'c2',m:'unit',rate:0.99,tax:0,taxMode:'exempt',min:0,minQty:1,on:1,priceConfigured:true,f:[]},201);
 const dates=['2024-02-29','2025-12-31','2026-01-01','2026-01-31','2026-02-01','2026-12-31','2027-01-01'];
 for(let n=0;n<21;n++){
  const owner=n%4===0?f.staff:f.admin;
  const input={cid:n%3===0?f.b.id:f.a.id,date:dates[n%dates.length],valid:'2027-12-31',items:[f.item('analytics_a',n%3+1),f.item('analytics_b',n%5+1),f.item('analytics_a',2),f.item('analytics_c',1)],del:owner===f.admin?1.005:0,oth:0.03};
  if(owner===f.staff)input.oth=0;
  if(n%3!==0)Object.assign(input,{discountSource:'manual',disc:n%2?{t:'f',v:1.005}:{t:'p',v:2.3}});
  // Keep own-report fixtures inside the existing employee discount policy.
  if(owner===f.staff)Object.assign(input,{discountSource:'manual',disc:{t:'p',v:0}});
  const q=await f.quote(input,owner);
  if(n%2)await f.admin.request('/api/quotations/'+q.data.id+'/status','POST',{version:q.version,status:'Pending Internal Review'});
 }
 // An authorized price override is part of the saved line value.
 const special=await f.quote({cid:f.b.id,del:1,items:[{...f.item(),override:{amount:1.01,reason:'Analytics rounding fixture'}},f.item('analytics_b'),f.item('analytics_c')]});
 const db=f.app.db,quotes=await db.prepare('SELECT id,customer_id,owner_id,date,status,total,body FROM quotations ORDER BY id').all();
 const items=await db.prepare('SELECT i.*,a.net_value,a.gross_value FROM quotation_items i LEFT JOIN quotation_item_analytics a ON a.quotation_id=i.quotation_id AND a.item_id=i.id ORDER BY i.quotation_id,i.position,i.id').all();
 assert.equal(quotes.length,22);assert.equal(items.length,87);
 const records=[];
 for(const row of quotes){
  const lines=items.filter(i=>i.quotation_id===row.id),quote={...JSON.parse(row.body),items:lines.map(i=>JSON.parse(i.body))},oracle=savedMoneyOracle(quote);
  assert.equal(row.total,oracle.grand,'saved grand total '+row.id);
  for(const [index,line]of lines.entries()){
   assert.equal(line.subtotal,quote.items[index].sub);assert.equal(line.quantity,quote.items[index].qty);assert.equal(line.net_value,oracle.values[index],'net projection '+line.id);assert.equal(line.gross_value,oracle.grossValues[index],'GST projection '+line.id);
   records.push({qid:row.id,pid:line.product_id,categoryId:line.product_id==='analytics_a'?'c1':'c2',date:row.date,owner:row.owner_id,customer:row.customer_id,status:row.status,quantity:line.quantity,value:oracle.grossValues[index]});
  }
  if(row.id===special.data.id)assert.deepEqual([oracle.discount,oracle.values,oracle.grand],[39,[89,87,87],413]);
 }
 const cases=[{}, {productIds:'analytics_a'}, {categoryIds:'c2'}, {productIds:'analytics_a,analytics_b',categoryIds:'c2'}, {customerId:f.b.id}, {employeeId:f.staffId}, {status:'Pending Internal Review'}, {from:'2026-01-31',to:'2026-02-01'}, {month:'2'}, {year:'2024',from:'2024-02-29',to:'2024-02-29'}, {year:'2027'}, {customerId:f.a.id,employeeId:f.staffId,status:'Draft',productIds:'analytics_a'}, {categoryIds:'c2',customerId:f.b.id,month:'1'}];
 const evidence=[];
 for(const own of [false,true])for(const selected of cases){
  if(own&&selected.employeeId&&selected.employeeId!==f.staffId)continue;
  const params=new URLSearchParams({year:'2026',...selected}),report=await (own?f.staff:f.admin).request(endpoint+'?'+params);
  const matching=records.filter(r=>(!own||r.owner===f.staffId)&&r.date>=report.appliedFilters.from&&r.date<=report.appliedFilters.to&&report.periods.includes(r.date.slice(0,7))&&(!selected.productIds||selected.productIds.split(',').includes(r.pid))&&(!selected.categoryIds||selected.categoryIds.split(',').includes(r.categoryId))&&(!selected.customerId||selected.customerId===r.customer)&&(!selected.employeeId||selected.employeeId===r.owner)&&(!selected.status||selected.status===r.status));
  assert.deepEqual(report.totals,{quotationCount:new Set(matching.map(r=>r.qid)).size,lineItemCount:matching.length,quantity:matching.reduce((s,r)=>s+r.quantity,0),quotedValue:matching.reduce((s,r)=>s+r.value,0),productQuotationCount:new Set(matching.map(r=>r.qid+'/'+r.pid)).size,legacyCategoryLines:0,unknownCategoryLines:0},params.toString());
  for(const row of report.monthly){const lines=matching.filter(r=>r.pid===row.productId&&r.date.startsWith(row.period));assert.deepEqual([row.quotationCount,row.lineItemCount,row.quantity,row.quotedValue],[new Set(lines.map(r=>r.qid)).size,lines.length,lines.reduce((s,r)=>s+r.quantity,0),lines.reduce((s,r)=>s+r.value,0)]);}
  assert.equal(report.monthly.length,new Set(matching.map(r=>r.pid+'/'+r.date.slice(0,7))).size);
  evidence.push({scope:own?'own':'all',filters:Object.fromEntries(params),totals:report.totals});
 }
 const before=await f.admin.request(endpoint+'?year=2026');b=await f.admin.request('/api/products/analytics_b');await f.admin.request('/api/products/analytics_b','PATCH',{version:b.version,data:{name:'Archived renamed B',cat:'c1',on:0}});
 const current=await f.admin.request('/api/customer-categories/cc_bni');await f.admin.request('/api/customer-categories/cc_bni','PATCH',{version:current.data.version,data:{discountPercentage:'99.00'}});
 const after=await f.admin.request(endpoint+'?year=2026');assert.deepEqual(after,before,'catalog and category discount edits must not rewrite analytics history');
 require('node:fs').writeFileSync('test-results/product-analytics-review-reconciliation.json',JSON.stringify({quotationCount:quotes.length,lineItemCount:items.length,filterComparisons:evidence,sample:{subtotal:318,discount:39,productNet:[89,87,87],chargeNet:100,gst:50,grand:413}},null,2));
});

test('own-only filter metadata and guessed historical IDs never expose another owner records',async t=>{
 const f=await fixture(t);await f.quote();await f.quote({cid:f.b.id,date:'2024-02-29',items:[f.item('analytics_b')]},f.staff);
 const report=await f.staff.request(endpoint+'?year=2024');
 for(const [key,ids]of [['products',['analytics_b']],['categories',['c2']],['customers',[f.b.id]],['employees',[f.staffId]]])assert.deepEqual(report.options[key].map(v=>v.id),ids);
 assert.deepEqual(report.options.years,['2024']);
 for(const query of ['productIds=analytics_a','categoryIds=c1','customerId='+f.a.id]){
  const empty=await f.staff.request(endpoint+'?year=2026&'+query);assert.equal(empty.totals.quotationCount,0);assert.deepEqual(empty.products,[]);assert.deepEqual(empty.options,report.options);
 }
});

test('per-line net and GST-inclusive reporting match an independent oracle over mixed modes, charges and rounding policies',()=>{
 for(const calculationVersion of [undefined,2])for(let sample=1;sample<=600;sample++){
  const items=[0,1,2,3].map(i=>({id:'i'+i,pid:'p'+i,sub:(sample*7919+i*3571)%100000+1,base:1,qty:1,tax:[2.3,18,12.34,0][i],taxMode:['inclusive','inclusive','exclusive','exempt'][i]}));
  const quote={calculationVersion,items,disc:sample%2?{t:'p',v:[0,2.3,12.34,100][sample%4]}:{t:'f',v:1.005},del:1.005,oth:0.03,chargeTax:sample%2?18:2.3,chargeTaxMode:['inclusive','exclusive','exempt'][sample%3]};
  const expected=savedMoneyOracle(quote);assert.deepEqual(DP.itemQuotedGrossValues(quote),expected.grossValues,'GST sample '+sample+' version '+calculationVersion);assert.equal(DP.itemQuotedGrossValues(quote).reduce((n,v)=>n+v,0)+expected.chargeGross,expected.grand);assert.deepEqual(DP.itemQuotedValues(quote),expected.values,'sample '+sample+' version '+calculationVersion);assert.equal(DP.totals(quote).grand,expected.grand);
 }
});

test('GST-inclusive projection migration preserves historical documents and category snapshots and rolls back atomically',async t=>{
 const f=await fixture(t),q=await f.quote({disc:{t:'p',v:12.34},discountSource:'manual',del:1.18,chargeTaxMode:'inclusive',chargeTax:18}),db=f.app.db;
 const before=await db.prepare('SELECT id,body,version,total,updated_at FROM quotations ORDER BY id').all(),items=await db.prepare('SELECT * FROM quotation_items ORDER BY id').all(),projection=await db.prepare('SELECT quotation_id,item_id,category_id,category_name,category_basis,net_value FROM quotation_item_analytics ORDER BY item_id').all();
 await db.exec('DROP TABLE product_field_bindings;DROP TABLE field_configuration_audit_logs,configurable_field_options,configurable_fields,field_configuration_state;DROP FUNCTION preserve_field_configuration_identity();ALTER TABLE quotation_item_analytics DROP COLUMN gross_value;DELETE FROM schema_migrations WHERE version>=10');
 const prepare=db.prepare;db.prepare=sql=>sql.startsWith('UPDATE quotation_item_analytics a SET gross_value')?{run:async()=>{throw Error('Injected GST backfill failure');}}:prepare(sql);
 try{await assert.rejects(createStore(db),/Injected GST backfill failure/);}finally{db.prepare=prepare;}
 assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n,9);assert.equal((await db.prepare("SELECT count(*) AS n FROM information_schema.columns WHERE table_name='quotation_item_analytics' AND column_name='gross_value'").get()).n,0);
 await createStore(db);await createStore(db);assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n,13);assert.deepEqual(await db.prepare('SELECT id,body,version,total,updated_at FROM quotations ORDER BY id').all(),before);assert.deepEqual(await db.prepare('SELECT * FROM quotation_items ORDER BY id').all(),items);assert.deepEqual(await db.prepare('SELECT quotation_id,item_id,category_id,category_name,category_basis,net_value FROM quotation_item_analytics ORDER BY item_id').all(),projection);
 assert.equal((await f.admin.request(endpoint+'?year=2026')).totals.quotedValue,DP.itemQuotedGrossValues(q.data).reduce((n,v)=>n+v,0));
 await assert.rejects(db.exec('UPDATE quotation_item_analytics SET gross_value=NULL'),/null/i);await assert.rejects(db.exec('UPDATE quotation_item_analytics SET gross_value=-1'),/check/i);
});
