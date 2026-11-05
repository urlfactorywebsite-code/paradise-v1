'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const sharp=require('sharp'),DP=require('../shared/domain'),{createApp}=require('../server'),{testDatabase}=require('./database-helper');
async function fixture(t){
 const database=await testDatabase(),app=await createApp({...database,staticDir:path.resolve('public')});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await app.close();await database.destroy();});const base='http://127.0.0.1:'+app.server.address().port,password='Release-QA-'+crypto.randomUUID();
 function client(){let cookie='',csrf='';return {async raw(route,method='GET',data,headers={}){const response=await fetch(base+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;},async request(route,method='GET',data,status=200){const response=await this.raw(route,method,data),result=await response.json();if(result.csrfToken)csrf=result.csrfToken;assert.equal(response.status,status,method+' '+route+': '+(result.error||''));return result;}};}
 const admin=client();await admin.request('/api/auth/setup','POST',{name:'Release QA',username:'releaseqa',password,demo:false},201);return {app,database,admin,client,password};
}
const address=(label='Warehouse',isDefault=true)=>({label,line1:'Delivery street',country:'India',isDefault});
const customer=(extra={})=>({name:'Release customer',mob:'9876500200',addr:'BILLING STREET',...extra});

test('release: hostile listing search/filter controls fail validation before PostgreSQL',async t=>{
 const {admin}=await fixture(t);
 for(const route of ['/api/customers?q=%00','/api/quotations?q=%00','/api/quotations?customer=%00','/api/quotations?salesperson=%01','/api/reports/summary?employee=%00'])await admin.request(route,'GET',undefined,422);
});

test('release: SQL injection stays literal and invalid sort/pagination cannot execute SQL',async t=>{
 const {admin,app}=await fixture(t),sentinel=await admin.request('/api/customers','POST',customer(),201);
 for(const q of ["' OR 1=1; DROP TABLE customers; --",'%', '_', '\\']){
  assert.equal((await admin.request('/api/customers?q='+encodeURIComponent(q))).pagination.total,0);
  assert.equal((await admin.request('/api/customer-categories?manage=true&q='+encodeURIComponent(q))).pagination.total,0);
 }
 for(const suffix of ['sort=name%3BDROP%20TABLE%20customers','direction=asc%3BSELECT%201','page=-1','pageSize=101'])await admin.request('/api/customers?'+suffix,'GET',undefined,422);
 assert.equal((await app.db.prepare('SELECT count(*) AS n FROM customers').get()).n,1);assert.equal((await admin.request('/api/customers/'+sentinel.data.id)).data.name,sentinel.data.name);
});

test('release: complete category/customer/address/quotation pipeline freezes one discount and all snapshots',async t=>{
 const {admin,app}=await fixture(t),logoDataUrl='data:image/png;base64,'+(await sharp({create:{width:12,height:9,channels:3,background:'#168080'}}).png().toBuffer()).toString('base64');
 const category=await admin.request('/api/customer-categories','POST',{name:'Release members',discountPercentage:'12.34',highlightEnabled:true,highlightMessage:'RELEASE MEMBER BENEFIT\nSECOND LINE',logoDataUrl},201);
 let c=await admin.request('/api/customers','POST',customer({categoryId:category.data.id,person:'Buyer',contactPersonPhone:'+91 (90000) 22222',deliveryAddresses:[address(),address('Branch',false)]}),201);
 c=await admin.request('/api/customers/'+c.data.id,'PATCH',{version:c.version,data:{deliveryAddressId:c.data.deliveryAddresses.find(a=>a.label==='Branch').id}});
 const state=(await admin.request('/api/state')).state,input={cid:c.data.id,disc:{t:'f',v:100},items:[{pid:'p5',cfg:DP.defCfg(state.products.find(p=>p.id==='p5'))}]};
 const preview=await admin.request('/api/quotations/preview','POST',input);let q=await admin.request('/api/quotations','POST',input,201);
 assert.deepEqual([preview.totals.disc,preview.totals.gst,preview.totals.grand],[3702,4734,31032]);assert.equal(q.data.disc.v,12.34);assert.equal(q.data.customerSnapshot.contactPersonPhone,'+919000022222');assert.equal(q.data.customerSnapshot.addr,'BILLING STREET');assert.equal(q.data.deliveryAddressSnapshot.label,'Branch');assert.equal(q.data.categorySnapshot.logoStorageKey,category.data.logoStorageKey);
 assert.equal((await app.db.prepare('SELECT total FROM quotations WHERE id=?').get(q.data.id)).total,31032);
 q=await admin.request('/api/quotations/'+q.data.id+'/status','POST',{version:q.version,status:'Sent to Customer'});const frozen=structuredClone(q.data);
 await admin.request('/api/customer-categories/'+category.data.id,'DELETE',{version:category.version});await admin.request('/api/customers/'+c.data.id+'/delivery-addresses/'+c.data.deliveryAddressId,'PATCH',{version:c.version,data:{archived:true,line1:'LATER ADDRESS'}});
 assert.deepEqual((await admin.request('/api/quotations/'+q.data.id)).data,frozen);assert.equal((await admin.request('/api/customers/'+c.data.id)).data.categoryId,category.data.id);
 const pdf=await admin.raw('/api/quotations/'+q.data.id+'/pdf'),bytes=Buffer.from(await pdf.arrayBuffer());assert.equal(pdf.status,200);assert.ok(bytes.includes(Buffer.from('Rs. 310.32')));assert.ok(bytes.indexOf(Buffer.from('RELEASE MEMBER BENEFIT'))<bytes.indexOf(Buffer.from('Terms and conditions')));
});

test('release: concurrent customer/address and quotation updates have one winner and preserve integrity',async t=>{
 const {admin,app}=await fixture(t),c=await admin.request('/api/customers','POST',customer({deliveryAddresses:[address(),address('Branch',false)]}),201),root='/api/customers/'+c.data.id;
 const responses=await Promise.all([admin.raw(root,'PATCH',{version:c.version,data:{co:'Winner A'}}),admin.raw(root+'/delivery-addresses/'+c.data.deliveryAddresses.find(a=>a.label==='Branch').id,'PATCH',{version:c.version,data:{isDefault:true}})]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal((await admin.request(root)).version,c.version+1);assert.equal((await app.db.prepare('SELECT count(*) AS n FROM customer_delivery_addresses WHERE customer_id=? AND is_default').get(c.data.id)).n,1);
 const q=await admin.request('/api/quotations','POST',{id:'release_idempotent_quote',cid:c.data.id},201);
 const quotes=await Promise.all([admin.raw('/api/quotations/'+q.data.id,'PATCH',{version:q.version,data:{project:'First'}}),admin.raw('/api/quotations/'+q.data.id,'PATCH',{version:q.version,data:{project:'Second'}})]);
 assert.deepEqual(quotes.map(r=>r.status).sort(),[200,409]);await admin.request('/api/quotations','POST',{id:q.data.id,cid:c.data.id},409);assert.equal((await admin.request('/api/quotations')).pagination.total,1);
});

test('release: customer and quotation CRUD preserve references and only cascade the deleted customer addresses',async t=>{
 const {admin,app}=await fixture(t),a=await admin.request('/api/customers','POST',customer({categoryId:'cc_other',customCategoryName:'Local club',contactPersonPhone:'+919000002222',deliveryAddresses:[address(),address('Branch',false)]}),201),b=await admin.request('/api/customers','POST',customer({name:'Retained customer',mob:'9876500210',deliveryAddresses:[address('Retained')]}),201);
 const state=(await admin.request('/api/state')).state;let q=await admin.request('/api/quotations','POST',{cid:a.data.id,items:[{pid:'p5',cfg:DP.defCfg(state.products.find(p=>p.id==='p5'))}]},201);
 q=await admin.request('/api/quotations/'+q.data.id,'PATCH',{version:q.version,data:{project:'Edited project',discountSource:'manual',disc:{t:'p',v:2}}});assert.equal(q.data.project,'Edited project');assert.equal(DP.totals(q.data).grand,34692);
 const copy=await admin.request('/api/quotations/'+q.data.id+'/duplicate','POST',{version:q.version},201);assert.notEqual(copy.data.id,q.data.id);assert.notEqual(copy.data.no,q.data.no);assert.equal(DP.totals(copy.data).grand,34692);
 await admin.request('/api/customers/'+a.data.id,'DELETE',{version:a.version},409);assert.equal((await admin.request('/api/customers/'+a.data.id)).data.contactPersonPhone,'+919000002222');
 for(const record of [q,copy])await admin.request('/api/quotations/'+record.data.id,'DELETE',{version:record.version});
 await admin.request('/api/customers/'+a.data.id,'DELETE',{version:a.version});await admin.request('/api/customers/'+a.data.id,'GET',undefined,404);
 assert.equal((await app.db.prepare('SELECT count(*) AS n FROM customer_delivery_addresses WHERE customer_id=?').get(a.data.id)).n,0);assert.deepEqual((await admin.request('/api/customers/'+b.data.id)).data,b.data);assert.equal((await admin.request('/api/customer-categories')).data.length,8);
});

test('release: revoked customer permissions cannot commit an in-flight address update',async t=>{
 const {admin,app,client,password}=await fixture(t),c=await admin.request('/api/customers','POST',customer({deliveryAddresses:[address()]}),201),account=await admin.request('/api/users','POST',{name:'Address editor',username:'addresseditor',password,role:'Employee',permissions:['customer.view','customer.edit']},201),user=client();await user.request('/api/auth/login','POST',{username:'addresseditor',password});
 const mutate=app.store.mutate;app.store.mutate=async(...args)=>{await app.db.prepare('UPDATE users SET permissions_json=? WHERE id=?').run('[]',account.user.id);return mutate(...args);};
 try{await user.request('/api/customers/'+c.data.id+'/delivery-addresses/'+c.data.deliveryAddressId,'PATCH',{version:c.version,data:{line1:'FORBIDDEN'}},403);}finally{app.store.mutate=mutate;}
 assert.equal((await admin.request('/api/customers/'+c.data.id)).data.deliveryAddresses[0].line1,'Delivery street');
});

test('final review: quote-only roles keep document access without enumerating live delivery addresses',async t=>{
 const {admin,client,password}=await fixture(t),a=await admin.request('/api/customers','POST',customer({deliveryAddresses:[address(),address('Private branch',false)]}),201),b=await admin.request('/api/customers','POST',customer({mob:'9876500220',deliveryAddresses:[address('Private customer')]}),201);
 let account=await admin.request('/api/users','POST',{name:'Quote only',username:'quoteonly',password,role:'Employee'},201);const user=client();await user.request('/api/auth/login','POST',{username:'quoteonly',password});
 let q=await user.request('/api/quotations','POST',{cid:a.data.id},201);
 account=await admin.request('/api/users/'+account.user.id,'PATCH',{version:account.user.version,permissions:['quotation.create','quotation.view_own','quotation.edit_own','quotation.download_pdf']});await user.request('/api/auth/login','POST',{username:'quoteonly',password});
 const preview=await user.request('/api/quotations/preview','POST',{cid:b.data.id});assert.equal(preview.quotation.customerSnapshot.name,b.data.name);assert.equal(preview.quotation.deliveryAddressSnapshot,undefined);
 const fresh=await user.request('/api/quotations','POST',{cid:b.data.id},201);assert.equal(fresh.data.deliveryAddressSnapshot,undefined);
 for(const cid of [b.data.id,'UnknownCustomer'])for(const deliveryAddressId of [b.data.deliveryAddressId,'UnknownAddress']){await user.request('/api/quotations/preview','POST',{cid,deliveryAddressId},403);await user.request('/api/quotations','POST',{cid,deliveryAddressId},403);await user.request('/api/quotations/'+q.data.id,'PATCH',{version:q.version,data:{cid,deliveryAddressId}},403);}
 await user.request('/api/quotations/'+q.data.id,'PATCH',{version:q.version,data:{deliveryAddressId:a.data.deliveryAddresses.find(a=>a.label==='Private branch').id}},403);
 q=await user.request('/api/quotations/'+q.data.id,'PATCH',{version:q.version,data:{project:'Permitted snapshot edit'}});assert.equal(q.data.deliveryAddressSnapshot.label,'Warehouse');
 const copy=await user.request('/api/quotations/'+q.data.id+'/duplicate','POST',{version:q.version},201);assert.deepEqual(copy.data.deliveryAddressSnapshot,q.data.deliveryAddressSnapshot);assert.deepEqual(copy.data.customerSnapshot,q.data.customerSnapshot);
});

test('release: failed quotation write rolls back a batch containing a customer and multiple delivery addresses',async t=>{
 const {admin,app}=await fixture(t),state=await admin.request('/api/state'),audit=(await app.db.prepare('SELECT count(*) AS n FROM audit_events').get()).n;
 const candidate=structuredClone(state.state);candidate.customers.push({id:'atomic_customer',date:DP.seed().quotes[0].date,...customer({deliveryAddresses:[address(),address('Branch',false)]})});
 candidate.quotes.push({...DP.seed().quotes[2],id:'atomic_quote',no:'',cid:'atomic_customer',items:[]});
 const prepare=app.db.prepare;app.db.prepare=sql=>sql.startsWith('INSERT INTO quotations')?{run:async()=>{throw Error('Injected release transaction failure');}}:prepare(sql);
 try{await admin.request('/api/state','PUT',{revision:state.revision,state:candidate},500);}finally{app.db.prepare=prepare;}
 for(const table of ['customers','customer_delivery_addresses','quotations'])assert.equal((await app.db.prepare('SELECT count(*) AS n FROM '+table).get()).n,0);
 assert.equal((await admin.request('/api/state')).revision,state.revision);assert.equal((await app.db.prepare('SELECT count(*) AS n FROM audit_events').get()).n,audit);
});

test('release: errors and audit records exclude passwords, cookies, CSRF tokens and SQL internals',async t=>{
 const {admin,app,password}=await fixture(t),secretMarker='UNTRUSTED_REQUEST_SECRET_'+crypto.randomUUID();
 const response=await admin.raw('/api/customer-categories','POST',{name:'Rejected',discountPercentage:'101.00',password:secretMarker});assert.equal(response.status,422);assert.ok(response.headers.get('x-request-id'));assert.match(response.headers.get('content-security-policy'),/object-src 'none'/);
 const text=await response.text();assert.equal(text.includes(secretMarker),false);assert.equal(/SELECT |INSERT INTO|password_hash|stack|postgresql:\/\//.test(text),false);
 const events=JSON.stringify(await app.db.prepare('SELECT details FROM audit_events').all());assert.equal(events.includes(password),false);assert.equal(events.includes(secretMarker),false);assert.equal(/csrfToken|token_hash|password_hash/.test(events),false);
 const c=await admin.request('/api/customers','POST',customer(),201);await admin.request('/api/customers/'+c.data.id,'PATCH',{version:c.version,data:{name:'bad\u0000name'}},422);
 const prepare=app.db.prepare,logger=console.error,messages=[];
 app.db.prepare=sql=>sql.startsWith('INSERT INTO customers')?{run:async()=>{throw Object.assign(Error(secretMarker),{code:'RELEASE_TEST_FAILURE'});}}:prepare(sql);
 console.error=(...args)=>messages.push(args.join(' '));
 try{await admin.request('/api/customers','POST',customer({mob:'9876500209'}),500);}finally{app.db.prepare=prepare;console.error=logger;}
 assert.deepEqual(messages,['Request failed: RELEASE_TEST_FAILURE']);assert.equal(messages.join('').includes(secretMarker),false);
});
