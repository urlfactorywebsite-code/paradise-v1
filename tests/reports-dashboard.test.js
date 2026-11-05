'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Charts=require('../public/reports-charts'),{createApp}=require('../server'),{testDatabase}=require('./database-helper');

test('report models zero-fill months, distinguish unique product counts and explain approval denominators',()=>{
 const months=Charts.periods({from:'2025-12-31',to:'2026-03-01'});assert.deepEqual(months,['2025-12','2026-01','2026-02','2026-03']);
 assert.deepEqual(Charts.periods({from:'2025-01-01',to:'2026-12-31',month:'2'}),['2025-02','2026-02']);
 assert.deepEqual(Charts.periods({from:'2026-01-01',to:'2026-12-31',year:'2025'}),[]);
 assert.throws(()=>Charts.periods({from:'2020-01-01',to:'2026-12-31'}),/60/);
 const data={count:3,quotedValue:123456,byStatus:[{key:'Customer Approved',count:1},{key:'Draft',count:2}],byDate:[{key:'2026-01-01',count:2,quotedValue:100000},{key:'2026-02-28',count:1,quotedValue:23456}],quotes:[{date:'2026-01-01',status:'Customer Approved'},{date:'2026-01-01',status:'Draft'},{date:'2026-02-28',status:'Draft'}],byCustomer:[{key:'a'},{key:'b'}],products:[{id:'a',name:'Repeated line',timesQuoted:20,quotationCount:1},{id:'b',name:'More quotations',timesQuoted:3,quotationCount:3}]};
 data.byMonthStatus=[{period:'2026-01',status:'Customer Approved',count:1},{period:'2026-01',status:'Draft',count:1},{period:'2026-02',status:'Draft',count:1}]; const model=Charts.summaryModel(data,months);assert.equal(model.top.id,'b');assert.equal(model.approved,1);assert.equal(Charts.format(model.approvalRate,'percent'),'33.3%');assert.equal(model.customers,2);assert.deepEqual(model.trend.map(r=>r.count),[0,2,1,0]);assert.equal(model.trend.reduce((n,r)=>n+r.value,0),123456);assert.equal(model.trend[1].approved,1);
 assert.equal(Charts.summaryModel({...data,count:0,byStatus:[],quotes:[],byDate:[],byCustomer:[],products:[]},months).approvalRate,null);
});

test('sharing charts use permitted quotation cohorts, real event months and never treat Prepared as confirmation',()=>{
 const rows=[{quotationId:'q',createdAt:'2026-01-31T20:00:00Z',status:'Prepared'},{quotationId:'q',createdAt:'2026-01-31T12:00:00Z',status:'Manually Confirmed'},{quotationId:'q',createdAt:'2026-03-01T00:00:00Z',status:'Failed'},{quotationId:'other',createdAt:'2026-01-31T00:00:00Z',status:'Manually Confirmed'},{quotationId:'q',createdAt:'invalid',status:'Prepared'}];
 const model=Charts.sharingModel(rows,new Set(['q']),['2026-01','2026-02'],'Asia/Kolkata');assert.deepEqual(model.monthly,[{period:'2026-01',prepared:0,confirmed:1,failed:0},{period:'2026-02',prepared:1,confirmed:0,failed:0},{period:'2026-03',prepared:0,confirmed:0,failed:1}]);assert.equal(model.rows.length,4);assert.equal(model.invalidDates,1);assert.ok(!Object.hasOwn(model,'delivered'));
});

test('reusable chart renderers escape hostile labels, format INR and keep colors stable by product ID',()=>{
 const hostile='<img src=x onerror="alert(1)">';
 const svg=Charts.cartesian({id:'test',title:hostile,months:['2026-01'],series:[{id:'p',label:hostile,unit:'money',values:[123456],notes:['Original quoted name '+hostile]}],mode:'grouped'});
 assert.ok(!svg.includes('<img'));assert.ok(svg.includes('&lt;img'));assert.ok(svg.includes('1,234.56'));assert.ok(svg.includes('data-chart-tip='));
 assert.ok(svg.includes('quoted as Original quoted name'));
 assert.equal(Charts.color('a'),Charts.color('a'));assert.notEqual(Charts.color('a'),Charts.color('b'));
 assert.ok(!Charts.ranking({id:'rank',title:hostile,rows:[{id:'a',label:hostile,value:1,detail:hostile}]}).includes('<img'));
 assert.ok(!Charts.donut({id:'donut',title:hostile,rows:[{key:hostile,count:1}]}).includes('<img'));
 for(const mode of ['grouped','stacked','line','area']){const chart=Charts.cartesian({id:mode,title:mode,months:['2026-01','2026-02'],series:[{id:'a',label:'A',values:[0,3]}],mode});assert.ok(!/NaN|Infinity/.test(chart));}
 assert.ok(Charts.donut({id:'empty',title:'empty',rows:[]}).includes('No quotations'));
});

async function fixture(t){
 const database=await testDatabase(),app=await createApp(database);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();await database.destroy();});
 const base='http://127.0.0.1:'+app.server.address().port,password='Reports-'+crypto.randomUUID();
 function client(){let cookie='',csrf='';return {async request(route,method='GET',body,status=200){const response=await fetch(base+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const data=response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text();if(data.csrfToken)csrf=data.csrfToken;assert.equal(response.status,status,route+': '+JSON.stringify(data));return data;}};}
 const admin=client();await admin.request('/api/auth/setup','POST',{name:'Report owner',username:'reportowner',password,demo:false},201);
 await admin.request('/api/products','POST',{id:'report_product',code:'RP',name:'Report product',cat:'c1',m:'unit',rate:100,tax:18,min:0,minQty:1,on:1,priceConfigured:true,f:[]},201);
 const customer=(await admin.request('/api/customers','POST',{name:'Reports customer',mob:'9876543210'},201)).data;
 const employee=await admin.request('/api/users','POST',{name:'Report employee',username:'reportemployee',password,role:'Employee'},201),staff=client();await staff.request('/api/auth/login','POST',{username:'reportemployee',password});
 const quote=async(date,account=admin,items=1)=>(await account.request('/api/quotations','POST',{cid:customer.id,date,valid:'2027-12-31',items:Array.from({length:items},()=>({pid:'report_product',cfg:{qty:1}}))},201)).data;
 return {app,admin,staff,employee,quote,customer,password};
}

test('summary and CSV share year/month intersections, preserve unique counts and retain owner authorization',async t=>{
 const f=await fixture(t);await f.quote('2025-02-28');await f.quote('2026-01-31');const feb=await f.quote('2026-02-01',f.admin,3);await f.quote('2026-02-28',f.staff);
 const query='?from=2025-01-01&to=2026-12-31&year=2026&month=02',summary=await f.admin.request('/api/reports/summary'+query),product=await f.admin.request('/api/reports/product-performance'+query);
 assert.equal(summary.timezone,product.timezone);assert.equal(summary.count,2);assert.equal(summary.products[0].quotationCount,2);assert.equal(summary.products[0].timesQuoted,4);assert.equal(summary.quotedValue,47200);assert.equal(product.totals.quotationCount,summary.count);
 assert.equal(summary.byMonthStatus.reduce((n,r)=>n+r.count,0),2);assert.ok(summary.byMonthStatus.every(r=>r.period==='2026-02'));assert.ok(!Object.hasOwn(summary,'quotes'));
 const csv=await f.admin.request('/api/reports/quotations.csv'+query);assert.equal(csv.trim().split(/\r?\n/).length,3);assert.ok(csv.includes(feb.no));assert.ok(!csv.includes('2025-02-28'));assert.ok(!csv.includes('2026-01-31'));
 const own=await f.staff.request('/api/reports/summary'+query);assert.equal(own.count,1);assert.equal(own.products[0].quotationCount,1);assert.equal(own.quotedValue,11800);
 assert.equal((await f.admin.request('/api/reports/summary?from=2026-01-01&to=2026-12-31&year=2025')).count,0);
 const before=await f.app.db.prepare('SELECT id,body,total,version FROM quotations ORDER BY id').all();await f.admin.request('/api/reports/summary'+query);assert.deepEqual(await f.app.db.prepare('SELECT id,body,total,version FROM quotations ORDER BY id').all(),before);
});

test('report-only and mixed roles never receive identifiers for quotations outside their document access',async t=>{
 const f=await fixture(t),other=await f.quote('2026-01-01'),own=await f.quote('2026-01-02',f.staff),id=f.employee.user.id;
 await f.admin.request('/api/users/'+id,'PATCH',{version:1,permissions:['reports.view_all','quotation.view_own','quotation.share_whatsapp']});await f.staff.request('/api/auth/login','POST',{username:'reportemployee',password:f.password});
 const mixed=await f.staff.request('/api/reports/summary?year=2026');assert.equal(mixed.count,2);assert.deepEqual(mixed.sharingQuotationIds,[own.id]);assert.ok(!mixed.sharingQuotationIds.includes(other.id));assert.ok(!Object.hasOwn(mixed,'quotes'));
 await f.staff.request('/api/quotations/'+other.id,'GET',undefined,404);
 await f.admin.request('/api/users/'+id,'PATCH',{version:2,permissions:['reports.view_all']});await f.staff.request('/api/auth/login','POST',{username:'reportemployee',password:f.password});
 const reportOnly=await f.staff.request('/api/reports/summary?year=2026');assert.equal(reportOnly.count,2);assert.deepEqual(reportOnly.sharingQuotationIds,[]);assert.ok(!Object.hasOwn(reportOnly,'quotes'));
});

test('report calendar filters reject malformed, duplicate and injection values in summaries and exports',async t=>{
 const f=await fixture(t);for(const query of ['year=2026%27OR1=1','year=2026&year=2025','year=','year=0099','month=0','month=13','month=1.5','month=1&month=2'])for(const route of ['/api/reports/summary','/api/reports/quotations.csv'])await f.admin.request(route+'?'+query,'GET',undefined,422);
 await f.admin.request('/api/users/'+f.employee.user.id,'PATCH',{version:1,permissions:['product.view']});await f.staff.request('/api/reports/summary?year=2026','GET',undefined,401);
});

test('large charts bound keyboard stops, preserve exact zeros and distinguish current-status reporting',()=>{
 const months=Charts.periods({from:'2022-01-01',to:'2026-12-31'}),series=Array.from({length:50},(_,i)=>({id:'p'+i,label:'Product '+i,values:months.map((_,m)=>i+m)}));
 for(const mode of ['grouped','stacked','line','area']){const html=Charts.cartesian({id:'large',title:'Large chart',months,series,mode});assert.ok(!/NaN|Infinity|undefined/.test(html));assert.equal((html.match(/tabindex="0"/g)||[]).length,1);assert.ok(html.includes('Exact values are available'));}
 const zero=Charts.ranking({id:'zero',title:'Zero value',unit:'money',rows:[{id:'p',label:'Free quotation',value:0}]});assert.match(zero,/role="group"/);assert.match(zero,/width:0%/);assert.ok(!zero.includes('NaN'));
});

test('report currency labels and product CSV decimals preserve every paise up to the safe integer limit',()=>{
 assert.equal(Charts.moneyDecimal(Number.MAX_SAFE_INTEGER),'90071992547409.91');assert.equal(Charts.format(Number.MAX_SAFE_INTEGER,'money'),'\u20b99,00,71,99,25,47,409.91');
 assert.equal(Charts.moneyDecimal(1),'0.01');assert.equal(Charts.moneyDecimal(-1),'-0.01');assert.equal(Charts.format(-1,'money'),'-\u20b90.01');assert.equal(Charts.format(0,'money'),'\u20b90.00');
 for(let n=Number.MAX_SAFE_INTEGER-100;n<=Number.MAX_SAFE_INTEGER;n++)assert.equal(Charts.format(n,'money').slice(-2),String(BigInt(n)%100n).padStart(2,'0'));
});
