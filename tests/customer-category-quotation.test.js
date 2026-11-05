'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const DP=require('../shared/domain'),CC=require('../shared/customer-categories'),{createApp}=require('../server'),{testDatabase}=require('./database-helper');

test('review: versioned decimal calculations round tax, manual discounts and currency half-paise exactly',()=>{
 const item={sub:1500,base:1500,qty:1,tax:2.3,taxMode:'exclusive'},q={calculationVersion:2,items:[item],disc:{t:'p',v:0}};
 assert.equal(DP.totals(q).gst,35); // 15.00 * 2.3% = 0.345, rounded half-up.
 assert.equal(DP.totals({...q,disc:{t:'p',v:2.3}}).disc,35);
 assert.equal(DP.totals({...q,disc:{t:'f',v:1.005},del:1.005}).disc,101);
 assert.equal(DP.totals({...q,del:1.005}).qc,101);
 const inclusive={...q,items:[{...item,sub:180,base:180,tax:0.32,taxMode:'inclusive'}]};
 assert.equal(DP.totals(inclusive).taxable,179);
 // Historical records keep the original rounding, including known boundary behavior.
 delete q.calculationVersion;assert.equal(DP.totals(q).gst,34);
});

test('review: versioned product pricing avoids floating point money and dimension multiplication',()=>{
 const p={id:'precision',code:'PRECISION',cat:'c',name:'Precision',m:'unit',rate:1.005,tax:2.3,taxMode:'exclusive',f:[]};
 assert.equal(DP.calc(p,{qty:1},2).sub,101);assert.equal(DP.calc(p,{qty:1}).sub,100);
 const charged={...p,rate:15,charges:[{label:'Percentage',type:'p',amount:2.3}]};
 assert.equal(DP.calc(charged,{qty:1},2).sub,1535);
 assert.equal(DP.calc({...p,m:'area',rate:1},{qty:1,w:1.005,h:1,u:'ft'},2).sub,101);
 assert.equal(DP.calc({...p,m:'area',rate:1},{qty:1,w:12,h:12,u:'in'},2).sub,100);
 assert.equal(DP.calc({...p,m:'area',rate:1},{qty:1,w:30.48,h:30.48,u:'cm'},2).sub,100);
});

test('review: full versioned totals reconcile with an independent integer oracle across mixed tax treatments',()=>{
 const half=(n,d)=>Number((2n*n+d)/(2n*d));
 for(let sample=1;sample<=600;sample++){
  const points=[0,1,230,510,1234,3333,9999,10000][sample%8];
  const items=[0,1,2,3].map(i=>({sub:(sample*7919+i*3571)%100000+1,base:1,qty:1,tax:[2.3,18,12.34,0][i],taxMode:['exclusive','inclusive','exclusive','exempt'][i]}));
  const subtotal=items.reduce((s,i)=>s+i.sub,0),discount=half(BigInt(subtotal)*BigInt(points),10000n);
  const allocated=items.map((item,index)=>({index,value:Number(BigInt(item.sub)*BigInt(discount)/BigInt(subtotal)),rem:BigInt(item.sub)*BigInt(discount)%BigInt(subtotal)}));
  const remainder=discount-allocated.reduce((s,i)=>s+i.value,0);
  [...allocated].sort((a,b)=>a.rem===b.rem?a.index-b.index:a.rem>b.rem?-1:1).slice(0,remainder).forEach(i=>i.value++);
  const groups=new Map(),rows=items.map((i,index)=>({...i,amount:i.sub-allocated[index].value}));
  rows.push({amount:101,tax:2.3,taxMode:'exclusive'});
  for(const row of rows){const key=row.tax+':'+row.taxMode,old=groups.get(key);if(old)old.amount+=row.amount;else groups.set(key,{...row});}
  let taxable=0,gst=0;
  for(const row of groups.values()){
   const rate=BigInt(Math.round(row.tax*100)),amount=BigInt(row.amount);
   const net=row.taxMode==='inclusive'?half(amount*10000n,10000n+rate):row.amount;
   taxable+=net;gst+=row.taxMode==='inclusive'?row.amount-net:half(BigInt(net)*rate,10000n);
  }
  const totals=DP.totals({calculationVersion:2,items,discountSource:'category',disc:{t:'p',v:points/100},del:1.005,chargeTax:2.3});
  assert.deepEqual([totals.disc,totals.taxable,totals.gst,totals.grand],[discount,taxable,gst,taxable+gst],'sample '+sample);
  assert.equal(totals.cgst+totals.sgst,gst);
 }
});
async function fixture(t){
 const database=await testDatabase(),app=await createApp({...database,staticDir:path.resolve('public')});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();await database.destroy();});
 const base='http://127.0.0.1:'+app.server.address().port,password='Category-quotation-'+crypto.randomUUID();
 function client(){let cookie='',csrf='';return {async raw(route,method='GET',data){const r=await fetch(base+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;},async request(route,method='GET',data,status=200){const r=await this.raw(route,method,data),value=await r.json();if(value.csrfToken)csrf=value.csrfToken;assert.equal(r.status,status,route+': '+JSON.stringify(value));return value;}};}
 const admin=client();await admin.request('/api/auth/setup','POST',{name:'Category quotation QA',username:'categoryquoteqa',password,demo:false},201);
 const state=(await admin.request('/api/state')).state,p=state.products.find(p=>p.id==='p5');let phone=9876500000;
 const customer=async(extra={})=>(await admin.request('/api/customers','POST',{name:'Member '+phone,mob:String(phone++),addr:'BILLING STREET',contactPersonPhone:'+919000001111',...extra},201)).data;
 const configure=async(id,percentage,extra={})=>{const old=await admin.request('/api/customer-categories/'+id);return (await admin.request('/api/customer-categories/'+id,'PATCH',{version:old.data.version,data:{discountPercentage:percentage,highlightEnabled:true,highlightMessage:id+' MEMBER MESSAGE\nSECOND LINE',...extra}})).data;};
 const quote=(cid,extra={})=>({cid,items:[{id:'line',pid:p.id,cfg:DP.defCfg(p)}],...extra});return {database,app,admin,client,password,customer,configure,quote};
}

test('category money uses exact basis points and half-up paise rounding over its full range',()=>{
 for(const subtotal of [0,1,3,50,10005,1234567890123,9000000000001])for(const value of ['0.00','0.01','12.34','33.33','99.99','100.00']){
  const points=Number(value.replace('.','')),expected=Number((BigInt(subtotal)*BigInt(points)+5000n)/10000n);assert.equal(CC.amount(subtotal,value),expected);
 }
 for(const value of [-1,100.01,'1.234','NaN',null])assert.throws(()=>CC.amount(100,value));
 assert.equal(CC.amount(10005,'10.00'),1001);
});

test('category discount shares allocation and existing exclusive, inclusive, exempt and split/IGST rules',()=>{
 const items=[{sub:101,base:101,qty:1,tax:18,taxMode:'exclusive'},{sub:118,base:118,qty:1,tax:18,taxMode:'inclusive'},{sub:99,base:99,qty:1,tax:0,taxMode:'exempt'}];
 const q={items,disc:{t:'p',v:12.34},discountSource:'category',del:1,oth:0,chargeTax:18,chargeTaxMode:'exclusive'},t=DP.totals(q);assert.equal(t.disc,39);assert.equal(t.qc,100);assert.equal(t.taxable,363);assert.equal(t.gst,50);assert.equal(t.grand,413);assert.equal(t.cgst+t.sgst,t.gst);assert.equal(DP.totals({...q,taxDisplay:'igst'}).grand,t.grand);
 assert.equal(DP.totals({...q,disc:{t:'p',v:100}}).grand,118);assert.equal(DP.totals({...q,disc:{t:'p',v:0}}).disc,0);
});

test('BNI and YES defaults use one authoritative discount and preview, save and PDF agree',async t=>{
 const f=await fixture(t);for(const [id,percentage] of [['cc_bni','12.34'],['cc_yes','7.25']]){
  await f.configure(id,percentage);const c=await f.customer({categoryId:id}),input=f.quote(c.id,{disc:{t:'p',v:99},categoryDiscountAmount:999999,categorySnapshot:{discountPercentage:'99.00'}}),preview=await f.admin.request('/api/quotations/preview','POST',input),saved=await f.admin.request('/api/quotations','POST',input,201),q=saved.data,totals=DP.totals(q);
  assert.deepEqual(q.disc,{t:'p',v:Number(percentage)});assert.equal(q.discountSource,'category');assert.equal(q.categoryDiscountAmount,totals.disc);assert.equal(q.categorySnapshot.discountPercentage,percentage);assert.equal(q.customerSnapshot.contactPersonPhone,c.contactPersonPhone);assert.equal(preview.quotation.customerSnapshot.contactPersonPhone,c.contactPersonPhone);assert.deepEqual(preview.totals,totals);assert.equal(preview.quotation.categorySnapshot.highlightMessage,q.categorySnapshot.highlightMessage);
  assert.equal((await f.app.db.prepare('SELECT total FROM quotations WHERE id=?').get(q.id)).total,totals.grand);const pdf=await f.admin.raw('/api/quotations/'+q.id+'/pdf'),bytes=Buffer.from(await pdf.arrayBuffer());assert.equal(pdf.status,200);assert.ok(bytes.includes(Buffer.from(DP.rs(totals.grand))));assert.ok(bytes.includes(Buffer.from('category discount')));assert.ok(bytes.indexOf(Buffer.from(id+' MEMBER MESSAGE'))<bytes.indexOf(Buffer.from('Terms and conditions')));
 }
});

test('uncategorized, Other, inactive and archived categories preserve manual quotation discounts',async t=>{
 const f=await fixture(t);await f.configure('cc_bni','20.00',{active:false});await f.configure('cc_yes','30.00');const yes=await f.admin.request('/api/customer-categories/cc_yes');await f.admin.request('/api/customer-categories/cc_yes','DELETE',{version:yes.data.version});
 for(const extra of [{},{categoryId:'cc_other',customCategoryName:'My local association'}]){const c=await f.customer(extra),q=(await f.admin.request('/api/quotations','POST',f.quote(c.id,{disc:{t:'f',v:12.5}}),201)).data;assert.deepEqual(q.disc,{t:'f',v:12.5});assert.notEqual(q.discountSource,'category');}
 for(const categoryId of ['cc_bni','cc_yes']){const c=await f.customer();await f.app.db.prepare('UPDATE customers SET category_id=? WHERE id=?').run(categoryId,c.id);const q=(await f.admin.request('/api/quotations','POST',f.quote(c.id,{disc:{t:'p',v:5}}),201)).data;assert.equal(q.disc.v,5);assert.notEqual(q.discountSource,'category');assert.equal(q.categorySnapshot.highlightEnabled,false);}
});

test('zero and maximum category percentages are applied without discounting delivery or other charges',async t=>{
 const f=await fixture(t);for(const percentage of ['0.00','100.00']){await f.configure('cc_bni',percentage);const c=await f.customer({categoryId:'cc_bni'}),q=(await f.admin.request('/api/quotations','POST',f.quote(c.id,{del:10,oth:5}),201)).data,total=DP.totals(q);assert.equal(q.discountSource,'category');assert.equal(q.categoryDiscountAmount,CC.amount(total.isub,percentage));if(percentage==='100.00')assert.equal(total.grand,1770);}
});

test('changing customer updates the category default, clears automatic discounts and never stacks manual discounts',async t=>{
 const f=await fixture(t);await f.configure('cc_bni','12.34');await f.configure('cc_yes','7.25');const a=await f.customer({categoryId:'cc_bni'}),b=await f.customer({categoryId:'cc_yes'}),plain=await f.customer();let saved=await f.admin.request('/api/quotations','POST',f.quote(a.id),201);
 saved=await f.admin.request('/api/quotations/'+saved.data.id,'PATCH',{version:saved.version,data:{cid:b.id}});assert.equal(saved.data.disc.v,7.25);assert.equal(saved.data.categorySnapshot.id,'cc_yes');
 saved=await f.admin.request('/api/quotations/'+saved.data.id,'PATCH',{version:saved.version,data:{cid:plain.id}});assert.equal(saved.data.disc.v,0);assert.equal(saved.data.categorySnapshot,null);
 saved=await f.admin.request('/api/quotations/'+saved.data.id,'PATCH',{version:saved.version,data:{discountSource:'manual',disc:{t:'f',v:15}}});assert.equal(saved.data.disc.v,15);
 saved=await f.admin.request('/api/quotations/'+saved.data.id,'PATCH',{version:saved.version,data:{cid:a.id}});assert.equal(saved.data.disc.v,12.34);assert.equal(saved.data.discountSource,'category');
 saved=await f.admin.request('/api/quotations/'+saved.data.id,'PATCH',{version:saved.version,data:{discountSource:'manual',disc:{t:'p',v:2}}});assert.equal(saved.data.disc.v,2);assert.equal(saved.data.categoryDiscountAmount,0);assert.equal(DP.totals(saved.data).disc,6_00);
});

test('category settings and customer category changes do not silently reprice existing drafts or finalized quotes',async t=>{
 const f=await fixture(t);await f.configure('cc_bni','12.34');await f.configure('cc_yes','7.25');const c=await f.customer({categoryId:'cc_bni'});let saved=await f.admin.request('/api/quotations','POST',f.quote(c.id),201);const original=structuredClone(saved.data);
 await f.configure('cc_bni','25.00',{highlightMessage:'NEW MESSAGE'});await f.admin.request('/api/customers/'+c.id,'PATCH',{version:1,data:{categoryId:'cc_yes'}});
 saved=await f.admin.request('/api/quotations/'+saved.data.id,'PATCH',{version:saved.version,data:{project:'Unrelated draft edit'}});assert.deepEqual(saved.data.categorySnapshot,original.categorySnapshot);assert.equal(DP.totals(saved.data).grand,DP.totals(original).grand);
 saved=await f.admin.request('/api/quotations/'+saved.data.id,'PATCH',{version:saved.version,data:{_applyCategoryDiscount:true}});assert.equal(saved.data.disc.v,7.25);assert.equal(saved.data.categorySnapshot.id,'cc_yes');
 saved=await f.admin.request('/api/quotations/'+saved.data.id+'/status','POST',{version:saved.version,status:'Sent to Customer'});const frozen=structuredClone(saved.data);await f.configure('cc_yes','100.00',{highlightMessage:'LATER MESSAGE'});
 const read=(await f.admin.request('/api/quotations/'+saved.data.id)).data;assert.deepEqual(read,frozen);await f.admin.request('/api/quotations/'+saved.data.id,'PATCH',{version:saved.version,data:{_applyCategoryDiscount:true}},422);
 const duplicate=await f.admin.request('/api/quotations/'+saved.data.id+'/duplicate','POST',{version:saved.version},201);assert.equal(duplicate.data.disc.v,7.25);assert.deepEqual(duplicate.data.categorySnapshot,frozen.categorySnapshot);
});

test('legacy category quotations retain manual discounts and absent discount snapshots until explicit draft refresh',async t=>{
 const f=await fixture(t);await f.configure('cc_bni','12.34');const c=await f.customer({categoryId:'cc_bni'});let saved=await f.admin.request('/api/quotations','POST',f.quote(c.id,{discountSource:'manual',disc:{t:'f',v:9}}),201),body=structuredClone(saved.data);delete body.discountSource;delete body.categoryDiscountAmount;delete body.categorySnapshot.discountPercentage;delete body.items;delete body.hist;await f.app.db.prepare('UPDATE quotations SET body=? WHERE id=?').run(JSON.stringify(body),saved.data.id);
 saved=await f.admin.request('/api/quotations/'+saved.data.id,'PATCH',{version:saved.version,data:{project:'Legacy draft edit'}});assert.deepEqual(saved.data.disc,{t:'f',v:9});assert.equal(Object.hasOwn(saved.data.categorySnapshot,'discountPercentage'),false);assert.equal(Object.hasOwn(saved.data,'categoryDiscountAmount'),false);
 saved=await f.admin.request('/api/quotations/'+saved.data.id,'PATCH',{version:saved.version,data:{_applyCategoryDiscount:true}});assert.equal(saved.data.disc.v,12.34);assert.equal(saved.data.categorySnapshot.discountPercentage,'12.34');
});

test('automatic defaults and manual overrides respect existing employee caps and cannot forge discounts',async t=>{
 const f=await fixture(t);await f.configure('cc_bni','12.34');const c=await f.customer({categoryId:'cc_bni'});await f.admin.request('/api/users','POST',{name:'Employee',username:'limited',password:f.password,role:'Employee'},201);const employee=f.client();await employee.request('/api/auth/login','POST',{username:'limited',password:f.password});
 await employee.request('/api/quotations','POST',f.quote(c.id),403);const manual=await employee.request('/api/quotations','POST',f.quote(c.id,{discountSource:'manual',disc:{t:'p',v:5}}),201);assert.equal(manual.data.categoryDiscountAmount,0);
 await employee.request('/api/quotations/'+manual.data.id,'PATCH',{version:manual.version,data:{discountSource:'category',categorySnapshot:{discountPercentage:'1.00'},disc:{t:'p',v:1}}},403);
 await employee.request('/api/quotations/'+manual.data.id,'PATCH',{version:manual.version,data:{discountSource:'manual',disc:{t:'p',v:99}}},403);
 await f.admin.request('/api/quotations','POST',f.quote(c.id,{discountSource:'forged'}),422);await f.admin.request('/api/quotations','POST',f.quote(c.id,{_applyCategoryDiscount:'yes'}),422);
});

test('delivery addresses stay customer-owned and historical while the independent contact number is snapshotted',async t=>{
 const f=await fixture(t),address={label:'Warehouse',line1:'DELIVERY STREET',country:'India',isDefault:true};await f.configure('cc_bni','5.00');const a=await f.customer({categoryId:'cc_bni',deliveryAddresses:[address]}),b=await f.customer({deliveryAddresses:[{...address,line1:'FOREIGN STREET'}]});
 await f.admin.request('/api/quotations','POST',f.quote(a.id,{deliveryAddressId:b.deliveryAddressId}),422);const saved=await f.admin.request('/api/quotations','POST',f.quote(a.id),201);assert.equal(saved.data.customerSnapshot.addr,'BILLING STREET');assert.equal(saved.data.customerSnapshot.contactPersonPhone,a.contactPersonPhone);assert.equal(saved.data.deliveryAddressSnapshot.line1,'DELIVERY STREET');
 await f.admin.request('/api/customers/'+a.id+'/delivery-addresses/'+a.deliveryAddressId,'PATCH',{version:1,data:{line1:'CHANGED DELIVERY',archived:true}});const edited=await f.admin.request('/api/quotations/'+saved.data.id,'PATCH',{version:saved.version,data:{project:'After address edit'}});assert.deepEqual(edited.data.deliveryAddressSnapshot,saved.data.deliveryAddressSnapshot);assert.deepEqual(edited.data.categorySnapshot,saved.data.categorySnapshot);
});


test('review: server owns calculation policy, exact persisted totals and historical rounding',async t=>{
 const f=await fixture(t);await f.configure('cc_bni','0.00');const c=await f.customer({categoryId:'cc_bni'});
 const product=await f.admin.request('/api/products/p5');await f.admin.request('/api/products/p5','PATCH',{version:product.version,data:{tax:2.3}});
 const input=f.quote(c.id,{calculationVersion:1,items:[{id:'exact',pid:'p5',cfg:DP.defCfg(product.data),override:{amount:15,reason:'Precision boundary fixture'}}]});
 const preview=await f.admin.request('/api/quotations/preview','POST',input);let saved=await f.admin.request('/api/quotations','POST',input,201);
 assert.equal(saved.data.calculationVersion,2);assert.equal(preview.quotation.calculationVersion,2);
 assert.deepEqual([preview.totals.taxable,preview.totals.gst,preview.totals.grand],[1500,35,1535]);
 assert.equal((await f.app.db.prepare('SELECT total FROM quotations WHERE id=?').get(saved.data.id)).total,1535);
 const bytes=Buffer.from(await (await f.admin.raw('/api/quotations/'+saved.data.id+'/pdf')).arrayBuffer());assert.ok(bytes.includes(Buffer.from('Rs. 15.35')));
 const body=structuredClone(saved.data);delete body.calculationVersion;delete body.items;delete body.hist;
 await f.app.db.prepare('UPDATE quotations SET body=?,total=? WHERE id=?').run(JSON.stringify(body),1534,saved.data.id);
 saved=await f.admin.request('/api/quotations/'+saved.data.id,'PATCH',{version:saved.version,data:{project:'Preserve legacy',calculationVersion:2}});
 assert.equal(Object.hasOwn(saved.data,'calculationVersion'),false);assert.equal(DP.totals(saved.data).grand,1534);
 saved=await f.admin.request('/api/quotations/'+saved.data.id,'PATCH',{version:saved.version,data:{_applyCategoryDiscount:true}});assert.equal(Object.hasOwn(saved.data,'calculationVersion'),false);assert.equal(DP.totals(saved.data).grand,1534);
 const duplicate=await f.admin.request('/api/quotations/'+saved.data.id+'/duplicate','POST',{version:saved.version},201);assert.equal(duplicate.data.calculationVersion,2);assert.equal(DP.totals(duplicate.data).grand,1535);
 saved=await f.admin.request('/api/quotations/'+saved.data.id+'/status','POST',{version:saved.version,status:'Sent to Customer'});
 const historical=structuredClone(saved.data),originalPdf=Buffer.from(await (await f.admin.raw('/api/quotations/'+saved.data.id+'/pdf')).arrayBuffer());
 const settings=await f.admin.request('/api/settings');await f.admin.request('/api/settings','PATCH',{version:settings.version,data:{tax:28,taxMode:'inclusive',taxDisplay:'igst'}});
 await f.admin.request('/api/customers/'+c.id,'PATCH',{version:1,data:{addr:'LATER BILLING ADDRESS'}});
 const read=(await f.admin.request('/api/quotations/'+saved.data.id)).data;assert.deepEqual(read,historical);assert.equal(DP.totals(read).grand,1534);
 const pdf=Buffer.from(await (await f.admin.raw('/api/quotations/'+saved.data.id+'/pdf')).arrayBuffer());assert.ok(pdf.includes(Buffer.from('Rs. 15.34')));assert.ok(originalPdf.includes(Buffer.from('Rs. 15.34')));
 assert.equal((await f.app.db.prepare('SELECT total FROM quotations WHERE id=?').get(saved.data.id)).total,1534);
});

test('review: changing customers clears inherited contact overrides without changing either customer',async t=>{
 const f=await fixture(t),a=await f.customer({person:'Person A',addr:'BILLING A'}),b=await f.customer({person:'Person B',addr:'BILLING B'});
 let q=await f.admin.request('/api/quotations','POST',f.quote(a.id,{contact:{person:'A override',addr:'A override street'}}),201);
 const preview=await f.admin.request('/api/quotations/preview','POST',{...q.data,cid:b.id});assert.equal(preview.quotation.customerSnapshot.addr,'BILLING B');
 q=await f.admin.request('/api/quotations/'+q.data.id,'PATCH',{version:q.version,data:{cid:b.id}});
 assert.equal(q.data.customerSnapshot.addr,'BILLING B');assert.equal(q.data.customerSnapshot.person,'Person B');assert.equal(Object.hasOwn(q.data,'contact'),false);
 assert.equal((await f.admin.request('/api/customers/'+a.id)).data.addr,'BILLING A');assert.equal((await f.admin.request('/api/customers/'+b.id)).data.addr,'BILLING B');
});


test('review: finalized category snapshots and private logo references survive replacement, removal and archive',async t=>{
 const f=await fixture(t),sharp=require('sharp');
 const logo=async colour=>'data:image/png;base64,'+(await sharp({create:{width:8,height:8,channels:3,background:colour}}).png().toBuffer()).toString('base64');
 let category=await f.configure('cc_bni','20.00',{logoDataUrl:await logo('#168080')});const key=category.logoStorageKey,c=await f.customer({categoryId:category.id});
 let saved=await f.admin.request('/api/quotations','POST',f.quote(c.id),201);saved=await f.admin.request('/api/quotations/'+saved.data.id+'/status','POST',{version:saved.version,status:'Sent to Customer'});const frozen=structuredClone(saved.data);
 category=(await f.admin.request('/api/customer-categories/'+category.id,'PATCH',{version:category.version,data:{discountPercentage:'100.00',highlightMessage:'LATER MESSAGE',logoDataUrl:await logo('#ff0000')}})).data;
 assert.notEqual(category.logoStorageKey,key);
 category=(await f.admin.request('/api/customer-categories/'+category.id,'PATCH',{version:category.version,data:{removeLogo:true}})).data;
 await f.admin.request('/api/customer-categories/'+category.id,'DELETE',{version:category.version});
 const read=(await f.admin.request('/api/quotations/'+saved.data.id)).data;assert.deepEqual(read,frozen);assert.equal(read.categorySnapshot.logoStorageKey,key);assert.equal(read.categorySnapshot.highlightMessage,'cc_bni MEMBER MESSAGE\nSECOND LINE');assert.equal(DP.totals(read).grand,28320);
 assert.equal((await f.admin.raw('/api/customer-category-logos/'+key)).status,200);assert.equal((await f.client().raw('/api/customer-category-logos/'+key)).status,401);
 assert.equal((await f.admin.request('/api/customers/'+c.id)).data.categoryId,category.id);
 const bytes=Buffer.from(await (await f.admin.raw('/api/quotations/'+saved.data.id+'/pdf')).arrayBuffer());assert.ok(bytes.includes(Buffer.from('Rs. 283.20')));assert.ok(bytes.includes(Buffer.from('cc_bni MEMBER MESSAGE')));assert.equal(bytes.includes(Buffer.from('LATER MESSAGE')),false);
});
