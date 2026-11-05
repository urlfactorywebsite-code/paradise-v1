'use strict';
const {fail}=require('./validation');
const {hasPermission,requirePermission}=require('./access');
const Filters=require('../shared/quotation-filters');
const {scopeQuery}=require('./quotation-export');
const PAGE_SIZES=[10,20,30,40];
function parameters(search,user){
 if(!hasPermission(user,'quotation.view_all'))requirePermission(user,'quotation.view_own');
 const input=Object.create(null);for(const [key,value]of search){if(Object.hasOwn(input,key))fail('Duplicate pagination or filter parameter.');input[key]=value;}
 const integer=(value,fallback)=>{if(value===undefined)return fallback;if(!/^[1-9]\d{0,8}$/.test(value))fail('Invalid pagination parameter.');return Number(value);};
 const page=integer(input.page,1),pageSize=integer(input.pageSize,10);delete input.page;delete input.pageSize;
 if(!PAGE_SIZES.includes(pageSize))fail('Rows per page must be 10, 20, 30 or 40.');
 let filters;try{filters=Filters.normalize(input);}catch(error){fail(error.message);}
 if(filters.customerCategory)requirePermission(user,'customer.view');
 return {page,pageSize,filters};
}
async function quotationPage(store,search,user){
 const spec=parameters(search,user),scope=scopeQuery({scope:'filtered',filters:spec.filters},user);
 return store.db.readTransaction(async()=>{
  const {total}=await store.db.prepare(`SELECT count(*) AS total FROM (${scope.sql}) scoped`).get(...scope.values);
  const totalPages=Math.max(1,Math.ceil(total/spec.pageSize)),page=Math.min(spec.page,totalPages);
  // Retain the workspace's canonical position ordering, with an immutable tie breaker.
  const customerColumns=hasPermission(user,'customer.view')?"c.name,coalesce(c.body::jsonb->>'co','') AS company":"'' AS name,'' AS company";
  // Keep wide JSON bodies out of the offset sort. Hydrate only the bounded IDs.
  const records=await store.db.prepare(`WITH page_ids AS MATERIALIZED (SELECT q.id,q.position FROM (${scope.sql}) scoped JOIN quotations q ON q.id=scoped.id ORDER BY q.position,q.id LIMIT ? OFFSET ?) SELECT q.id,q.body,q.total,${customerColumns} FROM page_ids p JOIN quotations q ON q.id=p.id LEFT JOIN customers c ON c.id=q.customer_id ORDER BY p.position,p.id`).all(...scope.values,spec.pageSize,(page-1)*spec.pageSize);
  const data=records.map(row=>({...JSON.parse(row.body),items:[],hist:[]})),byId=new Map(data.map(q=>[q.id,q]));
  if(data.length){
   const ids=data.map(q=>q.id),slots=ids.map(()=>'?').join(',');
   // Batch child records rather than calling store.get once per quotation.
   for(const [table,key]of [['quotation_items','items'],['quotation_history','hist']]){
    const children=await store.db.prepare(`SELECT quotation_id,body FROM ${table} WHERE quotation_id IN (${slots}) ORDER BY quotation_id,position`).all(...ids);
    for(const row of children)byId.get(row.quotation_id)[key].push(JSON.parse(row.body));
   }
  }
  const display=Object.fromEntries(records.map(row=>[row.id,{total:row.total,customer:{name:row.name||'',co:row.company}}]));
  return {data,display,filters:spec.filters,pagination:{page,pageSize:spec.pageSize,total,totalPages,from:total?(page-1)*spec.pageSize+1:0,to:Math.min(page*spec.pageSize,total)}};
 });
}
module.exports={quotationPage,parameters,PAGE_SIZES};
