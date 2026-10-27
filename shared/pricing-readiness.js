/* One activation/quote eligibility contract; calculation stays in domain.js. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./domain'):root.DP,typeof module==='object'&&module.exports?require('./catalog'):root.Catalog);if(typeof module==='object'&&module.exports)module.exports=api;else root.PricingReadiness=api;})(typeof globalThis!=='undefined'?globalThis:this,function(DP,Catalog){
'use strict';
const money=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&Number.isSafeInteger(Math.round(value*100));
function eligibility(product,settings={},cats=[]){
 const checks=[],add=(code,label,pass,action)=>checks.push({code,label,pass:!!pass,...(!pass?{action}: {})});
 add('PRODUCT','Product exists',!!product,'Select an existing product.');
 if(!product)return{eligible:false,status:'Blocked',checks,errors:checks.filter(c=>!c.pass)};
 const category=cats.find(c=>c.id===product.cat);add('CATEGORY','Category exists and is active',category?.on,'Review the product category and its active status.');
 let effective;
 try{effective=DP.resolveProduct(product,settings);add('TEMPLATE','Template references are valid',true);}catch(error){add('TEMPLATE','Template references are valid',false,error.message);}
 if(effective){
  const entry=Catalog.manifest.find(e=>Catalog.match(e,{products:[product],cats}).product),configuration=entry?Catalog.readiness(entry,product,{set:settings,cats}).configurationReadiness:null;
  const definition=DP.fieldDefinitionError(effective),specific=Catalog.additionalFieldErrors(effective,cats),configurationErrors=[...(configuration?.missing||[]),...(definition?[definition]:[]),...specific];
  add('CONFIGURATION','Configuration fields and relationships are complete',!configurationErrors.length,[...new Set(configurationErrors)].join(' '));
  add('APPROVAL','Required pricing is configured',product.priceConfigured!==false,'Configure and approve the applicable base rate, GST and required options.');
  const tiered=effective.m==='tier'||effective.m==='unit'&&effective.tiers?.length;
  add('BASE_RATE',tiered?'Applicable tier rates are configured':'Applicable base rate is configured',(tiered?Array.isArray(effective.tiers)&&effective.tiers.length&&effective.tiers.every(t=>money(t[1])):money(effective.rate))&&(product.priceConfigured!==false||product.pricingApproval?.base===true),'Enter explicit approved rates for this product pricing method; blank is not a free rate.');
  add('GST','GST treatment and rate are configured',money(effective.tax)&&effective.tax<=100&&DP.TAX_MODES.includes(effective.taxMode??'exclusive')&&(product.priceConfigured!==false||product.pricingApproval?.tax===true),'Configure the existing GST treatment and a rate from 0 to 100.');
  const definitionPricing=DP.pricingError({...effective,priceConfigured:true});add('PRICING_REFERENCES','Pricing definitions and references are valid',!definitionPricing,definitionPricing||'');
  if(effective.m==='tier'||effective.m==='unit'&&effective.tiers?.length){const tiers=effective.tiers;add('TIERS','Applicable quantity tiers cover the minimum order',Array.isArray(tiers)&&tiers.length&&tiers[0][0]<=(effective.minQty||1),'Configure a valid tier at or below the minimum order quantity.');}
  for(const field of effective.f||[])if(['sel','multi'].includes(field.t)&&(field.required===true||field.t==='sel'&&field.required!==false)){
   const custom=field.allowCustom&&field.customCharge?.approved===true&&money(field.customCharge.amount);
   add('OPTIONS:'+field.k,field.l+' has available approved choices',DP.activeOptions(field).length||custom,'Configure at least one available approved choice for '+field.l+'.');
  }
 }
 const errors=checks.filter(c=>!c.pass),eligible=!errors.length;
 return{eligible,status:eligible?(product.on?'Valid':'Eligible'):'Blocked',active:!!product.on,checks,errors,...(product.on&&!eligible?{warning:'Active product needs pricing/configuration review; its status was preserved.'}:{})};
}
return{eligibility};
});
