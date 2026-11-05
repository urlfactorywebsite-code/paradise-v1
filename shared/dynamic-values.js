(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.DynamicValues=value;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const TYPES=Object.freeze(['text','number','dropdown','multi_select','date','checkbox','textarea']);
 const choices=type=>type==='dropdown'||type==='multi_select';
 const empty=value=>value===null||value===undefined||value===''||Array.isArray(value)&&!value.length;
 function normalize(field,value,previous){
  const error=message=>{throw new Error(field.label+': '+message);};
  if(empty(value)) {if(field.isRequired)error('a value is required.');return null;}
  if(field.fieldType==='checkbox'){if(typeof value!=='boolean')error('choose a valid checkbox value.');if(field.isRequired&&!value)error('this checkbox is required.');return value;}
  if(field.fieldType==='number'){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1000000000)error('enter a finite number between -1000000000 and 1000000000.');return value;}
  if(field.fieldType==='date'){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)error('enter a valid date.');return value;}
  if(choices(field.fieldType)){
   const values=field.fieldType==='multi_select'?value:[value],old=Array.isArray(previous)?previous:[previous];
   if(!Array.isArray(values)||values.length>100||new Set(values).size!==values.length||values.some(key=>typeof key!=='string'))error('choose unique valid options.');
   const available=field.options||[],retained=field.retainedOptions||[];
   for(const key of values)if(!available.some(option=>option.value===key&&option.isActive&&!option.archivedAt)&&!(old.includes(key)&&[...available,...retained].some(option=>option.value===key)))error('an option is unavailable.');
   return field.fieldType==='multi_select'?[...values]:values[0];
  }
  if(!['text','textarea'].includes(field.fieldType)||typeof value!=='string'||value.length>(field.configuration?.maxLength||4000)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))error('enter valid text within the length limit.');
  if(field.isRequired&&!value.trim())error('a value is required.');
  return value;
 }
 return Object.freeze({TYPES,choices,empty,normalize});
});
