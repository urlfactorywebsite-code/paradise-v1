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


test('review: changing a customer textarea to a choice clears incompatible metadata and leaves new rates pending',()=>{
 const app=workspace();app.run("prodForm('p8');preparePhase3();const index=PRODUCT_DRAFT.f.findIndex(f=>f.k==='artwork');changeFieldType(index,'sel');");
 assert.equal(app.run("PRODUCT_DRAFT.f[index].multiline"),undefined);
 assert.equal(app.run("DP.fieldDefinitionError(PRODUCT_DRAFT)"),null);
 assert.equal(app.run("PRODUCT_DRAFT.f[index].o[0][2]"),null);
 assert.equal(app.run("PRODUCT_DRAFT.f[index].optionMeta.Standard.approved"),false);
 assert.equal(app.run("PRODUCT_DRAFT.f[index].optionMeta.Standard.enabled"),false);
 app.run("changeFieldType(index,'txt')");
 assert.equal(app.run("PRODUCT_DRAFT.f[index].optionMeta"),undefined);
});

test('review: customer text uses its configured reusable length and escapes markup while restoring long requirements',()=>{
 const app=workspace();app.run("Object.assign(prod('p2'),DP.phase3Product(prod('p2')));Q=newQ();openCfg('p2');cs_('additionalRequirements','<img src=x onerror=alert(1)> '+ 'A'.repeat(3000));openCfg('p2');CF.additionalRequirements='<img src=x onerror=alert(1)> '+ 'A'.repeat(3000);const rendered=configurationFields(effectiveProd('p2'));");
 const html=app.run('rendered');assert.match(html,/maxlength="4000"/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);
 app.run("prod('p2').f.find(f=>f.k==='additionalRequirements').maxLength=120;const shorter=configurationFields(effectiveProd('p2'));");
 assert.match(app.run('shorter'),/maxlength="120"/);
});

test('review: unavailable saved named print locations remain readable until an explicit clearing action',()=>{
 const app=workspace();app.run("Object.assign(prod('p7'),DP.phase3Product(prod('p7')));const p=prod('p7'),f=p.f.find(f=>f.k==='printLocations');for(const o of f.o){o[2]=2;f.optionMeta[o[0]].approved=true;f.optionMeta[o[0]].enabled=true;}Q=newQ();openCfg('p7');setSizeQuantity('sz','S','10');cs_('printLocations',['Front','Back']);Q.items=[mkItem(p,CF,'shirt')];f.optionMeta.Back.enabled=false;openCfg('p7','shirt');const before=JSON.stringify(Q.items);");
 const html=app.node('#modal').innerHTML;assert.match(html,/Saved choice unavailable: Back/);assert.match(html,/Clear unavailable choices/);
 app.run("clearUnavailableOptions('printLocations')");
 assert.deepEqual(JSON.parse(app.run('JSON.stringify(CF.printLocations)')),['Front']);
 assert.equal(app.run('JSON.stringify(Q.items)===before'),true);
 assert.equal(app.run("calc(effectiveProd('p7'),CF).err"),null);
});

test('review: local additions get unique keys after another field is removed',()=>{
 const app=workspace();app.run("prodForm('p8');preparePhase3();addProductField();addProductField();PRODUCT_DRAFT.f.splice(PRODUCT_DRAFT.f.length-2,1);addProductField();");
 assert.equal(app.run("new Set(PRODUCT_DRAFT.f.map(f=>f.k)).size===PRODUCT_DRAFT.f.length"),true);
});

test('review: Admin can reset a product override to inheritance without changing shared or mapped master rates',()=>{
 const app=workspace();app.run("prodForm('p10');preparePhase3();const templateBefore=JSON.stringify(currentGiftTemplate());PRODUCT_DRAFT.f.find(f=>f.k==='type').o[1][2]=90;PRODUCT_DRAFT.f.find(f=>f.k==='artwork').l='Cup artwork';resetGiftField('model');resetGiftField('artwork');const raw=DP.stripGiftProduct(PRODUCT_DRAFT,currentGiftTemplate());");
 assert.equal(app.run("PRODUCT_DRAFT.f.find(f=>f.k==='type').o[1][2]"),60);
 assert.equal(app.run("PRODUCT_DRAFT.f.find(f=>f.k==='artwork').l"),'Artwork Requirement');
 assert.equal(app.run('JSON.stringify(currentGiftTemplate())===templateBefore'),true);
 assert.deepEqual(JSON.parse(app.run('JSON.stringify(raw.giftTemplate.overrides)')),{});
});

test('review: disabling an inherited field clears its current edit value without changing historical item snapshots',()=>{
 const app=workspace();app.run("prodForm('p8');preparePhase3();const color=PRODUCT_DRAFT.f.find(f=>f.k==='color');color.o=[['Blue','u',2]];color.optionMeta={Blue:{enabled:true,approved:true}};Object.assign(prod('p8'),DP.stripGiftProduct(PRODUCT_DRAFT,currentGiftTemplate()));Q=newQ();openCfg('p8');cs_('color','Blue');Q.items=[mkItem(effectiveProd('p8'),CF,'bag')];const history=JSON.stringify(Q.items);prod('p8').giftTemplate.disabled=['color'];openCfg('p8','bag');");
 assert.equal(app.run('CF.color'),undefined);
 assert.equal(app.run("calc(effectiveProd('p8'),CF).err"),null);
 assert.equal(app.run('JSON.stringify(Q.items)===history'),true);
 assert.doesNotMatch(app.node('#modal').innerHTML,/aria-label="Colour"/);
 app.run("prodForm('p8');toggleGiftField('color',true);PRODUCT_DRAFT.f.find(f=>f.k==='artwork').when={key:'color',equals:'Blue'};");
 assert.doesNotThrow(()=>app.run("toggleGiftField('color',false)"));
 assert.equal(app.run("PRODUCT_DRAFT.giftTemplate.disabled.includes('color')"),false);
 assert.match(app.node('element').textContent,/Condition references an unknown field/);
});
