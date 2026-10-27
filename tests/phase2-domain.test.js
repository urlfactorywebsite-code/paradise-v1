'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const DP=require('../shared/domain');
const {validateState}=require('../server/validation');
const {quotationPdf}=require('../server/pdf');
const old=code=>DP.seed({demo:false}).products.find(p=>p.code===code);
const card=()=>DP.phase2Product(old('GD-VC'));
function approvedFlex(){const p=DP.phase2Product(old('PR-FX'));for(const[key,value,rate]of[['material','220 GSM',2],['printing','Solvent',3],['eyelets','Corners Only',1.5],['eyelets','Every 2 Feet',1.5],['eye','Ropes',3],['eye','Stands',25]]){const f=p.f.find(f=>f.k===key);f.o.find(o=>o[0]===value)[2]=rate;Object.assign(f.optionMeta[value],{enabled:true,approved:true});}p.f.find(f=>f.k==='eyelets').eyeletPolicy.approved=true;return p;}
const flexCfg=p=>({...DP.defCfg(p),w:2,h:3,u:'ft',qty:2});

test('A01-04: existing finishes remain and Custom requires saved customer-visible details without an automatic price',()=>{
 const p=card(),f=p.f.find(f=>f.k==='fin');for(const name of['Plain','Glossy','Matte','Velvet','Custom'])assert.ok(f.o.some(o=>o[0]===name));
 const cfg={...DP.defCfg(p),fin:'Custom'};assert.match(DP.calc(p,cfg).err,/Custom Finish Details.*required/);
 const item=DP.mkItem(p,{...cfg,customFinish:'Approved textured finish'},'card');assert.ok(item);assert.equal(item.cfg.customFinish,'Approved textured finish');
 assert.equal(item.sub,DP.calc(p,{...cfg,fin:'Plain'}).sub);assert.ok(DP.customerSpecifications(item).includes('Custom Finish Details: Approved textured finish'));
 assert.ok(DP.calc(p,{...cfg,customFinish:'   '}).err);const hidden=DP.mkItem(p,{...cfg,fin:'Plain',customFinish:'HIDDEN-FINISH'},'plain');assert.equal(hidden.cfg.customFinish,undefined);assert.ok(!DP.customerSpecifications(hidden).join(' ').includes('HIDDEN-FINISH'));
});
test('A05-08: structured shape-size compatibility rejects invalid pairs and missing custom dimensions',()=>{
 const p=card(),size=p.f.find(f=>f.k==='size'),rectangle=size.o[0][0],square=size.o[1][0],cfg=DP.defCfg(p);
 assert.equal(DP.calc(p,{...cfg,shape:'Square',size:square}).err,null);
 assert.match(DP.calc(p,{...cfg,shape:'Square',size:rectangle}).err,/square/);
 assert.match(DP.calc(p,{...cfg,shape:'Custom',size:square}).err,/custom/);
 const custom={...cfg,shape:'Custom',size:'Custom',w:3,h:2,u:'in'};assert.equal(DP.calc(p,custom).err,null);delete custom.w;assert.match(DP.calc(p,custom).err,/width/);
 size.optionMeta[square].label='A misleading rectangular label';assert.equal(DP.calc(p,{...cfg,shape:'Square',size:square}).err,null);
 size.optionMeta[square].geometry={w:4,h:2,u:'in'};DP.syncPhase2Rules(p);assert.match(DP.pricingError(p),/Shape-size/);
});
test('A09/C21: frontend reconciliation preserves valid selections and resets incompatible sizes',()=>{
 const p=card(),cfg=DP.defCfg(p),square=p.f.find(f=>f.k==='size').o[1][0];
 const changed=DP.reconcileConfig(p,{...cfg,shape:'Square'},'shape');assert.equal(changed.size,square);
 assert.equal(DP.reconcileConfig(p,changed,'shape').size,square);
 assert.equal(DP.reconcileConfig(p,{...changed,shape:'Custom'},'shape').size,'Custom');
});
test('B10-12: Admin material and printing rates use the shared billable area, quantity and base minimum',()=>{
 const p=approvedFlex(),r=DP.calc(p,flexCfg(p));assert.equal(r.err,null);assert.equal(r.base,30000);assert.equal(r.sub,36000);assert.equal(r.grand,42480);
 assert.deepEqual(r.L.filter(row=>/^Material:|^Printing Type:/.test(row[0])).map(row=>row[1]),[2400,3600]);
 const material=p.f.find(f=>f.k==='material');material.optionMeta['220 GSM'].label='Approved banner stock';assert.ok(DP.calc(p,flexCfg(p)).sp.includes('Material: Approved banner stock'));
});
test('B13-16: eyelet None, corners and perimeter quantities use approved per-piece rates and panel quantities',()=>{
 const p=approvedFlex(),cfg=flexCfg(p);
 const none=DP.calc(p,cfg);assert.equal(none.computed.eyelets.total,0);assert.ok(!none.L.some(row=>row[0].startsWith('Eyelets:')));
 const corners=DP.calc(p,{...cfg,eyelets:'Corners Only'});assert.equal(corners.computed.eyelets.perPiece,4);assert.equal(corners.computed.eyelets.total,8);assert.equal(corners.sub,37200);
 const perimeter=DP.calc(p,{...cfg,eyelets:'Every 2 Feet'});assert.equal(perimeter.computed.eyelets.perPiece,6);assert.equal(perimeter.computed.eyelets.total,12);assert.equal(perimeter.sub,37800);
 for(const [w,h,u]of[[4,2,'ft'],[48,24,'in'],[121.92,60.96,'cm'],[1.2192,.6096,'m']])assert.equal(DP.calc(p,{...cfg,w,h,u,qty:1,eyelets:'Every 2 Feet'}).computed.eyelets.total,6);
 assert.equal(DP.calc(p,{...cfg,w:1,h:1,qty:1,eyelets:'Every 2 Feet'}).computed.eyelets.total,4);
});
test('B15/B20: unapproved eyelet policy, missing prices and disabled options fail closed',()=>{
 const p=DP.phase2Product(old('PR-FX'));assert.match(DP.calc(p,DP.defCfg(p)).err,/approved prices/);
 const approved=approvedFlex();approved.f.find(f=>f.k==='eyelets').eyeletPolicy.approved=false;
 assert.match(DP.calc(approved,{...flexCfg(approved),eyelets:'Corners Only'}).err,/policy.*approval/);
 const material=approved.f.find(f=>f.k==='material');material.optionMeta['220 GSM'].enabled=false;
 assert.match(DP.calc(approved,{...flexCfg(approved),material:'220 GSM'}).err,/active option/);
 material.optionMeta['220 GSM'].enabled=true;material.o[0][2]=null;assert.match(DP.pricingError(approved),/pricing/);
});
test('B17: retained bundle keeps its existing price and cannot be combined with separately charged eyelets',()=>{
 const p=approvedFlex(),cfg=flexCfg(p),fin=p.f.find(f=>f.k==='fin');assert.equal(fin.o.find(o=>o[0]==='Hemming & Eyelets')[2],2);assert.equal(fin.o.find(o=>o[0]==='Hemming')[2],null);
 assert.equal(DP.calc(p,{...cfg,fin:'Hemming & Eyelets'}).sub,38400);
 assert.match(DP.calc(p,{...cfg,fin:'Hemming & Eyelets',eyelets:'Corners Only'}).err,/already includes eyelets/);
 assert.deepEqual(DP.availableOptions(p,p.f.find(f=>f.k==='eyelets'),{...cfg,fin:'Hemming & Eyelets'}).map(o=>o[0]),['None']);
});
test('B18: accessory rates preserve Pipe Pockets and support quantities and existing charge bases',()=>{
 const p=approvedFlex(),cfg=flexCfg(p),eye=p.f.find(f=>f.k==='eye');assert.equal(eye.o.find(o=>o[0]==='Pipe Pockets')[2],150);
 assert.equal(DP.calc(p,{...cfg,eye:'Pipe Pockets'}).sub,51000);
 assert.equal(DP.calc(p,{...cfg,eye:'Ropes',accessoryQty:4}).sub,38400);
 assert.match(DP.calc(p,{...cfg,eye:'Ropes',accessoryQty:-1}).err,/quantity/);
 eye.o.find(o=>o[0]==='Stands')[1]='f';assert.equal(DP.calc(p,{...cfg,eye:'Stands',accessoryQty:1}).sub,38500);
 eye.o.push(['Cable clips','u',2]);eye.optionMeta['Cable clips']={label:'Cable clips',enabled:true,approved:true,quantityKey:'accessoryQty'};DP.syncPhase2Rules(p);assert.equal(DP.calc(p,{...cfg,eye:'Cable clips',accessoryQty:3}).sub,37200);
});
test('B19/C25: unknown options, invalid rates and client-derived quantities cannot bypass calculations',()=>{
 const p=approvedFlex(),cfg=flexCfg(p);assert.match(DP.calc(p,{...cfg,material:'Forged'}).err,/Invalid option/);
 assert.match(DP.calc(p,{...cfg,eyeletQuantity:999}).err,/Unknown/);
 const f=p.f.find(f=>f.k==='material');f.o[0][1]='u';assert.match(DP.pricingError(p),/per-area/);
});
test('C23-24: explicit setup and managed rule synchronization are idempotent and retain manual rules/rates',()=>{
 for(const code of['GD-VC','PR-FX']){const source=old(code),before=structuredClone(source);source.compatibility.push({id:'manual',when:{key:'qty',equals:100},field:code==='GD-VC'?'mat':'type',allowed:[code==='GD-VC'?'Standard Board':'Normal Flex'],message:'Manual rule'});const p=DP.phase2Product(source);assert.deepEqual(DP.phase2Product(p),p);assert.equal(p.rate,before.rate);assert.deepEqual(p.compatibility.find(r=>r.id==='manual'),source.compatibility[0]);assert.deepEqual(old(code),before);}
 assert.throws(()=>DP.phase2Product(old('PG-TS')),/only/);
 const legacy=old('PR-FX');legacy.f.find(f=>f.k==='material').default='Previous custom stock';assert.equal(DP.phase2Product(legacy).f.find(f=>f.k==='material').legacyTextDefault,'Previous custom stock');
 const collision=old('GD-VC');collision.compatibility=[{id:'phase2_shape_rectangle',when:{key:'qty',equals:100},field:'mat',allowed:['Standard Board']}];assert.throws(()=>DP.phase2Product(collision),/reserved Phase 2 ID/);assert.equal(collision.compatibility[0].field,'mat');
 const reordered=old('GD-VC');reordered.f.find(f=>f.k==='size').o.reverse();assert.equal(DP.pricingError(DP.phase2Product(reordered)),null);
});
test('C22/C26: existing rules remain valid and circular or contradictory rule references are rejected',()=>{
 const p={...old('GD-VC'),f:[{k:'a',l:'A',t:'sel',o:[['X','f',0],['Y','f',0]]},{k:'b',l:'B',t:'sel',o:[['One','f',0],['Two','f',0]]}],compatibility:[{when:{key:'a',equals:'X'},field:'b',allowed:['One']}]};assert.equal(DP.pricingError(p),null);
 p.compatibility.push({when:{key:'b',equals:'One'},field:'a',allowed:['X']});assert.match(DP.pricingError(p),/Circular/);p.compatibility.pop();
 p.compatibility.push({when:{mode:'ANY',conditions:[{key:'a',operator:'equals',value:'X'},{key:'a',operator:'equals',value:'Y'}]},field:'b',allowed:['Two']});assert.match(DP.pricingError(p),/Contradictory/);
 p.compatibility=[{when:{key:'missing',equals:'X'},field:'b',allowed:['One']}];assert.match(DP.pricingError(p),/unknown/);
});
test('D27-30: legacy free-text selections, snapshots and prices survive product setup and PDF generation',()=>{
 const state=DP.seed(),previous=structuredClone(state),q=state.quotes[1],item=q.items.find(i=>i.pid==='p5');item.cfg.material='LEGACY-STOCK-REF';item.cfg.printing='Legacy custom printing';item.sp.push('Material: LEGACY-STOCK-REF');delete item.fieldSnapshot;previous.quotes=structuredClone(state.quotes);
 state.products[state.products.findIndex(p=>p.code==='PR-FX')]=DP.phase2Product(state.products.find(p=>p.code==='PR-FX'));
 const checked=validateState(state,previous,{id:'admin',name:'Admin',role:'Administrator'},()=>{throw new Error('Unexpected allocation')});assert.deepEqual(checked.quotes[1].items,previous.quotes[1].items);assert.equal(DP.totals(checked.quotes[1]).grand,DP.totals(previous.quotes[1]).grand);
 assert.ok(quotationPdf(checked.quotes[1],checked).toString('latin1').includes('LEGACY-STOCK-REF'));
});
test('D30: computed eyelet quantities and stable display names appear in safe customer specifications',()=>{
 const state=DP.seed(),p=approvedFlex(),item=DP.mkItem(p,{...flexCfg(p),eyelets:'Corners Only'},'flex');state.quotes[0].items=[item];assert.equal(item.computed.eyelets.total,8);assert.ok(DP.customerSpecifications(item).includes('Eyelets: Corners Only (8 eyelets)'));assert.ok(quotationPdf(state.quotes[0],state).toString('latin1').includes('8 eyelets'));
});
test('D31: unrelated products including existing T-Shirt fields remain untouched by Phase 2 setup',()=>{
 const state=DP.seed({demo:false}),before=structuredClone(state.products.filter(p=>!['GD-VC','PR-FX'].includes(p.code)));state.products=state.products.map(p=>['GD-VC','PR-FX'].includes(p.code)?DP.phase2Product(p):p);assert.deepEqual(state.products.filter(p=>!['GD-VC','PR-FX'].includes(p.code)),before);
});

test('C rules: higher-order intersections and multiselect controller contradictions are rejected',()=>{
 const source={...old('GD-VC'),f:[{k:'a',l:'A',t:'sel',o:[['X','f',0]]},{k:'b',l:'B',t:'sel',o:[['One','f',0],['Two','f',0],['Three','f',0]]}],compatibility:[['One','Two'],['One','Three'],['Two','Three']].map(allowed=>({when:{key:'a',equals:'X'},field:'b',allowed}))};
 assert.match(DP.pricingError(source),/Contradictory/);
 source.f[0]={k:'a',l:'A',t:'multi',required:false,o:[['X','f',0],['Y','f',0]]};source.compatibility=[{when:{key:'a',equals:'X'},field:'b',allowed:['One']},{when:{key:'a',equals:'Y'},field:'b',allowed:['Two']}];assert.match(DP.pricingError(source),/Contradictory/);
});

test('B mandatory configuration cannot be weakened to optional prices or removed bundle protection',()=>{
 const p=approvedFlex();p.f.find(f=>f.k==='material').required=false;assert.match(DP.pricingError(p),/mandatory/);delete p.f.find(f=>f.k==='material').required;
 p.f.find(f=>f.k==='material').when={key:'type',equals:'Star Flex'};assert.match(DP.pricingError(p),/mandatory/);delete p.f.find(f=>f.k==='material').when;
 p.compatibility=[];assert.match(DP.pricingError(p),/double-charge/);
});

test('C legacy self rules that preserve their triggering choice remain harmless and operational',()=>{
 const p=old('PR-FX');p.compatibility=[{when:{key:'type',equals:'Normal Flex'},field:'type',allowed:['Normal Flex']}];assert.equal(DP.pricingError(p),null);assert.equal(DP.calc(p,DP.defCfg(p)).err,null);
 p.compatibility[0].allowed=['Star Flex'];assert.match(DP.pricingError(p),/Circular/);
});
