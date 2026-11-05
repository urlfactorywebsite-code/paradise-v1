'use strict';
// Disposable, maximum-size metadata fixture. Never accepts an existing app URL.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createApp}=require('../server'),{testDatabase}=require('../tests/database-helper');
const target=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL):null;
if(process.env.TEST_DISPOSABLE!=='1'||!target||!['127.0.0.1','localhost'].includes(target.hostname)||target.port!=='55429')throw Error('Use explicitly disposable loopback PostgreSQL on port 55429.');
(async()=>{
 const database=await testDatabase();let app;
 try{
  app=await createApp(database);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
  const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Metadata benchmark',username:'fieldbenchmark',password:crypto.randomUUID()+'-Benchmark',demo:true})});assert.equal(setup.status,201);const cookie=setup.headers.get('set-cookie').split(';')[0];
  const before=await (await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json(),db=app.db,existing=(await db.prepare('SELECT count(*) AS n FROM configurable_fields').get()).n,added=500-existing;
  await db.transaction(async()=>{
   // Fixture generation is intentionally outside the production query budget.
   await db.exec("SET LOCAL statement_timeout='120s'");
   await db.prepare(`INSERT INTO configurable_fields(id,page_key,field_key,label,field_type,policy,scope_type,scope_id) SELECT 'perf_'||n,'customers','custom_perf_'||n,'Performance '||n,'dropdown','configurable','page','customers' FROM generate_series(1,?)n`).run(added);
   await db.prepare(`INSERT INTO configurable_field_options(id,field_id,value,label,display_order) SELECT f.id||'_'||n,f.id,'option_'||n,'Option '||n,n FROM configurable_fields f CROSS JOIN generate_series(1,100)n WHERE f.id LIKE 'perf_%'`).run();
   await db.prepare(`INSERT INTO field_configuration_audit_logs(id,actor_user_id,field_id,action,before_value,after_value)
    SELECT 'perf_audit_'||n,(SELECT id FROM users LIMIT 1),'perf_1','editor_saved',snapshot,snapshot||jsonb_build_object('version',n)
    FROM generate_series(1,20000)n CROSS JOIN (SELECT jsonb_build_object('id',f.id,'label',f.label,'fieldType',f.field_type,'version',1,'options',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.display_order) FROM configurable_field_options o WHERE o.field_id=f.id)) AS snapshot FROM configurable_fields f WHERE f.id='perf_1')fixture`).run();
   await db.exec('UPDATE field_configuration_state SET revision=revision+1 WHERE id=1');
  });
  await db.exec('ANALYZE configurable_fields;ANALYZE configurable_field_options;ANALYZE field_configuration_audit_logs');
  const statements=[],prepare=db.prepare;db.prepare=sql=>{statements.push(sql);return prepare(sql);};const samples=[];
  async function measure(route,etag){const offset=statements.length,start=performance.now(),r=await fetch(base+route,{headers:{Cookie:cookie,...(etag?{'If-None-Match':etag}:{})}}),text=await r.text(),sql=statements.slice(offset);assert.equal(r.status,etag?304:200);return {elapsedMs:Math.round((performance.now()-start)*100)/100,status:r.status,payloadBytes:Buffer.byteLength(text),etag:r.headers.get('etag'),preparedStatements:sql.length,fieldSelects:sql.filter(s=>s.includes('FROM configurable_fields')).length,optionSelects:sql.filter(s=>s.includes('FROM configurable_field_options')).length,businessHydration:sql.some(s=>/FROM (quotations|quotation_items|customers|products|workspace)\b/.test(s)),...(text?{rows:(JSON.parse(text).data.customers||JSON.parse(text).data).length}:{})};}
  for(let n=0;n<5;n++)samples.push(await measure('/api/field-configurations/resolve?pageKeys=customers,quotations'));
  const cached=await measure('/api/field-configurations/resolve?pageKeys=customers,quotations',samples[0].etag),list=await measure('/api/configurable-fields?pageKey=customers&pageSize=25'),history=await measure('/api/configurable-fields/perf_1/audit?pageSize=20');
  assert.ok(samples.every(row=>row.fieldSelects===1&&row.optionSelects===1&&!row.businessHydration));assert.equal(cached.fieldSelects,0);assert.equal(cached.optionSelects,0);assert.equal(list.rows,25);assert.equal(history.rows,20);db.prepare=prepare;
  const plans={};for(const [key,sql,args]of [['options','SELECT * FROM configurable_field_options WHERE field_id=? ORDER BY display_order,id',['perf_1']],['history','SELECT * FROM field_configuration_audit_logs WHERE field_id=? ORDER BY created_at DESC,id LIMIT 20',['perf_1']],['scopes',"SELECT * FROM configurable_fields WHERE page_key='customers' AND scope_type='page' ORDER BY display_order,id",[]]])plans[key]=(await db.prepare('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+sql).get(...args))['QUERY PLAN'];
  assert.match(JSON.stringify(plans.options),/Index|Bitmap/);assert.match(JSON.stringify(plans.history),/Index|Bitmap/);assert.deepEqual(await (await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json(),before);
  const sorted=samples.map(s=>s.elapsedMs).sort((a,b)=>a-b),result={fixture:{totalFields:500,choiceFields:added,options:added*100,auditRows:20000},samples,cached,list,history,medianMs:sorted[2],maxMs:sorted.at(-1),plans};
  fs.mkdirSync(path.resolve('test-results'),{recursive:true});fs.writeFileSync('test-results/dynamic-phase5-performance.json',JSON.stringify(result,null,2));console.log(JSON.stringify({fixture:result.fixture,medianMs:result.medianMs,maxMs:result.maxMs,cachedMs:cached.elapsedMs,payloadBytes:samples[0].payloadBytes,queries:{fields:samples[0].fieldSelects,options:samples[0].optionSelects},listMs:list.elapsedMs,historyMs:history.elapsedMs},null,2));
 }finally{await app?.close();await database.destroy();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
