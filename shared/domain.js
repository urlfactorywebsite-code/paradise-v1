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
function seed({demo=true}={}){
 const cats=[{id:'c1',name:'Graphic Designing',on:1},{id:'c2',name:'Printing Services',on:1},{id:'c3',name:'Promotional Gifts',on:1}];
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
 const cu=(n,c,p,m,e,g)=>({id:'C'+n,name:n==1?'Ravi Kumar (Demo)':n==2?'Meena S (Demo)':n==3?'Arun Textiles (Demo)':n==4?'Lakshmi N (Demo)':'Sunrise School (Demo)',co:c,person:c.split(' ')[0],mob:m,email:e,addr:'Demo address '+n+', Salem',gstin:g,notes:'Demonstration record',date:'2026-09-0'+n});
 const cust=[cu(1,'Kumar Traders','','9000000001','ravi@demo.example','33DEMO0001A1Z1'),cu(2,'Meena Boutique','','9000000002','meena@demo.example',''),cu(3,'Arun Textiles','','9000000003','arun@demo.example','33DEMO0003C1Z3'),cu(4,'Lakshmi Bakery','','9000000004','lakshmi@demo.example',''),cu(5,'Sunrise School','','9000000005','office@demo.example','')];
 const mk=(pid,c)=>mkItem(prods.find(p=>p.id===pid),Object.assign(defCfg(prods.find(p=>p.id===pid)),c));
 const qd=(i,cid,st,items,n,by)=>({id:'Q'+i,no:`DP/QTN/2026/${String(i).padStart(4,'0')}`,date:addD(today(),-n),valid:addD(today(),15-n),cid,sales:by,ref:'DEMO',project:'Demo project '+i,subject:'Quotation (demonstration data)',req:'',items,chargeTax:18,disc:{t:'p',v:i==1?5:0},del:i==2?500:0,oth:0,status:st,terms:clone(TERMS),by,hist:[{f:'—',t:'Draft',d:now(),u:by}].concat(st=='Draft'?[]:[{f:'Draft',t:st,d:now(),u:by}])});
 const qs=[qd(1,'C1','Sent to Customer',[mk('p1',{qty:500,mat:'Textured Paper',sides:'Double Side',edge:'Rounded Edge'}),mk('p3',{qty:500})],0,'Priya'),
 qd(2,'C2','Customer Approved',[mk('p5',{w:10,h:4,u:'ft',qty:2,inst:'Required'}),mk('p6',{w:3,h:2,u:'ft',qty:5})],2,'Karthik'),
 qd(3,'C3','Draft',[mk('p7',{sz:{S:10,M:20,L:30,XL:25,XXL:15},meth:'DTF'})],4,'Priya'),
 qd(4,'C4','Customer Rejected',[mk('p2',{pkg:'Standard'})],9,'Karthik'),
 qd(5,'C5','Expired',[mk('p10',{qty:50}),mk('p8',{qty:200,size:'Medium'})],25,'Priya')];
 return clone({cats,products:prods,customers:demo?cust:[],quotes:demo?qs:[],log:demo?[{t:now(),x:'Demo data loaded',u:'System'}]:[],set:{name:'DESIGN PARADISE',tag:'SALEM · LOVE YOUR BRAND',addr:'[Placeholder] 12 Sample Road, Salem, Tamil Nadu 636001',phone:'+91 00000 00000',email:'hello@example.com',web:'www.example.com',gstin:'[Placeholder GSTIN]',tax:18,prefix:'DP/QTN',valid:15,showNotes:false,terms:clone(TERMS)}});
}
const TERMS=['This quotation is valid until the specified expiry date.','Prices and taxes are based on the specifications listed in this quotation.','Changes to approved specifications or quantities may change the quoted price.','Production timelines are subject to confirmation and approval of final artwork.','Any advance payment or payment schedule must be agreed upon before work begins.','Delivery and installation charges will be applied where applicable and as specified in the quotation.'];
const AF=Object.freeze({ft:1,in:1/144,cm:1/929.0304,m:10.7639104});
function defCfg(product){
  const config={qty:product.tiers?.[0]?.[0]||1,w:4,h:3,u:'ft',sz:Object.fromEntries(SZ.map(size=>[size,0]))};
  for(const field of product.f||[])if(field.t==='sel')config[field.k]=field.o?.[0]?.[0];
  return config;
}

function pricingError(product){
  if(!product||!['unit','area','fixed'].includes(product.m)||!Array.isArray(product.f))return 'Invalid product pricing configuration.';
  if(!nonnegative(product.rate)||!nonnegative(product.min??0)||!nonnegative(product.tax)||product.tax>100)return 'Product prices and tax must be finite, nonnegative values.';
  if(product.m==='unit'){
    if(!Array.isArray(product.tiers)||!product.tiers.length)return 'This product needs quantity pricing tiers.';
    let previous=0;
    for(const tier of product.tiers){
      if(!Array.isArray(tier)||tier.length!==2||!integer(tier[0])||tier[0]<=previous||tier[0]>MAX_QUANTITY||!nonnegative(tier[1]))return 'Invalid quantity pricing tier.';
      previous=tier[0];
    }
  }
  for(const field of product.f){
    if(!field||!['sel','txt','dim'].includes(field.t))return 'Invalid product field.';
    if(field.t==='sel'&&(!Array.isArray(field.o)||!field.o.length||field.o.some(option=>!Array.isArray(option)||typeof option[0]!=='string'||!['f','u','p','a'].includes(option[1])||!nonnegative(option[2]))))return 'Invalid option pricing.';
  }
  return null;
}

function calc(product,config){
  const L=[],sp=[];
  let err=pricingError(product),qty=0,base=0,area=0;
  config=config&&typeof config==='object'?config:{};
  if(!err&&config.qty!==undefined&&(!integer(config.qty)||config.qty<1||config.qty>MAX_QUANTITY))err='Quantity must be a whole number between 1 and 1,000,000.';
  if(!err&&product.sizes){
    const sizes=config.sz;
    if(!sizes||typeof sizes!=='object'||Array.isArray(sizes)||Object.keys(sizes).some(size=>!SZ.includes(size))||SZ.some(size=>sizes[size]!==undefined&&(!integer(sizes[size])||sizes[size]>MAX_QUANTITY)))err='Size quantities must be nonnegative whole numbers.';
    else qty=SZ.reduce((sum,size)=>sum+(sizes[size]??0),0);
  }else if(!err)qty=product.m==='fixed'?1:config.qty;
  if(!err&&(!integer(qty)||qty<1||qty>MAX_QUANTITY))err=product.sizes?'Enter quantities for at least one size, totaling at most 1,000,000.':'Enter a valid whole-number quantity.';
  const minimum=product?.m==='unit'?product.tiers?.[0]?.[0]:1;
  if(!err&&qty<minimum)err=`Minimum order quantity is ${minimum}.`;
  if(!err&&product.m==='area'){
    if(!finite(config.w)||!finite(config.h)||config.w<=0||config.h<=0||config.w>MAX_DIMENSION||config.h>MAX_DIMENSION)err='Enter a width and height greater than zero and at most 10,000.';
    else if(!Object.prototype.hasOwnProperty.call(AF,config.u))err='Select a valid dimension unit.';
    else area=config.w*config.h*AF[config.u];
  }
  if(!err){
    try{
      if(product.m==='unit'){
        const tier=[...product.tiers].reverse().find(row=>qty>=row[0]),rate=R(tier[1]);
        base=safeMoney(rate*qty);
        L.push([`Base: ${qty} × ${inr(rate)} (tier from ${tier[0]})`,base]);
      }else if(product.m==='area'){
        const rate=R(product.rate);
        base=safeMoney(Math.round(rate*area*qty));
        L.push([`Area: ${area.toFixed(2)} sq ft × ${qty} × ${inr(rate)}`,base]);
        const minimumCharge=safeMoney(R(product.min??0));
        if(base<minimumCharge){L.push([`Minimum order charge adjustment (min ${inr(minimumCharge)})`,minimumCharge-base]);base=minimumCharge;}
      }else{
        base=safeMoney(R(product.rate));
        if(base)L.push(['Fixed fee',base]);
      }
      if(product.m==='area')sp.push(`Size: ${config.w} × ${config.h} ${config.u}`);
      if(product.sizes)sp.push('Sizes: '+SZ.filter(size=>config.sz[size]).map(size=>size+' '+config.sz[size]).join(', '));
      for(const field of product.f){
        if(field.t==='sel'){
          const option=field.o.find(value=>value[0]===config[field.k]);
          if(!option){err='Invalid option for '+field.l+'.';break;}
          sp.push(field.l+': '+option[0]);
          if(option[2]){
            const amount=safeMoney(option[1]==='f'?R(option[2]):option[1]==='u'?Math.round(R(option[2])*qty):option[1]==='p'?Math.round(base*option[2]/100):Math.round(R(option[2])*area*qty));
            L.push([field.l+': '+option[0]+(option[1]==='p'?` (${option[2]}% of base)`:''),amount]);
          }
        }else if(field.t==='txt'&&config[field.k]){
          if(typeof config[field.k]!=='string'){err='Invalid text for '+field.l+'.';break;}
          sp.push(field.l+': '+config[field.k]);
        }
      }
      const sub=err?0:safeMoney(L.reduce((sum,row)=>sum+row[1],0));
      const gst=err?0:safeMoney(Math.round(sub*product.tax/100));
      return{err,qty,L,sp,base,sub,tax:product.tax,eff:qty?Math.round(sub/qty):0,gst};
    }catch(error){err=error.message;}
  }
  return{err,qty:Number.isSafeInteger(qty)?qty:0,L:[],sp:[],base:0,sub:0,tax:product?.tax??0,eff:0,gst:0};
}

function mkItem(product,config,id,notes){
  const result=calc(product,config);
  if(result.err)return null;
  return{id:id||uid(),pid:product.id,name:product.name,qty:result.qty,L:result.L,sp:result.sp,sub:result.sub,base:result.base,tax:product.tax,notes:notes||'',cfg:clone(config)};
}

// Allocate integer paise exactly. Stable largest remainder avoids negative final
// lines when individually rounded discounts consume more than the total discount.
function allocateDiscount(items,discount,subtotal){
  if(!subtotal||!discount)return items.map(()=>0);
  const divisor=BigInt(subtotal),amount=BigInt(discount);
  const allocations=items.map((item,index)=>{
    const numerator=amount*BigInt(item.sub);
    return{index,value:Number(numerator/divisor),remainder:numerator%divisor};
  });
  let left=discount-allocations.reduce((sum,row)=>sum+row.value,0);
  const ordered=[...allocations].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
  for(const row of ordered){if(left===0)break;row.value++;left--;}
  return allocations.map(row=>row.value);
}

function totals(quote,settings={}){
  if(!quote||!Array.isArray(quote.items))throw new TypeError('Quotation items are required.');
  const items=quote.items;
  for(const item of items){
    if(!item||!integer(item.sub)||!integer(item.base)||item.base>item.sub||!integer(item.qty)||item.qty<1||!nonnegative(item.tax)||item.tax>100)throw new TypeError('Invalid quotation item amount, quantity, or tax.');
  }
  const isub=safeMoney(items.reduce((sum,item)=>sum+item.sub,0)),ib=safeMoney(items.reduce((sum,item)=>sum+item.base,0));
  const discount=quote.disc||{t:'f',v:0};
  if(!['p','f'].includes(discount.t)||!finite(discount.v))throw new TypeError('Invalid discount.');
  let disc=discount.t==='p'?Math.round(isub*discount.v/100):R(discount.v);
  if(!Number.isSafeInteger(disc))throw new RangeError('Discount exceeds the supported range.');
  const warn=disc>isub||disc<0;
  disc=Math.min(Math.max(disc,0),isub);
  const allocations=allocateDiscount(items,disc,isub);
  const rows=items.map((item,index)=>({r:item.tax,t:item.sub-allocations[index]}));
  if(!nonnegative(quote.del??0)||!nonnegative(quote.oth??0))throw new TypeError('Additional charges must be finite, nonnegative values.');
  const qc=safeMoney(R(quote.del??0)+R(quote.oth??0));
  if(qc){
    const chargeTax=quote.chargeTax??settings.tax??0;
    if(!nonnegative(chargeTax)||chargeTax>100)throw new TypeError('Invalid tax on additional charges.');
    rows.push({r:chargeTax,t:qc});
  }
  const groups=new Map();
  for(const row of rows)groups.set(row.r,safeMoney((groups.get(row.r)||0)+row.t));
  const br=[...groups].sort((a,b)=>a[0]-b[0]).map(([r,t])=>({r,t,x:safeMoney(Math.round(t*r/100))}));
  const gst=safeMoney(br.reduce((sum,row)=>sum+row.x,0)),taxable=safeMoney(isub-disc+qc);
  return{n:items.length,qty:safeMoney(items.reduce((sum,item)=>sum+item.qty,0)),isub,ib,ic:isub-ib,disc,warn,qc,taxable,gst,br,grand:safeMoney(taxable+gst)};
}

return{ST:Object.freeze(ST),TERMS:Object.freeze(TERMS),AF,SZ:Object.freeze(SZ),seed,defCfg,calc,mkItem,totals,R,inr,rs};
});
