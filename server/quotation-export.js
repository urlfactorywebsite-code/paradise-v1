'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pipeline}=require('node:stream/promises');
const {fail,id}=require('./validation'),{hasPermission,requirePermission}=require('./access');
const Filters=require('../shared/quotation-filters');
const MAX_ROWS=50000,MAX_BYTES=100*1024*1024,MAX_SELECTED=1000,MAX_CONCURRENT=2;
const columns=[
 ['number','Quotation number','quotation'],['date','Quotation date','quotation'],['customer','Customer','quotation'],['company','Company','quotation'],['total','Total (INR, including GST)','quotation'],['status','Status','quotation'],['salesperson','Salesperson','quotation'],['validUntil','Valid until','quotation'],['reference','Customer reference number','quotation'],
 ['customerName','Customer name','customer'],['companyName','Company name','customer'],['contactPerson','Contact person','customer'],['contactPersonNumber','Contact person number','customer'],['mobile','Mobile number','customer'],['whatsapp','WhatsApp number','customer'],['email','Email address','customer'],['gstin','GSTIN','customer'],['customerCategory','Customer category','customer'],['billingAddress','Billing address','customer'],['deliveryAddress','Delivery addresses (combined)','customer']
].map(([key,label,group])=>({key,label,group}));
const defaults={quotation:['number','date','customer','company','total','status','salesperson','validUntil'],customer:['customerName','companyName','contactPerson','contactPersonNumber','mobile','email','customerCategory','billingAddress','deliveryAddress'],custom:['number','date','customer','total','status']};
function authorize(user){if(!hasPermission(user,'quotation.view_all'))requirePermission(user,'quotation.view_own');}
function available(user){return columns.filter(c=>c.group!=='customer'||hasPermission(user,'customer.view'));}
function validate(input,user){
 authorize(user);
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid export request.');
 for(const key of Object.keys(input))if(!['type','scope','columns','filters','selectedIds','quotationWise'].includes(key))fail('Unknown export setting.');
 const {type='quotation',scope='filtered',quotationWise=false}=input;
 if(!['quotation','customer','custom'].includes(type)||!['selected','filtered','all'].includes(scope)||typeof quotationWise!=='boolean')fail('Invalid export type or scope.');
 if(type==='customer')requirePermission(user,'customer.view');
 if(quotationWise&&type!=='customer')fail('Quotation-wise customer export requires Customer Details.');
 let filters;try{filters=Filters.normalize(input.filters===undefined?{}:input.filters);}catch(e){fail(e.message);}
 if(filters.customerCategory)requirePermission(user,'customer.view');
 const chosen=input.columns===undefined?defaults[type]:input.columns;
 if(!Array.isArray(chosen)||!chosen.length||chosen.length>columns.length||new Set(chosen).size!==chosen.length)fail('Select one or more unique export columns.');
 for(const key of chosen){const column=columns.find(c=>c.key===key);if(!column)fail('Unsupported export column.');if(column.group==='customer')requirePermission(user,'customer.view');if(type==='quotation'&&column.group!=='quotation')fail('Use Customer Details or Custom Field Selection for customer-detail columns.');if(type==='customer'&&column.group!=='customer'&&!(quotationWise&&key==='number'))fail('Customer Details supports customer columns only.');}
 const selected=input.selectedIds===undefined?[]:input.selectedIds;
 if(!Array.isArray(selected)||selected.length>MAX_SELECTED||new Set(selected).size!==selected.length)fail('Select at most 1,000 unique quotations.');
 selected.forEach(id);
 if(scope==='selected'&&!selected.length)fail('Select at least one quotation.');
 return {type,scope,quotationWise,columns:chosen,filters:scope==='filtered'?filters:{},selectedIds:scope==='selected'?selected:[]};
}
function scopeQuery(spec,user){
 const f=spec.filters,conditions=[],values=[],add=(sql,value)=>{conditions.push(sql);values.push(value);};
 if(!hasPermission(user,'quotation.view_all'))add('q.owner_id=?',user.id);
 if(spec.scope==='selected'){conditions.push('q.id IN ('+spec.selectedIds.map(()=>'?').join(',')+')');values.push(...spec.selectedIds);}
 for(const [key,column]of [['status','q.status'],['salesperson','q.salesperson'],['customer','q.customer_id'],['from','q.date'],['to','q.date'],['customerCategory','c.category_id']])if(f[key])add(column+(['from','to'].includes(key)?key==='from'?'>=?':'<=?':'=?'),f[key]);
 for(const [key,op]of [['min','>='],['max','<=']])if(f[key])add('q.total'+op+'?',Filters.amount(f[key]));
 if(f.product)add('EXISTS (SELECT 1 FROM quotation_items i WHERE i.quotation_id=q.id AND i.product_id=?)',f.product);
 if(f.q){
  // Match list search fields only, with literal wildcard handling. No internal notes.
  const term='%'+f.q.toLowerCase().replace(/[\\%_]/g,'\\$&')+'%';
  const customer=hasPermission(user,'customer.view')?"coalesce(c.name,''),coalesce(c.body::jsonb->>'co',''),coalesce(c.mobile,'')":"'','',''";
  conditions.push(`lower(concat_ws(' ',q.number,${customer})||coalesce((SELECT ' '||string_agg(coalesce(i.body::jsonb->>'name',''),' ' ORDER BY i.position,i.id) FROM quotation_items i WHERE i.quotation_id=q.id),'')) LIKE ? ESCAPE '\\'`);
  values.push(term);
 }
 return {sql:`SELECT q.id,q.customer_id FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id${conditions.length?' WHERE '+conditions.join(' AND '):''}`,values};
}
function selectionSQL(spec,scope){
 const dedupe=spec.type==='customer'&&!spec.quotationWise;
 const projection=dedupe?'SELECT DISTINCT customer_id AS id,customer_id FROM scoped':'SELECT id,customer_id FROM scoped';
 return `WITH scoped AS (${scope.sql}),selected AS (${projection})`;
}
async function counts(store,spec,user){
 const scope=scopeQuery(spec,user),prefix=selectionSQL(spec,scope);
 const row=await store.db.prepare(`${prefix} SELECT (SELECT count(*) FROM scoped) AS quotations,(SELECT count(*) FROM selected) AS rows`).get(...scope.values);
 if(spec.scope==='selected'&&row.quotations!==spec.selectedIds.length)fail('One or more selected quotations are unavailable.',404);
 if(row.rows>MAX_ROWS)fail('CSV export exceeds 50,000 rows. Narrow the filters.');
 return {...row,prefix,values:scope.values};
}
const money=value=>{const n=BigInt(value||0);return String(n/100n)+'.'+String(n%100n).padStart(2,'0');};
const formattedDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4):value||'';
function csvCell(value){let s=String(value??'');if(/^[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\ufeff]*[=+@-]/u.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
const csvLine=row=>row.map(csvCell).join(',')+'\r\n';
function rowSQL(spec,count){
 const dedupe=spec.type==='customer'&&!spec.quotationWise;
 // Project only whitelisted values, never hydrate quotation histories or pricing.
 const fields={number:'q.number',date:'q.date',customer:"coalesce(nullif(q.body::jsonb->'customerSnapshot'->>'name',''),c.name,'')",company:"coalesce(q.body::jsonb->'customerSnapshot'->>'co',c.body::jsonb->>'co','')",total:'q.total::text',status:'q.status',salesperson:'q.salesperson',validUntil:'q.valid_until',reference:"q.body::jsonb->>'ref'",customerName:'c.name',companyName:"c.body::jsonb->>'co'",contactPerson:"c.body::jsonb->>'person'",contactPersonNumber:'c.contact_person_phone',mobile:'c.mobile',whatsapp:"c.body::jsonb->>'wa'",email:'c.email',gstin:"c.body::jsonb->>'gstin'",customerCategory:"CASE WHEN cc.is_other THEN c.custom_category_name ELSE cc.name END",billingAddress:"c.body::jsonb->>'addr'",deliveryAddress:`(SELECT string_agg(concat_ws(', ',a.label,a.line1,nullif(a.line2,''),nullif(a.city,''),nullif(a.state,''),nullif(a.postal_code,''),a.country),E'\n' ORDER BY a.is_default DESC,a.created_at,a.id) FROM customer_delivery_addresses a WHERE a.customer_id=c.id AND NOT a.archived)`};
 return `${count.prefix} SELECT s.id AS cursor,${spec.columns.map(k=>fields[k]+' AS "'+k+'"').join(',')} FROM selected s ${dedupe?'':'JOIN quotations q ON q.id=s.id'} LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN customer_categories cc ON cc.id=c.category_id WHERE s.id>? ORDER BY s.id LIMIT 500`;
}
function createQuotationExport({store,body,json}){
 const active=new Map();
 return async(req,res,url,user)=>{
  if(!url.pathname.startsWith('/api/quotation-export'))return false;
  if(url.pathname==='/api/quotation-export/options'&&req.method==='GET'){
   authorize(user);if(url.search)fail('Export options do not accept parameters.');
   json(res,200,{columns:available(user),defaults,maxRows:MAX_ROWS,maxSelected:MAX_SELECTED,maxBytes:MAX_BYTES,maxConcurrent:MAX_CONCURRENT});return true;
  }
  if(!['/api/quotation-export/preview','/api/quotation-export/csv'].includes(url.pathname)||req.method!=='POST')fail('Unknown export endpoint.',404);
  if(url.search)fail('Export filters must be supplied in the request body.');
  const spec=validate(await body(req),user);
  if(url.pathname.endsWith('/preview')){
   const count=await store.db.readTransaction(()=>counts(store,spec,user));
   json(res,200,{rows:count.rows,quotations:count.quotations,scope:spec.scope,filters:spec.filters,maxRows:MAX_ROWS});return true;
  }
  // Stage bounded CSV privately so validation/size/DB errors never produce a
  // successful-looking partial download. Both DB reads share one MVCC snapshot.
  if(active.has(user.id)||active.size>=MAX_CONCURRENT)fail('An export is already running or export capacity is busy. Retry after it finishes.',429);
  const job=Symbol('quotation export');active.set(user.id,job);
  const release=()=>{if(active.get(user.id)===job)active.delete(user.id);};
  // Release on response completion, before potentially slower disk cleanup.
  // A previous job's finally must never release a newer job for the same user.
  res.once('finish',release);
  let directory,handle;
  try{
   directory=await fs.promises.mkdtemp(path.join(os.tmpdir(),'dp-quotation-export-'));
   const filename=path.join(directory,'export.csv');
   await fs.promises.chmod(directory,0o700);handle=await fs.promises.open(filename,'wx',0o600);
   let bytes=0;
   const write=async text=>{bytes+=Buffer.byteLength(text);if(bytes>MAX_BYTES)fail('CSV export exceeds 100 MiB. Narrow the filters.');await handle.writeFile(text);};
   const count=await store.db.readTransaction(async()=>{
    const result=await counts(store,spec,user),sql=rowSQL(spec,result);let cursor='';
    await write('\ufeff'+csvLine(spec.columns.map(k=>columns.find(c=>c.key===k).label)));
    while(true){
     if(req.aborted||res.destroyed)throw Error('Export request closed.');
     const rows=await store.db.prepare(sql).all(...result.values,cursor);if(!rows.length)break;
     for(const row of rows)await write(csvLine(spec.columns.map(k=>k==='total'?money(row[k]):['date','validUntil'].includes(k)?formattedDate(row[k]):row[k])));
     cursor=rows.at(-1).cursor;
    }
    return result;
   });
   await handle.close();handle=null;
   await store.audit(user,'quotations.exported','quotes','',{scope:spec.scope,type:spec.type,rows:count.rows,quotations:count.quotations,columns:spec.columns});
   res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="'+(spec.type==='customer'?'customer-details':'quotation-details')+'.csv"','Content-Length':bytes,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   await pipeline(fs.createReadStream(filename),res);return true;
  }finally{try{try{await handle?.close();}finally{if(directory)await fs.promises.rm(directory,{recursive:true,force:true});}}finally{res.removeListener('finish',release);release();}}
 };
}
module.exports={createQuotationExport,validate,scopeQuery,csvCell,formattedDate,money,MAX_ROWS,MAX_SELECTED,MAX_BYTES,MAX_CONCURRENT};
