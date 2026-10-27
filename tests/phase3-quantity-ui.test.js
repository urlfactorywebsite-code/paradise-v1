'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const DP = require('../shared/domain');

function workspace() {
 const elements = new Map();
 const node = selector => {
  if (!elements.has(selector)) elements.set(selector, { innerHTML:'',textContent:'',style:{},dataset:{},value:'',checked:false,append(){},remove(){} });
  return elements.get(selector);
 };
 for (const selector of ['#app','#modal','#toast','#cc','#config-fields','#config-quantity']) node(selector);
 const context = vm.createContext({ DP,crypto:crypto.webcrypto,console,AbortController,URLSearchParams,Blob,URL,
  setTimeout(fn,ms){const timer=setTimeout(fn,ms);timer.unref();return timer;},clearTimeout,
  window:{addEventListener(){}},location:{hash:'#dash'},
  document:{body:{classList:{toggle(){}}},querySelector:selector=>elements.get(selector)||null,querySelectorAll:()=>[],createElement:()=>node('element'),addEventListener(){}},
  fetch:async()=>({ok:true,status:200,json:async()=>({data:[]})}),
 });
 for (const file of ['app.js','backend-ui.js','srs-ui.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../public',file),'utf8').replace(/start\(\);\s*$/,''),context,{filename:file});
 context.initial={state:DP.seed({demo:true}),revision:1,user:{id:'admin',name:'Administrator',role:'Administrator'}};
 const run=code=>vm.runInContext(code,context);
 run(`adopt(initial);const p=prod('p7');Object.assign(p,DP.phase3Product(p));
  const location=p.f.find(field=>field.k==='printLocations');location.o[0][2]=0;Object.assign(location.optionMeta.Front,{enabled:true,approved:true});
  p.f.find(field=>field.k==='sz').sizes.push({key:'kids_6_8',label:'Kids 6-8',enabled:true,price:0});
  p.f.push({k:'proof',l:'DTF proof requirements',t:'txt',show_on_customer_pdf:true,when:{key:'meth',equals:'DTF'}});
  p.compatibility.push({field:'meth',when:{key:'qty',equals:10},allowed:['DTF']});
  Q=newQ();openCfg('p7');cs_('printLocations',['Front']);`);
 return {run,node};
}

test('Phase 3 size totals reconcile quantity-based options and refresh dependent customer fields',()=>{
 const app=workspace();app.run("cs_('meth','Screen Print');setSizeQuantity('sz','kids_6_8','10');");
 assert.equal(app.run('CF.qty'),10);
 assert.equal(app.run('CF.meth'),'DTF');
 assert.equal(app.run('calc(p,CF).err'),null);
 assert.match(app.node('#config-fields').innerHTML,/value="DTF" selected/);
 assert.doesNotMatch(app.node('#config-fields').innerHTML,/<option value="Screen Print"/);
 assert.match(app.node('#config-fields').innerHTML,/DTF proof requirements/);
});

test('Phase 3 clearing unavailable historical sizes reconciles quantity-based choices without changing the saved item',()=>{
 const app=workspace();app.run(`setSizeQuantity('sz','S','10');Q.items=[mkItem(p,CF,'shirt')];const saved=JSON.stringify(Q.items);
  CF.sz={S:10,retired:5};CF.qty=15;CF.meth='Screen Print';clearUnavailableSizes('sz');`);
 assert.equal(app.run('CF.qty'),10);
 assert.equal(app.run('CF.sz.retired'),undefined);
 assert.equal(app.run('CF.meth'),'DTF');
 assert.equal(app.run('calc(p,CF).err'),null);
 assert.equal(app.run('JSON.stringify(Q.items)===saved'),true);
 assert.match(app.node('#config-fields').innerHTML,/value="DTF" selected/);
 assert.match(app.node('#config-fields').innerHTML,/DTF proof requirements/);
});

test('Phase 3 sparse custom sizes render zero for omitted keys that match Object prototype names',()=>{
 const app=workspace();app.run(`p.f.find(field=>field.k==='sz').sizes.push({key:'toString',label:'Custom prototype-name size',enabled:true,price:2});
  CF.sz={S:10};CF.qty=10;const rendered=sizeQuantityField(p.f.find(field=>field.k==='sz'));`);
 assert.match(app.run('rendered'),/aria-label="Custom prototype-name size"[^>]*value="0"/);
 assert.doesNotMatch(app.run('rendered'),/native code/);
 app.run("setSizeQuantity('sz','S','11')");
 assert.equal(app.run('CF.qty'),11);
 assert.equal(app.run('calc(p,CF).qty'),11);
});

test('Phase 3 displayed and edited size totals use only explicitly supplied quantities',()=>{
 const app=workspace();app.run(`const inherited=Object.create({kids_6_8:7});inherited.S=10;CF.sz=inherited;CF.qty=10;
  const rendered=sizeQuantityField(p.f.find(field=>field.k==='sz'));`);
 assert.match(app.run('rendered'),/aria-label="Kids 6-8"[^>]*value="0"/);
 assert.match(app.run('rendered'),/Total Quantity: 10/);
 app.run("setSizeQuantity('sz','S','11')");
 assert.equal(app.run('CF.qty'),11);
 assert.equal(app.run('calc(p,CF).qty'),11);
});
