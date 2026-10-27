/* Shared quotation catalog and pricing. All calculated money is integer paise. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DP = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';
const ST=['Draft','Pending Internal Review','Approved Internally','Sent to Customer','Customer Approved','Customer Rejected','Expired','Cancelled'];
const clone=value=>JSON.parse(JSON.stringify(value));
const uid=()=>globalThis.crypto?.randomUUID?.() || ('item-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
const iso=date=>date.toISOString().slice(0,10),today=()=>iso(new Date()),now=()=>new Date().toISOString();
const addD=(value,days)=>{const date=new Date(value+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days);return iso(date)};
const MAX_QUANTITY=1000000,MAX_DIMENSION=10000;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const nonnegative=value=>finite(value)&&value>=0;
const integer=value=>Number.isSafeInteger(value)&&value>=0;
function safeMoney(value){if(!Number.isSafeInteger(value)||value<0)throw new RangeError('Calculated amount exceeds the supported range.');return value}
function R(value=0){const amount=Number(value);if(!Number.isFinite(amount))throw new TypeError('Enter a finite amount.');const paise=Math.round(amount*100);if(!Number.isSafeInteger(paise))throw new RangeError('Amount exceeds the supported range.');return paise}
const nf=(paise,prefix)=>prefix+(paise/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const inr=paise=>nf(paise,'\u20b9'),rs=paise=>nf(paise,'Rs. ');
const o=(v,t,a)=>[v,t||'f',a||0],sel=(k,l,op)=>({k,l,t:'sel',o:op}),T=(k,l)=>({k,l,t:'txt'}),SZ=['S','M','L','XL','XXL'];
const DEL=sel('deliv','Delivery',[o('Standard'),o('Express','p',20)]),NOTE=T('note','Notes'),DES=sel('design','Design Service',[o('Not Required'),o('Basic Design','f',250),o('Premium Design','f',800)]);
const SIDES=sel('sides','Printing Sides',[o('Single Side'),o('Double Side','p',25)]);
const SAMPLE_COMPANY=Object.freeze({name:'DESIGN PARADISE',tag:'SALEM · LOVE YOUR BRAND',addr:'12 Gandhi Road, Salem, Tamil Nadu 636001',phone:'+91 90000 12345',email:'hello@designparadise.example',web:'www.designparadise.example',gstin:'33ABCDE1234F1Z5'});
function companyDetails(settings){
 const details={...settings};
 const examples={...SAMPLE_COMPANY,prefix:'DP/QTN',signature:'Design Paradise Team',footer:'Thank you for choosing Design Paradise.',customerNotes:'Please review the specifications and approve the final artwork before production.'};
 const legacyLabel=/\[\s*placeholder\b[^\]]*\]/gi;
 for(const [key,example] of Object.entries(examples)){
  if(typeof details[key]!=='string')continue;
  const value=details[key].replace(legacyLabel,'');
  if(value!==details[key])details[key]=value.trim()||example;
 }
 if(Array.isArray(details.terms))details.terms=details.terms.map((term,index)=>{
  if(typeof term!=='string')return term;
  const value=term.replace(legacyLabel,'');return value===term?term:(value.trim()||TERMS[index%TERMS.length]);
 });
 return details;
}
function seed({demo=true}={}){
 const cats=[{id:'c1',name:'Graphic Designing',description:'Brand identity and graphic design services',order:1,on:1},{id:'c2',name:'Printing Services',description:'Digital, offset and specialist printing',order:2,on:1},{id:'c3',name:'Promotional Gifts',description:'Customized merchandise and promotional products',order:3,on:1}];
 const P=(id,code,name,cat,m,rate,tiers,tax,f,x)=>Object.assign({id,code,name,cat,m,rate,tiers,tax,on:1,min:0,f:[...f,DEL,NOTE]},x||{});
 const prods=[
 P('p1','GD-VC','Visiting Card','c1','unit',0,[[100,5],[200,4.5],[500,3.8],[1000,3.2]],18,[sel('size','Size',[o('Standard 3.5 × 2 in'),o('Square 2.5 × 2.5 in','u',.2)]),sel('mat','Material',[o('Standard Board'),o('Textured Paper','u',1.2),o('Kraft Board','u',.8),o('Synthetic','u',2)]),SIDES,sel('edge','Edge Type',[o('Sharp Edge'),o('Rounded Edge','u',.3)]),sel('fin','Finish',[o('Plain'),o('Glossy','u',.4),o('Matte','u',.4),o('Velvet','u',.9)]),DES,sel('art','Artwork Status',[o('Artwork Ready'),o('Artwork Required','f',150)])]),
 P('p2','GD-LG','Logo Design','c1','fixed',0,null,18,[sel('pkg','Design Package',[o('Basic','f',2500),o('Standard','f',5000),o('Premium','f',9000)]),sel('con','Concepts',[o('2 Concepts'),o('3 Concepts','f',1000),o('5 Concepts','f',2500)]),sel('rev','Revisions',[o('2 Revisions'),o('5 Revisions','f',800),o('Unlimited','f',2000)]),sel('fmt','Delivery Format',[o('PNG & JPG'),o('AI, PDF & PNG','f',500)]),sel('urg','Urgency',[o('Standard (5 days)'),o('Urgent (48 hrs)','p',30)])]),
 P('p3','GD-LH','Letterhead','c1','unit',0,[[100,6],[500,4.5],[1000,3.8]],18,[sel('paper','Paper',[o('Standard 80 GSM'),o('Bond 100 GSM','u',1)]),SIDES,DES]),
 P('p4','GD-BR','Brochure','c1','unit',0,[[100,22],[500,16],[1000,12]],18,[sel('size','Size',[o('A5'),o('A4','u',4)]),sel('fold','Fold',[o('Bi-fold'),o('Tri-fold','u',3)]),sel('fin','Finish',[o('Matte'),o('Gloss','u',2)]),DES]),
 P('p5','PR-FX','Flex Printing','c2','area',14,null,18,[{k:'dim',l:'Size',t:'dim'},sel('type','Flex Type',[o('Normal Flex'),o('Star Flex','a',3)]),sel('fin','Finishing',[o('Plain'),o('Hemming & Eyelets','a',2)]),sel('eye','Extra Accessories',[o('None'),o('Pipe Pockets','f',150)]),sel('inst','Installation',[o('Not Required'),o('Required','a',5)])],{min:300}),
 P('p6','PR-VN','Vinyl Printing','c2','area',28,null,18,[{k:'dim',l:'Size',t:'dim'},sel('mat','Material',[o('Standard Vinyl'),o('Eco Solvent Vinyl','a',4),o('Waterproof Wall Vinyl','a',8)]),sel('lam','Lamination',[o('None'),o('Matt Lamination','a',6)]),sel('inst','Installation',[o('Not Required'),o('Required','a',5)])],{min:400}),
 P('p7','PG-TS','T-Shirt Printing','c3','unit',0,[[10,260],[50,220],[100,190]],18,[sel('type','T-Shirt Type',[o('Round Neck'),o('Polo','u',40)]),sel('fab','Fabric',[o('Cotton'),o('Dri-fit Polyester','u',30)]),T('color','Colour'),sel('meth','Printing Method',[o('Screen Print'),o('DTF','u',35),o('Sublimation','u',25)]),sel('loc','Print Locations',[o('1 Location'),o('2 Locations','u',40)]),SIDES,DES,sel('pack','Packaging',[o('Standard Poly Bag'),o('Individual Box','u',15)])],{sizes:1}),
 P('p8','PG-PB','Paper Bag','c3','unit',0,[[100,18],[500,14]],12,[sel('size','Size',[o('Small'),o('Medium','u',3),o('Large','u',6)]),sel('mat','Material',[o('Kraft'),o('Art Paper','u',4)]),sel('print','Printing',[o('1 Colour'),o('Full Colour','u',3)]),sel('setup','Setup',[o('Standard setup','f',300)])]),
 P('p9','PG-KC','Key Chain','c3','unit',0,[[50,35],[200,28]],18,[sel('mat','Material',[o('Acrylic'),o('Metal','u',15),o('Rubber','u',8)]),sel('cust','Customization',[o('Printed'),o('Laser Engraving','u',10)]),sel('setup','Setup',[o('Standard setup','f',250)])]),
 P('p10','PG-MG','Mug Printing','c3','unit',0,[[12,150],[50,125]],18,[sel('type','Mug Type',[o('White Ceramic'),o('Magic Mug','u',60)]),sel('pack','Packaging',[o('Standard'),o('Individual Box','u',12)]),sel('setup','Setup',[o('Sublimation setup','f',200)])]),
 P('p11','PG-TC','Table Calendar','c3','unit',0,[[50,90],[200,70]],0,[sel('pages','Sheets',[o('12 Sheets'),o('13 Sheets','u',5)]),sel('stand','Stand',[o('Standard'),o('Premium Wooden','u',25)])]),
 P('p12','PG-ST','Shield & Trophy','c3','unit',0,[[1,650],[10,520]],18,[sel('model','Model',[o('Acrylic Shield'),o('Wooden Shield','u',200),o('Crystal Trophy','u',450)]),sel('plate','Plate',[o('Standard Engraving'),o('Colour Print','u',50)])])];
 // Existing demonstration rates remain examples. Newly listed SRS products stay
 // inactive until the business supplies and approves their actual prices.
 const catalog=[
 ['GD-EN','Envelope','c1'],['GD-ID','ID Card & Lanyard','c1'],['GD-BB','Bill Book','c1'],['GD-CT','Catalogue','c1'],['GD-IN','Invitation','c1'],['GD-DG','Danglers','c1'],['GD-MN','Menu Card','c1'],['GD-SM','Social Media Poster','c1','fixed'],['GD-CG','Custom Graphic Designs','c1','base'],
 ['PR-OF','Offset Printing','c2'],['PR-DG','Digital Printing','c2'],['PR-LED','LED Board','c2','area'],['PR-ECO','Eco Solvent Printing','c2','area'],['PR-DTF','DTF Printing for Fabric & Leather','c2','area'],['PR-UV','UV Direct Printing','c2','area'],['PR-WV','Waterproof Vinyl Wall Posters','c2','area'],['PR-SC','Screen & Canvas Printing','c2','area'],['PR-GF','Gold / Silver Foil & Emboss Printing','c2'],['PR-HS','Hologram Stickers','c2'],['PR-SP','Sunpack Sheet Printing','c2','area'],
 ['PG-IT','Ink-Transfer Sticker','c3'],['PG-UM','Umbrella','c3'],['PG-PF','Photo Frame','c3'],['PG-GK','Gazebo / Kiosk','c3'],['PG-PN','Pen Printing','c3'],['PG-CP','Cap','c3'],['PG-BD','Badges','c3'],['PG-SG','Sublimation Gift Printing','c3']];
 prods.find(p=>p.id==='p4').name='Flyer & Brochure';
 for(const [index,[code,name,cat,m='unit']] of catalog.entries()){
  const fields=[sel('material','Material',[o('Standard')]),sel('customization','Customization',[o('Printed'),o('Custom')]),T('model','Product Model'),T('color','Colour'),sel('pack','Packaging',[o('Standard'),o('Custom')]),T('artwork','Artwork Requirement')];
  if(m==='area')fields.unshift({k:'dim',l:'Dimensions',t:'dim'});
  prods.push(P('p'+(13+index),code,name,cat,m,0,null,18,fields,{on:0,priceConfigured:false,description:'Configure approved pricing and specifications before activation.'}));
 }
 for(const product of prods){
  Object.assign(product,{description:product.description||'',image:'',unit:product.m==='area'?'sq ft':product.m==='fixed'?'service':'item',type:product.cat==='c1'?'Design Service':product.cat==='c2'?'Printing':'Promotional Product',minQty:product.tiers?.[0]?.[0]||1,taxMode:'exclusive',charges:[],compatibility:[]});
 }
 const card=prods.find(p=>p.id==='p1');
 card.f.unshift(sel('shape','Product Shape',[o('Rectangle'),o('Square'),o('Custom')]));
 card.f.find(f=>f.k==='size').o.push(o('Custom'));
 card.f.splice(2,0,{k:'customDim',l:'Custom Dimensions',t:'dim',when:{key:'size',equals:'Custom'}});
 const flex=prods.find(p=>p.id==='p5');flex.f.splice(2,0,T('material','Material'),T('printing','Printing Type'));
 const cu=(n,name,c,person,m,e,addr,g)=>({id:'C'+n,name:name+' (Demo)',co:c,person,mob:m,email:e,addr,gstin:g,notes:'Sample customer for quotation practice',wa:'+91'+m,type:'Business',on:1,createdBy:'System',date:'2026-09-0'+n});
 const cust=[cu(1,'Ravi Kumar','Kumar Traders','Ravi Kumar','9000000001','ravi@demo.example','24 Market Road, Shevapet, Salem, Tamil Nadu 636002','33DEMO0001A1Z1'),cu(2,'Meena S','Meena Boutique','Meena S','9000000002','meena@demo.example','18 Sarada College Road, Salem, Tamil Nadu 636016',''),cu(3,'Arun Textiles','Arun Textiles','Arun Prakash','9000000003','arun@demo.example','8 Textile Market Road, Ammapet, Salem, Tamil Nadu 636003','33DEMO0003C1Z3'),cu(4,'Lakshmi N','Lakshmi Bakery','Lakshmi N','9000000004','lakshmi@demo.example','42 Cherry Road, Salem, Tamil Nadu 636007',''),cu(5,'Sunrise School','Sunrise School','Anitha Raman','9000000005','office@demo.example','15 School Road, Fairlands, Salem, Tamil Nadu 636016','')];
 const mk=(pid,c)=>mkItem(prods.find(p=>p.id===pid),Object.assign(defCfg(prods.find(p=>p.id===pid)),c));
 const projects=[['Kumar Traders stationery','Visiting cards and letterheads'],['Meena Boutique storefront','Flex signage and vinyl printing'],['Arun Textiles team uniforms','Custom printed T-shirts'],['Lakshmi Bakery brand identity','Logo design package'],['Sunrise School annual day','Printed mugs and paper bags']];
 const qd=(i,cid,st,items,n,by)=>({id:'Q'+i,no:`DP/QTN/2026/${String(i).padStart(4,'0')}`,date:addD(today(),-n),valid:addD(today(),15-n),cid,sales:by,ref:'DEMO-'+String(i).padStart(3,'0'),project:projects[i-1][0],subject:projects[i-1][1],req:'',items,chargeTax:18,disc:{t:'p',v:i==1?5:0},del:i==2?500:0,oth:0,status:st,terms:clone(TERMS),by,hist:[{f:'—',t:'Draft',d:now(),u:by}].concat(st=='Draft'?[]:[{f:'Draft',t:st,d:now(),u:by}])});
 const qs=[qd(1,'C1','Sent to Customer',[mk('p1',{qty:500,mat:'Textured Paper',sides:'Double Side',edge:'Rounded Edge'}),mk('p3',{qty:500})],0,'Priya'),
 qd(2,'C2','Customer Approved',[mk('p5',{w:10,h:4,u:'ft',qty:2,inst:'Required'}),mk('p6',{w:3,h:2,u:'ft',qty:5})],2,'Karthik'),
 qd(3,'C3','Draft',[mk('p7',{sz:{S:10,M:20,L:30,XL:25,XXL:15},meth:'DTF'})],4,'Priya'),
 qd(4,'C4','Customer Rejected',[mk('p2',{pkg:'Standard'})],9,'Karthik'),
 qd(5,'C5','Expired',[mk('p10',{qty:50}),mk('p8',{qty:200,size:'Medium'})],25,'Priya')];
 return clone({cats,products:prods,customers:demo?cust:[],quotes:demo?qs:[],log:demo?[{t:now(),x:'Demo data loaded',u:'System'}]:[],set:{...SAMPLE_COMPANY,tax:18,prefix:'DP/QTN',valid:15,showNotes:false,terms:clone(TERMS),employeeDiscountLimit:10,employeeDiscountMax:0,allowAdditionalCharges:true,independentApproval:true,taxMode:'exclusive',taxDisplay:'split',currency:'INR',sequenceStart:1,logo:'',signature:'',footer:'',customerNotes:''}});
}
const TERMS=['This quotation is valid until the specified expiry date.','Prices and taxes are based on the specifications listed in this quotation.','Changes to approved specifications or quantities may change the quoted price.','Production timelines are subject to confirmation and approval of final artwork.','Any advance payment or payment schedule must be agreed upon before work begins.','Delivery and installation charges will be applied where applicable and as specified in the quotation.'];
const AF=Object.freeze({ft:1,in:1/144,cm:1/929.0304,m:10.7639104});
const METHODS=Object.freeze(['fixed','unit','area','tier','package','base']);
const TAX_MODES=Object.freeze(['exclusive','inclusive','exempt']);
const empty=value=>value===undefined||value===null||value===''||(Array.isArray(value)&&value.length===0);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const validKey=key=>typeof key==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)&&!['constructor','prototype','__proto__'].includes(key);
const conditionRows=condition=>condition?.conditions??(condition?[condition]:[]);
const optionMeta=(field,value)=>field.optionMeta&&own(field.optionMeta,value)?field.optionMeta[value]:{};
const optionLabel=(field,value)=>optionMeta(field,value).label||value;
function activeOptions(field){return (field.o||[]).filter(o=>optionMeta(field,o[0]).enabled!==false&&optionMeta(field,o[0]).approved!==false&&nonnegative(o[2])).sort((a,b)=>(optionMeta(field,a[0]).order??field.o.indexOf(a))-(optionMeta(field,b[0]).order??field.o.indexOf(b)));}
function availableOptions(product,field,config){const resolved=visibility(product,config);return activeOptions(field).filter(o=>(product.compatibility||[]).every(rule=>rule.field!==field.k||!matches(rule.when,config,resolved.available)||rule.allowed.includes(o[0])));}
function reconcileConfig(product,configuration,changedKey){
 let config=normalizeConfig(product,configuration);
 const affected=new Set(changedKey?[changedKey]:product.f.map(f=>f.k));
 if(changedKey)for(let n=0;n<product.f.length;n++){for(const rule of product.compatibility||[])if(conditionRows(rule.when).some(row=>affected.has(row.key)))affected.add(rule.field);for(const field of product.f)if(conditionRows(field.when).some(row=>affected.has(row.key)))affected.add(field.k);}
 for(let pass=0;pass<(product.f||[]).length;pass++){
  let changed=false;
  for(const field of product.f||[])if(affected.has(field.k)&&['sel','multi'].includes(field.t)&&fieldVisible(field,config,product)){
   const options=availableOptions(product,field,config),keys=options.map(o=>o[0]);
   if(field.t==='sel'&&config[field.k]!==''&&!keys.includes(config[field.k])&&!(field.allowCustom&&!field.o.some(o=>o[0]===config[field.k]))){config[field.k]=keys.includes(field.default)?field.default:field.required===false?'':keys[0]??'';changed=true;}
   else if(field.t==='multi'&&Array.isArray(config[field.k])){const next=config[field.k].filter(value=>keys.includes(value));if(next.length!==config[field.k].length){config[field.k]=next;changed=true;}}
  }
  config=normalizeConfig(product,config);if(!changed)break;
 }
 return config;
}
function sizeGeometry(meta){if(meta?.geometry?.custom===true)return 'custom';const g=meta?.geometry;if(!g||!finite(g.w)||!finite(g.h)||g.w<=0||g.h<=0||!own(AF,g.u))return null;return g.w===g.h?'square':'rectangle';}
function syncPhase2Rules(product){
 if(product.phase2==='visiting_card'){
  const sizes=product.f.find(f=>f.k==='size');
  product.compatibility=(product.compatibility||[]).filter(r=>!['phase2_shape_rectangle','phase2_shape_square','phase2_shape_custom'].includes(r.id));
  for(const [shape,geometry] of [['Rectangle','rectangle'],['Square','square'],['Custom','custom']])product.compatibility.push({id:'phase2_shape_'+geometry,when:{key:'shape',equals:shape},field:'size',allowed:(sizes?.o||[]).filter(o=>sizeGeometry(optionMeta(sizes,o[0]))===geometry).map(o=>o[0]),message:'Select a '+geometry+' size for '+shape+' shape.'});
  const details=product.f.find(f=>f.k==='customFinish'),dim=product.f.find(f=>f.k==='customDim');
  if(details){details.required=true;details.when={key:'fin',equals:'Custom'};}
  if(dim){dim.required=true;dim.when={key:'size',equals:(sizes?.o||[]).filter(o=>sizeGeometry(optionMeta(sizes,o[0]))==='custom').map(o=>o[0])};}
 }
 if(product.phase2==='flex'){
  product.compatibility=(product.compatibility||[]).filter(r=>!r.id?.startsWith('phase2_bundle_'));
  const finishing=product.f.find(f=>f.k==='fin');for(const o of finishing?.o||[])if(optionMeta(finishing,o[0]).includesEyelets)product.compatibility.push({id:'phase2_bundle_'+o[0],when:{key:'fin',equals:o[0]},field:'eyelets',allowed:['None'],message:'This finishing option already includes eyelets. Select None for separate eyelets to avoid double charging.'});
  const accessories=product.f.find(f=>f.k==='eye'),quantity=product.f.find(f=>f.k==='accessoryQty');if(accessories&&quantity){const values=accessories.o.filter(o=>['u','q'].includes(o[1])&&optionMeta(accessories,o[0]).quantityKey==='accessoryQty').map(o=>o[0]);quantity.when=values.length?{key:'eye',equals:values}:{mode:'ALL',conditions:[{key:'eye',operator:'equals',value:accessories.o[0][0]},{key:'eye',operator:'not_equals',value:accessories.o[0][0]}]};}
 }
 return product;
}
function phase2Product(input){
 const p=clone(input);if(p.phase2)return syncPhase2Rules(p);
 if((p.compatibility||[]).some(r=>r.id?.startsWith('phase2_shape_')||r.id?.startsWith('phase2_bundle_')))throw new Error('An existing rule uses a reserved Phase 2 ID. Rename that rule before setup; it has not been overwritten.');
 const meta=(field)=>{field.optionMeta=field.optionMeta||Object.fromEntries(field.o.map((o,i)=>[o[0],{label:o[0],enabled:true,approved:true,order:i}]));return field;};
 const pending=(field,label,type,extra={})=>{if(!field.o.some(o=>o[0]===label)){field.o.push([label,type,null]);field.optionMeta[label]={label,enabled:false,approved:false,order:field.o.length-1,...extra};}};
 if(p.code==='GD-VC'){
  const finish=p.f.find(f=>f.k==='fin'&&f.t==='sel'),size=p.f.find(f=>f.k==='size'&&f.t==='sel');if(!finish||!size)throw new Error('Existing Finish and Size dropdowns are required for Visiting Card setup.');
  p.phase2='visiting_card';meta(finish);if(!finish.o.some(o=>o[0]==='Custom')){finish.o.push(['Custom','f',0]);finish.optionMeta.Custom={label:'Custom',enabled:true,approved:true,order:finish.o.length-1};}
  if(!p.f.some(f=>f.k==='customFinish'))p.f.push({k:'customFinish',l:'Custom Finish Details',t:'txt',required:true,show_on_customer_pdf:true,when:{key:'fin',equals:'Custom'}});
  if(!p.f.some(f=>f.k==='shape'))p.f.unshift({k:'shape',l:'Product Shape',t:'sel',o:[['Rectangle','f',0],['Square','f',0],['Custom','f',0]]});
  meta(size);
  // These are explicit canonical template dimensions, never parsed from display text.
  const canonical=seed({demo:false}).products.find(x=>x.code==='GD-VC').f.find(f=>f.k==='size');
  if(size.o.some(o=>o[0]===canonical.o[0][0])&&!optionMeta(size,canonical.o[0][0]).geometry)size.optionMeta[canonical.o[0][0]].geometry={w:3.5,h:2,u:'in'};
  if(size.o.some(o=>o[0]===canonical.o[1][0])&&!optionMeta(size,canonical.o[1][0]).geometry)size.optionMeta[canonical.o[1][0]].geometry={w:2.5,h:2.5,u:'in'};
  if(!size.o.some(o=>o[0]==='Custom')){size.o.push(['Custom','f',0]);size.optionMeta.Custom={label:'Custom',enabled:true,approved:true,order:size.o.length-1};}size.optionMeta.Custom.geometry={custom:true};
  const dim=p.f.find(f=>f.k==='customDim');if(dim){dim.when={key:'size',equals:'Custom'};dim.required=true;}else p.f.push({k:'customDim',l:'Custom Dimensions',t:'dim',required:true,when:{key:'size',equals:'Custom'}});
 }else if(p.code==='PR-FX'){
  p.phase2='flex';
  for(const [key,label,names] of [['material','Material',['220 GSM','280 GSM','Backlit']],['printing','Printing Type',['Solvent','Eco-solvent']]]){
   let f=p.f.find(f=>f.k===key);if(!f){f={k:key,l:label,t:'txt'};p.f.push(f);}if(f.t==='txt'){if(typeof f.default==='string'&&f.default)f.legacyTextDefault=f.default;f.t='sel';f.o=[];f.optionMeta={};delete f.default;f.required=true;for(const name of names)pending(f,name,'a');}else if(f.t==='sel')meta(f);else throw new Error(label+' must be text or a dropdown.');if(key==='material')f.rateBasis='area';
  }
  const finishing=p.f.find(f=>f.k==='fin'&&f.t==='sel');if(!finishing)throw new Error('Existing Finishing dropdown is required.');meta(finishing);for(const o of finishing.o)if(o[0]==='Hemming & Eyelets')finishing.optionMeta[o[0]].includesEyelets=true;pending(finishing,'Hemming','a');
  if(!p.f.some(f=>f.k==='eyelets')){const f={k:'eyelets',l:'Eyelets',t:'sel',quantityRule:'eyelets',eyeletPolicy:{approved:false,spacingFt:2,corners:4},o:[['None','u',0]],optionMeta:{None:{label:'None',enabled:true,approved:true,order:0,quantityRule:'none'}}};pending(f,'Corners Only','u',{quantityRule:'corners'});pending(f,'Every 2 Feet','u',{quantityRule:'perimeter'});p.f.push(f);}
  const accessories=p.f.find(f=>f.k==='eye'&&f.t==='sel');if(!accessories)throw new Error('Existing Accessories dropdown is required.');meta(accessories);for(const name of ['Ropes','Stands'])pending(accessories,name,'u',{quantityKey:'accessoryQty'});
  if(!p.f.some(f=>f.k==='accessoryQty'))p.f.push({k:'accessoryQty',l:'Accessory quantity per piece',t:'num',min:1,max:MAX_QUANTITY,integer:true,default:1,required:true,when:{key:'eye',equals:['Ropes','Stands']}});
 }else throw new Error('Phase 2 setup applies only to Visiting Card and Flex Printing.');
 return syncPhase2Rules(p);
}
function eyeletCount(field,config){
 const rule=optionMeta(field,config[field.k]).quantityRule;if(rule==='none')return 0;
 if(!field.eyeletPolicy?.approved)throw new TypeError('Eyelet counting policy requires business approval.');
 if(!finite(config.w)||!finite(config.h)||!own(AF,config.u)||config.w<=0||config.h<=0)throw new TypeError('Eyelets require valid dimensions.');
 const feet=Math.sqrt(AF[config.u]);return rule==='corners'?4:rule==='perimeter'?2*(Math.max(1,Math.ceil(config.w*feet/2-1e-10))+Math.max(1,Math.ceil(config.h*feet/2-1e-10))):NaN;
}
const GIFT_KEYS=Object.freeze(['model','material','color','customization','printing','packaging','artwork']);
// Projection provenance is private process state, never trusted JSON metadata.
const templateProjections=new WeakMap();
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])])):value;
const sameDefinition=(left,right)=>JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
function giftTemplate(){
 const labels={model:'Product Model',material:'Material',color:'Colour',customization:'Customization Type',printing:'Printing Method',packaging:'Packaging',artwork:'Artwork Requirement'};
 return {id:'promotional_gift',version:1,name:'Promotional Gift',f:GIFT_KEYS.map(k=>k==='artwork'?{k,l:labels[k],t:'txt',required:false,multiline:true,show_on_customer_pdf:true}:{k,l:labels[k],t:'sel',required:false,show_on_customer_pdf:true,o:[['Standard','f',null]],optionMeta:{Standard:{label:'Standard',enabled:false,approved:false,order:0}}})};
}
const CATALOG_TEMPLATE_IDS=Object.freeze(['print_product','area_product','stationery_product']);
const TEMPLATE_KEYS=Object.freeze({promotional_gift:GIFT_KEYS,print_product:['size','paper','sides','finish'],area_product:['dim','material','lamination','installation'],stationery_product:['paper','size','sides','binding']});
function catalogTemplate(id){
 if(!CATALOG_TEMPLATE_IDS.includes(id))throw new Error('Unknown catalog template.');
 const labels={size:'Size',paper:'Paper',sides:'Printing Sides',finish:'Finish',dim:'Dimensions',material:'Material',lamination:'Lamination',installation:'Installation',binding:'Binding'},names={print_product:'Print Product',area_product:'Area Product',stationery_product:'Stationery Product'};
 return {id,version:1,name:names[id],f:TEMPLATE_KEYS[id].map(k=>k==='dim'?{k,l:labels[k],t:'dim',required:true,show_on_customer_pdf:true}:{k,l:labels[k],t:'sel',required:false,show_on_customer_pdf:true,o:[['Configure options','f',null]],optionMeta:{'Configure options':{label:'Configure options',enabled:false,approved:false,order:0}}})};
}
function templateDefinitionError(template,expectedId){
 const keys=TEMPLATE_KEYS[expectedId];
 if(!keys||!template||typeof template!=='object'||Array.isArray(template)||template.id!==expectedId||template.version!==1||typeof template.name!=='string'||!template.name.trim()||template.name.length>150||!Array.isArray(template.f)||template.f.length!==keys.length||keys.some(k=>!template.f.some(f=>f?.k===k))||new Set(template.f.map(f=>f?.k)).size!==keys.length)return expectedId==='promotional_gift'?'Invalid Promotional Gift template; all seven stable shared field keys are required.':'Invalid catalog template; all stable shared field keys are required.';
 if(['extends','parent','giftTemplate','catalogTemplate','templates'].some(k=>template[k]!==undefined)||template.f.some(f=>f.giftTemplate!==undefined||f.catalogTemplate!==undefined||f.template!==undefined||f.extends!==undefined))return 'Circular or nested template inheritance is not supported.';
 if(expectedId==='area_product'&&template.f.find(f=>f.k==='dim').t!=='dim')return 'Area Product Dimensions must use the existing dimensions field.';
 return fieldDefinitionError({m:expectedId==='area_product'?'area':'unit',f:template.f});
}
function giftTemplateError(template){return templateDefinitionError(template,'promotional_gift');}
function catalogTemplateError(template){return CATALOG_TEMPLATE_IDS.includes(template?.id)?templateDefinitionError(template,template.id):'Invalid catalog template reference.';}
function templateAssignment(product){
 if(product?.giftTemplate&&product?.catalogTemplate)throw new Error('A product cannot inherit conflicting template assignments.');
 return product?.catalogTemplate?{key:'catalogTemplate',assignment:product.catalogTemplate}:product?.giftTemplate?{key:'giftTemplate',assignment:product.giftTemplate}:null;
}
function productTemplate(product,settings={}){
 const ref=templateAssignment(product);if(!ref)return null;
 if(ref.key==='giftTemplate'){if(ref.assignment.id!=='promotional_gift')throw new Error('Invalid gift template reference.');return settings.giftTemplate||giftTemplate();}
 if(!CATALOG_TEMPLATE_IDS.includes(ref.assignment.id))throw new Error('Invalid catalog template reference.');
 return settings.catalogTemplates?.[ref.assignment.id]||catalogTemplate(ref.assignment.id);
}
function assignmentError(product,template,key){
 if(!product||typeof product!=='object'||Array.isArray(product)||!Array.isArray(product.f)||product.f.some(f=>!f||typeof f!=='object'||Array.isArray(f)))return 'Invalid product fields for template assignment.';
 if(product.giftTemplate&&product.catalogTemplate)return 'A product cannot inherit conflicting template assignments.';
 const a=product[key];if(a===undefined)return null;
 const templateError=templateDefinitionError(template,key==='giftTemplate'?'promotional_gift':a?.id);if(templateError)return templateError;
 const keys=TEMPLATE_KEYS[template.id];
 if(!a||typeof a!=='object'||Array.isArray(a)||a.id!==template.id||['extends','parent','giftTemplate','catalogTemplate','templates'].some(k=>a[k]!==undefined))return 'Invalid or circular template assignment.';
 if(a.map!==undefined&&(!a.map||typeof a.map!=='object'||Array.isArray(a.map)))return 'Invalid template field mapping.';
 const map=a.map||{};if(Object.keys(map).some(k=>!keys.includes(k))||Object.values(map).some(k=>!validKey(k))||new Set(Object.values(map)).size!==Object.values(map).length)return 'Template field mappings must use unique stable field keys.';
 if(new Set(keys.map(k=>map[k]||k)).size!==keys.length)return 'Template field mappings conflict with an inherited stable field key.';
 if(Object.entries(map).some(([semantic,k])=>!product.f.some(f=>f.k===k)))return 'Mapped template fields must reference existing product fields.';
 if(a.disabled!==undefined&&(!Array.isArray(a.disabled)||a.disabled.some(k=>!keys.includes(k))||new Set(a.disabled).size!==a.disabled.length))return 'Invalid disabled shared template fields.';
 if(a.required!==undefined&&(!Array.isArray(a.required)||a.required.some(k=>!keys.includes(k))||new Set(a.required).size!==a.required.length))return 'Required shared template fields must use unique stable semantic identifiers.';
 const overrides=a.overrides||{};
 if(!overrides||typeof overrides!=='object'||Array.isArray(overrides)||Object.entries(overrides).some(([semantic,f])=>!keys.includes(semantic)||!f||typeof f!=='object'||Array.isArray(f)||f.k!==(map[semantic]||semantic)||f.giftTemplate!==undefined||f.catalogTemplate!==undefined||f.template!==undefined||f.extends!==undefined))return 'Template field overrides must preserve stable mapped identifiers.';
 if(template.id==='area_product'&&(overrides.dim||product.f.find(f=>f.k===(map.dim||'dim'))||template.f.find(f=>f.k==='dim')).t!=='dim')return 'Area Product Dimensions must use the existing dimensions field.';
 for(const semantic of keys){const k=map[semantic]||semantic;if(!map[semantic]&&product.f.some(f=>f.k===k))return 'A local field conflicts with an inherited template field; map it explicitly.';}
 const allKeys=new Set([...product.f.map(f=>f.k),...keys.map(k=>map[k]||k)]);
 if(a.order!==undefined&&(!Array.isArray(a.order)||a.order.some(k=>!validKey(k)||!allKeys.has(k))||new Set(a.order).size!==a.order.length))return 'Template field order must use unique existing field identifiers.';
 return null;
}
function giftAssignmentError(product,template){return assignmentError(product,template,'giftTemplate');}
function catalogAssignmentError(product,template){return assignmentError(product,template,'catalogTemplate');}
function assertProjectionInput(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid product for template assignment.');
 if(['__giftRaw','__giftBase','__templateRaw','__templateBase'].some(k=>own(input,k)))throw new Error('Internal gift projection metadata cannot be supplied.');
}
function resolveTemplateProduct(input,template,key){
 assertProjectionInput(input);
 if(!input[key])return input;
 const context=templateProjections.get(input),raw=clone(context?.raw||input),error=assignmentError(raw,template,key);if(error)throw new Error(error);
 const a=raw[key],keys=TEMPLATE_KEYS[template.id],map=a.map||{},disabled=new Set(a.disabled||[]),required=new Set(a.required||[]),base=new Map(),resolved=new Map();
 const remap=condition=>{if(!condition)return condition;const result=clone(condition);for(const row of conditionRows(result))row.key=map[row.key]||row.key;return result;};
 for(const definition of template.f){
  const k=map[definition.k]||definition.k,local=map[definition.k]&&raw.f.find(f=>f.k===k),field=clone(local?{...definition,...local}:definition);field.k=k;
  if(local){if(local.required===undefined)field.required=local.t==='sel';if(!local.optionMeta)delete field.optionMeta;if(local.t!=='sel'&&local.t!=='multi'){delete field.o;delete field.optionMeta;}if(local.t!=='txt')delete field.multiline;}
  if(template.id==='promotional_gift'&&definition.k==='model'&&['PG-MG','PG-TC'].includes(raw.code))field.l=definition.l;
  if(definition.when!==undefined&&local?.when===undefined)field.when=remap(definition.when);
  // Shared references use semantic keys; retained local metadata already uses
  // stable product keys and must keep its own quantity references.
  if(!local)for(const metadata of Object.values(field.optionMeta||{}))if(metadata.quantityKey)metadata.quantityKey=map[metadata.quantityKey]||metadata.quantityKey;
  if(required.has(definition.k))field.required=true;
  base.set(definition.k,field);if(!disabled.has(definition.k))resolved.set(k,clone(a.overrides?.[definition.k]||field));
 }
 const mapped=new Set(Object.values(map)),fields=raw.f.filter(f=>!mapped.has(f.k)).map(clone);
 for(const original of raw.f)if(mapped.has(original.k)&&resolved.has(original.k)){fields.splice(Math.min(raw.f.indexOf(original),fields.length),0,resolved.get(original.k));resolved.delete(original.k);}
 fields.push(...resolved.values());
 if(a.order){const originalOrder=new Map(fields.map((f,i)=>[f.k,i])),order=new Map(a.order.map((k,i)=>[k,i]));fields.sort((x,y)=>(order.get(x.k)??a.order.length+originalOrder.get(x.k))-(order.get(y.k)??a.order.length+originalOrder.get(y.k)));}
 const result={...raw,f:fields};const definitionError=fieldDefinitionError(result);if(definitionError)throw new Error(definitionError);
 templateProjections.set(result,{raw,base:Object.fromEntries(base),key,keys,effectiveOrder:fields.map(f=>f.k)});return result;
}
function stripTemplateProduct(input,template,key){
 assertProjectionInput(input);
 if(!input[key])return clone(input);
 const context=templateProjections.get(input),raw=clone(context?.raw||input),a=raw[key];
 if(!context)return raw;
 if(context.key!==key)throw new Error('Conflicting template projection.');
 const base=context.base,map=a.map||{},semanticKeys=new Set(context.keys.map(k=>map[k]||k)),overrides={},disabled=[];
 for(const semantic of context.keys){const field=input.f.find(f=>f.k===(map[semantic]||semantic));if(!field){disabled.push(semantic);if(a.overrides?.[semantic])overrides[semantic]=clone(a.overrides[semantic]);}else if(!sameDefinition(field,base[semantic]))overrides[semantic]=clone(field);}
 const local=input.f.filter(f=>!semanticKeys.has(f.k));
 raw.f=raw.f.filter(f=>Object.values(map).includes(f.k)).concat(local.map(clone));
 const localOrder=new Map(local.map((f,i)=>[f.k,i])),order=new Map((context.raw.f||[]).map((f,i)=>[f.k,i]));raw.f.sort((x,y)=>(order.get(x.k)??1000+localOrder.get(x.k))-(order.get(y.k)??1000+localOrder.get(y.k)));
 for(const [k,v] of Object.entries(input))if(!['f','giftTemplate','catalogTemplate'].includes(k))raw[k]=clone(v);
 raw[key]={id:a.id,map:clone(map),disabled,overrides};
 if(a.required!==undefined)raw[key].required=clone(a.required);
 const requestedOrder=input.f.map(f=>f.k);
 if(a.order||!sameDefinition(requestedOrder,context.effectiveOrder))raw[key].order=requestedOrder;
 return raw;
}
function resolveGiftProduct(input,template){return resolveTemplateProduct(input,template,'giftTemplate');}
function stripGiftProduct(input,template){return stripTemplateProduct(input,template,'giftTemplate');}
function resolveProduct(input,settings={}){assertProjectionInput(input);const ref=templateAssignment(input);return ref?resolveTemplateProduct(input,productTemplate(input,settings),ref.key):input;}
function stripProduct(input,settings={}){assertProjectionInput(input);const ref=templateAssignment(input);return ref?stripTemplateProduct(input,productTemplate(input,settings),ref.key):clone(input);}
function assignProductTemplate(input,id,settings={},options={}){
 if(id!=='promotional_gift'&&!CATALOG_TEMPLATE_IDS.includes(id))throw new Error('Unknown catalog template.');
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['map','disabled','required','overrides','order'].includes(k)))throw new Error('Invalid template assignment options.');
 if(id==='promotional_gift'){
  const assigned=assignGiftProduct(input,settings.giftTemplate||giftTemplate(),options);
  resolveProduct(assigned,settings);return assigned;
 }
 const template=settings.catalogTemplates?.[id]||catalogTemplate(id),current=templateAssignment(input);
 if(current){if(current.assignment.id!==id)throw new Error('A product already has another template. Review and explicitly remove its assignment before changing templates.');resolveProduct(input,settings);return clone(input);}
 const p=clone(input),aliases={size:['size'],paper:['paper','material','mat'],sides:['sides'],finish:['finish','fin'],dim:['dim'],material:['material','mat'],lamination:['lamination','lam'],installation:['installation','inst'],binding:['binding','bind']},names={size:['size','envelope size','paper size'],paper:['paper','paper/material','material/paper'],sides:['sides','printing sides','print sides'],finish:['finish','finishing'],dim:['dimensions','custom dimensions','size'],material:['material'],lamination:['lamination'],installation:['installation'],binding:['binding']},map={};
 for(const semantic of TEMPLATE_KEYS[id]){if(options.map&&own(options.map,semantic)){map[semantic]=options.map[semantic];continue;}const candidates=p.f.filter(f=>((aliases[semantic]||[semantic]).includes(f.k)||(names[semantic]||[]).includes(f.l?.trim().toLowerCase()))&&(semantic!=='dim'||f.t==='dim'));if(candidates.length>1)throw new Error('Multiple existing fields match shared '+semantic+'. Configure an explicit mapping before assignment.');if(candidates.length)map[semantic]=candidates[0].k;}
 p.catalogTemplate={id,disabled:[],overrides:{},...clone(options),map};
 resolveProduct(p,settings);return p;
}
function assignGiftProduct(input,template=giftTemplate(),options={}){
 if(input.giftTemplate){resolveGiftProduct(input,template);return clone(input);}
 const p=clone(input),aliases={model:['model','type','stand'],material:['material','mat'],color:['color','colour'],customization:['customization','cust','plate'],printing:['printing','print','meth'],packaging:['packaging','pack'],artwork:['artwork']},map={};
 const names={model:['product model','model','mug type','stand'],material:['material'],color:['colour','color'],customization:['customization','customization type','customisation type','plate'],printing:['printing','printing method'],packaging:['packaging'],artwork:['artwork requirement','artwork requirements']};
 for(const semantic of GIFT_KEYS){if(options.map&&own(options.map,semantic)){map[semantic]=options.map[semantic];continue;}const candidates=p.f.filter(f=>aliases[semantic].includes(f.k)||names[semantic].includes(f.l?.trim().toLowerCase()));if(candidates.length>1)throw new Error('Multiple existing fields match shared '+semantic+'. Configure an explicit gift field mapping before assignment; existing fields and prices have not been changed.');if(candidates.length)map[semantic]=candidates[0].k;}
 p.giftTemplate={id:template.id,disabled:[],overrides:{},...clone(options),map};
 resolveGiftProduct(p,template);return p;
}
function phase3Product(input,template=giftTemplate()){
 const p=clone(input);
 const requirements=(key,label)=>{
  const matches=p.f.filter(f=>f.k===key||f.l?.trim().toLowerCase()===label.toLowerCase());
  if(matches.length>1||matches[0]&&matches[0].t!=='txt')throw new Error(label+' must use one text field. Review the existing field before Phase 3 preparation; existing options and rates have not been changed.');
  if(matches.length)matches[0].multiline=true;
  else p.f.push({k:key,l:label,t:'txt',required:false,multiline:true,show_on_customer_pdf:true});
 };
 if(['PG-PB','PG-KC','PG-MG','PG-TC','PG-ST'].includes(p.code))return assignGiftProduct(p,template);
 if(p.code==='PG-TS'){
  if(p.f.some(f=>!['loc','printLocations'].includes(f.k)&&f.l?.trim().toLowerCase()==='print locations'))throw new Error('Review the existing Print Locations field mapping before Phase 3 preparation; adding another field could duplicate controls and charges. Existing fields and rates have not been changed.');
  if(p.f.some(f=>f.k==='printLocations'&&f.t!=='multi'))throw new Error('Print Locations must use a multiselect field. Review the existing field before Phase 3 preparation; existing options and rates have not been changed.');
  if(!p.f.some(f=>f.t==='SIZE_BREAKDOWN')){p.f.push({k:'sz',l:'Size breakdown',t:'SIZE_BREAKDOWN',required:true,show_on_customer_pdf:true,sizes:SZ.map(key=>({key,label:key,enabled:true,price:0}))});p.sizes=0;}
  const old=p.f.find(f=>f.k==='loc');if(old){if([...p.f,...(p.charges||[]),...(p.compatibility||[])].some(f=>f.field==='loc'||conditionRows(f.when).some(row=>row.key==='loc')))throw new Error('Existing rules reference the legacy Print Locations field. Review those rules before preparing named print locations; historical locations cannot be inferred.');p.phase3LegacyFields=[...(p.phase3LegacyFields||[]),clone(old)];p.f=p.f.filter(f=>f.k!=='loc');}
  if(!p.f.some(f=>f.k==='printLocations')){const locations=['Front','Back','Left Chest','Right Chest','Sleeve','Neck Label'];p.f.push({k:'printLocations',l:'Print Locations',t:'multi',required:true,minSelections:1,maxSelections:locations.length,show_on_customer_pdf:true,o:locations.map(v=>[v,'u',null]),optionMeta:Object.fromEntries(locations.map((v,i)=>[v,{label:v,enabled:false,approved:false,order:i}]))});}
  requirements('designRequirements','Design Requirements');
  p.phase3='tshirt';return p;
 }
 if(p.code==='GD-LG'){requirements('additionalRequirements','Additional Requirements');p.phase3='logo';return p;}
 throw new Error('Phase 3 preparation is available only for T-Shirt, Logo Design and the five existing gift products. Use explicit template assignment for other products.');
}
function optionDefinitionError(product,field){
 if(field.allowCustom!==undefined&&typeof field.allowCustom!=='boolean'||field.allowCustom&&field.t!=='sel')return 'Custom values are supported only on dropdown fields.';
 if(field.customCharge!==undefined){const c=field.customCharge;if(!c||typeof c!=='object'||Array.isArray(c)||!['f','u','p','a','q'].includes(c.type)||typeof c.approved!=='boolean'||!(nonnegative(c.amount)||c.amount===null&&c.approved===false))return 'Custom values require a configured charge basis and approved rate.';}
 if(field.legacyTextDefault!==undefined&&(typeof field.legacyTextDefault!=='string'||field.legacyTextDefault.length>4000))return 'Invalid retained legacy text default.';
 if(field.optionMeta!==undefined){
  if(!field.optionMeta||typeof field.optionMeta!=='object'||Array.isArray(field.optionMeta)||Object.keys(field.optionMeta).length>100)return 'Invalid option metadata.';
  for(const [key,m] of Object.entries(field.optionMeta)){
   if(!field.o?.some(o=>o[0]===key)||!m||typeof m!=='object'||Array.isArray(m)||['__proto__','constructor','prototype'].includes(key))return 'Option metadata must reference existing options.';
   if(['enabled','approved','includesEyelets'].some(k=>m[k]!==undefined&&typeof m[k]!=='boolean')||m.label!==undefined&&(typeof m.label!=='string'||!m.label.trim()||m.label.length>200)||m.order!==undefined&&(!integer(m.order)||m.order>MAX_QUANTITY))return 'Invalid option availability, label, order or pricing approval.';
   if(m.quantityRule!==undefined&&!['none','corners','perimeter'].includes(m.quantityRule))return 'Invalid eyelet quantity rule.';
   if(m.quantityKey!==undefined&&!product.f.some(f=>f.k===m.quantityKey&&f.t==='num'&&f.integer&&f.min>=1))return 'Option quantity must reference a positive whole-number field.';
   if(m.geometry!==undefined){const g=m.geometry;if(!g||typeof g!=='object'||Array.isArray(g)||g.custom!==undefined&&typeof g.custom!=='boolean'||g.custom!==true&&(!sizeGeometry(m)||g.w>MAX_DIMENSION||g.h>MAX_DIMENSION))return 'Size geometry requires positive dimensions and a valid unit, or custom geometry.';}
  }
 }
 if(field.rateBasis!==undefined&&field.rateBasis!=='area')return 'Invalid field rate basis.';
 if(field.rateBasis==='area'&&field.o.some(o=>o[1]!=='a'))return 'Material rates must use per-area pricing.';
 if(field.quantityRule!==undefined){
  if(field.quantityRule!=='eyelets'||field.t!=='sel'||field.eyeletPolicy?.spacingFt!==2||field.eyeletPolicy?.corners!==4||typeof field.eyeletPolicy?.approved!=='boolean'||field.o.some(o=>o[1]!=='u'||!['none','corners','perimeter'].includes(optionMeta(field,o[0]).quantityRule)))return 'Invalid eyelet policy or option quantity rule.';
 }
 return null;
}
function compatibilityConflict(product){
 const fields=product.f,spend=()=>{if(--budget<0)throw new Error('Compatibility rules are too complex; simplify interacting conditions.');};let budget=20000;
 const expected=row=>{const v=own(row,'equals')?row.equals:row.value;return Array.isArray(v)?v:[v];};
 const possible=rows=>[...new Set(rows.map(row=>row.key))].every(key=>{
  spend();const constraints=rows.filter(row=>row.key===key),field=fields.find(f=>f.k===key),values=constraints.flatMap(expected),numeric=field?.t==='num'||['qty','w','h'].includes(key),other=numeric?Math.max(0,...values.filter(finite))+1:'__other_value__';
  const domain=['sel','multi'].includes(field?.t)?field.o.map(o=>o[0]).concat(field.required===false?['']:[]):[...values,other];
  if(field?.t==='multi'){const forbidden=new Set(constraints.filter(r=>r.operator==='not_equals').flatMap(expected)),allowed=domain.filter(value=>!forbidden.has(value));return (!field.required||allowed.length>0)&&constraints.filter(r=>r.operator!=='not_equals').every(r=>expected(r).some(value=>allowed.includes(value)));}
  return domain.some(value=>constraints.every(r=>r.operator==='not_equals'?!expected(r).includes(value):expected(r).includes(value)));
 });
 const together=(conditions,index=0,rows=[])=>{spend();if(index===conditions.length)return possible(rows);const c=conditions[index],branches=!c?[[]]:c.mode==='ANY'?conditionRows(c).map(row=>[row]):[conditionRows(c)];return branches.some(branch=>possible([...rows,...branch])&&together(conditions,index+1,[...rows,...branch]));};
 try{for(const field of fields){const rules=(product.compatibility||[]).filter(r=>r.field===field.k);if(rules.length<2)continue;
  const search=(start,allowed,conditions)=>{for(let i=start;i<rules.length;i++){spend();const next=allowed.filter(value=>rules[i].allowed.includes(value));if(next.length===allowed.length)continue;const gates=[...conditions,rules[i].when];if(!together(gates))continue;if(!next.length||search(i+1,next,gates))return true;}return false;};
  if(search(0,field.o.map(o=>o[0]),[]))return 'Contradictory compatibility rules cannot match at the same time.';
 }}catch(error){return error.message;}return null;
}
function matches(condition,config,available=()=>true){
 if(!condition)return true;
 const rows=conditionRows(condition);
 const match=row=>{
  if(!available(row.key)||!own(config,row.key)||config[row.key]===undefined||config[row.key]===null)return false;
  const expected=own(row,'equals')?row.equals:row.value,actual=config[row.key];
  const equal=Array.isArray(expected)?expected.some(value=>Array.isArray(actual)?actual.includes(value):actual===value):Array.isArray(actual)?actual.includes(expected):actual===expected;
  return row.operator==='not_equals'?!equal:equal;
 };
 return condition.mode==='ANY'?rows.some(match):rows.every(match);
}
function visibility(product,config){
 const fields=product?.f||[],known=new Map(fields.map(field=>[field.k,field])),visiting=new Set(),memo=new Map();
 const available=key=>{
  const dependency=known.get(key);
  if(dependency)return visible(dependency);
  if(product&&['w','h','u'].includes(key)&&product.m!=='area')return fields.some(field=>field.t==='dim'&&visible(field));
  return true;
 };
 const visible=value=>{
  if(memo.has(value.k))return memo.get(value.k);
  if(visiting.has(value.k))return false;
  visiting.add(value.k);
  const result=matches(value.when,config,available);
  visiting.delete(value.k);memo.set(value.k,result);return result;
 };
 return {visible,available};
}
function fieldVisible(field,config,product){return visibility(product,config).visible(field);}
function sizeFields(product){
 const fields=(product.f||[]).filter(field=>field.t==='SIZE_BREAKDOWN');
 return fields.length?fields:product.sizes?[{k:'sz',l:'Sizes',t:'SIZE_BREAKDOWN',legacy:true,sizes:SZ.map(key=>({key,label:key,enabled:true,price:0}))}]:[];
}
const sizeCount=(quantities,key)=>quantities&&own(quantities,key)?quantities[key]:0;
function normalizeConfig(product,configuration){
 const config={...(configuration&&typeof configuration==='object'&&!Array.isArray(configuration)?configuration:{})};
 for(const key of Object.keys(config))if(key.startsWith('_'))delete config[key];
 const assignment=product.catalogTemplate||product.giftTemplate;
 for(const semantic of assignment?.disabled||[])delete config[assignment.map?.[semantic]||semantic];
 for(const field of Array.isArray(product.catalogLegacyFields)?product.catalogLegacyFields:[])if(field?.k&&!(product.f||[]).some(current=>current.k===field.k))delete config[field.k];
 for(const field of product.f||[])if(config[field.k]===undefined&&field.default!==undefined)config[field.k]=clone(field.default);
 if(['fixed','package'].includes(product.m)&&(config.qty===undefined||(integer(config.qty)&&config.qty>0&&config.qty<=MAX_QUANTITY)))config.qty=1;
 const sizeField=sizeFields(product).find(field=>fieldVisible(field,config,product)),sizes=sizeField&&config[sizeField.k];
 if(sizes&&typeof sizes==='object'&&!Array.isArray(sizes)&&Object.values(sizes).every(integer)){
  const qty=Object.values(sizes).reduce((sum,value)=>sum+value,0);if(qty<=MAX_QUANTITY)config.qty=qty;
 }
 const resolved=visibility(product,config);
 for(const field of product.f||[])if(!resolved.visible(field))delete config[field.k];
 for(const key of ['w','h','u'])if(!resolved.available(key))delete config[key];
 return config;
}
function sizeQuantityError(product,configuration){
 if(product?.phase3!=='tshirt'||!configuration||typeof configuration!=='object'||Array.isArray(configuration)||!own(configuration,'qty'))return null;
 const field=sizeFields(product).find(f=>fieldVisible(f,configuration,product)),sizes=field&&configuration[field.k];
 if(sizes&&typeof sizes==='object'&&!Array.isArray(sizes)){
  const available=new Set(field.sizes.filter(size=>size.enabled!==false).map(size=>size.key)),amounts=Object.values(sizes);
  if(Object.keys(sizes).every(key=>available.has(key))&&amounts.every(amount=>integer(amount)&&amount<=MAX_QUANTITY)&&configuration.qty!==amounts.reduce((sum,amount)=>sum+amount,0))return 'Total quantity must match the size breakdown.';
 }
 return null;
}
const internalName=value=>/(?:internal|private|staff)/i.test(value||'');
function isInternalField(field){return field.internal_only===true||internalName(field.k)||internalName(field.l)||/^(?:note|notes)$/i.test((field.k||'').replace(/_/g,''))||/^\s*Notes\s*$/i.test(field.l||'');}
function publicField(field){
 if(isInternalField(field)||field.show_on_customer_pdf===false)return false;
 if(field.show_on_customer_pdf===true)return true;
 return !/^(?:note|notes|designrequirements|additionalrequirements)$/i.test((field.k||'').replace(/_/g,''))&&!/^(?:Notes|Design Requirements|Additional Requirements)$/i.test(field.l||'');
}
function formatField(field,config){
 const value=config[field.k];
 if(field.t==='dim')return finite(config.w)&&finite(config.h)?`${field.l}: ${config.w} \u00d7 ${config.h} ${config.u}`:'';
 if(field.t==='SIZE_BREAKDOWN')return value&&typeof value==='object'?field.l+': '+field.sizes.filter(size=>size.enabled!==false&&sizeCount(value,size.key)>0).map(size=>`${size.label} ${sizeCount(value,size.key)}`).join(', '):'';
 if(empty(value)||(typeof value==='string'&&!value.trim()))return '';
 if(['sel','multi'].includes(field.t)){const text=(Array.isArray(value)?value:[value]).map(v=>optionLabel(field,v)).join(', ');if(field.quantityRule==='eyelets'){try{const count=eyeletCount(field,config)*(config.qty||1);return field.l+': '+text+(count?' ('+count+' eyelets)':'');}catch{return '';}}return field.l+': '+text;}
 return field.l+': '+(Array.isArray(value)?value.join(', '):value);
}
function customerSpecifications(item){
 let values;
 if(Array.isArray(item.fieldSnapshot)){
  const product={f:item.fieldSnapshot},config=normalizeConfig(product,item.cfg);
  values=item.fieldSnapshot.filter(field=>publicField(field)&&fieldVisible(field,config,product)).map(field=>formatField(field,config));
 }else values=(item.sp||[]).filter(value=>typeof value==='string'&&!internalName(value.split(':',1)[0])&&!/^\s*(?:notes|design requirements|additional requirements)\s*:/i.test(value));
 return [...new Set(values.filter(value=>value&&value.trim()&&!/:\s*$/.test(value)))];
}
function defCfg(product){
 const config={qty:Math.max(product.minQty||1,product.tiers?.[0]?.[0]||1),w:4,h:3,u:'ft',sz:Object.fromEntries(SZ.map(size=>[size,0]))};
 for(const field of product.f||[]){
  if(field.default!==undefined)config[field.k]=clone(field.default);
  else if(field.t==='sel')config[field.k]=field.required===false?'':activeOptions(field)[0]?.[0]??'';
  else if(field.t==='num')config[field.k]=field.min??0;
  else if(field.t==='txt')config[field.k]='';
  else if(field.t==='multi')config[field.k]=[];
  else if(field.t==='SIZE_BREAKDOWN')config[field.k]=Object.fromEntries(field.sizes.filter(size=>size.enabled!==false).map(size=>[size.key,0]));
 }
 return config;
}
function fieldDefinitionError(product){
 const fields=product.f||[],known=new Map(fields.map(field=>[field?.k,field])),reserved=new Set(['qty','sz','w','h','u']);
 if((product.compatibility!==undefined&&!Array.isArray(product.compatibility))||(product.charges!==undefined&&!Array.isArray(product.charges)))return 'Invalid product rules.';
 if(fields.length>50||fields.some(field=>!field||!validKey(field.k)||(reserved.has(field.k)&&!(field.k==='sz'&&field.t==='SIZE_BREAKDOWN')))||known.size!==fields.length)return 'Invalid or duplicate product field key.';
 if(product.phase2!==undefined&&!['visiting_card','flex'].includes(product.phase2))return 'Invalid Phase 2 profile.';
 if(product.phase2==='visiting_card'){
  const size=known.get('size');if(known.get('shape')?.t!=='sel'||size?.t!=='sel'||known.get('customFinish')?.t!=='txt'||known.get('customDim')?.t!=='dim')return 'Visiting Card requires Shape, Size, Custom Finish Details and Custom Dimensions fields.';
  if(!Array.isArray(size.o)||size.o.some(o=>!Array.isArray(o)||!sizeGeometry(optionMeta(size,o[0]))))return 'Classify every card size with structured dimensions or custom geometry.';
  for(const [shape,geometry] of [['Rectangle','rectangle'],['Square','square'],['Custom','custom']]){const rule=product.compatibility?.find(r=>r.id==='phase2_shape_'+geometry),expected=(size.o||[]).filter(o=>sizeGeometry(optionMeta(size,o[0]))===geometry).map(o=>o[0]);if(!expected.length||!rule||rule.field!=='size'||rule.when?.key!=='shape'||rule.when?.equals!==shape||rule.allowed?.length!==expected.length||expected.some(value=>!rule.allowed.includes(value)))return 'Shape-size compatibility rules must follow configured size geometry.';}
 }
 if(product.phase2==='flex'){
  if(['material','printing','fin','eye','eyelets'].some(key=>known.get(key)?.t!=='sel')||['material','printing'].some(key=>known.get(key).required===false||known.get(key).when!==undefined)||known.get('material').rateBasis!=='area'||known.get('eyelets').quantityRule!=='eyelets')return 'Flex requires mandatory unconditional priced Material/Printing dropdowns, Finishing, Accessories and independent Eyelets.';
  const fin=known.get('fin');for(const o of fin.o||[])if(optionMeta(fin,o[0]).includesEyelets&&!product.compatibility?.some(r=>r.id==='phase2_bundle_'+o[0]&&r.field==='eyelets'&&r.when?.key==='fin'&&r.when?.equals===o[0]&&r.allowed?.length===1&&r.allowed[0]==='None'))return 'Bundled eyelets require a no-double-charge compatibility rule.';
 }
 const checkCondition=condition=>{
  if(!condition||typeof condition!=='object'||Array.isArray(condition))return 'Invalid field condition.';
  if(own(condition,'conditions')&&(!['ALL','ANY'].includes(condition.mode)||!Array.isArray(condition.conditions)||!condition.conditions.length||condition.conditions.length>50))return 'Invalid condition group; choose ALL or ANY and at least one condition.';
  for(const row of conditionRows(condition)){
   if(!row||typeof row!=='object'||Array.isArray(row)||!validKey(row.key)||(!known.has(row.key)&&!['qty','w','h','u'].includes(row.key)))return 'Condition references an unknown field.';
   const legacy=own(row,'equals'),operator=row.operator??'equals',value=legacy?row.equals:row.value;
   if(!['equals','not_equals'].includes(operator)||(!legacy&&!own(row,'value')))return 'Invalid condition operator or value.';
   const values=Array.isArray(value)?value:[value];
   if(!values.length||values.length>100||(!legacy&&Array.isArray(value))||values.some(v=>!(typeof v==='string'&&v.length<=4000||finite(v)&&Math.abs(v)<=10000000)))return 'Invalid condition value.';
   const target=known.get(row.key);
   if(target&&['dim','SIZE_BREAKDOWN'].includes(target.t))return 'Conditions must reference a text, option, numeric or quantity field.';
   if(target&&['sel','multi'].includes(target.t)&&values.some(v=>!(v===''&&target.t==='sel'&&target.required===false)&&(!Array.isArray(target.o)||!target.o.some(option=>option[0]===v))))return 'Condition references an unavailable option.';
   if(target?.t==='num'&&values.some(v=>!finite(v)))return 'Numeric conditions require numeric values.';
   if(['qty','w','h'].includes(row.key)&&values.some(v=>!finite(v)))return 'Numeric conditions require numeric values.';
   if(target?.t==='txt'&&values.some(v=>typeof v!=='string'))return 'Text conditions require text values.';
   if(row.key==='u'&&values.some(v=>typeof v!=='string'||!own(AF,v)))return 'Dimension unit conditions require a valid unit.';
  }
  return null;
 };
 for(const field of fields){
  if(['show_on_customer_pdf','internal_only','required','multiline'].some(key=>field[key]!==undefined&&typeof field[key]!=='boolean'))return 'Invalid product field flag.';
  if(field.multiline&&field.t!=='txt')return 'Multiline input is supported only on text fields.';
  if(['minSelections','maxSelections'].some(k=>field[k]!==undefined&&(!integer(field[k])||field[k]>100))||field.minSelections!==undefined&&field.maxSelections!==undefined&&field.minSelections>field.maxSelections||['minSelections','maxSelections'].some(k=>field[k]!==undefined)&&field.t!=='multi')return 'Invalid multiselect selection limits.';
  if(field.when!==undefined){const error=checkCondition(field.when);if(error)return error;}
  if(field.t==='SIZE_BREAKDOWN'){
   if(!['unit','tier'].includes(product.m))return 'Size breakdown requires unit or tier pricing.';
   if(!Array.isArray(field.sizes)||!field.sizes.length||field.sizes.length>100||field.sizes.some(size=>!size||typeof size.key!=='string'||!size.key.trim()||size.key.length>80||['__proto__','constructor','prototype'].includes(size.key)||typeof size.label!=='string'||!size.label.trim()||size.label.length>100||(size.enabled!==undefined&&typeof size.enabled!=='boolean')||!nonnegative(size.price??0))||new Set(field.sizes.map(size=>size.key)).size!==field.sizes.length||new Set(field.sizes.map(size=>size.label)).size!==field.sizes.length||!field.sizes.some(size=>size.enabled!==false))return 'Invalid size definitions; size keys and labels must be unique and at least one size enabled.';
   if(conditionRows(field.when).some(row=>row.key==='qty'))return 'Size breakdown cannot depend on its calculated quantity.';
  }
 }
 if(fields.filter(field=>field.t==='SIZE_BREAKDOWN').length>1)return 'Only one size breakdown may calculate product quantity.';
 for(const rule of [...(product.compatibility||[]),...(product.charges||[])])if(rule.when!==undefined){const error=checkCondition(rule.when);if(error)return error;}
 const compatibility=product.compatibility||[];
 for(const rule of compatibility){const target=known.get(rule.field);if(target?.t!=='sel'||!Array.isArray(rule.allowed)||!rule.allowed.length||new Set(rule.allowed).size!==rule.allowed.length||rule.allowed.some(value=>!target.o?.some(o=>o[0]===value)))return 'Invalid compatibility target or allowed options.';}
 const conflict=compatibilityConflict(product);if(conflict)return conflict;
 const visited=new Set(),visiting=new Set();
 const dependencies=key=>known.has(key)?[known.get(key)]:key==='qty'?fields.filter(field=>field.t==='SIZE_BREAKDOWN'):['w','h','u'].includes(key)&&product.m!=='area'?fields.filter(field=>field.t==='dim'):[];
 const ruleRows=rule=>{const rows=conditionRows(rule.when),row=rows[0],value=row&&(own(row,'equals')?row.equals:row.value),values=Array.isArray(value)?value:[value];return rows.length===1&&row.key===rule.field&&row.operator!=='not_equals'&&values.every(value=>rule.allowed.includes(value))?[]:rows;};
 const visit=field=>{if(visiting.has(field.k))return false;if(visited.has(field.k))return true;visiting.add(field.k);const rows=[...conditionRows(field.when),...compatibility.filter(r=>r.field===field.k).flatMap(ruleRows)];for(const row of rows)for(const dependency of dependencies(row.key))if(!visit(dependency))return false;visiting.delete(field.k);visited.add(field.k);return true;};
 if(fields.some(field=>!visit(field)))return 'Circular product field dependencies are not allowed.';
 return null;
}
function pricingError(product){
 if(!product||!METHODS.includes(product.m)||!Array.isArray(product.f))return 'Invalid product pricing configuration.';
 if(product.priceConfigured===false)return 'Approved pricing must be configured before quoting this product.';
 const tiered=product.m==='tier'||product.m==='unit'&&product.tiers?.length;
 if((!tiered&&!nonnegative(product.rate)||tiered&&product.rate!=null&&!nonnegative(product.rate))||!nonnegative(product.min??0)||!nonnegative(product.tax)||product.tax>100)return 'Product prices and tax must be finite, nonnegative values.';
 if(!TAX_MODES.includes(product.taxMode??'exclusive')||!integer(product.minQty??1)||(product.minQty??1)<1||(product.minQty??1)>MAX_QUANTITY)return 'Invalid tax treatment or minimum quantity.';
 const definitionError=fieldDefinitionError(product);if(definitionError)return definitionError;
 if(product.m==='tier'||(product.m==='unit'&&product.tiers?.length)){
  if(!Array.isArray(product.tiers)||!product.tiers.length)return 'This product needs quantity pricing tiers.';
  let previous=0;
  for(const tier of product.tiers){
   if(!Array.isArray(tier)||tier.length!==2||!integer(tier[0])||tier[0]<=previous||tier[0]>MAX_QUANTITY||!nonnegative(tier[1]))return 'Invalid quantity pricing tier.';
   previous=tier[0];
  }
 }
 for(const field of product.f){
  if(!field||!['sel','multi','txt','dim','num','SIZE_BREAKDOWN'].includes(field.t))return 'Invalid product field.';
  if(['sel','multi'].includes(field.t)&&(!Array.isArray(field.o)||!field.o.length||field.o.some(option=>!Array.isArray(option)||typeof option[0]!=='string'||!['f','u','p','a','q'].includes(option[1])||!(nonnegative(option[2])||option[2]===null&&optionMeta(field,option[0]).approved===false))))return 'Invalid option pricing.';
  if(['sel','multi'].includes(field.t)){const error=optionDefinitionError(product,field);if(error)return error;}
  if(field.t==='num'&&((field.min!==undefined&&!finite(field.min))||(field.max!==undefined&&!finite(field.max))||(field.min!==undefined&&field.max!==undefined&&field.min>field.max)))return 'Invalid numeric field limits.';
 }
 if(product.charges!==undefined&&(!Array.isArray(product.charges)||product.charges.some(charge=>!charge||typeof charge.label!=='string'||!['f','u','p','a','q'].includes(charge.type)||!nonnegative(charge.amount))))return 'Invalid additional charges.';
 if(product.compatibility!==undefined&&(!Array.isArray(product.compatibility)||product.compatibility.some(rule=>!rule||typeof rule.field!=='string'||!Array.isArray(rule.allowed)||!rule.allowed.length)))return 'Invalid option compatibility rules.';
 return null;
}
function chargeAmount(type,amount,base,qty,area){
 if(type==='a'&&!area&&amount)throw new TypeError('Area-based charges require valid dimensions.');
 return safeMoney(type==='f'?R(amount):['u','q'].includes(type)?Math.round(R(amount)*qty):type==='p'?Math.round(base*amount/100):Math.round(R(amount)*area*qty));
}
function calc(product,configuration){
 const L=[],sp=[],computed={};
 let err=pricingError(product)||sizeQuantityError(product,configuration),qty=0,base=0,area=0;
 let config=err?{}:normalizeConfig(product,configuration);
 const sizeField=err?null:sizeFields(product).find(field=>fieldVisible(field,config,product));
 if(!err&&Object.keys(config).some(key=>!['qty','sz','w','h','u'].includes(key)&&!product.f.some(field=>field.k===key)))err='Unknown product configuration field.';
 if(!err&&!sizeField&&config.qty!==undefined&&(!integer(config.qty)||config.qty<1||config.qty>MAX_QUANTITY))err='Quantity must be a whole number between 1 and 1,000,000.';
 if(!err&&sizeField){
  const sizes=config[sizeField.k],available=sizeField.sizes.filter(size=>size.enabled!==false);
  if(!sizes||typeof sizes!=='object'||Array.isArray(sizes)||Object.keys(sizes).some(key=>!available.some(size=>size.key===key)||!integer(sizes[key])||sizes[key]>MAX_QUANTITY))err='Size quantities must use available sizes and nonnegative whole numbers.';
  else qty=available.reduce((sum,size)=>sum+sizeCount(sizes,size.key),0);
 }else if(!err)qty=['fixed','package'].includes(product.m)?1:config.qty;
 if(!err&&(!integer(qty)||qty<1||qty>MAX_QUANTITY))err=sizeField?'Enter quantities for at least one size, totaling at most 1,000,000.':'Enter a valid whole-number quantity.';
 if(!err&&sizeField){config.qty=qty;config=normalizeConfig(product,config);}
 const minimum=Math.max(product?.minQty??1,product?.tiers?.[0]?.[0]??1);
 if(!err&&qty<minimum)err=`Minimum order quantity is ${minimum}.`;
 const needsArea=!err&&(product.m==='area'||product.f.some(field=>field.t==='dim'&&fieldVisible(field,config,product)));
 if(needsArea){
  if(!finite(config.w)||!finite(config.h)||config.w<=0||config.h<=0||config.w>MAX_DIMENSION||config.h>MAX_DIMENSION)err='Enter a width and height greater than zero and at most 10,000.';
  else if(!Object.prototype.hasOwnProperty.call(AF,config.u))err='Select a valid dimension unit.';
  else area=config.w*config.h*AF[config.u];
 }
 const {available}=visibility(product,config);
 if(!err)for(const rule of product.compatibility||[])if(available(rule.field)&&matches(rule.when,config,available)&&!rule.allowed.includes(config[rule.field])){err=rule.message||'Selected product options are not compatible.';break;}
 if(!err){try{
  if(product.m==='tier'||(product.m==='unit'&&product.tiers?.length)){
   const tier=[...product.tiers].reverse().find(row=>qty>=row[0]),rate=R(tier[1]);
   base=safeMoney(rate*qty);L.push([`Base: ${qty} \u00d7 ${inr(rate)} (tier from ${tier[0]})`,base]);
  }else if(product.m==='unit'){
   const rate=R(product.rate);base=safeMoney(rate*qty);L.push([`Unit: ${qty} \u00d7 ${inr(rate)}`,base]);
  }else if(product.m==='area'){
   const rate=R(product.rate);base=safeMoney(Math.round(rate*area*qty));L.push([`Area: ${area.toFixed(2)} sq ft \u00d7 ${qty} \u00d7 ${inr(rate)}`,base]);
  }else{base=safeMoney(R(product.rate));if(base)L.push([product.m==='package'?'Package fee':'Base fee',base]);}
  const minimumCharge=safeMoney(R(product.min??0));
  if(base<minimumCharge){L.push([`Minimum order charge adjustment (min ${inr(minimumCharge)})`,minimumCharge-base]);base=minimumCharge;}
  if(needsArea&&!product.f.some(field=>field.t==='dim'))sp.push(`Size: ${config.w} \u00d7 ${config.h} ${config.u}`);
  if(sizeField?.legacy)sp.push(formatField(sizeField,config));
  for(const field of product.f){
   if(!fieldVisible(field,config,product))continue;
   const value=config[field.k];
   if(field.t!=='dim'&&empty(value)){
    if(field.required===true||(field.t==='sel'&&field.required!==false)){err=field.t==='sel'&&!activeOptions(field).length?field.l+' has no active approved prices. Configure and approve pricing before quoting.':field.l+' is required.';break;}
    continue;
   }
   if(['sel','multi'].includes(field.t)){
    const values=field.t==='multi'?value:[value];
    const custom=field.t==='sel'&&field.allowCustom===true&&typeof value==='string'&&value.trim()&&value.length<=200&&!field.o.some(option=>option[0]===value);
    if(!Array.isArray(values)||values.length>100||new Set(values).size!==values.length||values.some(value=>!activeOptions(field).some(option=>option[0]===value))&&!custom){err='Invalid option for '+field.l+': select an active option with approved pricing.';break;}
    if(field.t==='multi'&&(values.length<(field.minSelections??0)||values.length>(field.maxSelections??100))){err=field.l+' must contain between '+(field.minSelections??0)+' and '+(field.maxSelections??100)+' selections.';break;}
    if(custom&&(!field.customCharge?.approved||!nonnegative(field.customCharge.amount))){err=field.l+' custom values require an explicitly approved configured rate.';break;}
    for(const value of values){const option=custom?[value,field.customCharge.type,field.customCharge.amount]:field.o.find(option=>option[0]===value),meta=custom?{}:optionMeta(field,value);let chargeQty=qty,label=field.l+': '+optionLabel(field,value);if(field.quantityRule==='eyelets'){const perPiece=eyeletCount(field,config),total=perPiece*qty;if(!integer(total))throw new TypeError('Invalid eyelet quantity.');computed[field.k]={perPiece,total};chargeQty=total;label+=' ('+total+' eyelets)';}else if(meta.quantityKey&&['u','q'].includes(option[1])){if(!integer(config[meta.quantityKey])||config[meta.quantityKey]<1||config[meta.quantityKey]>MAX_QUANTITY)throw new TypeError('Enter a valid accessory quantity.');chargeQty=qty*config[meta.quantityKey];}if(option[2])L.push([label+(option[1]==='p'?` (${option[2]}% of base)`:''),chargeAmount(option[1],option[2],base,chargeQty,area)]);}
   }else if(field.t==='txt'){
    if(typeof value!=='string'||value.length>(field.maxLength??4000)||(field.required&&!value.trim())){err='Invalid text for '+field.l+'.';break;}
   }else if(field.t==='num'){
    if(!finite(value)||(field.min!==undefined&&value<field.min)||(field.max!==undefined&&value>field.max)||(field.integer&&!Number.isSafeInteger(value))){err='Invalid numeric value for '+field.l+'.';break;}
   }else if(field.t==='SIZE_BREAKDOWN'){
    for(const size of field.sizes)if(size.enabled!==false&&size.price&&sizeCount(value,size.key))L.push([field.l+': '+size.label,chargeAmount('u',size.price,base,sizeCount(value,size.key),area)]);
   }
   if(publicField(field)){const specification=formatField(field,config);if(specification)sp.push(specification);}
  }
  if(!err)for(const charge of product.charges||[])if(matches(charge.when,config,available))L.push([charge.label,chargeAmount(charge.type,charge.amount,base,qty,area)]);
  const sub=err?0:safeMoney(L.reduce((sum,row)=>sum+row[1],0)),tax=product.taxMode==='exempt'?0:product.tax;
  const gst=err?0:safeMoney(product.taxMode==='inclusive'?sub-Math.round(sub*100/(100+tax)):Math.round(sub*tax/100));
  const taxable=product.taxMode==='inclusive'?sub-gst:sub,grand=product.taxMode==='inclusive'?sub:safeMoney(sub+gst);
  return{err,qty,L,sp,computed,base,sub,tax,taxMode:product.taxMode??'exclusive',eff:qty?Math.round(sub/qty):0,gst,taxable,grand};
 }catch(error){err=error.message;}}
 return{err,qty:Number.isSafeInteger(qty)?qty:0,L:[],sp:[],base:0,sub:0,tax:product?.tax??0,eff:0,gst:0,taxable:0,grand:0};
}
function mkItem(product,config,id,notes){
 const result=calc(product,config);if(result.err)return null;
 const normalized=normalizeConfig(product,config);if(sizeFields(product).some(field=>fieldVisible(field,normalized,product)))normalized.qty=result.qty;
 const snapshot=[...product.f,...sizeFields(product).filter(field=>field.legacy)];
 if(product.m==='area'&&!snapshot.some(field=>field.t==='dim'))snapshot.push({k:'dim',l:'Size',t:'dim'});
 return{id:id||uid(),pid:product.id,name:product.name,code:product.code,unit:product.unit||'item',qty:result.qty,L:result.L,sp:[...new Set(result.sp)],sub:result.sub,base:result.base,tax:result.tax,taxMode:result.taxMode,notes:notes||'',cfg:clone(normalized),fieldSnapshot:clone(snapshot),...(Object.keys(result.computed||{}).length?{computed:clone(result.computed)}:{})};
}
// Largest remainder allocation keeps every amount in integer paise.
function allocateDiscount(items,discount,subtotal){
 if(!subtotal||!discount)return items.map(()=>0);
 const divisor=BigInt(subtotal),amount=BigInt(discount);
 const allocations=items.map((item,index)=>{const numerator=amount*BigInt(item.sub);return{index,value:Number(numerator/divisor),remainder:numerator%divisor};});
 let left=discount-allocations.reduce((sum,row)=>sum+row.value,0);
 const ordered=[...allocations].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
 for(const row of ordered){if(left===0)break;row.value++;left--;}
 return allocations.map(row=>row.value);
}
function totals(quote,settings={}){
 if(!quote||!Array.isArray(quote.items))throw new TypeError('Quotation items are required.');
 const items=quote.items;
 for(const item of items)if(!item||!integer(item.sub)||!integer(item.base)||item.base>item.sub||!integer(item.qty)||item.qty<1||!nonnegative(item.tax)||item.tax>100)throw new TypeError('Invalid quotation item amount, quantity, or tax.');
 const isub=safeMoney(items.reduce((sum,item)=>sum+item.sub,0)),ib=safeMoney(items.reduce((sum,item)=>sum+item.base,0));
 const discount=quote.disc||{t:'f',v:0};if(!['p','f'].includes(discount.t)||!finite(discount.v))throw new TypeError('Invalid discount.');
 let disc=discount.t==='p'?Math.round(isub*discount.v/100):R(discount.v);
 if(!Number.isSafeInteger(disc))throw new RangeError('Discount exceeds the supported range.');
 const warn=disc>isub||disc<0;disc=Math.min(Math.max(disc,0),isub);
 const allocations=allocateDiscount(items,disc,isub);
 const rows=items.map((item,index)=>({r:item.taxMode==='exempt'?0:item.tax,t:item.sub-allocations[index],mode:item.taxMode??'exclusive'}));
 if(!nonnegative(quote.del??0)||!nonnegative(quote.oth??0))throw new TypeError('Additional charges must be finite, nonnegative values.');
 const qc=safeMoney(R(quote.del??0)+R(quote.oth??0));
 if(qc){const chargeTax=quote.chargeTax??settings.tax??0;if(!nonnegative(chargeTax)||chargeTax>100)throw new TypeError('Invalid tax on additional charges.');rows.push({r:quote.chargeTaxMode==='exempt'?0:chargeTax,t:qc,mode:quote.chargeTaxMode??'exclusive'});}
 const groups=new Map();
 for(const row of rows){
  if(!TAX_MODES.includes(row.mode))throw new TypeError('Invalid tax treatment.');
  const key=row.r+':'+row.mode,group=groups.get(key)||{r:row.r,t:0,mode:row.mode};group.t=safeMoney(group.t+row.t);groups.set(key,group);
 }
 const brackets=new Map();
 for(const row of groups.values()){
  const net=row.mode==='inclusive'?Math.round(row.t*100/(100+row.r)):row.t;
  const tax=safeMoney(row.mode==='inclusive'?row.t-net:Math.round(net*row.r/100));
  const bracket=brackets.get(row.r)||{r:row.r,t:0,x:0};bracket.t=safeMoney(bracket.t+net);bracket.x=safeMoney(bracket.x+tax);brackets.set(row.r,bracket);
 }
 const br=[...brackets.values()].sort((a,b)=>a.r-b.r),gst=safeMoney(br.reduce((sum,row)=>sum+row.x,0)),taxable=safeMoney(br.reduce((sum,row)=>sum+row.t,0));
 const taxDisplay=quote.taxDisplay??quote.companySnapshot?.taxDisplay??settings.taxDisplay??'split';
 const cgst=taxDisplay==='igst'?0:br.reduce((sum,row)=>sum+Math.floor(row.x/2),0),sgst=taxDisplay==='igst'?0:gst-cgst,igst=taxDisplay==='igst'?gst:0;
 return{n:items.length,qty:safeMoney(items.reduce((sum,item)=>sum+item.qty,0)),isub,ib,ic:isub-ib,disc,warn,qc,taxable,gst,br,cgst,sgst,igst,taxDisplay,grand:safeMoney(taxable+gst)};
}
return{ST:Object.freeze(ST),TERMS:Object.freeze(TERMS),AF,SZ:Object.freeze(SZ),METHODS,TAX_MODES,seed,companyDetails,defCfg,calc,mkItem,totals,fieldVisible,sizeFields,normalizeConfig,sizeQuantityError,customerSpecifications,isInternalField,publicField,fieldDefinitionError,pricingError,optionDefinitionError,optionMeta,optionLabel,activeOptions,availableOptions,reconcileConfig,phase2Product,syncPhase2Rules,eyeletCount,GIFT_KEYS,CATALOG_TEMPLATE_IDS,catalogTemplate,catalogTemplateError,catalogAssignmentError,templateAssignment,productTemplate,resolveProduct,stripProduct,assignProductTemplate,giftTemplate,giftTemplateError,giftAssignmentError,resolveGiftProduct,stripGiftProduct,assignGiftProduct,phase3Product,R,inr,rs};
});
