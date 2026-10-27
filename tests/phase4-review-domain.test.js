'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const DP=require('../shared/domain'),Catalog=require('../shared/catalog');
const initial=()=>DP.seed({demo:false});
const find=(state,code)=>state.products.find(product=>product.code===code);
const entry=code=>Catalog.manifest.find(item=>item.code===code);

test('Phase 4 review: incompatible existing Catalogue Page Count is blocked without overwriting Admin data',()=>{
 for(const field of [
  {k:'pageCount',l:'Page Count',t:'txt',required:false},
  {k:'pageCount',l:'Page Count',t:'num',integer:false,required:true,min:1},
  {k:'pageCount',l:'Page Count',t:'num',integer:true,required:false,min:1},
  {k:'pageCount',l:'Page Count',t:'num',integer:true,required:true,min:0},
  {k:'pageCount',l:'Page Count',t:'num',integer:true,required:true,min:1,when:{key:'qty',equals:0}}
 ]){
  const state=initial(),product=find(state,'GD-CT');product.f.push(field);const before=structuredClone(product),prepared=Catalog.prepareProduct(product,state.set,state.cats);
  assert.equal(prepared.blocked,true);assert.equal(prepared.changed,false);assert.deepEqual(prepared.product,before);assert.deepEqual(product,before);
  assert.match(prepared.issues.join(' '),/Page Count.*positive whole-number/);
  const all=Catalog.prepareCatalog(state);assert.deepEqual(find(all.state,'GD-CT'),before);assert.ok(!all.changes.some(change=>change.code==='GD-CT'));
  assert.match(Catalog.readiness(entry('GD-CT'),product,state).configurationReadiness.missing.join(' '),/Page Count.*positive whole-number/);
 }
});

test('Phase 4 review: an exact existing Page Count label reuses its stable key and keeps rules, rates and quotation input',()=>{
 const state=initial(),product=find(state,'GD-CT'),existing={k:'adminPages',l:' Page Count ',t:'num',integer:true,required:true,min:1,max:2000,show_on_customer_pdf:false};
 product.f.push(existing,{k:'pageInstructions',l:'Production instruction',t:'txt',when:{key:'adminPages',equals:4}});
 const prepared=Catalog.prepareProduct(product,state.set,state.cats);assert.equal(prepared.blocked,false);
 const effective=DP.resolveProduct(prepared.product,state.set);assert.deepEqual(effective.f.find(field=>field.k==='adminPages'),existing);assert.ok(!effective.f.some(field=>field.k==='pageCount'));
 assert.equal(Catalog.additionalFieldErrors(effective,state.cats).length,0);assert.equal(DP.fieldDefinitionError(effective),null);
 for(const field of effective.f.filter(field=>field.t==='sel')){field.o=[['Approved fixture choice','f',0]];field.optionMeta={'Approved fixture choice':{enabled:true,approved:true}};}
 Object.assign(effective,{rate:10,tax:18,priceConfigured:true});const cfg={...DP.defCfg(effective),qty:2,adminPages:4,pageInstructions:'Retained conditional instruction'};
 assert.equal(DP.calc(effective,cfg).err,null);assert.equal(DP.calc(effective,cfg).sub,2000);
 for(const adminPages of [undefined,0,-1,1.5,'four'])assert.match(DP.calc(effective,{...cfg,adminPages}).err,/Page Count|numeric|required/);
 assert.deepEqual(Catalog.prepareProduct(prepared.product,state.set,state.cats).product,prepared.product);
});

test('Phase 4 review: ambiguous product-specific fields are reported rather than duplicated or merged',()=>{
 for(const [code,fields,label] of [
  ['GD-CT',[{k:'pageCount',l:'Page Count',t:'num',integer:true,required:true,min:1},{k:'otherPages',l:'Page Count',t:'num',integer:true,required:true,min:1}],'Page Count'],
  ['GD-ID',[{k:'lanyardType',l:'Lanyard Type',t:'txt'},{k:'approvedAccessory',l:'Lanyard Type',t:'sel',o:[['Admin option','u',7]]}],'Lanyard Type'],
  ['GD-SM',[{k:'firstDeliverables',l:'Output Specifications',t:'txt'},{k:'secondDeliverables',l:'Output Specifications',t:'txt'}],'Output Specifications']
 ]){
  const state=initial(),product=find(state,code);product.f.push(...fields);const before=structuredClone(product),prepared=Catalog.prepareProduct(product,state.set,state.cats);
  assert.equal(prepared.blocked,true);assert.deepEqual(prepared.product,before);assert.match(prepared.issues.join(' '),new RegExp(label+': multiple existing fields'));
  assert.match(Catalog.readiness(entry(code),product,state).configurationReadiness.missing.join(' '),/multiple existing fields/);
 }
});

test('Phase 4 review: Bill Book choices and mandatory copies cannot be silently bypassed by incompatible controls',()=>{
 for(const field of [{k:'copies',l:'Number of Copies',t:'txt',required:true},{k:'copies',l:'Number of Copies',t:'sel',required:false,o:[['Admin choice','f',0]]},{k:'copies',l:'Number of Copies',t:'sel',required:true,o:[['Admin choice','f',0]],when:{key:'qty',equals:0}},{k:'carbonSets',l:'Carbon Sets',t:'txt'}]){
  const state=initial(),product=find(state,'GD-BB');product.f.push(field);const before=structuredClone(product),prepared=Catalog.prepareProduct(product,state.set,state.cats);
  assert.equal(prepared.blocked,true);assert.deepEqual(prepared.product,before);assert.match(prepared.issues.join(' '),/Admin-managed choices|must be required/);
 }
 const state=initial(),product=find(state,'GD-BB'),copies={k:'approvedCopies',l:'Number of Copies',t:'sel',required:true,o:[['Three copies','u',2.5]],optionMeta:{'Three copies':{enabled:true,approved:true}}};product.f.push(copies);
 const prepared=Catalog.prepareProduct(product,state.set,state.cats),effective=DP.resolveProduct(prepared.product,state.set);
 assert.equal(prepared.blocked,false);assert.deepEqual(effective.f.find(field=>field.k==='approvedCopies'),copies);assert.ok(!effective.f.some(field=>field.k==='copies'));assert.deepEqual(Catalog.additionalFieldErrors(effective,state.cats),[]);
});

test('Phase 4 review: extra-field contracts follow persistent catalog identity and ignore unrelated custom products',()=>{
 const state=Catalog.prepareCatalog(initial()).state,product=DP.resolveProduct(find(state,'GD-CT'),state.set);product.f.find(field=>field.k==='pageCount').integer=false;
 assert.match(Catalog.additionalFieldErrors(product,state.cats).join(' '),/positive whole-number/);
 Object.assign(product,{catalogManifestCode:'GD-CT',code:'BUSINESS-CATALOGUE',name:'Business catalogue'});assert.match(Catalog.additionalFieldErrors(product,state.cats).join(' '),/positive whole-number/);
 delete product.catalogManifestCode;product.name='Catalogue';assert.match(Catalog.additionalFieldErrors(product,state.cats).join(' '),/positive whole-number/);
 product.name='Unrelated custom booklet';assert.deepEqual(Catalog.additionalFieldErrors(product,state.cats),[]);
});
