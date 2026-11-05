'use strict';
const {isDeepStrictEqual:equal}=require('node:util'),DP=require('../shared/domain'),Display=require('../shared/product-fields'),Values=require('./field-values');
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
async function normalizeItems(db,state,previous,options={}){
 const pending=[],oldQuotes=new Map(previous.quotes.map(q=>[q.id,q]));
 for(const q of state.quotes){
  const old=oldQuotes.get(q.id),source=old||options.duplicateSources?.get(q.id),items=new Map((source?.items||[]).map(i=>[i.id,i]));
  for(const item of q.items){
   const candidate=items.get(item.id),saved=candidate?.pid===item.pid?candidate:null;
   if(old&&saved&&equal(item,saved))continue;
   if(old&&old.status!=='Draft'&&!equal(item.customFields,candidate?.customFields))fail('Custom selections on a finalized quotation cannot be changed.',409);
   pending.push({q,item,saved,old,sameConfig:Boolean(old&&saved&&equal(item.cfg,saved.cfg)&&!options.refreshQuoteIds?.has(q.id))});
  }
 }
 if(!pending.length)return;
 const configurations=await require('./dynamic-fields').resolveProductFields(db,[...new Set(pending.map(row=>row.item.pid))]);
 for(const {q,item,saved,old,sameConfig} of pending){
  const fields=configurations.get(item.pid)||[];
  if(!fields.some(field=>field.policy==='configurable')&&item.customFields===undefined)continue;
  if(!sameConfig||!saved||!equal(item.customFields,saved.customFields))Values.normalizeRecord(item,saved,fields.filter(field=>field.policy==='configurable'&&!field.native));
  if(!sameConfig){
   for(const field of fields.filter(field=>field.native)){
    const current=item.cfg[field.native.key],selected=Array.isArray(current)?current:[current],previous=saved?.cfg[field.native.key],retained=Array.isArray(previous)?previous:[previous];
    for(const option of field.retainedOptions)if(selected.includes(field.native.optionValues[option.value])&&!retained.includes(field.native.optionValues[option.value]))fail(field.label+': select an available option.');
   }
   item.fieldSnapshot=Display.present({f:item.fieldSnapshot},fields).f;
  }
  item.sp=DP.customerSpecifications(item);
 }
}
module.exports={normalizeItems};
