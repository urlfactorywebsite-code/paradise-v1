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
  for (const selector of ['#app','#modal','#toast','#cc','#field-list','#product-rules','#config-fields','#config-quantity']) node(selector);
  const context = vm.createContext({ DP,crypto:crypto.webcrypto,console,AbortController,URLSearchParams,Blob,URL,
    setTimeout(fn,ms){ const timer=setTimeout(fn,ms);timer.unref();return timer; },clearTimeout,
    window:{addEventListener(){}},location:{hash:'#dash'},
    document:{body:{classList:{toggle(){}}},querySelector:s=>elements.get(s)||null,querySelectorAll:()=>[],createElement:()=>node('element'),addEventListener(){}},
    fetch:async()=>({ok:true,status:200,json:async()=>({data:[]})}),
  });
  for (const file of ['app.js','backend-ui.js','srs-ui.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../public',file),'utf8').replace(/start\(\);\s*$/,''),context,{filename:file});
  context.initial={state:DP.seed({demo:true}),revision:1,user:{id:'admin',name:'Administrator',role:'Administrator'}};
  vm.runInContext('adopt(initial);',context);
  return {run:code=>vm.runInContext(code,context),node};
}

test('Phase 2 Admin setup stages a draft and exposes approval, availability, ordering and geometry controls',()=>{
 const app=workspace();app.run("const original=JSON.stringify(prod('p1'));prodForm('p1');preparePhase2()");assert.equal(app.run('PRODUCT_DRAFT.phase2'),'visiting_card');assert.equal(app.run("JSON.stringify(prod('p1'))===original"),true);
 assert.match(app.node('#field-list').innerHTML,/Custom Finish Details|Size width/);assert.match(app.node('#field-list').innerHTML,/Rate explicitly approved/);
 app.run("prodForm('p5');PRODUCT_DRAFT.f.find(f=>f.k==='material').default='Previous stock reference';preparePhase2()");const html=app.node('#field-list').innerHTML;for(const text of['220 GSM','Solvent','Ropes','Stands','Business-approved eyelet counting policy','Retained previous text default: Previous stock reference'])assert.ok(html.includes(text),text);assert.equal(app.run("PRODUCT_DRAFT.f.find(f=>f.k==='eyelets').eyeletPolicy.approved"),false);
});
test('Phase 2 managed options retain stable keys while labels, rates and ordering change',()=>{
 const app=workspace();app.run("prodForm('p5');preparePhase2();const i=PRODUCT_DRAFT.f.findIndex(f=>f.k==='material');setOptionMeta(i,'220 GSM','label','New display');setOptionMeta(i,'220 GSM','approved',true);moveManagedOption(i,0,1);addManagedOption(i)");
 assert.equal(app.run("PRODUCT_DRAFT.f.find(f=>f.k==='material').optionMeta['220 GSM'].label"),'New display');assert.equal(app.run("PRODUCT_DRAFT.f.find(f=>f.k==='material').o[1][0]"),'220 GSM');assert.equal(app.run("PRODUCT_DRAFT.f.find(f=>f.k==='material').o.at(-1)[2]"),null);
 app.run("const accessory=PRODUCT_DRAFT.f.findIndex(f=>f.k==='eye');setOptionMeta(accessory,'Pipe Pockets','quantityKey','accessoryQty')");assert.match(app.node('#field-list').innerHTML,/Quantity source \(per-unit bases only\)/);
});
test('Phase 2 card configurator filters invalid sizes, resets on shape change and requires finish details',()=>{
 const app=workspace();app.run("Q=newQ();Object.assign(prod('p1'),DP.phase2Product(prod('p1')));openCfg('p1');cs_('shape','Square')");
 assert.equal(app.run('CF.size'),app.run("prod('p1').f.find(f=>f.k==='size').o[1][0]"));assert.doesNotMatch(app.node('#config-fields').innerHTML,/option value="Standard 3/);
 assert.doesNotMatch(app.node('#config-fields').innerHTML,/Custom Finish Details/);
 app.run("cs_('shape','Custom');cs_('fin','Custom')");assert.equal(app.run('CF.size'),'Custom');assert.match(app.node('#config-fields').innerHTML,/Custom Finish Details/);assert.match(app.node('#cc').innerHTML,/required/);
 app.run("cs_('customFinish','Customer requested finish')");assert.equal(app.run("calc(prod('p1'),CF).err"),null);
});
test('Phase 2 historical unmapped dropdown choices stay readable until an explicit valid selection',()=>{
 const app=workspace();app.run("Q=newQ();const p=prod('p5'),cfg={...defCfg(p),material:'Historical stock',printing:'Historical method'};Q.items=[mkItem(p,cfg,'legacy')];Object.assign(p,DP.phase2Product(p));openCfg('p5','legacy')");
 assert.match(app.node('#modal').innerHTML,/Saved choice unavailable: Historical stock/);assert.equal(app.run('CF.material'),'Historical stock');assert.match(app.node('#cc').innerHTML,/active option/);
});

