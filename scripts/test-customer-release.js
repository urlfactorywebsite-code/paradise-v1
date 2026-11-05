'use strict';
// Explicitly local release verification. Every workspace is generated and torn
// down; this runner never uses an existing app URL or credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {createApp}=require('../server'),{testDatabase}=require('../tests/database-helper'),{chromium}=require('playwright');
const target=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL):null;
if(process.env.TEST_DISPOSABLE!=='1'||!target||!['localhost','127.0.0.1'].includes(target.hostname)||target.port!=='55429')throw Error('Use disposable loopback PostgreSQL on port 55429 with TEST_DISPOSABLE=1.');
const suites=[
 ['quotation-pagination.browser.cjs','quotation-pagination-browser.json'],
 ['quotation-export.browser.cjs','quotation-export-browser.json'],
 ['dynamic-production.browser.cjs','dynamic-production-browser.json'],
 ['dynamic-pages.browser.cjs','dynamic-pages-browser.json'],
 ['product-fields-review.browser.cjs','product-fields-review-browser.json'],
 ['product-fields.browser.cjs','product-fields-browser.json'],
 ['dynamic-inline.browser.cjs','dynamic-inline-browser.json'],
 ['product-analytics.browser.cjs','product-analytics-browser.json'],
 ['customer-details.browser.cjs','customer-phase1-browser.json'],
 ['customer-categories.browser.cjs','customer-categories-browser.json'],
 ['customer-category-quotation.browser.cjs','customer-phase3-browser.json'],
 ['customer-release.browser.cjs','customer-phase4-browser.json'],
 ['quotation-editor.browser.cjs','quotation-editor-browser.json'],
 ['quotation-audit.browser.cjs','quotation-audit-browser.json'],
 ['browser-ui.cjs','ui-regressions.json',true],
 ['dropdowns.browser.cjs','dropdown-regressions.json'],
 ['dashboard.browser.cjs','dashboard-browser.json',true],
 ['products.browser.cjs','products-browser.json'],
 ['pricing-editor.browser.cjs','pricing-editor-browser.json'],
 ['pricing-refinement.browser.cjs','pricing-refinement-browser.json'],
];
if(process.argv.includes('--all'))suites.push(...[
 ['phase1.browser.cjs','phase1-browser.json','demo'],
 ['phase1-review.browser.cjs','phase1-review-browser.json','demo'],
 ['phase2.browser.cjs','phase2-browser.json','demo'],
 ['phase3.browser.cjs','phase3-browser.json','demo'],
 ['phase3-review.browser.cjs','phase3-review-browser.json','demo'],
 ['phase3-quantity.browser.cjs','phase3-quantity-browser.json','demo'],
 ['phase3-readiness.browser.cjs','phase3-readiness-browser.json','demo'],
 ['phase4.browser.cjs','phase4-browser.json','demo'],
 ['phase4-review.browser.cjs','phase4-review-browser.json','demo'],
 ['phase5.browser.cjs','phase5-browser.json','demo'],
]);
if(process.argv.includes('--legacy-only'))suites.splice(0,20);
if(!process.argv.includes('--legacy-only'))suites.unshift(['reports-dashboard.browser.cjs','reports-dashboard-browser.json']);
const requestedSuite=process.argv.find(value=>value.startsWith('--suite='))?.slice(8);
if(requestedSuite){const selected=suites.filter(suite=>suite[0]===requestedSuite);if(!selected.length)throw Error('Unknown browser suite.');suites.splice(0,suites.length,...selected);}
const summary=[],output=path.resolve('test-results');fs.mkdirSync(output,{recursive:true});
const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync(chromium.executablePath())?chromium.executablePath():process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);
async function runSuite([file,artifact,external]){
 let database,app;const env={...process.env};delete env.TEST_USERNAME;delete env.TEST_PASSWORD;delete env.TEST_BASE_URL;
 // PDF text extraction needs no BLAS worker pool; avoid host memory spikes.
 for(const key of ['OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS'])env[key]??='1';
 if(executable)env.PLAYWRIGHT_CHROMIUM_EXECUTABLE=executable;
 try{
  if(external){database=await testDatabase();app=await createApp({...database,staticDir:path.resolve('dist')});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));env.TEST_BASE_URL='http://127.0.0.1:'+app.server.address().port;
   if(external==='demo'){env.TEST_USERNAME='release_demo';env.TEST_PASSWORD='Release-demo-'+crypto.randomUUID();const setup=await fetch(env.TEST_BASE_URL+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Release demo QA',username:env.TEST_USERNAME,password:env.TEST_PASSWORD,demo:true})});if(setup.status!==201)throw Error('Disposable demo setup failed.');const auth=await setup.json(),headers={'Content-Type':'application/json',Cookie:setup.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':auth.csrfToken};const state=await (await fetch(env.TEST_BASE_URL+'/api/state',{headers})).json();const normalized=await fetch(env.TEST_BASE_URL+'/api/state',{method:'PUT',headers,body:JSON.stringify({revision:state.revision,state:state.state})});if(!normalized.ok)throw Error('Disposable demo normalization failed: '+await normalized.text());}
  }
  fs.rmSync(path.join(output,artifact),{force:true});
  const log=fs.openSync(path.join(output,'customer-phase4-'+file+'.log'),'w');let exitCode;
  try{exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join('tests',file)],{env,stdio:['ignore',log,log],windowsHide:true});child.on('error',reject);child.on('exit',resolve);});}finally{fs.closeSync(log);}
  const evidence=JSON.parse(fs.readFileSync(path.join(output,artifact),'utf8')),checks=evidence.results||[];
  const passed=checks.filter(c=>c.result==='PASS').length,failed=checks.filter(c=>c.result==='FAIL').length,exceptions=(evidence.exceptions||[]).length,result=exitCode===0&&checks.length>0&&!failed&&!exceptions?'PASS':'FAIL';
  summary.push({suite:file,result,exitCode,passed,failed,exceptions});console.log(result+' '+file+' - '+passed+' checks');if(result!=='PASS')process.exitCode=1;
 }catch(error){summary.push({suite:file,result:'FAIL',error:error.message});console.error('FAIL '+file+': '+error.message);process.exitCode=1;}
 finally{if(app)await app.close();if(database)await database.destroy();fs.writeFileSync(path.join(output,'customer-phase4-browser-summary.json'),JSON.stringify({suites:summary,passed:summary.reduce((n,s)=>n+(s.passed||0),0)},null,2));}
}
(async()=>{for(const suite of suites)await runSuite(suite);})().catch(error=>{console.error(error.message);process.exitCode=1;});
