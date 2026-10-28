'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createApp}=require('../server');
const {testDatabase}=require('./database-helper');
const DP=require('../shared/domain');
async function fixture(t){
 const database=await testDatabase(),app=await createApp(database);
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await app.close();await database.destroy();});
 const base=`http://127.0.0.1:${app.server.address().port}`,password='Quotation-test-'+crypto.randomUUID();
 function client(){let cookie='',csrf='';return {async request(route,method='GET',value,status=200){const response=await fetch(base+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(value===undefined?{}:{'Content-Type':'application/json'})},...(value===undefined?{}:{body:JSON.stringify(value)})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const data=response.headers.get('content-type')?.includes('application/json')?await response.json():Buffer.from(await response.arrayBuffer());if(data.csrfToken)csrf=data.csrfToken;assert.equal(response.status,status,`${method} ${route}: ${Buffer.isBuffer(data)?'document':JSON.stringify(data)}`);return data;}};}
 const admin=client();await admin.request('/api/auth/setup','POST',{name:'Quotation QA',username:'quotationqa',password,demo:false},201);
 const state=(await admin.request('/api/state')).state,customer=(await admin.request('/api/customers','POST',{name:'Quotation customer',mob:'9876500011',co:'Isolated company',notes:'PRIVATE-CUSTOMER-SECRET'},201)).data;
 const draft={cid:customer.id,date:'2026-10-28',valid:'2026-11-10',internalNotes:'PRIVATE-QUOTATION-SECRET',terms:['CUSTOMER-TERMS-VISIBLE'],items:[{pid:'p2',cfg:{...DP.defCfg(state.products.find(p=>p.id==='p2')),qty:3},notes:'PRIVATE-ITEM-SECRET'}],del:35.25,oth:12.50,disc:{t:'p',v:5}};
 return {app,admin,client,password,customer,draft,state};
}
test('quotation private notes roundtrip in existing JSON without changing numbering, status or pricing',async t=>{
 const f=await fixture(t),created=await f.admin.request('/api/quotations','POST',f.draft,201),q=created.data;
 assert.equal(q.internalNotes,f.draft.internalNotes);assert.equal(q.status,'Draft');assert.match(q.no,/\/2026\/\d+$/);
 const total=DP.totals(q).grand,history=structuredClone(q.hist);
 const updated=await f.admin.request('/api/quotations/'+q.id,'PATCH',{version:created.version,data:{internalNotes:'Updated private note',project:'New project'}});
 assert.equal(updated.data.internalNotes,'Updated private note');assert.equal(updated.data.no,q.no);assert.equal(DP.totals(updated.data).grand,total);assert.deepEqual(updated.data.hist,history);
 const omitted=await f.admin.request('/api/quotations/'+q.id,'PATCH',{version:updated.version,data:{subject:'Unrelated metadata edit'}});
 assert.equal(omitted.data.internalNotes,'Updated private note');
 await f.admin.request('/api/quotations/'+q.id,'PATCH',{version:omitted.version,data:{internalNotes:'x'.repeat(4001)}},422);
 const cleared=await f.admin.request('/api/quotations/'+q.id,'PATCH',{version:omitted.version,data:{internalNotes:''}});assert.equal(cleared.data.internalNotes,'');assert.equal(DP.totals(cleared.data).grand,total);
 const legacy=await f.admin.request('/api/quotations','POST',{...f.draft,internalNotes:undefined},201);assert.equal(Object.hasOwn(legacy.data,'internalNotes'),false);
});
test('private quotation notes are excluded from preview projection, PDFs and WhatsApp handoff',async t=>{
 const f=await fixture(t),created=await f.admin.request('/api/quotations','POST',f.draft,201),id=created.data.id;
 const preview=await f.admin.request('/api/quotations/preview','POST',created.data);
 assert.equal(Object.hasOwn(preview.quotation,'internalNotes'),false);assert.equal(preview.totals.grand,DP.totals(created.data).grand);
 for(const secret of [f.draft.internalNotes,'PRIVATE-ITEM-SECRET','PRIVATE-CUSTOMER-SECRET'])assert.ok(!JSON.stringify(preview.quotation).includes(secret));
 assert.equal(Object.hasOwn(preview.quotation.items[0],'cfg'),false);assert.equal(Object.hasOwn(preview.quotation.items[0],'fieldSnapshot'),false);
 const pdf=await f.admin.request('/api/quotations/'+id+'/pdf');assert.ok(pdf.subarray(0,5).equals(Buffer.from('%PDF-')));
 for(const secret of [f.draft.internalNotes,'PRIVATE-ITEM-SECRET'])assert.ok(!pdf.toString('latin1').includes(secret));
 assert.ok(pdf.toString('latin1').includes('CUSTOMER-TERMS-VISIBLE'));
 const shared=await f.admin.request('/api/quotations/'+id+'/whatsapp','POST',{version:created.version,number:'+919876500011'},201);
 assert.ok(!JSON.stringify(shared).includes(f.draft.internalNotes));assert.ok(!JSON.stringify(shared).includes('PRIVATE-ITEM-SECRET'));
 assert.equal((await f.admin.request('/api/quotations/'+id)).data.status,'Draft');
});
test('private notes inherit existing staff quotation ownership and edit permissions',async t=>{
 const f=await fixture(t),created=await f.admin.request('/api/quotations','POST',f.draft,201);
 const account=await f.admin.request('/api/users','POST',{name:'Restricted employee',username:'quotationemployee',password:f.password,role:'Employee'},201),employee=f.client();
 await employee.request('/api/auth/login','POST',{username:account.user.username,password:f.password});
 await employee.request('/api/quotations/'+created.data.id,'GET',undefined,404);
 await employee.request('/api/quotations/'+created.data.id,'PATCH',{version:created.version,data:{internalNotes:'Unauthorized'}},404);
 assert.ok(!JSON.stringify(await employee.request('/api/state')).includes(f.draft.internalNotes));
 const own=await employee.request('/api/quotations','POST',{...f.draft,internalNotes:'Own private note'},201);assert.equal(own.data.internalNotes,'Own private note');
 await f.client().request('/api/quotations/'+own.data.id,'GET',undefined,401);
 assert.equal((await f.admin.request('/api/quotations/'+created.data.id)).data.internalNotes,f.draft.internalNotes);
});
