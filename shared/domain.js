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
const empty=value=>value===undefined||value===null||value==='';
function matches(condition,config){return !condition||(!Array.isArray(condition)&&typeof condition==='object'&&Object.prototype.hasOwnProperty.call(condition,'equals')&&(Array.isArray(condition.equals)?condition.equals.includes(config[condition.key]):config[condition.key]===condition.equals));}
function fieldVisible(field,config){return matches(field.when,config);}
function defCfg(product){
 const config={qty:Math.max(product.minQty||1,product.tiers?.[0]?.[0]||1),w:4,h:3,u:'ft',sz:Object.fromEntries(SZ.map(size=>[size,0]))};
 for(const field of product.f||[]){
  if(field.default!==undefined)config[field.k]=clone(field.default);
  else if(field.t==='sel')config[field.k]=field.required===false?'':field.o?.[0]?.[0];
  else if(field.t==='num')config[field.k]=field.min??0;
  else if(field.t==='txt')config[field.k]='';
 }
 return config;
}
function pricingError(product){
 if(!product||!METHODS.includes(product.m)||!Array.isArray(product.f))return 'Invalid product pricing configuration.';
 if(product.priceConfigured===false)return 'Approved pricing must be configured before quoting this product.';
 if(!nonnegative(product.rate)||!nonnegative(product.min??0)||!nonnegative(product.tax)||product.tax>100)return 'Product prices and tax must be finite, nonnegative values.';
 if(!TAX_MODES.includes(product.taxMode??'exclusive')||!integer(product.minQty??1)||(product.minQty??1)<1||(product.minQty??1)>MAX_QUANTITY)return 'Invalid tax treatment or minimum quantity.';
 if(product.m==='tier'||(product.m==='unit'&&product.tiers?.length)){
  if(!Array.isArray(product.tiers)||!product.tiers.length)return 'This product needs quantity pricing tiers.';
  let previous=0;
  for(const tier of product.tiers){
   if(!Array.isArray(tier)||tier.length!==2||!integer(tier[0])||tier[0]<=previous||tier[0]>MAX_QUANTITY||!nonnegative(tier[1]))return 'Invalid quantity pricing tier.';
   previous=tier[0];
  }
 }
 for(const field of product.f){
  if(!field||!['sel','txt','dim','num'].includes(field.t))return 'Invalid product field.';
  if(field.t==='sel'&&(!Array.isArray(field.o)||!field.o.length||field.o.some(option=>!Array.isArray(option)||typeof option[0]!=='string'||!['f','u','p','a','q'].includes(option[1])||!nonnegative(option[2]))))return 'Invalid option pricing.';
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
 const L=[],sp=[];
 let err=pricingError(product),qty=0,base=0,area=0;
 const config={...(configuration&&typeof configuration==='object'?configuration:{})};
 if(!err)for(const field of product.f)if(config[field.k]===undefined&&field.default!==undefined)config[field.k]=clone(field.default);
 if(!err&&config.qty!==undefined&&(!integer(config.qty)||config.qty<1||config.qty>MAX_QUANTITY))err='Quantity must be a whole number between 1 and 1,000,000.';
 if(!err&&product.sizes){
  const sizes=config.sz;
  if(!sizes||typeof sizes!=='object'||Array.isArray(sizes)||Object.keys(sizes).some(size=>!SZ.includes(size))||SZ.some(size=>sizes[size]!==undefined&&(!integer(sizes[size])||sizes[size]>MAX_QUANTITY)))err='Size quantities must be nonnegative whole numbers.';
  else qty=SZ.reduce((sum,size)=>sum+(sizes[size]??0),0);
 }else if(!err)qty=['fixed','package'].includes(product.m)?1:config.qty;
 if(!err&&(!integer(qty)||qty<1||qty>MAX_QUANTITY))err=product.sizes?'Enter quantities for at least one size, totaling at most 1,000,000.':'Enter a valid whole-number quantity.';
 const minimum=Math.max(product?.minQty??1,product?.tiers?.[0]?.[0]??1);
 if(!err&&qty<minimum)err=`Minimum order quantity is ${minimum}.`;
 const needsArea=!err&&(product.m==='area'||product.f.some(field=>field.t==='dim'&&fieldVisible(field,config)));
 if(needsArea){
  if(!finite(config.w)||!finite(config.h)||config.w<=0||config.h<=0||config.w>MAX_DIMENSION||config.h>MAX_DIMENSION)err='Enter a width and height greater than zero and at most 10,000.';
  else if(!Object.prototype.hasOwnProperty.call(AF,config.u))err='Select a valid dimension unit.';
  else area=config.w*config.h*AF[config.u];
 }
 if(!err)for(const rule of product.compatibility||[])if(matches(rule.when,config)&&!rule.allowed.includes(config[rule.field])){err=rule.message||'Selected product options are not compatible.';break;}
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
  if(needsArea)sp.push(`Size: ${config.w} \u00d7 ${config.h} ${config.u}`);
  if(product.sizes)sp.push('Sizes: '+SZ.filter(size=>config.sz[size]).map(size=>size+' '+config.sz[size]).join(', '));
  for(const field of product.f){
   if(!fieldVisible(field,config))continue;
   const value=config[field.k];
   if(field.t!=='dim'&&empty(value)){
    if(field.required===true||(field.t==='sel'&&field.required!==false)){err=field.l+' is required.';break;}
    continue;
   }
   if(field.t==='sel'){
    const option=field.o.find(value=>value[0]===config[field.k]);
    if(!option){err='Invalid option for '+field.l+'.';break;}
    sp.push(field.l+': '+option[0]);
    if(option[2])L.push([field.l+': '+option[0]+(option[1]==='p'?` (${option[2]}% of base)`:''),chargeAmount(option[1],option[2],base,qty,area)]);
   }else if(field.t==='txt'){
    if(typeof value!=='string'||value.length>(field.maxLength??4000)||(field.required&&!value.trim())){err='Invalid text for '+field.l+'.';break;}
    sp.push(field.l+': '+value);
   }else if(field.t==='num'){
    if(!finite(value)||(field.min!==undefined&&value<field.min)||(field.max!==undefined&&value>field.max)||(field.integer&&!Number.isSafeInteger(value))){err='Invalid numeric value for '+field.l+'.';break;}
    sp.push(field.l+': '+value);
   }
  }
  if(!err)for(const charge of product.charges||[])if(matches(charge.when,config))L.push([charge.label,chargeAmount(charge.type,charge.amount,base,qty,area)]);
  const sub=err?0:safeMoney(L.reduce((sum,row)=>sum+row[1],0)),tax=product.taxMode==='exempt'?0:product.tax;
  const gst=err?0:safeMoney(product.taxMode==='inclusive'?sub-Math.round(sub*100/(100+tax)):Math.round(sub*tax/100));
  const taxable=product.taxMode==='inclusive'?sub-gst:sub,grand=product.taxMode==='inclusive'?sub:safeMoney(sub+gst);
  return{err,qty,L,sp,base,sub,tax,taxMode:product.taxMode??'exclusive',eff:qty?Math.round(sub/qty):0,gst,taxable,grand};
 }catch(error){err=error.message;}}
 return{err,qty:Number.isSafeInteger(qty)?qty:0,L:[],sp:[],base:0,sub:0,tax:product?.tax??0,eff:0,gst:0,taxable:0,grand:0};
}
function mkItem(product,config,id,notes){
 const result=calc(product,config);if(result.err)return null;
 return{id:id||uid(),pid:product.id,name:product.name,code:product.code,unit:product.unit||'item',qty:result.qty,L:result.L,sp:result.sp,sub:result.sub,base:result.base,tax:result.tax,taxMode:result.taxMode,notes:notes||'',cfg:clone(config)};
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
return{ST:Object.freeze(ST),TERMS:Object.freeze(TERMS),AF,SZ:Object.freeze(SZ),METHODS,TAX_MODES,seed,companyDetails,defCfg,calc,mkItem,totals,fieldVisible,pricingError,R,inr,rs};
});
