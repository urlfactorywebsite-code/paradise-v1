'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const {createApp}=require('../server'),{testDatabase}=require('./database-helper');
const Filters=require('../shared/quotation-filters'),Exporter=require('../server/quotation-export');
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
function parseCSV(text){const rows=[];let row=[],cell='',quoted=false;text=text.replace(/^\ufeff/,'');for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell='';}else if(ch==='\r'&&text[i+1]==='\n'&&!quoted){row.push(cell);rows.push(row);row=[];cell='';i++;}else cell+=ch;}return rows;}
function performanceEvidence(key,value){const fs=require('node:fs'),file='test-results/quotation-export-review-performance.json';fs.mkdirSync('test-results',{recursive:true});const data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};data[key]=value;fs.writeFileSync(file,JSON.stringify(data,null,2));}

test('quotation filters reject invalid dates, decimal precision, ranges and unknown/tenant parameters',()=>{
 for(const filters of [{from:'2026-02-30'},{from:'2026-12-01',to:'2026-01-01'},{min:'2',max:'1'},{min:'1.001'},{min:'1e3'},{max:'-1'},{min:'Infinity'},{status:'hacked'},{tenantId:'x'},{customer:[]},{q:'bad\u0000'},{product:"x' OR 1=1"}])assert.throws(()=>Filters.normalize(filters));
 assert.equal(Filters.amount('0.29'),29);assert.equal(Filters.amount('100000000000.00'),10000000000000);assert.deepEqual(Filters.normalize({min:'0',max:'0'}),{min:'0',max:'0'});
});
test('CSV cells protect formulas and preserve commas, quotes, newlines, Unicode and integer paise',()=>{
 for(const value of ['=1+1',' +SUM(A1)','\t@cmd','\u200b-5','\r=1'])assert.ok(Exporter.csvCell(value).startsWith('"\''));
 assert.deepEqual(parseCSV('\ufeff'+['தமிழ், "Name"','line1\nline2','=SUM(A1)'].map(Exporter.csvCell).join(',')+'\r\n'),[['தமிழ், "Name"','line1\nline2',"'=SUM(A1)"]]);
 assert.equal(Exporter.money('9007199254740991'),'90071992547409.91');assert.equal(Exporter.formattedDate('2026-11-05'),'05/11/2026');
});
test('combined filters use saved GST-inclusive totals, category/product IDs, inclusive dates and literal search',async t=>{
 const f=await fixture(t),q=await f.make(f.c1,{discountSource:'manual',disc:{t:'p',v:10}});await f.make(f.c2,{date:'2026-10-31'});
 const saved=await f.app.db.prepare('SELECT total FROM quotations WHERE id=?').get(q.data.id);assert.equal(saved.total,21240);
 const filters={q:'தமிழ்',status:'Draft',salesperson:'Export sales',customer:f.c1.id,from:'2026-11-01',to:'2026-11-01',min:'212.40',max:'212.40',customerCategory:'cc_other',product:f.product.id};
 const spec={type:'quotation',scope:'filtered',filters,columns:['number','total','reference']};const preview=await f.admin.request('/api/quotation-export/preview','POST',spec);assert.equal(preview.rows,1);
 const csv=parseCSV(await f.admin.request('/api/quotation-export/csv','POST',spec));assert.equal(csv[1][0],q.data.no);assert.equal(csv[1][1],'212.40');assert.equal(csv[1][2],q.data.ref);
 assert.equal(Filters.matches(q.data,f.c1,filters,saved.total),true);
 for(const filters of [{q:'%'},{q:'_'},{q:"' OR 1=1 --"},{product:'unknown'},{customerCategory:'cc_bni',customer:f.c1.id},{min:'212.41',max:'212.41'}])assert.equal((await f.admin.request('/api/quotation-export/preview','POST',{filters})).rows,0);
});
test('customer export deduplicates, combines active owned addresses, and explicitly supports quotation-wise/custom columns',async t=>{
 const f=await fixture(t);await f.make();await f.make();await f.make(f.c2);
 const columns=['customerName','contactPersonNumber','mobile','whatsapp','customerCategory','billingAddress','deliveryAddress'];
 const spec={type:'customer',scope:'all',columns};assert.equal((await f.admin.request('/api/quotation-export/preview','POST',spec)).rows,2);
 const csv=parseCSV(await f.admin.request('/api/quotation-export/csv','POST',spec));assert.equal(csv.length,3);const row=csv.find(r=>r[0]===f.c1.name);assert.equal(row[1],"'+442079460958");assert.equal(row[2],f.c1.mob);assert.equal(row[3],"'+919876543210");assert.equal(row[4],'Local club');assert.equal(row[5],f.c1.addr);assert.match(row[6],/Factory, First street, India/);assert.match(row[6],/\nStore, Second street, India/);
 const wise=await f.admin.request('/api/quotation-export/preview','POST',{...spec,quotationWise:true,columns:['number','customerName']});assert.equal(wise.rows,3);
 const custom=parseCSV(await f.admin.request('/api/quotation-export/csv','POST',{type:'custom',columns:['mobile','number','date']}));assert.deepEqual(custom[0],['Mobile number','Quotation number','Quotation date']);assert.equal(custom[1][2],'01/11/2026');
});
test('export scope spans all backend pages, selected records ignore active filters, all scope ignores filters',async t=>{
 const f=await fixture(t),q=await f.make(),source=await f.app.db.prepare('SELECT * FROM quotations WHERE id=?').get(q.data.id);
 // Representative >page-size data inserted only in this disposable fixture.
 for(let i=0;i<105;i++){const doc={...q.data,id:'ExportBulk'+i,no:'BULK/'+i};await f.app.db.prepare('INSERT INTO quotations(id,number,customer_id,date,valid_until,status,salesperson,owner_id,total,body,version,position,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(doc.id,doc.no,doc.cid,doc.date,doc.valid,doc.status,doc.sales,source.owner_id,source.total,JSON.stringify(doc),1,i+1,source.updated_at);}
 assert.equal((await f.admin.request('/api/quotation-export/preview','POST',{filters:{customer:f.c1.id}})).rows,106);
 const csv=parseCSV(await f.admin.request('/api/quotation-export/csv','POST',{columns:['number'],filters:{customer:f.c1.id}}));assert.equal(csv.length,107);
 assert.equal((await f.admin.request('/api/quotation-export/preview','POST',{scope:'selected',selectedIds:[q.data.id],filters:{q:'no match'}})).rows,1);
 assert.equal((await f.admin.request('/api/quotation-export/preview','POST',{scope:'all',filters:{q:'no match'}})).rows,106);
 await f.admin.request('/api/quotation-export/preview','POST',{scope:'selected',selectedIds:[q.data.id,'not_found']},404);
});
test('authentication, own quotation scope, customer column permissions and selected-ID isolation fail closed',async t=>{
 const f=await fixture(t),adminQ=await f.make(),anonymous=f.client();await anonymous.request('/api/quotation-export/options','GET',undefined,401);
 const account=await f.admin.request('/api/users','POST',{name:'Quote only',username:'quoteonly',password:f.password,role:'Employee',permissions:['quotation.view_own','quotation.create']},201),employee=f.client();await employee.request('/api/auth/login','POST',{username:account.user.username,password:f.password});
 const own=await f.make(f.c2,{},employee);assert.equal((await employee.request('/api/quotation-export/preview','POST',{scope:'all'})).rows,1);
 const csv=parseCSV(await employee.request('/api/quotation-export/csv','POST',{scope:'all',columns:['number']}));assert.deepEqual(csv.slice(1),[[own.data.no]]);
 await employee.request('/api/quotation-export/csv','POST',{scope:'selected',selectedIds:[adminQ.data.id]},404);
 for(const spec of [{type:'customer'},{type:'custom',columns:['email']},{filters:{customerCategory:'cc_bni'}}])await employee.request('/api/quotation-export/preview','POST',spec,403);
 assert.ok((await employee.request('/api/quotation-export/options')).columns.every(c=>c.group!=='customer'));
 const restricted=await f.admin.request('/api/users','POST',{name:'No reports',username:'noexports',password:f.password,role:'Employee',permissions:[]},201),none=f.client();await none.request('/api/auth/login','POST',{username:restricted.user.username,password:f.password});for(const endpoint of ['preview','csv'])await none.request('/api/quotation-export/'+endpoint,'POST',{},403);
});
test('separate company databases cannot enumerate or export foreign selected records',async t=>{
 const a=await fixture(t),b=await fixture(t),foreign=await b.make();await a.admin.request('/api/quotation-export/preview','POST',{scope:'selected',selectedIds:[foreign.data.id]},404);assert.equal((await a.admin.request('/api/quotation-export/preview','POST',{})).rows,0);
 await a.admin.request('/api/quotation-export/csv','POST',{tenantId:b.database.name},422);
});
test('export validation rejects sensitive columns, duplicate IDs/columns, unknown filters and excessive selections',async t=>{
 const f=await fixture(t);
 for(const spec of [{columns:['id']},{columns:['password']},{columns:[]},{columns:['number','number']},{type:'quotation',columns:['mobile']},{scope:'selected',selectedIds:[]},{scope:'selected',selectedIds:['x','x']},{selectedIds:Array.from({length:1001},(_,i)=>'id'+i)},{filters:{tenant:'other'}},{columns:['customerName'],type:'customer',quotationWise:'yes'},{type:'customer',columns:['number']},{scope:'bogus'},{type:'bogus'}])await f.admin.request('/api/quotation-export/preview','POST',spec,422);
 await f.admin.request('/api/quotation-export/options?tenant=other','GET',undefined,422);
});
test('bounded batch export preserves one read snapshot and rejects row limits before CSV headers',async t=>{
 const f=await fixture(t),q=await f.make(),prepare=f.app.db.prepare;let batches=0,snapshots=0;
 const read=f.app.db.readTransaction;f.app.db.readTransaction=async fn=>{snapshots++;return read(fn);};
 f.app.db.prepare=sql=>{const stmt=prepare(sql);if(sql.includes('AS quotations,'))return {...stmt,get:async(...args)=>({...await stmt.get(...args),rows:50001})};return stmt;};
 await f.admin.request('/api/quotation-export/csv','POST',{columns:['number']},422);f.app.db.prepare=prepare;
 f.app.db.prepare=sql=>{const stmt=prepare(sql);if(sql.includes('AS cursor,'))return {...stmt,all:async(...args)=>{batches++;return stmt.all(...args);}};return stmt;};
 const csv=parseCSV(await f.admin.request('/api/quotation-export/csv','POST',{columns:['number']}));assert.equal(csv[1][0],q.data.no);assert.equal(batches,2);assert.equal(snapshots,2);
});

test('50,000 actual database rows export in bounded batches; row 50,001 is rejected',async t=>{
 const f=await fixture(t),q=await f.make();
 // Minimal historic bodies exercise the projected SQL path at the real limit.
 await f.app.db.prepare(`INSERT INTO quotations(id,number,customer_id,date,valid_until,status,salesperson,owner_id,total,body,version,position,updated_at)
 SELECT 'ExportLimit'||n,'LIMIT/'||n,customer_id,date,valid_until,status,salesperson,owner_id,total,'{}',1,n,updated_at FROM quotations CROSS JOIN generate_series(1,49999) AS n WHERE id=?`).run(q.data.id);
 const preview=await f.admin.request('/api/quotation-export/preview','POST',{columns:['number']});assert.equal(preview.rows,50000);
 await f.app.db.exec('ANALYZE quotations');
 const scope=Exporter.scopeQuery(Exporter.validate({columns:['number'],filters:{customer:f.c1.id,from:'2026-11-01',to:'2026-11-30'}},{role:'Administrator'}),{role:'Administrator'});
 const plan=(await f.app.db.prepare('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+scope.sql+' ORDER BY q.id LIMIT 500').get(...scope.values))['QUERY PLAN'];
 const prepare=f.app.db.prepare;let batchPlan,text,elapsedMs;
 f.app.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('WITH scoped AS')&&sql.includes('AS cursor,'))return {...statement,all:async(...args)=>{if(!batchPlan)batchPlan=(await prepare('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql).get(...args))['QUERY PLAN'];return statement.all(...args);}};return statement;};
 try{const start=performance.now();text=await f.admin.request('/api/quotation-export/csv','POST',{columns:['number']});elapsedMs=performance.now()-start;}finally{f.app.db.prepare=prepare;}
 const csv=parseCSV(text);assert.equal(csv.length,50001);assert.equal(new Set(csv.slice(1).map(row=>row[0])).size,50000);performanceEvidence('database',{rows:50000,exportMs:elapsedMs,csvBytes:Buffer.byteLength(text)+3,plan,batchPlan});
 await f.app.db.prepare(`INSERT INTO quotations(id,number,customer_id,date,valid_until,status,salesperson,owner_id,total,body,version,position,updated_at) SELECT 'ExportOverflow','OVERFLOW',customer_id,date,valid_until,status,salesperson,owner_id,total,'{}',1,50001,updated_at FROM quotations WHERE id=?`).run(q.data.id);
 await f.admin.request('/api/quotation-export/preview','POST',{columns:['number']},422);await f.admin.request('/api/quotation-export/csv','POST',{columns:['number']},422);
});

test('archived categories/products keep associations and export historical quotation names with current customer details',async t=>{
 const f=await fixture(t),q=await f.make();
 // Other is a protected sentinel; archive a managed associated category instead.
 const managed=await f.admin.request('/api/customers/'+f.c1.id,'PATCH',{version:1,data:{categoryId:'cc_bni'}});
 const bni=await f.admin.request('/api/customer-categories/cc_bni');await f.admin.request('/api/customer-categories/cc_bni','DELETE',{version:bni.data.version});
 const product=await f.admin.request('/api/products/'+f.product.id);await f.admin.request('/api/products/'+f.product.id,'PATCH',{version:product.version,data:{name:'Renamed product',on:0}});
 await f.admin.request('/api/customers/'+f.c1.id,'PATCH',{version:managed.version,data:{name:'Renamed customer'}});
 const filters={customerCategory:'cc_bni',product:f.product.id};assert.equal((await f.admin.request('/api/quotation-export/preview','POST',{filters})).rows,1);
 const csv=parseCSV(await f.admin.request('/api/quotation-export/csv','POST',{type:'custom',filters,columns:['customer','customerName','customerCategory']}));assert.equal(csv[1][0],f.c1.name);assert.equal(csv[1][1],'Renamed customer');assert.equal(csv[1][2],'BNI');assert.equal((await f.admin.request('/api/quotations/'+q.data.id)).data.items[0].name,'Export Product');
});

test('quotation list search predicate and backend match the same literal field combinations',async t=>{
 const f=await fixture(t),q=(await f.make()).data;
 for(const term of [q.no+' '+f.c1.name,f.c1.mob+' '+q.items[0].name,q.items[0].name.toUpperCase(),'No match']){
  const expected=Filters.matches(q,f.c1,{q:term},23600)?1:0;assert.equal((await f.admin.request('/api/quotation-export/preview','POST',{filters:{q:term}})).rows,expected,term);
 }
});

test('empty-item search and canonical validity dates agree with the visible quotation records',async t=>{
 const f=await fixture(t),q=(await f.make(f.c2,{items:[]})).data;
 const filters={q:f.c2.mob+' '};assert.equal(Filters.matches(q,f.c2,filters,0),false);
 assert.equal((await f.admin.request('/api/quotation-export/preview','POST',{filters})).rows,0);
 // The relational validity column remains authoritative for legacy bodies.
 await f.app.db.prepare("UPDATE quotations SET body=(body::jsonb-'valid')::text WHERE id=?").run(q.id);
 const rows=parseCSV(await f.admin.request('/api/quotation-export/csv','POST',{columns:['number','validUntil']}));assert.deepEqual(rows[1],[q.no,'01/12/2026']);
});

test('optional export settings reject non-object filters and non-array selections rather than silently defaulting',async t=>{
 const f=await fixture(t);
 for(const value of [null,false,0,''])for(const key of ['filters','selectedIds'])await f.admin.request('/api/quotation-export/preview','POST',{[key]:value},422);
});

test('authenticated export POSTs require CSRF; completed downloads audit only approved metadata without changing records',async t=>{
 const f=await fixture(t),q=await f.make(),before=(await f.admin.request('/api/state')).revision;
 for(const action of ['preview','csv']){const response=await f.admin.raw('/api/quotation-export/'+action,'POST',{});assert.equal(response.status,403);}
 await f.admin.request('/api/quotation-export/csv','POST',{columns:['number'],filters:{customer:f.c1.id}});
 assert.equal((await f.admin.request('/api/state')).revision,before);assert.deepEqual((await f.admin.request('/api/quotations/'+q.data.id)).data,q.data);
 const events=await f.app.db.prepare("SELECT details FROM audit_events WHERE action='quotations.exported'").all();assert.equal(events.length,1);assert.deepEqual(JSON.parse(events[0].details),{scope:'filtered',type:'quotation',rows:1,quotations:1,columns:['number']});
});

test('byte limit and database errors return JSON before headers and remove privately staged CSV files',async t=>{
 const fs=require('node:fs'),os=require('node:os'),f=await fixture(t);await f.make();const prepare=f.app.db.prepare,dirs=()=>fs.readdirSync(os.tmpdir()).filter(name=>name.startsWith('dp-quotation-export-')),before=dirs();
 let n=0;const value='x'.repeat(1024*1024);
 f.app.db.prepare=sql=>{const statement=prepare(sql);if(sql.includes('AS cursor,'))return {...statement,all:async()=>[{cursor:String(++n),number:value}]};return statement;};
 const limited=await f.admin.request('/api/quotation-export/csv','POST',{columns:['number']},422);assert.match(limited.error,/100 MiB/);assert.deepEqual(dirs(),before);
 f.app.db.prepare=sql=>{const statement=prepare(sql);if(sql.includes('AS cursor,'))return {...statement,all:async()=>{throw Error('Synthetic export DB error');}};return statement;};
 await f.admin.request('/api/quotation-export/csv','POST',{columns:['number']},500);assert.deepEqual(dirs(),before);f.app.db.prepare=prepare;
});

test('every export type/scope returns the exact intended quotation or deduplicated customer cohort',async t=>{
 const f=await fixture(t),q1=(await f.make()).data,q2=(await f.make(f.c1,{date:'2026-12-01'})).data,q3=(await f.make(f.c2)).data;
 const filters={customer:f.c1.id,from:'2026-11-01',to:'2026-11-30',product:f.product.id,status:'Draft',salesperson:'Export sales',min:'236.00',max:'236.00'},selectedIds=[q2.id,q3.id];
 for(const type of ['quotation','customer','custom'])for(const scope of ['selected','filtered','all'])for(const quotationWise of type==='customer'?[false,true]:[false]){
  const chosen=type==='customer'&&!quotationWise?['customerName']:type==='customer'?['number','customerName']:type==='custom'?['number','customerName','contactPersonNumber','total']:['number','customer','total'];
  const spec={type,scope,quotationWise,columns:chosen,filters,selectedIds},expected=scope==='selected'?[q2,q3]:scope==='filtered'?[q1]:[q1,q2,q3],dedupe=type==='customer'&&!quotationWise;
  const wanted=dedupe?[...new Set(expected.map(q=>q.cid===f.c1.id?f.c1.name:f.c2.name))]:expected.map(q=>q.no);
  const preview=await f.admin.request('/api/quotation-export/preview','POST',spec),csv=parseCSV(await f.admin.request('/api/quotation-export/csv','POST',spec));assert.equal(preview.quotations,expected.length);assert.equal(preview.rows,wanted.length);assert.deepEqual(csv.slice(1).map(row=>row[0]).sort(),wanted.sort(),JSON.stringify({type,scope,quotationWise}));
 }
});

test('all approved customer mappings preserve historical quote labels and exact UTF-8/BOM/CSV bytes',async t=>{
 const f=await fixture(t),q=(await f.make(f.c1,{discountSource:'manual',disc:{t:'p',v:10}})).data;
 const changed=(await f.admin.request('/api/customers/'+f.c1.id,'PATCH',{version:1,data:{name:'=HYPERLINK("test","தமிழ்")',co:'New, "Company"\n分公司',person:'New buyer',contactPersonPhone:'+33123456789',mob:'9876543222',wa:'+919876543222',email:'new@example.test',gstin:'33ABCDE1234F1Z5',addr:'New billing\r\n街道',customCategoryName:'新协会'} }));
 await f.admin.request('/api/customers/'+f.c1.id+'/delivery-addresses/'+f.c1.deliveryAddresses.find(a=>a.label==='Factory').id,'PATCH',{version:changed.version,data:{archived:true}});
 const columns=['number','date','validUntil','reference','customer','company','total','status','salesperson','customerName','companyName','contactPerson','contactPersonNumber','mobile','whatsapp','email','gstin','customerCategory','billingAddress','deliveryAddress'];
 const response=await f.admin.raw('/api/quotation-export/csv','POST',{type:'custom',scope:'all',columns},true);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'text/csv; charset=utf-8');assert.equal(response.headers.get('cache-control'),'no-store');
 const bytes=Buffer.from(await response.arrayBuffer());assert.deepEqual([...bytes.subarray(0,3)],[239,187,191]);assert.equal(Number(response.headers.get('content-length')),bytes.length);assert.equal(bytes.subarray(-2).toString(),'\r\n');
 const csv=parseCSV(bytes.toString('utf8'));assert.equal(csv.length,2);assert.deepEqual(csv[1],[q.no,'01/11/2026','01/12/2026',q.ref,f.c1.name,f.c1.co,'212.40','Draft','Export sales',"'"+changed.data.name,changed.data.co,'New buyer',"'+33123456789",'9876543222',"'+919876543222",'new@example.test','33ABCDE1234F1Z5','新协会',changed.data.addr,'Store, Second street, India']);
});

test('concurrent exports are bounded, duplicate user exports are rejected, and capacity is released',async t=>{
 const f=await fixture(t);await f.make();const others=[];
 for(let i=0;i<2;i++){const account=await f.admin.request('/api/users','POST',{name:'Export worker '+i,username:'exportworker'+i,password:f.password,role:'Employee',permissions:['quotation.view_all']},201),client=f.client();await client.request('/api/auth/login','POST',{username:account.user.username,password:f.password});others.push(client);}
 let release,started1,started2;const gate=new Promise(r=>release=r),firstStarted=new Promise(r=>started1=r),secondStarted=new Promise(r=>started2=r),prepare=f.app.db.prepare;let n=0,first,second;
 f.app.db.prepare=sql=>{const statement=prepare(sql);if(sql.includes('AS cursor,')&&sql.includes(' AS "number"'))return {...statement,all:async(...args)=>{n++;if(n===1)started1();if(n===2)started2();await gate;return statement.all(...args);}};return statement;};
 try{
  first=f.admin.request('/api/quotation-export/csv','POST',{columns:['number']});await firstStarted;
  await f.admin.request('/api/quotation-export/csv','POST',{columns:['date']},429);
  second=others[0].request('/api/quotation-export/csv','POST',{columns:['number']});await secondStarted;
  await others[1].request('/api/quotation-export/csv','POST',{columns:['date']},429);
  assert.equal((await others[1].request('/api/quotation-export/preview','POST',{columns:['number']})).rows,1);
 }finally{release();await Promise.all([first,second].filter(Boolean));f.app.db.prepare=prepare;}
 assert.equal(parseCSV(await others[1].request('/api/quotation-export/csv','POST',{columns:['number']})).length,2);
});

test('a multi-batch export retains its database snapshot while customer and quotation records change',async t=>{
 const {connectDatabase}=require('../server/database'),f=await fixture(t),q=(await f.make()).data;
 await f.app.db.prepare(`INSERT INTO quotations(id,number,customer_id,date,valid_until,status,salesperson,owner_id,total,body,version,position,updated_at) SELECT 'Snapshot'||n,'SNAPSHOT/'||n,customer_id,date,valid_until,status,salesperson,owner_id,total,'{}',1,n,updated_at FROM quotations CROSS JOIN generate_series(1,500) n WHERE id=?`).run(q.id);
 const last=await f.app.db.prepare('SELECT id,number FROM quotations ORDER BY id OFFSET 500 LIMIT 1').get(),outsider=connectDatabase(f.database),prepare=f.app.db.prepare;let changed=false;
 f.app.db.prepare=sql=>{const statement=prepare(sql);if(sql.includes('AS cursor,'))return {...statement,all:async(...args)=>{const rows=await statement.all(...args);if(rows.length&&!changed){changed=true;await outsider.prepare("UPDATE customers SET name=?,body=jsonb_set(body::jsonb,'{name}',to_jsonb(?::text))::text WHERE id=?").run('Changed during export','Changed during export',f.c1.id);await outsider.prepare('DELETE FROM quotations WHERE id=?').run(last.id);await outsider.prepare(`INSERT INTO quotations(id,number,customer_id,date,valid_until,status,salesperson,owner_id,total,body,version,position,updated_at) SELECT 'zzzzSnapshotLater','LATER',customer_id,date,valid_until,status,salesperson,owner_id,total,'{}',1,502,updated_at FROM quotations LIMIT 1`).run();}return rows;}};return statement;};
 try{const csv=parseCSV(await f.admin.request('/api/quotation-export/csv','POST',{type:'custom',columns:['number','customerName']}));assert.equal(csv.length,502);assert.ok(csv.slice(1).every(row=>row[1]===f.c1.name));assert.ok(csv.some(row=>row[0]===last.number));assert.ok(!csv.some(row=>row[0]==='LATER'));}finally{f.app.db.prepare=prepare;await outsider.close();}
 const csv=parseCSV(await f.admin.request('/api/quotation-export/csv','POST',{type:'custom',columns:['number','customerName']}));assert.equal(csv.length,502);assert.ok(csv.slice(1).every(row=>row[1]==='Changed during export'));assert.ok(csv.some(row=>row[0]==='LATER'));
});

test('compiled list predicates retain all filters without repeating normalization for each quotation',()=>{
 const q={no:'PERF/1',date:'2026-11-01',status:'Draft',sales:'Sales',cid:'Customer1',items:[{pid:'Product1',name:'商品'}]},c={name:'Customer',co:'Company',mob:'9876543210',categoryId:'Category1'},filters={q:'商品',status:'Draft',salesperson:'Sales',customer:'Customer1',customerCategory:'Category1',product:'Product1',from:'2026-11-01',to:'2026-11-30',min:'100.00',max:'100.00'};
 const records=Array.from({length:50000},(_,i)=>({...q,status:i%2?'Cancelled':'Draft'})),predicate=Filters.compile(filters);
 let start=performance.now();const normal=records.filter(record=>Filters.matches(record,c,filters,10000)).length,normalMs=performance.now()-start;start=performance.now();const compiled=records.filter(record=>predicate(record,c,10000)).length,compiledMs=performance.now()-start;
 assert.equal(compiled,25000);assert.equal(compiled,normal);assert.equal(predicate(q,c,9999),false);assert.equal(predicate(q,c,10001),false);performanceEvidence('list',{records:50000,matched:compiled,perRowValidationMs:normalMs,compiledMs});
});

test('temporary storage creation failures release export capacity and a later request succeeds',async t=>{
 const fs=require('node:fs'),f=await fixture(t);await f.make();const original=fs.promises.mkdtemp;
 fs.promises.mkdtemp=async prefix=>{if(prefix.includes('dp-quotation-export-'))throw Error('Synthetic temporary storage failure');return original(prefix);};
 try{await f.admin.request('/api/quotation-export/csv','POST',{columns:['number']},500);}finally{fs.promises.mkdtemp=original;}
 assert.equal(parseCSV(await f.admin.request('/api/quotation-export/csv','POST',{columns:['number']})).length,2);
});

test('completed response releases its slot before cleanup without releasing a newer job',async t=>{
 const fs=require('node:fs'),f=await fixture(t);await f.make();const rm=fs.promises.rm,prepare=f.app.db.prepare;let releaseCleanup,cleanupStarted,cleanupDone,releaseSecond,secondStarted,first,second;
 const cleanupGate=new Promise(r=>releaseCleanup=r),cleanupWaiting=new Promise(r=>cleanupStarted=r),cleanupFinished=new Promise(r=>cleanupDone=r),secondGate=new Promise(r=>releaseSecond=r),secondWaiting=new Promise(r=>secondStarted=r);let heldCleanup=false,holdingSecond=false,secondHeld=false;
 fs.promises.rm=async(...args)=>{const hold=String(args[0]).includes('dp-quotation-export-')&&!heldCleanup;if(hold){heldCleanup=true;cleanupStarted();await cleanupGate;}const result=await rm(...args);if(hold)cleanupDone();return result;};
 f.app.db.prepare=sql=>{const statement=prepare(sql);if(sql.includes('AS cursor,'))return {...statement,all:async(...args)=>{if(holdingSecond&&!secondHeld){secondHeld=true;secondStarted();await secondGate;}return statement.all(...args);}};return statement;};
 try{
  first=f.admin.request('/api/quotation-export/csv','POST',{columns:['number']});await first;await cleanupWaiting;holdingSecond=true;second=f.admin.request('/api/quotation-export/csv','POST',{columns:['number']});await Promise.race([secondWaiting,second.then(()=>{throw Error('Second export completed before the gate.');})]);releaseCleanup();await cleanupFinished;await new Promise(r=>setImmediate(r));await f.admin.request('/api/quotation-export/csv','POST',{columns:['number']},429);
 }finally{releaseCleanup();releaseSecond();await Promise.allSettled([first,second].filter(Boolean));fs.promises.rm=rm;f.app.db.prepare=prepare;}
 for(let i=0;i<20;i++)assert.equal(parseCSV(await f.admin.request('/api/quotation-export/csv','POST',{columns:['number']})).length,2);
});
