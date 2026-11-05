(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CustomerCategories=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function basisPoints(value){
  const s=typeof value==='number'&&Number.isFinite(value)?String(value):value;
  if(typeof s!=='string'||!/^\d{1,3}(?:\.\d{1,2})?$/.test(s))throw new TypeError('Use a category percentage from 0 to 100 with at most two decimal places.');
  const [whole,fraction='']=s.split('.'),points=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(points>10000)throw new RangeError('Category percentage must be from 0 to 100.');return points;
 }
 function percentage(value){const points=basisPoints(value);return Math.floor(points/100)+'.'+String(points%100).padStart(2,'0');}
 function amount(subtotal,value){if(!Number.isSafeInteger(subtotal)||subtotal<0)throw new RangeError('Invalid category discount subtotal.');return Number((BigInt(subtotal)*BigInt(basisPoints(value))+5000n)/10000n);}
 function snapshot(customer,categories){
  const category=(categories||[]).find(c=>c.id===customer?.categoryId&&!c.isOther);
  if(!category)return null;
  return {id:category.id,name:category.name,logoStorageKey:category.logoStorageKey||null,highlightEnabled:Boolean(category.active&&!category.archivedAt&&category.highlightEnabled),highlightMessage:category.highlightMessage||'',discountPercentage:category.active&&!category.archivedAt?percentage(category.discountPercentage??'0.00'):null};
 }
 function resolve(quotation,source,customer,categories){
  if(quotation.discountSource!==undefined&&!['category','manual'].includes(quotation.discountSource))throw new TypeError('Invalid quotation discount source.');
  if(quotation._applyCategoryDiscount!==undefined&&typeof quotation._applyCategoryDiscount!=='boolean')throw new TypeError('Invalid category discount refresh flag.');
  const same=source?.cid===quotation.cid,refresh=quotation._applyCategoryDiscount===true;
  if(refresh&&source&&source.status!=='Draft')throw new TypeError('Duplicate this quotation to apply current category settings.');
  const category=same&&!refresh?source.categorySnapshot:snapshot(customer,categories);
  const eligible=typeof category?.discountPercentage==='string';
  let mode=quotation.discountSource??(same?source.discountSource:eligible?'category':undefined);
  if(refresh){if(!eligible)throw new TypeError('This customer has no active managed category discount.');mode='category';}
  // A customer's old automatic discount cannot follow them to an unrelated category.
  if(!same&&!eligible&&mode==='category')mode=undefined;
  if(mode==='category'&&!eligible)throw new TypeError('This quotation has no saved category discount. Apply current category settings to its draft first.');
  const clearAutomatic=!same&&source?.discountSource==='category'&&!eligible&&quotation.discountSource!=='manual';
  return {categorySnapshot:category,discountSource:mode,disc:mode==='category'?{t:'p',v:Number(category.discountPercentage)}:clearAutomatic?{t:'p',v:0}:quotation.disc};
 }
 function highlight(quotation){const category=quotation?.categorySnapshot;return category?.highlightEnabled&&typeof category.highlightMessage==='string'&&category.highlightMessage.trim()?{name:category.name,message:category.highlightMessage}:null;}
 function discountLabel(quotation){return quotation?.discountSource==='category'&&typeof quotation.categorySnapshot?.discountPercentage==='string'?quotation.categorySnapshot.name+' category discount ('+quotation.categorySnapshot.discountPercentage+'%)':null;}
 return {snapshot,highlight,basisPoints,percentage,amount,resolve,discountLabel};
});
