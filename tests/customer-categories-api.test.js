'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const sharp=require('sharp'),{createApp}=require('../server'),{testDatabase}=require('./database-helper'),{connectDatabase}=require('../server/database'),{createStore}=require('../server/store'),DP=require('../shared/domain');
async function fixture(t){
 const database=await testDatabase(),app=await createApp({...database,staticDir:path.resolve('public')});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await app.close();await database.destroy();});const base='http://127.0.0.1:'+app.server.address().port,password='Categories-'+crypto.randomUUID();
 function client(){let cookie='',csrf='';return {async raw(route,method='GET',value,options={}){const response=await fetch((options.base||base)+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(value===undefined?{}:{'Content-Type':'application/json'}),...options.headers},...(value===undefined?{}:{body:JSON.stringify(value)})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;},async request(route,method='GET',value,status=200){const response=await this.raw(route,method,value),data=await response.json();if(data.csrfToken)csrf=data.csrfToken;assert.equal(response.status,status,method+' '+route+': '+JSON.stringify(data));return data;}};}
 const admin=client();await admin.request('/api/auth/setup','POST',{name:'Category QA',username:'categoryqa',password,demo:false},201);return {database,app,admin,client,password,base};
}
const root='/api/customer-categories';
const logo=async(format='png',width=8,height=6)=>'data:image/'+format+';base64,'+(await sharp({create:{width,height,channels:3,background:'#168080'}})[format]().toBuffer()).toString('base64');
const customer=extra=>({name:'Member',mob:'9876543210',...extra});

test('category CRUD, exact decimals, unique names, literal search, pagination and Other protection',async t=>{
 const {admin,app}=await fixture(t),list=await admin.request(root+'?manage=true');assert.equal(list.pagination.total,7);assert.equal((await admin.request(root)).data.length,8);
 const created=await admin.request(root,'POST',{name:'Future %_ Association',discountPercentage:'12.34',highlightMessage:'Member benefit\nPlain text',highlightEnabled:true},201),id=created.data.id;
 for(const name of ['தமிழ் சங்கம்','x'.repeat(150)]){const c=await admin.request(root,'POST',{id:'CC'+crypto.randomUUID(),name},201);assert.match(c.data.slug,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);assert.ok(c.data.slug.length<=100);}
 assert.equal(created.data.discountPercentage,'12.34');assert.equal((await app.db.prepare('SELECT discount_percentage::text AS value FROM customer_categories WHERE id=?').get(id)).value,'12.34');
 await admin.request(root,'POST',{name:'future %_ association'},409);await admin.request(root,'POST',{name:'Distinct',slug:created.data.slug},409);
 const result=await admin.request(root+'?manage=true&q=%25_&pageSize=1');assert.equal(result.pagination.total,1);assert.equal(result.data[0].id,id);
 assert.equal((await admin.request(root+'?manage=true&pageSize=2&page=2')).data.length,2);
 for(const discountPercentage of [-1,100.01,'NaN','1.234',null,{},true,'1e2',''])await admin.request(root,'POST',{name:'Invalid',discountPercentage},422);
 for(const discountPercentage of ['0','100','99.99']){const c=await admin.request(root,'POST',{name:'Rate '+discountPercentage,discountPercentage},201);assert.equal(c.data.discountPercentage,Number(discountPercentage).toFixed(2));}
 for(const data of [{name:'Other'},{name:'x',isOther:true},{name:'x',tenant_id:'foreign'},{name:'x',logoStorageKey:'foreign'},{name:'x',highlightEnabled:true},{name:'x',highlightMessage:'x'.repeat(1001)}])await admin.request(root,'POST',data,422);
 await admin.request(root+'/cc_other','PATCH',{version:1,data:{name:'Renamed Other'}},404);
 await admin.request(root+'/'+id,'PATCH',{data:{name:'Missing version'}},428);
 const edited=await admin.request(root+'/'+id,'PATCH',{version:created.version,data:{name:'Renamed',active:false,highlightMessage:'Changed'}});assert.equal(edited.data.slug,created.data.slug);assert.equal(edited.data.highlightMessage,'Changed');
 await admin.request(root+'/'+id,'PATCH',{version:created.version,data:{name:'Stale'}},409);
 assert.ok(!(await admin.request(root)).data.some(c=>c.id===id));assert.ok((await admin.request(root+'?manage=true&status=inactive')).data.some(c=>c.id===id));
 for(const query of ['status=wrong','page=0','pageSize=101','q='+('x'.repeat(201)),'q=%00','q=%01'])await admin.request(root+'?manage=true&'+query,'GET',undefined,422);
});

test('category management requires explicit backend permission and isolates separate company databases',async t=>{
 const f=await fixture(t),other=await fixture(t),created=await f.admin.request(root,'POST',{name:'Private category',logoDataUrl:await logo()},201);
 const anonymous=f.client();await anonymous.request(root+'?manage=true','GET',undefined,401);assert.equal((await anonymous.raw(created.data.logoUrl)).status,401);
 for(const [username,permissions,readStatus,referenceStatus] of [['none',[],403,403],['customer',['customer.view'],403,200],['viewer',['customer_categories.view'],200,200]]){
  await f.admin.request('/api/users','POST',{name:username,username,password:f.password,role:'Employee',permissions},201);const user=f.client();await user.request('/api/auth/login','POST',{username,password:f.password});
  await user.request(root+'?manage=true','GET',undefined,readStatus);await user.request(root,'GET',undefined,referenceStatus);
  for(const id of [created.data.id,'missing']){await user.request(root+'/'+id,'PATCH',{version:1,data:{name:'Forbidden'}},403);await user.request(root+'/'+id,'DELETE',{version:1},403);}
  await user.request(root,'POST',{name:'Forbidden',logoDataUrl:await logo()},403);assert.equal((await user.raw(created.data.logoUrl)).status,referenceStatus);
 }
 await other.admin.request(root+'/'+created.data.id,'GET',undefined,404);assert.equal((await other.admin.raw(created.data.logoUrl)).status,404);
 await other.admin.request(root+'/'+created.data.id,'PATCH',{version:created.version,data:{name:'Foreign'}},404);
 assert.equal((await f.admin.request(root+'/'+created.data.id)).data.name,'Private category');
 await f.admin.request('/api/users','POST',{name:'Manager',username:'manager',password:f.password,role:'Employee',permissions:['customer_categories.manage']},201);const manager=f.client();await manager.request('/api/auth/login','POST',{username:'manager',password:f.password});await manager.request(root,'POST',{name:'Delegated'},201);
});

test('logos are decoded and normalized, replaced immutably, removable, size-limited and ownership constrained',async t=>{
 const {admin,app}=await fixture(t);let category;
 for(const format of ['png','jpeg','webp']){
  category=await admin.request(root,'POST',{name:'Logo '+format,logoDataUrl:await logo(format)},201);const response=await admin.raw(category.data.logoUrl),bytes=Buffer.from(await response.arrayBuffer());assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('cache-control'),/private/);assert.equal((await sharp(bytes).metadata()).format,'png');
 }
 const oldUrl=category.data.logoUrl,id=category.data.id,updated=await admin.request(root+'/'+id,'PATCH',{version:category.version,data:{logoDataUrl:await logo('jpeg',9,7)}});assert.notEqual(updated.data.logoUrl,oldUrl);assert.equal((await admin.raw(oldUrl)).status,200);
 const removed=await admin.request(root+'/'+id,'PATCH',{version:updated.version,data:{removeLogo:true}});assert.equal(removed.data.logoStorageKey,null);assert.equal((await admin.raw(root+'/'+id+'/logo')).status,404);assert.equal((await admin.raw(oldUrl)).status,200);
 const invalid=['data:image/svg+xml;base64,'+Buffer.from('<svg onload="alert(1)"/>').toString('base64'),'data:image/png;base64,'+Buffer.from('not a raster image').toString('base64'),(await logo()).replace('image/png','image/jpeg'),'data:image/png;base64,'+Buffer.alloc(300001).toString('base64'),await logo('png',4097,1),(await logo()).slice(0,-20)];
 for(const logoDataUrl of invalid)await admin.request(root,'POST',{name:'Unsafe',logoDataUrl},422);
 assert.equal((await admin.request(root+'?manage=true&q=Unsafe')).pagination.total,0);
 const png=Buffer.from((await logo('jpeg')).split(',')[1],'base64'),withPayload='data:image/jpeg;base64,'+Buffer.concat([png,Buffer.from('<script>alert(1)</script>')]).toString('base64');
 const cleaned=await admin.request(root,'POST',{name:'Cleaned',logoDataUrl:withPayload},201),output=Buffer.from(await (await admin.raw(cleaned.data.logoUrl)).arrayBuffer());assert.equal(output.includes(Buffer.from('<script>')),false);
 await assert.rejects(app.db.prepare('UPDATE customer_categories SET logo_storage_key=? WHERE id=?').run(cleaned.data.logoStorageKey,id),/foreign key/);
});

test('archive preserves customer associations and immutable quotation highlights without changing totals',async t=>{
 const {admin,app}=await fixture(t),category=await admin.request(root+'/cc_bni','PATCH',{version:1,data:{discountPercentage:'33.33',highlightEnabled:true,highlightMessage:'Original member benefit\nSecond line'}}),c=await admin.request('/api/customers','POST',customer({categoryId:'cc_bni'}),201);
 const q=await admin.request('/api/quotations','POST',{cid:c.data.id,categorySnapshot:{highlightEnabled:true,highlightMessage:'Forged'}},201);assert.equal(q.data.categorySnapshot.highlightMessage,'Original member benefit\nSecond line');assert.equal(q.data.disc.v,33.33);
 const before=await app.db.prepare('SELECT body,version,updated_at,total FROM quotations WHERE id=?').get(q.data.id);
 const changed=await admin.request(root+'/cc_bni','PATCH',{version:category.version,data:{highlightMessage:'Updated benefit',discountPercentage:'99.99'}});
 assert.deepEqual(await app.db.prepare('SELECT body,version,updated_at,total FROM quotations WHERE id=?').get(q.data.id),before);
 const edited=await admin.request('/api/quotations/'+q.data.id,'PATCH',{version:q.version,data:{project:'Edit',categorySnapshot:{highlightMessage:'Forged'}}});assert.deepEqual(edited.data.categorySnapshot,q.data.categorySnapshot);
 const newer=await admin.request('/api/quotations','POST',{cid:c.data.id},201);assert.equal(newer.data.categorySnapshot.highlightMessage,'Updated benefit');assert.equal(newer.data.disc.v,99.99);
 await admin.request(root+'/cc_bni','DELETE',{version:changed.version});assert.equal((await admin.request('/api/customers/'+c.data.id)).data.categoryId,'cc_bni');
 await admin.request('/api/customers','POST',customer({mob:'9876543211',categoryId:'cc_bni'}),422);
 await admin.request('/api/customers/'+c.data.id,'PATCH',{version:c.version,data:{co:'Still associated'}});
 assert.equal((await admin.request('/api/quotations','POST',{cid:c.data.id},201)).data.categorySnapshot.highlightEnabled,false);
 assert.deepEqual((await admin.request('/api/quotations/'+q.data.id)).data.categorySnapshot,q.data.categorySnapshot);
 const duplicate=await admin.request('/api/quotations/'+q.data.id+'/duplicate','POST',{version:edited.version},201);assert.deepEqual(duplicate.data.categorySnapshot,q.data.categorySnapshot);
 await assert.rejects(app.db.prepare("DELETE FROM customer_categories WHERE id='cc_bni'").run(),/foreign key/);
});

test('migration 8 upgrades populated schema 7 atomically, preserves bodies and does not reset configuration',async t=>{
 const database=await testDatabase(),db=connectDatabase(database);t.after(async()=>{await db.close();await database.destroy();});
 for(const file of ['schema.sql','migrations/004-access-whatsapp.sql','migrations/005-product-configuration.sql','migrations/006-pricing-imports.sql','migrations/007-customer-details.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../server',file),'utf8'));
 await db.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);INSERT INTO schema_migrations VALUES(7,'previous');");
 const body=JSON.stringify({id:'legacy',name:'Legacy',mob:'9876543210',on:0});await db.prepare('INSERT INTO customers(id,name,mobile,email,body,version,position,updated_at,category_id) VALUES(?,?,?,?,?,?,?,?,?)').run('legacy','Legacy','9876543210','',body,8,0,'previous','cc_bni');
 const before=await db.prepare('SELECT * FROM customers').all(),exec=db.exec;db.exec=async sql=>{const result=await exec(sql);if(sql.includes('CREATE TABLE customer_category_logos'))throw Error('Injected migration 8 failure');return result;};
 await assert.rejects(createStore(db),/Injected migration 8/);db.exec=exec;assert.equal((await db.prepare('SELECT max(version) AS n FROM schema_migrations').get()).n,7);assert.equal((await db.prepare("SELECT to_regclass('public.customer_category_logos') AS n").get()).n,null);
 await createStore(db);await db.exec("UPDATE customer_categories SET discount_percentage=17.25,highlight_message='Preserved',highlight_enabled=TRUE WHERE id='cc_bni'");await createStore(db);
 assert.deepEqual(await db.prepare('SELECT * FROM customers').all(),before);assert.equal((await db.prepare('SELECT count(*) AS n FROM customer_categories').get()).n,8);assert.equal((await db.prepare("SELECT discount_percentage::text AS n FROM customer_categories WHERE id='cc_bni'").get()).n,'17.25');
});

test('schema 8 backup and restore retain private logo bytes, configuration and snapshot references',async t=>{
 const f=await fixture(t),category=await f.admin.request(root,'POST',{name:'Restore member',logoDataUrl:await logo(),discountPercentage:'27.25',highlightMessage:'Retained',highlightEnabled:true},201),c=await f.admin.request('/api/customers','POST',customer({categoryId:category.data.id}),201),q=await f.admin.request('/api/quotations','POST',{cid:c.data.id},201);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'paradise-category-backup-')),name='category_restore_'+crypto.randomBytes(10).toString('hex'),url=new URL(f.database.databaseUrl);url.pathname='/'+name;let restored;
 try{const backup=await require('../server/backup').backupDatabase(f.app.db,dir);await require('../scripts/restore').restore(path.join(dir,backup.name),name,f.database);restored=connectDatabase({databaseUrl:url.href});const store=await createStore(restored),saved=(await store.get('quotes',q.data.id)).data;assert.deepEqual(saved.categorySnapshot,q.data.categorySnapshot);assert.equal(saved.discountSource,q.data.discountSource);assert.equal(saved.categoryDiscountAmount,q.data.categoryDiscountAmount);assert.deepEqual(saved.disc,q.data.disc);const row=await restored.prepare('SELECT content FROM customer_category_logos WHERE id=?').get(category.data.logoStorageKey);assert.equal((await sharp(row.content).metadata()).format,'png');assert.equal((await restored.prepare('SELECT discount_percentage::text AS n FROM customer_categories WHERE id=?').get(category.data.id)).n,'27.25');}
 finally{if(restored)await restored.close();await f.app.db.exec(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('paradise-category-backup-'))throw Error('Unexpected test directory');fs.rmSync(dir,{recursive:true,force:true});}
});

test('failed logo writes roll back category, audit and revision together; stale IDs cannot overwrite',async t=>{
 const {admin,app}=await fixture(t),before=await admin.request('/api/state'),audit=(await app.db.prepare('SELECT count(*) AS n FROM audit_events').get()).n,prepare=app.db.prepare;
 app.db.prepare=sql=>sql.startsWith('INSERT INTO customer_category_logos')?{run:async()=>{throw Error('Injected logo failure');}}:prepare(sql);
 try{await admin.request(root,'POST',{id:'AtomicCategory',name:'Atomic category',logoDataUrl:await logo()},500);}finally{app.db.prepare=prepare;}
 assert.equal((await admin.request(root+'?manage=true&q=Atomic')).pagination.total,0);assert.equal((await admin.request('/api/state')).revision,before.revision);assert.equal((await app.db.prepare('SELECT count(*) AS n FROM audit_events').get()).n,audit);
 await admin.request(root,'POST',{id:'AtomicCategory',name:'Atomic category'},201);await admin.request(root,'POST',{id:'AtomicCategory',name:'Overwrite'},409);
});

test('legacy quotations keep absent highlights and client forgery cannot add them during editing',async t=>{
 const {admin,app}=await fixture(t),c=await admin.request('/api/customers','POST',customer({categoryId:'cc_bni'}),201),q=await admin.request('/api/quotations','POST',{cid:c.data.id},201);
 const legacy={...q.data};delete legacy.categorySnapshot;delete legacy.discountSource;delete legacy.categoryDiscountAmount;delete legacy.items;delete legacy.hist;await app.db.prepare('UPDATE quotations SET body=? WHERE id=?').run(JSON.stringify(legacy),q.data.id);
 await admin.request(root+'/cc_bni','PATCH',{version:1,data:{highlightMessage:'New benefit',highlightEnabled:true}});
 const edited=await admin.request('/api/quotations/'+q.data.id,'PATCH',{version:q.version,data:{project:'Legacy edit',categorySnapshot:{highlightEnabled:true,highlightMessage:'Forged'}}});assert.equal(Object.hasOwn(edited.data,'categorySnapshot'),false);
 assert.equal((await admin.request('/api/quotations','POST',{cid:c.data.id},201)).data.categorySnapshot.highlightMessage,'New benefit');
});

test('category permissions are rechecked inside the transaction after a concurrent revocation',async t=>{
 const f=await fixture(t),account=await f.admin.request('/api/users','POST',{name:'Revoked',username:'revoked',password:f.password,role:'Employee',permissions:['customer_categories.manage']},201),user=f.client();await user.request('/api/auth/login','POST',{username:'revoked',password:f.password});
 const mutate=f.app.store.mutate;f.app.store.mutate=async(...args)=>{await f.app.db.prepare('UPDATE users SET permissions_json=? WHERE id=?').run('[]',account.user.id);return mutate(...args);};
 try{await user.request(root,'POST',{name:'Should not exist'},403);}finally{f.app.store.mutate=mutate;}
 assert.equal((await f.admin.request(root+'?manage=true&q=Should')).pagination.total,0);
});

test('configured highlight limits are returned to the editor and enforced on API input',async t=>{
 const previous=process.env.CUSTOMER_CATEGORY_HIGHLIGHT_MAX_LENGTH;process.env.CUSTOMER_CATEGORY_HIGHLIGHT_MAX_LENGTH='20';let f;
 try{f=await fixture(t);}finally{if(previous===undefined)delete process.env.CUSTOMER_CATEGORY_HIGHLIGHT_MAX_LENGTH;else process.env.CUSTOMER_CATEGORY_HIGHLIGHT_MAX_LENGTH=previous;}
 const result=await f.admin.request(root+'?manage=true');assert.equal(result.limits.highlightMaxLength,20);await f.admin.request(root,'POST',{name:'Limited',highlightMessage:'x'.repeat(21)},422);await f.admin.request(root,'POST',{name:'Limited',highlightMessage:'x'.repeat(20),highlightEnabled:true},201);
});

test('review: malformed explicit category IDs and slug types fail without inserting records',async t=>{
 const {admin}=await fixture(t),before=(await admin.request(root+'?manage=true')).pagination.total;
 for(const id of [null,false,0,'',[],{}])await admin.request(root,'POST',{id,name:'Invalid ID'},422);
 for(const slug of [null,false,0,[],{}])await admin.request(root,'POST',{name:'Invalid slug',slug},422);
 assert.equal((await admin.request(root+'?manage=true')).pagination.total,before);
});

test('review: reducing the message limit permits preservation, disabling and restoring existing long messages',async t=>{
 const previous=process.env.CUSTOMER_CATEGORY_HIGHLIGHT_MAX_LENGTH;process.env.CUSTOMER_CATEGORY_HIGHLIGHT_MAX_LENGTH='20';let f;
 try{f=await fixture(t);}finally{if(previous===undefined)delete process.env.CUSTOMER_CATEGORY_HIGHLIGHT_MAX_LENGTH;else process.env.CUSTOMER_CATEGORY_HIGHLIGHT_MAX_LENGTH=previous;}
 const oldMessage='Previously valid message before the limit was reduced';await f.app.db.prepare("UPDATE customer_categories SET highlight_message=?,highlight_enabled=TRUE WHERE id='cc_bni'").run(oldMessage);
 let updated=await f.admin.request(root+'/cc_bni','PATCH',{version:1,data:{highlightEnabled:false}});assert.equal(updated.data.highlightMessage,oldMessage);
 updated=await f.admin.request(root+'/cc_bni','PATCH',{version:updated.version,data:{name:'Preserved member category',highlightMessage:oldMessage}});assert.equal(updated.data.highlightMessage,oldMessage);
 await f.admin.request(root+'/cc_bni','PATCH',{version:updated.version,data:{highlightMessage:oldMessage+' changed'}},422);
 updated=await f.admin.request(root+'/cc_bni','DELETE',{version:updated.version});updated=await f.admin.request(root+'/cc_bni','PATCH',{version:updated.version,data:{archived:false,active:true}});assert.equal(updated.data.highlightMessage,oldMessage);assert.equal(updated.data.archivedAt,null);
});

test('review: identical category IDs remain company-local and foreign sessions and logo objects cannot cross databases',async t=>{
 const first=await fixture(t),second=await fixture(t),a=await first.admin.request(root+'/cc_bni','PATCH',{version:1,data:{name:'Company A members',highlightMessage:'Company A private configuration',logoDataUrl:await logo()}}),b=await second.admin.request(root+'/cc_bni','PATCH',{version:1,data:{name:'Company B members',highlightMessage:'Company B private configuration',logoDataUrl:await logo('jpeg')}});
 assert.equal((await first.admin.request(root+'/cc_bni?tenant_id='+second.database.name)).data.name,a.data.name);assert.equal((await second.admin.request(root+'/cc_bni?tenantId='+first.database.name)).data.name,b.data.name);
 for(const [local,foreign] of [[first,second],[second,first]]){
  const asset=local===first?b.data.logoUrl:a.data.logoUrl;
  for(const route of [root+'?manage=true',root+'/cc_bni',asset])assert.equal((await local.admin.raw(route,'GET',undefined,{base:foreign.base})).status,401,'A session must belong to the target database');
  assert.equal((await local.admin.raw(asset)).status,404);assert.equal((await local.admin.raw(asset,'DELETE',{version:1})).status,405);
  await local.admin.request(root+'/cc_bni','PATCH',{version:2,data:{logoStorageKey:(local===first?b:a).data.logoStorageKey}},422);
 }
 assert.equal((await first.admin.request(root+'/cc_bni')).data.name,a.data.name);assert.equal((await second.admin.request(root+'/cc_bni')).data.name,b.data.name);
});

test('review: CSRF, concurrent updates and constraint failures leave category and logo integrity intact',async t=>{
 const {admin,app}=await fixture(t),c=await admin.request(root,'POST',{name:'Concurrent category',logoDataUrl:await logo()},201),id=c.data.id;
 for(const headers of [{'X-CSRF-Token':''},{'X-CSRF-Token':'wrong'}])assert.equal((await admin.raw(root+'/'+id,'PATCH',{version:c.version,data:{name:'CSRF bypass'}},{headers})).status,403);
 const responses=await Promise.all(['First writer','Second writer'].map(name=>admin.raw(root+'/'+id,'PATCH',{version:c.version,data:{name}})));assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 for(const discount of ['-0.01','100.01','NaN'])await assert.rejects(app.db.prepare('UPDATE customer_categories SET discount_percentage=? WHERE id=?').run(discount,id),/check constraint/);
 await assert.rejects(app.db.prepare('UPDATE customer_categories SET highlight_message=? WHERE id=?').run('x'.repeat(4001),id),/check constraint/);
 await assert.rejects(app.db.prepare('UPDATE customer_categories SET version=0 WHERE id=?').run(id),/check constraint/);
 await assert.rejects(app.db.prepare('UPDATE customer_category_logos SET mime_type=? WHERE id=?').run('image/svg+xml',c.data.logoStorageKey),/check constraint/);
 await assert.rejects(app.db.prepare('DELETE FROM customer_category_logos WHERE id=?').run(c.data.logoStorageKey),/foreign key/);
 const rows=await app.db.prepare('SELECT content,sha256 FROM customer_category_logos WHERE id=?').get(c.data.logoStorageKey);assert.equal(crypto.createHash('sha256').update(rows.content).digest('hex'),rows.sha256);
});

test('review: hostile raster containers and metadata cannot become executable or oversized stored objects',async t=>{
 const {admin,app}=await fixture(t),dataUrl=(mime,bytes)=>'data:image/'+mime+';base64,'+bytes.toString('base64');
 const png=Buffer.from((await logo()).split(',')[1],'base64'),apng=Buffer.concat([png.subarray(0,33),Buffer.from([0,0,0,8]),Buffer.from('acTL'),Buffer.alloc(12),png.subarray(33)]);
 const webp=Buffer.from((await logo('webp')).split(',')[1],'base64');webp.writeUInt32LE(0,4);
 const invalid=[dataUrl('png',apng),dataUrl('webp',webp),dataUrl('png',Buffer.from('GIF89a<script>alert(1)</script>')),dataUrl('png',Buffer.from('<svg><script>alert(1)</script></svg>')),(await logo()).replace(/=+$/,'')];
 for(const logoDataUrl of invalid)await admin.request(root,'POST',{name:'Rejected payload',logoDataUrl},422);
 const tagged=await sharp({create:{width:700,height:350,channels:3,background:'#008080'}}).withExif({IFD0:{Artist:'PRIVATE-EXIF-MARKER'}}).jpeg().toBuffer(),c=await admin.request(root,'POST',{name:'Sanitized logo',logoDataUrl:dataUrl('jpeg',tagged)},201),r=await admin.raw(c.data.logoUrl),bytes=Buffer.from(await r.arrayBuffer()),metadata=await sharp(bytes).metadata();
 assert.equal(metadata.width,512);assert.equal(metadata.height,256);assert.equal(metadata.exif,undefined);assert.equal(bytes.includes(Buffer.from('PRIVATE-EXIF-MARKER')),false);assert.ok(bytes.length<=2097152);assert.match(r.headers.get('content-security-policy'),/sandbox/);
 assert.equal((await app.db.prepare('SELECT count(*) AS n FROM customer_category_logos').get()).n,1);
});

test('review: category settings cannot be forged through legacy workspace writes and archives still permit PDF rendering',async t=>{
 const f=await fixture(t),category=await f.admin.request(root+'/cc_bni','PATCH',{version:1,data:{highlightEnabled:true,highlightMessage:'Historical member message',logoDataUrl:await logo()}}),c=await f.admin.request('/api/customers','POST',customer({categoryId:'cc_bni'}),201),live=await f.admin.request('/api/state');
 const q=await f.admin.request('/api/quotations','POST',{cid:c.data.id,items:[{pid:'p5',cfg:DP.defCfg(live.state.products.find(p=>p.id==='p5'))}]},201),state=await f.admin.request('/api/state');
 Object.assign(state.state.customerCategories.find(x=>x.id==='cc_bni'),{discountPercentage:'100.00',logoStorageKey:'forged',highlightMessage:'Forged by workspace'});await f.admin.request('/api/state','PUT',state);
 assert.deepEqual((await f.admin.request(root+'/cc_bni')).data,category.data);
 const archived=await f.admin.request(root+'/cc_bni','DELETE',{version:category.version});assert.ok(archived.data.archivedAt);assert.equal((await f.admin.raw(category.data.logoUrl)).status,200);
 const pdf=await f.admin.raw('/api/quotations/'+q.data.id+'/pdf');assert.equal(pdf.status,200);assert.ok(Buffer.from(await pdf.arrayBuffer()).includes(Buffer.from('Historical member message')));
 const before=await f.app.db.prepare('SELECT body,version,total FROM quotations WHERE id=?').get(q.data.id);
 const managerAccount=await f.admin.request('/api/users','POST',{name:'Category only',username:'categoryonly',password:f.password,role:'Employee',permissions:['customer_categories.manage']},201),manager=f.client();await manager.request('/api/auth/login','POST',{username:managerAccount.user.username,password:f.password});
 await manager.request(root+'/cc_bni','PATCH',{version:archived.version,data:{archived:false,active:true}});assert.deepEqual(await f.app.db.prepare('SELECT body,version,total FROM quotations WHERE id=?').get(q.data.id),before);
});
