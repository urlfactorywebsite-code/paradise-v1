'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),ExcelJS=require('exceljs'),JSZip=require('jszip');
const DP=require('../shared/domain'),Catalog=require('../shared/catalog'),Readiness=require('../shared/pricing-readiness'),P=require('../server/pricing-import');
const admin={role:'Administrator'},state=()=>DP.seed({demo:true});
function row(s,productCode,optionCode,amount,quantity=null,gst=null,discount=null){const p=s.products.find(p=>p.code===productCode),target=P.targets(p,s.set).targets.find(t=>t.code===optionCode);return{row:2,values:[p.name,target.name,quantity,amount,gst,discount,p.code,target.code,target.type,target.unit],errors:[]};}
async function file(records){const w=new ExcelJS.Workbook(),sheet=w.addWorksheet('Product Pricing');sheet.addRow(P.HEADERS);for(const record of records)sheet.addRow(record.values);return Buffer.from(await w.xlsx.writeBuffer());}
function configured(code){const s=Catalog.prepareCatalog(state()).state,old=s.products.find(p=>p.code===code),p=DP.resolveProduct(old,s.set);for(const f of p.f)if(['sel','multi'].includes(f.t)){f.o=[['Approved fixture choice','f',0]];f.optionMeta={'Approved fixture choice':{approved:true,enabled:true}};}Object.assign(p,{rate:10,tax:18,priceConfigured:true,on:0});s.products[s.products.findIndex(p=>p.id===old.id)]=DP.stripProduct(p,s.set);return s;}

test('Phase 5 workbook uses all current catalog references, required columns, typed values, validation and blank pending prices',async()=>{
 const s=state(),buffer=await P.workbook(s),w=new ExcelJS.Workbook();await w.xlsx.load(buffer);
 assert.deepEqual(w.worksheets.map(sheet=>sheet.name),['Instructions','Product Pricing','Product Reference','Option Reference']);assert.deepEqual(w.getWorksheet('Product Pricing').getRow(1).values.slice(1),P.HEADERS);
 assert.equal(w.getWorksheet('Product Reference').actualRowCount,41);assert.equal(w.getWorksheet('Product Pricing').views[0].ySplit,1);assert.equal(w.getWorksheet('Product Pricing').getCell('D2').dataValidation.type,'decimal');
 const parsed=await P.parseWorkbook(buffer),pending=parsed.find(r=>r.values[6]==='GD-EN'&&r.values[7]==='BASE');assert.equal(pending.values[3],null);assert.equal(pending.values[4],null);
 const tier=parsed.find(r=>r.values[6]==='GD-VC'&&r.values[7]==='TIER'&&r.values[2]===100);assert.equal(tier.values[3],5);assert.equal(tier.values[4],18);
 for(const p of s.products)for(const t of P.targets(p,s.set).targets)assert.ok(w.getWorksheet('Option Reference').getColumn(2).values.includes(t.code),p.code+' '+t.code);
 assert.ok(w.getWorksheet('Instructions').getCell('B10').text.includes('company-wide'));assert.ok(!parsed.some(r=>r.errors.length));
});

test('Phase 5 decimal conversion distinguishes zero, missing, fractions, Excel percentages and supported precision',()=>{
 assert.equal(P.scaled('0.00'),0);assert.equal(P.scaled('12.34'),1234);assert.equal(P.percent('18%'),1800);assert.equal(P.percent(0.18,true),1800);assert.equal(P.percent(1,true),10000);
 for(const value of ['',-1,'1.005','1e3',NaN,Infinity,'=1+1'])assert.throws(()=>P.scaled(value));for(const value of [-1,100.01,'101%'])assert.throws(()=>P.percent(value));
});

test('Phase 5 literal mapping rejects unknown/cross-product options, changed bases/units, bad price/tier/GST/discount data',()=>{
 const s=state(),base=row(s,'GD-LG','BASE','10'),cases=[[6,'UNKNOWN','UNKNOWN_PRODUCT'],[7,'OTHER_PRODUCT_OPTION','UNKNOWN_OPTION'],[8,'area','UNSUPPORTED_PRICING_TYPE'],[9,'INR/sq ft','INVALID_UNIT'],[3,-1,'INVALID_PRICE'],[3,null,'INVALID_PRICE'],[3,'0.001','INVALID_PRICE'],[4,101,'INVALID_GST'],[5,-1,'INVALID_DISCOUNT'],[2,10,'UNSUPPORTED_TIER']];
 for(const [index,value,code]of cases){const r=structuredClone(base);r.values[index]=value;const p=P.validateRows([r],s,admin);assert.equal(p.valid,false);assert.ok(p.errors.some(e=>e.code===code),JSON.stringify(p.errors));assert.equal(p.errors[0].rowNumber,2);}
 for(const quantity of [0,-1,1.5,'bad',99])assert.equal(P.validateRows([row(s,'GD-VC','TIER','5.00',quantity)],s,admin).valid,false);
});

test('Phase 5 duplicate targets and conflicting product/global percentages reject every affected row',()=>{
 const s=state(),a=row(s,'GD-VC','TIER','6',100,18,10),b={...structuredClone(a),row:3};assert.equal(P.validateRows([a,b],s,admin).summary.invalidRows,2);
 const c=row(s,'GD-VC','TIER','6',200,12,15);c.row=3;const p=P.validateRows([a,c],s,admin);assert.equal(p.valid,false);assert.ok(p.errors.some(e=>e.code==='CONFLICTING_GST'));assert.ok(p.errors.some(e=>e.code==='CONFLICTING_DISCOUNT'));
 const restricted={role:'Employee',permissions:['pricing.manage']};assert.equal(P.validateRows([row(s,'GD-LG','BASE','10',null,18,5)],s,restricted).errors[0].code,'SETTINGS_PERMISSION');assert.equal(P.validateRows([row(s,'GD-LG','BASE','10',null,18,null)],s,restricted).valid,true);
});

test('Phase 5 rates upsert existing source of truth and retain omitted tiers, unrelated products, quotation snapshots and activation',()=>{
 const s=state(),before=structuredClone(s),r=row(s,'GD-VC','TIER','12.34',100,18),plan=P.validateRows([r],s,admin);assert.equal(plan.valid,true);P.applyRows(s,plan);
 const p=s.products.find(p=>p.code==='GD-VC');assert.equal(p.tiers[0][1],12.34);assert.deepEqual(p.tiers.slice(1),before.products[0].tiers.slice(1));assert.equal(p.on,before.products[0].on);assert.deepEqual(s.products.slice(1),before.products.slice(1));assert.deepEqual(s.quotes,before.quotes);
 const result=DP.calc(p,{...DP.defCfg(p),qty:100});assert.equal(result.sub,123400);assert.equal(result.gst,22212);assert.equal(result.grand,145612);
 const repeated=P.validateRows([r],s,admin);assert.equal(repeated.summary.unchanged,1);const saved=structuredClone(s);P.applyRows(s,repeated);assert.deepEqual(s,saved);
});

test('Phase 5 staged import never approves an unconfigured legacy tax or automatically activates a product',()=>{
 const s=configured('GD-EN'),p=s.products.find(p=>p.code==='GD-EN');p.priceConfigured=false;p.tax=18;p.rate=0;
 let plan=P.validateRows([row(s,p.code,'BASE','25')],s,admin);assert.equal(plan.valid,true);P.applyRows(s,plan);let current=s.products.find(p=>p.id===p.id&&p.code==='GD-EN');assert.equal(current.on,0);assert.equal(current.priceConfigured,false);assert.deepEqual(current.pricingApproval,{base:true,tax:false});assert.equal(Readiness.eligibility(current,s.set,s.cats).eligible,false);
 plan=P.validateRows([row(s,p.code,'BASE','25',null,18)],s,admin);P.applyRows(s,plan);current=s.products.find(p=>p.code==='GD-EN');assert.equal(current.priceConfigured,true);assert.equal(current.on,0);assert.equal(Readiness.eligibility(current,s.set,s.cats).eligible,true);
});

test('Phase 5 inherited option imports create isolated product overrides and retain shared template/sibling prices',()=>{
 const s=configured('PG-UM'),p=s.products.find(p=>p.code==='PG-UM'),before=structuredClone(s),t=P.targets(p,s.set).targets.find(t=>t.kind==='option'&&t.field==='printing'),plan=P.validateRows([row(s,p.code,t.code,'5.25')],s,admin);assert.equal(plan.valid,true);P.applyRows(s,plan);
 const current=s.products.find(p=>p.code==='PG-UM'),effective=DP.resolveProduct(current,s.set);assert.equal(effective.f.find(f=>f.k==='printing').o[0][2],5.25);assert.deepEqual(s.set,before.set);assert.deepEqual(s.products.find(p=>p.code==='PG-PF'),before.products.find(p=>p.code==='PG-PF'));assert.equal(current.on,0);
 const result=DP.calc(effective,{...DP.defCfg(effective),printing:'Approved fixture choice',qty:1});assert.equal(result.err,null);assert.equal(result.sub,1525);
});

test('Phase 5 eligibility covers all four templates, missing rates/options, inactive categories, invalid references and proper tier pricing',()=>{
 for(const code of ['GD-EN','PR-LED','PG-UM','PR-OF']){const s=configured(code),p=s.products.find(p=>p.code===code);assert.equal(Readiness.eligibility(p,s.set,s.cats).eligible,true,code);const bad=structuredClone(p);bad.tax=null;assert.equal(Readiness.eligibility(bad,s.set,s.cats).eligible,false);assert.equal(Readiness.eligibility(p,s.set,s.cats.map(c=>({...c,on:0}))).eligible,false);}
 const s=state(),p={id:'tier_fixture',code:'TIER-FIXTURE',name:'Tier fixture',cat:'c1',m:'tier',rate:null,min:0,minQty:1,tax:18,on:0,priceConfigured:true,tiers:[[1,3.33]],f:[]};assert.equal(Readiness.eligibility(p,s.set,s.cats).eligible,true);assert.equal(DP.calc(p,{qty:5}).sub,1665);
 p.tiers=[[10,3.33]];assert.equal(Readiness.eligibility(p,s.set,s.cats).eligible,false);assert.equal(Readiness.eligibility(null,s.set,s.cats).eligible,false);
 const pending=Catalog.prepareCatalog(s).state.products.find(p=>p.code==='GD-EN');assert.equal(Readiness.eligibility(pending,s.set,s.cats).eligible,false);
});

test('Phase 5 fixed/unit/area/package/base and setup/size/custom charge imports use only existing calculation bases',()=>{
 for(const m of ['fixed','unit','area','package','base']){const s=state(),p={id:'fixture',code:'FIXTURE',name:'Fixture',cat:'c1',m,rate:10,min:0,minQty:1,tax:18,on:0,priceConfigured:true,tiers:null,f:[],charges:[{label:'Setup',type:'f',amount:2}]};s.products.push(p);const charge=P.targets(p,s.set).targets.find(t=>t.kind==='charge'),plan=P.validateRows([row(s,p.code,'BASE','20'),row(s,p.code,charge.code,'3.25')].map((r,i)=>({...r,row:i+2})),s,admin);assert.equal(plan.valid,true);P.applyRows(s,plan);const current=s.products.at(-1),cfg={qty:2,w:2,h:3,u:'ft'},result=DP.calc(current,cfg);assert.equal(result.err,null);assert.equal(result.sub,(m==='area'?24000:m==='unit'?4000:2000)+325,m);assert.equal(current.on,0);}
});

test('Phase 5 formula cells reject literal import fields even when they contain a numeric cached result',async()=>{
 const s=state(),r=row(s,'GD-LG','BASE','10'),w=new ExcelJS.Workbook(),sheet=w.addWorksheet('Product Pricing');sheet.addRow(P.HEADERS);sheet.addRow(r.values);sheet.getCell('D2').value={formula:'1+1',result:2};const records=await P.parseWorkbook(Buffer.from(await w.xlsx.writeBuffer())),p=P.validateRows(records,s,admin);assert.equal(p.valid,false);assert.ok(p.errors.some(e=>e.code==='LITERAL_REQUIRED'&&e.field==='Unit Price'));
});

test('Phase 5 XLSX preflight rejects malformed packages, missing sheets/columns, macros and external relationships',async()=>{
 await assert.rejects(P.preflight(Buffer.from('not an xlsx')));await assert.rejects(P.preflight(Buffer.from('PK\u0003\u0004bad')));
 const valid=await file([row(state(),'GD-LG','BASE','10')]);
 for(const [name,text]of [['xl/vbaProject.bin','fake'],['xl/externalLinks/link.xml','<external/>'],['xl/_rels/evil.rels','<Relationships><Relationship TargetMode="External" Target="https://invalid.example"/></Relationships>'],['xl/evil.xml','<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x/>']]){const zip=await JSZip.loadAsync(valid);zip.file(name,text);await assert.rejects(P.preflight(await zip.generateAsync({type:'nodebuffer'})));}
 const w=new ExcelJS.Workbook();w.addWorksheet('Wrong sheet');await assert.rejects(P.parseWorkbook(Buffer.from(await w.xlsx.writeBuffer())),/Missing Product Pricing/);
 const sheet=w.addWorksheet('Product Pricing');sheet.addRow(['Product']);await assert.rejects(P.parseWorkbook(Buffer.from(await w.xlsx.writeBuffer())),/column headings/);
});

test('Phase 5 ZIP expansion, entry count, row and compressed size limits reject before workbook parsing',async()=>{
 const valid=await file([row(state(),'GD-LG','BASE','10')]);await assert.rejects(P.preflight(valid,{...P.limits(),bytes:10}),/upload size/);
 let zip=await JSZip.loadAsync(valid);zip.file('xl/bomb.xml','a'.repeat(2*1024*1024));await assert.rejects(P.preflight(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})),/expansion limits/);
 zip=await JSZip.loadAsync(valid);for(let i=0;i<260;i++)zip.file('extra/'+i+'.xml','<x/>');await assert.rejects(P.preflight(await zip.generateAsync({type:'nodebuffer'})),/entries/);
 await assert.rejects(P.preflight(valid,{...P.limits(),rows:0}),/row or cell limit/);
 for(const address of ['A1048576','XFD2','A999999999']){zip=await JSZip.loadAsync(valid);const name='xl/worksheets/sheet1.xml';zip.file(name,(await zip.file(name).async('string')).replace('r="D2"','r="'+address+'"'));await assert.rejects(P.preflight(await zip.generateAsync({type:'nodebuffer'})),/address/);}
});

test('Phase 5 size surcharges, custom dropdown charges, percent/area/per-piece choices and conditional setup imports retain engine bases',()=>{
 const s=state(),p={id:'charge_fixture',code:'CHARGE-FIXTURE',name:'Charge fixture',cat:'c1',m:'unit',rate:10,min:0,minQty:1,tax:18,on:0,priceConfigured:true,tiers:null,f:[{k:'sizes',l:'Size quantities',t:'SIZE_BREAKDOWN',sizes:[{key:'A',label:'A',enabled:true,price:0}]},{k:'finish',l:'Finish',t:'sel',allowCustom:true,customCharge:{type:'u',amount:1,approved:true},o:[['Standard','p',1],['Area','a',1],['Per piece','q',1]]}],charges:[{label:'Setup',type:'f',amount:2,when:{key:'qty',equals:2}}]};s.products.push(p);
 const addresses=P.targets(p,s.set).targets,entries=addresses.filter(t=>['size','custom','option','charge'].includes(t.kind)).map((t,i)=>({...row(s,p.code,t.code,t.kind==='size'?'2.25':t.kind==='custom'?'3.50':t.type==='p'?'25':t.kind==='charge'?'4':'2'),row:i+2}));const plan=P.validateRows(entries,s,admin);assert.equal(plan.valid,true,JSON.stringify(plan.errors));P.applyRows(s,plan);const updated=s.products.at(-1),cfg={...DP.defCfg(updated),sizes:{A:2},finish:'Special'};assert.equal(DP.calc(updated,cfg).sub,3550);assert.equal(DP.calc(updated,{...cfg,finish:'Standard'}).sub,3350);assert.equal(updated.f[1].o.find(o=>o[0]==='Area')[1],'a');assert.equal(updated.f[1].o.find(o=>o[0]==='Per piece')[1],'q');
});

test('Phase 5 true tier imports can complete staged pricing with an irrelevant null base and preserve inclusive GST',()=>{
 const s=state(),p={id:'tier_import',code:'TIER-IMPORT',name:'Tier import',cat:'c1',m:'tier',rate:null,min:0,minQty:1,tax:null,taxMode:'inclusive',on:0,priceConfigured:false,tiers:[],f:[],charges:[],compatibility:[]};s.products.push(p);const plan=P.validateRows([row(s,p.code,'TIER','118.00',1,18)],s,admin);assert.equal(plan.valid,true,JSON.stringify(plan.errors));P.applyRows(s,plan);const updated=s.products.at(-1);assert.equal(updated.rate,null);assert.equal(updated.priceConfigured,true);assert.equal(updated.on,0);assert.equal(Readiness.eligibility(updated,s.set,s.cats).eligible,true);const calculated=DP.calc(updated,{qty:2});assert.equal(calculated.sub,23600);assert.equal(calculated.gst,3600);assert.equal(calculated.grand,23600);
});

test('Phase 5 review rejects corrupt XML, macro content declarations, unsupported columns and ambiguous catalog codes',async()=>{
 const s=state(),valid=await file([row(s,'GD-LG','BASE','10')]);let zip=await JSZip.loadAsync(valid);zip.file('xl/worksheets/sheet1.xml','<worksheet><broken');await assert.rejects(P.parseWorkbook(await zip.generateAsync({type:'nodebuffer'})),/could not be parsed/);
 zip=await JSZip.loadAsync(valid);zip.file('[Content_Types].xml',(await zip.file('[Content_Types].xml').async('string')).replace('spreadsheetml.sheet.main','ms-excel.sheet.macroEnabled.main'));await assert.rejects(P.parseWorkbook(await zip.generateAsync({type:'nodebuffer'})),/Macros/);
 const book=new ExcelJS.Workbook();await book.xlsx.load(valid);book.getWorksheet('Product Pricing').getCell('K1').value='Tenant ID';await assert.rejects(P.parseWorkbook(Buffer.from(await book.xlsx.writeBuffer())),/column headings/);
 const record=row(s,'GD-LG','BASE','10');s.products.push({...structuredClone(s.products.find(p=>p.code==='GD-LG')),id:'ambiguous',code:'gd-lg'});assert.ok(P.validateRows([record],s,admin).errors.some(e=>e.code==='AMBIGUOUS_PRODUCT'));
});
