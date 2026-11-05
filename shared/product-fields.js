(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.ProductFieldDisplay=value;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clone=value=>structuredClone(value);
 function present(product,fields,controls=false,previous={}){
  const result=clone(product),bindings=new Map(fields.filter(field=>field.native).map(field=>[field.native.key,field]));
  result.f=(result.f||[]).map(field=>{
   const definition=bindings.get(field.k);if(!definition)return field;
   // Renaming a field must not expose historically private/internal content.
   if(field.internal_only||/(?:internal|private|staff)/i.test(field.k+' '+field.l)||/^(?:notes|design requirements|additional requirements)$/i.test(field.l))field.internal_only=true;
   field.l=definition.label;const all=[...definition.options,...(definition.retainedOptions||[])];
   if(field.o){field.optionMeta={...(field.optionMeta||{})};for(const [index,option] of all.entries()){const key=definition.native.optionValues[option.value];if(key===undefined)continue;const meta=field.optionMeta[key]={...(field.optionMeta[key]||{}),label:option.label,order:index};const old=Array.isArray(previous[field.k])?previous[field.k]:[previous[field.k]];if(controls&&(!option.isActive||option.archivedAt)&&!old.includes(key))meta.enabled=false;}
    const order=new Map(all.map((option,index)=>[definition.native.optionValues[option.value],index]));field.o.sort((a,b)=>(order.get(a[0])??10000)-(order.get(b[0])??10000));}
   return field;
  }).sort((a,b)=>(bindings.get(a.k)?.displayOrder??10000)-(bindings.get(b.k)?.displayOrder??10000));
  return result;
 }
 return Object.freeze({present});
});
