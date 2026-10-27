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

test('Phase 3 Admin stages T-shirt sizes, location charges and customer instructions without changing saved catalog',()=>{
 const app=workspace();app.run("const saved=JSON.stringify(prod('p7'));prodForm('p7');preparePhase3()");
 assert.equal(app.run("JSON.stringify(prod('p7'))===saved"),true);
 assert.equal(app.run("PRODUCT_DRAFT.f.filter(f=>f.t==='SIZE_BREAKDOWN').length"),1);
 assert.equal(app.run("PRODUCT_DRAFT.f.find(f=>f.k==='printLocations').o.length"),6);
 assert.equal(app.run("PRODUCT_DRAFT.f.find(f=>f.k==='printLocations').o.every(o=>o[2]===null)"),true);
 const html=app.node('#field-list').innerHTML;
 for(const label of ['Minimum selections','Maximum selections','Design Requirements','Multiple lines of customer instructions','Rate explicitly approved'])assert.ok(html.includes(label),label);
 app.run("preparePhase3()");assert.equal(app.run("PRODUCT_DRAFT.f.filter(f=>f.k==='printLocations').length"),1);
});

test('Phase 3 shared gift fields render once, retain mapped model prices and preserve per-product edits as overrides',()=>{
 const app=workspace();
 app.run("prodForm('p10');preparePhase3();const model=PRODUCT_DRAFT.f.find(f=>f.k==='type');model.l='Cup model';const color=PRODUCT_DRAFT.f.find(f=>f.k==='color');color.l='Glaze colour';const raw=DP.stripGiftProduct(PRODUCT_DRAFT,currentGiftTemplate());const projected=DP.resolveGiftProduct(raw,currentGiftTemplate());");
 assert.equal(app.run("projected.f.filter(f=>f.k==='type').length"),1);
 assert.equal(app.run("projected.f.filter(f=>f.k==='model').length"),0);
 assert.equal(app.run("projected.f.find(f=>f.k==='type').o[1][2]"),60);
 assert.equal(app.run("projected.f.find(f=>f.k==='type').l"),'Cup model');
 assert.equal(app.run("projected.f.find(f=>f.k==='color').l"),'Glaze colour');
 assert.equal(app.run("raw.f.some(f=>f.k==='color')"),false);
 assert.ok(app.node('#field-list').innerHTML.includes('Promotional gift template:'));
});

test('Phase 3 inherited fields can be disabled, restored and combined with extra local specifications',()=>{
 const app=workspace();app.run("prodForm('p8');preparePhase3();toggleGiftField('color',false);addProductField();PRODUCT_DRAFT.f.at(-1).k='deliveryMessage';PRODUCT_DRAFT.f.at(-1).l='Delivery message';const first=DP.stripGiftProduct(PRODUCT_DRAFT,currentGiftTemplate());toggleGiftField('color',true);const second=DP.stripGiftProduct(PRODUCT_DRAFT,currentGiftTemplate());");
 assert.equal(app.run("first.giftTemplate.disabled.includes('color')"),true);
 assert.equal(app.run("second.giftTemplate.disabled.includes('color')"),false);
 assert.equal(app.run("PRODUCT_DRAFT.f.filter(f=>f.k==='color').length"),1);
 assert.equal(app.run("PRODUCT_DRAFT.f.some(f=>f.k==='deliveryMessage')"),true);
 assert.match(app.run('phase3ConfigurationPanel()'),/Colour/);
});

test('Phase 3 shared template editor protects stable fields and does not save draft changes automatically',()=>{
 const app=workspace();app.run("const original=JSON.stringify(currentGiftTemplate());giftTemplateForm();PRODUCT_DRAFT.f.find(f=>f.k==='artwork').l='Artwork instructions';renderFields()");
 assert.equal(app.run("JSON.stringify(currentGiftTemplate())===original"),true);
 const html=app.node('#field-list').innerHTML;
 assert.match(html,/readonly value="artwork"/);
 assert.doesNotMatch(html,/Remove specification/);
 assert.match(app.node('#modal').innerHTML,/Save shared template/);
});

test('Phase 3 T-shirt location choices, size totals and multiline requirements survive item editing and public preview',()=>{
 const app=workspace();app.run(`Q=newQ();Object.assign(prod('p7'),DP.phase3Product(prod('p7')));const p=prod('p7'),f=p.f.find(f=>f.k==='printLocations');for(const o of f.o){o[2]=o[0]==='Front'?2:3;f.optionMeta[o[0]].approved=true;f.optionMeta[o[0]].enabled=true;}openCfg('p7');setSizeQuantity('sz','S','10');cs_('printLocations',['Front','Back']);cs_('designRequirements','Place logo on front\\nUse navy artwork');`);
 assert.match(app.node('#config-fields').innerHTML||app.node('#modal').innerHTML,/<textarea[^>]*Design Requirements/);
 assert.equal(app.run("calc(effectiveProd('p7'),CF).qty"),10);
 assert.equal(app.run("calc(effectiveProd('p7'),CF).sub"),265000);
 app.run("Q.items=[mkItem(effectiveProd('p7'),CF,'shirt','PRIVATE-STAFF-NOTE')];openCfg('p7','shirt');");
 assert.equal(app.run('CF.designRequirements'),'Place logo on front\nUse navy artwork');
 assert.deepEqual(JSON.parse(app.run('JSON.stringify(CF.printLocations)')),['Front','Back']);
 const html=app.run("docHTML({...S.quotes[0],items:Q.items})");assert.match(html,/Place logo on front/);assert.match(html,/Front, Back/);assert.doesNotMatch(html,/PRIVATE-STAFF-NOTE/);
});

test('Phase 3 gift custom values use their configured rate and pending custom values stay unavailable',()=>{
 const app=workspace();app.run("prodForm('p8');preparePhase3();const i=PRODUCT_DRAFT.f.findIndex(f=>f.k==='color');setCustomOption(i,true);const raw=DP.stripGiftProduct(PRODUCT_DRAFT,currentGiftTemplate());Object.assign(prod('p8'),raw);Q=newQ();openCfg('p8');");
 assert.match(app.node('#modal').innerHTML,/Custom values require an explicitly approved configured rate/);
 app.run("prodForm('p8');const c=PRODUCT_DRAFT.f.find(f=>f.k==='color');c.customCharge={type:'u',amount:1.5,approved:true};Object.assign(prod('p8'),DP.stripGiftProduct(PRODUCT_DRAFT,currentGiftTemplate()));openCfg('p8');cs_('color','School blue');");
 assert.equal(app.run('CF.color'),'School blue');assert.match(app.node('#config-fields').innerHTML,/Custom: School blue/);
 assert.equal(app.run("calc(effectiveProd('p8'),CF).sub"),225000);
});

test('Phase 3 historical T-shirt location totals remain readable and explicit named-location editing clears the legacy key',()=>{
 const app=workspace();app.run("Q={...newQ(),items:[clone(S.quotes.find(q=>q.id==='Q3').items[0])]};const historical=JSON.stringify(Q.items);Object.assign(prod('p7'),DP.phase3Product(prod('p7')));const locations=prod('p7').f.find(f=>f.k==='printLocations');locations.o[0][2]=0;locations.optionMeta.Front.enabled=true;locations.optionMeta.Front.approved=true;openCfg('p7',Q.items[0].id);");
 assert.match(app.node('#modal').innerHTML,/Saved Print Locations: 1 Location/);
 assert.equal(app.run('JSON.stringify(Q.items)===historical'),true);
 app.run("cs_('printLocations',['Front'])");
 assert.equal(app.run("'loc' in CF"),false);
 assert.equal(app.run("calc(effectiveProd('p7'),CF).err"),null);
});

