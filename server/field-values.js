'use strict';
const {isDeepStrictEqual:equal}=require('node:util');
const Values=require('../shared/dynamic-values');
const own=(value,key)=>Object.hasOwn(value,key);
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
function carry(result,input,previous){
 if(own(input,'customFields')||own(previous||{},'customFields'))result.customFields=structuredClone(input.customFields===undefined?previous?.customFields:input.customFields);
 if(previous?.customFieldSnapshots)result.customFieldSnapshots=structuredClone(previous.customFieldSnapshots);
}
async function normalizeState(db,state,previous,options={}){
 const pending=[];
 for(const [collection,page] of [['customers','customers'],['quotes','quotations']]){
  const old=new Map(previous[collection].map(record=>[record.id,record]));
  for(const record of state[collection]){
   const saved=old.get(record.id);
   if(saved&&equal(record.customFields,saved.customFields))continue;
   if(collection==='quotes'&&saved&&saved.status!=='Draft')fail('Custom fields on a finalized quotation cannot be changed.',409);
   // Only the canonical duplicate endpoint supplies a trusted source. A new
   // quotation payload cannot confer permission to select an archived value.
   pending.push({record,saved:saved||(collection==='quotes'?options.duplicateSources?.get(record.id):null),page});
  }
 }
 if(!pending.length)return;
 const resolved=await require('./dynamic-fields').resolveFields(db,[...new Set(pending.map(item=>item.page))]);
 for(const {record,saved,page} of pending)normalizeRecord(record,saved,resolved[page].filter(field=>field.policy==='configurable'));
}
function normalizeRecord(record,saved,definitions){
  const values=record.customFields===undefined?{}:record.customFields;
  if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>500)fail('Invalid custom field values.');
  const byRoot=new Map(definitions.map(field=>[field.rootFieldId,field]));
  for(const [rootId,value] of Object.entries(saved?.customFields||{}))if(!own(values,rootId)&&(!byRoot.get(rootId)?.isActive||!byRoot.get(rootId)?.isVisible))values[rootId]=structuredClone(value);
  const snapshots={};
  for(const [rootId,value] of Object.entries(values)){
   const field=byRoot.get(rootId),oldValue=saved?.customFields?.[rootId],oldSnapshot=saved?.customFieldSnapshots?.[rootId];
   if(oldSnapshot&&equal(value,oldValue)){snapshots[rootId]=structuredClone(oldSnapshot);continue;}
   if(!field||!field.isActive||!field.isVisible)fail('A custom field is unavailable.');
   const previous=Array.isArray(oldValue)?oldValue:[oldValue],configured=[...field.options,...field.retainedOptions];
   // A whole-field scope override may omit old choices. Only server-owned
   // snapshots of values still stored on this record can retain those choices.
   const retained=(oldSnapshot?.options||[]).filter(option=>previous.includes(option.value)&&!configured.some(current=>current.value===option.value)).map(option=>({...option,isActive:false,retained:true}));
   const definition=retained.length?{...field,retainedOptions:[...field.retainedOptions,...retained]}:field;
   try{values[rootId]=Values.normalize(definition,value,oldValue);}catch(error){fail(error.message);}
   const selected=Array.isArray(values[rootId])?values[rootId]:[values[rootId]],options=[...configured,...retained];
   snapshots[rootId]={fieldId:field.id,rootFieldId:rootId,qualifiedKey:field.qualifiedKey,label:field.label,fieldType:field.fieldType,version:field.version,
    options:options.filter(option=>selected.includes(option.value)).map(option=>({value:option.value,label:option.archivedAt&&oldSnapshot?.options?.find(old=>old.value===option.value)?.label||option.label}))};
  }
  for(const field of definitions)if(field.isActive&&field.isVisible&&field.isRequired&&!own(values,field.rootFieldId))fail(field.label+': a value is required.');
  if(Object.keys(values).length||record.customFields!==undefined){record.customFields=values;record.customFieldSnapshots=snapshots;}
}
module.exports={carry,normalizeState,normalizeRecord};
