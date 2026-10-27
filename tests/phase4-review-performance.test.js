'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createApp}=require('../server'),{testDatabase}=require('./database-helper'),{listing}=require('../server/queries');

test('Phase 4 review: catalog pagination avoids per-product reads while preserving sort, filters and record metadata',async t=>{
 const database=await testDatabase(),app=await createApp(database);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await app.close();await database.destroy();});
 const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/auth/setup`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Catalog Performance Fixture',username:'catalogperf',password:'Fixture-'+crypto.randomUUID(),demo:true})});assert.equal(response.status,201);
 await app.store.db.exec(`INSERT INTO products (id,category_id,name,code,active,body,version,position,updated_at) SELECT 'page_'||i,'c1','Page Fixture '||lpad(i::text,3,'0'),'PAGE-'||i,0,jsonb_set(jsonb_set(jsonb_set(jsonb_set(body::jsonb,'{id}',to_jsonb('page_'||i)),'{code}',to_jsonb('PAGE-'||i)),'{name}',to_jsonb('Page Fixture '||lpad(i::text,3,'0'))),'{on}','0')::text,7,40+i,'2026-10-26T00:00:00.000Z' FROM products CROSS JOIN generate_series(1,110) i WHERE id='p1'`);
 const db=app.store.db,original=db.prepare;let selects=[];
 db.prepare=function(sql){if(/^SELECT\s/i.test(sql))selects.push(sql);return original.call(this,sql);};
 let first;
 try{
  for(const [page,size,expected]of [[1,1,1],[1,25,25],[1,100,100],[2,100,10]]){
   selects=[];const result=await listing(app.store,'products',new URLSearchParams({q:'Page Fixture',category:'c1',active:'0',page:String(page),pageSize:String(size)}));
   assert.equal(selects.length,2,'A bounded catalog page must use count + page reads, independent of row count');
   assert.equal(result.data.length,expected);assert.deepEqual(result.pagination,{page,pageSize:size,total:110,totalPages:Math.ceil(110/size)});
   const start=(page-1)*size+1;assert.equal(result.data[0].id,'page_'+start);assert.equal(result.data[0].version,7);assert.equal(result.data[0].updatedAt,'2026-10-26T00:00:00.000Z');assert.equal(result.data[0].on,0);
   first=first||result.data[0];
  }
  selects=[];const descending=await listing(app.store,'products',new URLSearchParams({q:'Page Fixture',direction:'desc',pageSize:'1'}));assert.equal(descending.data[0].id,'page_110');assert.equal(selects.length,2);
 }finally{db.prepare=original;}
 const stored=await app.store.get('products',first.id);assert.deepEqual(first,{...stored.data,version:stored.version,updatedAt:stored.updatedAt});
});
