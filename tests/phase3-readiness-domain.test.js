'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const DP=require('../shared/domain');
const {validateState}=require('../server/validation');
const admin={id:'readiness-admin',name:'Readiness Admin',role:'Administrator'};
const product=code=>DP.seed({demo:false}).products.find(p=>p.code===code);
function shirt(){
 const p=DP.phase3Product(product('PG-TS')),locations=p.f.find(f=>f.k==='printLocations');
 locations.o[0][2]=2;Object.assign(locations.optionMeta.Front,{enabled:true,approved:true});
 p.f.find(f=>f.k==='sz').sizes.push(...['toString','valueOf','hasOwnProperty'].map(key=>({key,label:'Custom '+key,enabled:true,price:3})));
 return p;
}
const shirtConfig=(p,sz)=>({...DP.defCfg(p),sz,qty:Object.values(sz).reduce((sum,value)=>sum+value,0),printLocations:['Front']});

test('Phase 3 readiness: existing Print Locations aliases cannot create duplicate controls or charges during preparation',()=>{
 for(const key of ['existingPrintLocations','legacy_locations']){
  const original=product('PG-TS');original.f.find(f=>f.k==='loc').k=key;
  const retained=structuredClone(original);
  assert.throws(()=>DP.phase3Product(original),/Print Locations.*review|Review.*Print Locations/i);
  assert.deepEqual(original,retained);
  const legacy=DP.calc(original,{...DP.defCfg(original),sz:{S:10},[key]:'2 Locations'});
  assert.equal(legacy.err,null);assert.equal(legacy.sub,300000);
  assert.equal(legacy.L.filter(row=>row[0].startsWith('Print Locations:')).length,1);
 }
});

test('Phase 3 readiness: sparse custom sizes matching Object prototype names count only explicit quantities',()=>{
 const p=shirt(),config=shirtConfig(p,{S:10});
 const result=DP.calc(p,config);assert.equal(result.err,null);assert.equal(result.qty,10);assert.equal(result.sub,262000);
 const selected=shirtConfig(p,{S:10,toString:2,valueOf:3,hasOwnProperty:4}),priced=DP.calc(p,selected);
 assert.equal(priced.err,null);assert.equal(priced.qty,19);assert.equal(priced.sub,500500);
 assert.equal(priced.L.filter(row=>row[0].startsWith('Size breakdown:')).length,3);
 const item=DP.mkItem(p,selected,'prototype-named-sizes');
 assert.equal(item.cfg.qty,19);assert.ok(DP.customerSpecifications(item).some(value=>value.includes('Custom toString 2')&&value.includes('Custom valueOf 3')&&value.includes('Custom hasOwnProperty 4')));
});

test('Phase 3 readiness: inherited size properties cannot create phantom quantities, charges or customer specifications',()=>{
 const p=shirt(),sizes=Object.assign(Object.create({M:20,toString:5,valueOf:8,hasOwnProperty:13}),{S:10}),config=shirtConfig(p,sizes);
 const result=DP.calc(p,config);assert.equal(result.err,null);assert.equal(result.qty,10);assert.equal(result.sub,262000);
 assert.equal(result.L.filter(row=>row[0].startsWith('Size breakdown:')).length,0);
 assert.equal(result.sp.find(value=>value.startsWith('Size breakdown:')),'Size breakdown: S 10');
 const item=DP.mkItem(p,config,'own-quantities');assert.equal(item.qty,10);assert.deepEqual(item.cfg.sz,{S:10});
 assert.equal(DP.customerSpecifications(item).find(value=>value.startsWith('Size breakdown:')),'Size breakdown: S 10');
});

test('Phase 3 readiness: shared option quantity references follow mapped field aliases and remain isolated from local references',()=>{
 const previous=DP.seed({demo:false}),input=structuredClone(previous),template=DP.giftTemplate();
 const model=template.f.find(f=>f.k==='model');Object.assign(model,{t:'num',min:1,max:100,integer:true});delete model.o;delete model.optionMeta;
 const color=template.f.find(f=>f.k==='color');color.o=[['Blue','u',2]];color.optionMeta={Blue:{enabled:true,approved:true,quantityKey:'model'}};
 input.set.giftTemplate=template;
 const raw=input.products.find(p=>p.code==='PG-PB');raw.f.push({k:'modelQty',l:'Model count',t:'num',min:1,max:100,integer:true},{k:'localQty',l:'Local count',t:'num',min:1,max:100,integer:true},{k:'localExtra',l:'Local extra',t:'sel',o:[['Local','u',1]],optionMeta:{Local:{enabled:true,approved:true,quantityKey:'localQty'}}});
 const prepared=DP.assignGiftProduct(raw,template,{map:{model:'modelQty'}});input.products=input.products.map(p=>p.id===raw.id?prepared:p);
 const saved=validateState(input,previous,admin,()=> 'UNUSED'),effective=DP.resolveGiftProduct(saved.products.find(p=>p.id===raw.id),saved.set.giftTemplate);
 assert.equal(effective.f.find(f=>f.k==='color').optionMeta.Blue.quantityKey,'modelQty');
 assert.equal(effective.f.find(f=>f.k==='localExtra').optionMeta.Local.quantityKey,'localQty');
 const cfg={...DP.defCfg(effective),qty:100,modelQty:3,localQty:2,color:'Blue'},calculated=DP.calc(effective,cfg);
 assert.equal(calculated.err,null);assert.equal(calculated.sub,290000);
 assert.equal(calculated.L.find(row=>row[0]==='Colour: Blue')[1],60000);
 assert.equal(calculated.L.find(row=>row[0]==='Local extra: Local')[1],20000);
 assert.equal(template.f.find(f=>f.k==='color').optionMeta.Blue.quantityKey,'model');
 assert.equal(saved.set.giftTemplate.f.find(f=>f.k==='color').optionMeta.Blue.quantityKey,'model');
 assert.deepEqual(DP.stripGiftProduct(effective,saved.set.giftTemplate).giftTemplate.overrides,{});
});
