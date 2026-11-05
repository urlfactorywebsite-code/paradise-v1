/* Shared quotation-list filter contract. Amount inputs are decimal rupees. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.QuotationFilters=factory();})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const keys=['q','status','salesperson','customer','from','to','min','max','customerCategory','product'];
 const statuses=['Draft','Pending Internal Review','Approved Internally','Sent to Customer','Customer Approved','Customer Rejected','Expired','Cancelled'];
 function amount(value){
  if(typeof value!=='string'||!/^\d{1,12}(?:\.\d{1,2})?$/.test(value))throw Error('Amounts must be non-negative rupees with at most two decimal places.');
  const [whole,part='']=value.split('.'),result=Number(BigInt(whole)*100n+BigInt(part.padEnd(2,'0')));
  if(!Number.isSafeInteger(result)||result>10000000000000)throw Error('Quotation amount is too large.');
  return result;
 }
 function normalize(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid quotation filters.');
  const result={};
  for(const key of Object.keys(input)){
   if(!keys.includes(key))throw Error('Unknown quotation filter: '+key+'.');
   const value=input[key];if(typeof value!=='string'||value.length>(key==='salesperson'?500:200)||/[\u0000-\u001f\u007f]/.test(value))throw Error('Invalid '+key+' filter.');
   if(!value)continue;result[key]=value;
  }
  for(const key of ['customer','customerCategory','product'])if(result[key]&&!/^[A-Za-z0-9_-]{1,80}$/.test(result[key]))throw Error('Invalid '+key+' filter.');
  if(result.status&&!statuses.includes(result.status))throw Error('Invalid quotation status.');
  for(const key of ['from','to'])if(result[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(result[key])||!Number.isFinite(Date.parse(result[key]))||new Date(result[key]).toISOString().slice(0,10)!==result[key]))throw Error('Enter a valid '+key+' date.');
  if(result.from&&result.to&&result.from>result.to)throw Error('From date must not be after To date.');
  for(const key of ['min','max'])if(result[key])amount(result[key]);
  if(result.min&&result.max&&amount(result.min)>amount(result.max))throw Error('Minimum amount must not exceed maximum amount.');
  return result;
 }
 function compile(filters){
  const f=normalize(filters),minimum=f.min?amount(f.min):null,maximum=f.max?amount(f.max):null,term=f.q?.toLowerCase();
  return (q,c,total)=>{
   if(f.status&&q.status!==f.status||f.salesperson&&q.sales!==f.salesperson||f.customer&&q.cid!==f.customer||f.from&&q.date<f.from||f.to&&q.date>f.to||minimum!==null&&total<minimum||maximum!==null&&total>maximum||f.customerCategory&&c.categoryId!==f.customerCategory||f.product&&!q.items.some(i=>i.pid===f.product))return false;
   return !term||[q.no,c.name,c.co,c.mob,...q.items.map(i=>i.name)].join(' ').toLowerCase().includes(term);
  };
 }
 function matches(q,c,filters,total){return compile(filters)(q,c,total);}
 return {keys,normalize,amount,matches,compile};
});
