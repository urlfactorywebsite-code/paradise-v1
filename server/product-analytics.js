'use strict';
const DP=require('../shared/domain');
const {date,id,fail}=require('./validation');
const {hasPermission,requirePermission}=require('./access');
const {workspaceTimezone,workspaceToday}=require('./dashboard');
const MAX_PRODUCTS=50,MAX_MONTHS=60,OPTION_LIMIT=500;
const scalar=['from','to','year','month','customerId','employeeId','status','metric','grouping'];
function parseFilters(params,user){
 const all=hasPermission(user,'reports.view_all');if(!all)requirePermission(user,'reports.view_own');
 for(const key of params.keys())if(![...scalar,'productIds','categoryIds'].includes(key))fail('Unknown product analytics parameter.');
 for(const key of scalar)if(params.getAll(key).length>1||params.has(key)&&!params.get(key))fail('Invalid '+key+' filter.');
 const ids=key=>{const values=params.getAll(key).flatMap(value=>value.split(','));if(values.length>MAX_PRODUCTS)fail('Select at most 50 '+key+'.');values.forEach(id);return [...new Set(values)].sort();};
 const productIds=ids('productIds'),categoryIds=ids('categoryIds'),year=params.get('year'),month=params.get('month');
 if(year&&(!/^\d{4}$/.test(year)||Number(year)<1000))fail('Year must contain four digits from 1000 through 9999.');
 if(month&&(!/^\d{1,2}$/.test(month)||Number(month)<1||Number(month)>12))fail('Month must be from 1 through 12.');
 const timezone=workspaceTimezone(),defaultYear=year||(params.get('from')||params.get('to')||workspaceToday(timezone)).slice(0,4);
 const from=date(params.get('from')||defaultYear+'-01-01'),to=date(params.get('to')||defaultYear+'-12-31');
 if(from>to)fail('From date must not be after to date.');
 const start=Number(from.slice(0,4))*12+Number(from.slice(5,7))-1,end=Number(to.slice(0,4))*12+Number(to.slice(5,7))-1;
 if(end-start>=MAX_MONTHS)fail('Choose a date range of at most 60 calendar months.');
 const periods=[];for(let n=start;n<=end;n++){const y=Math.floor(n/12),m=n%12+1;if((!year||y===Number(year))&&(!month||m===Number(month)))periods.push(String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0'));}
 for(const key of ['customerId','employeeId'])if(params.get(key))id(params.get(key));
 if(!all&&params.get('employeeId')&&params.get('employeeId')!==user.id)fail('Only your own employee report is permitted.',403);
 const status=params.get('status')||null;if(status&&!DP.ST.includes(status))fail('Invalid quotation status.');
 const metric=params.get('metric')||'quotationCount',grouping=params.get('grouping')||'month';
 if(!['quotationCount','quantity','quotedValue'].includes(metric))fail('Invalid product analytics metric.');
 if(grouping!=='month')fail('Only monthly grouping is supported.');
 return {from,to,year:year?Number(year):null,month:month?Number(month):null,productIds,categoryIds,customerId:params.get('customerId')||null,employeeId:params.get('employeeId')||null,status,metric,grouping,periods,timezone,scope:all?'all':'own'};
}
function eligible(filters,user,dates=true){
 const clauses=[],values=[],add=(sql,value)=>{clauses.push(sql);values.push(value);};
 if(filters.scope==='own')add('q.owner_id=?',user.id);
 if(filters.customerId)add('q.customer_id=?',filters.customerId);
 if(filters.employeeId)add('q.owner_id=?',filters.employeeId);
 if(filters.status)add('q.status=?',filters.status);
 if(dates){add('q.date>=?',filters.from);add('q.date<=?',filters.to);if(filters.year)add('substring(q.date,1,4)=?',String(filters.year));if(filters.month)add('substring(q.date,6,2)=?',String(filters.month).padStart(2,'0'));}
 for(const [ids,column] of [[filters.productIds,'i.product_id'],[filters.categoryIds,'a.category_id']])if(ids.length){clauses.push(`${column} IN (${ids.map(()=>'?').join(',')})`);values.push(...ids);}
 return {sql:`SELECT q.id AS quotation_id,q.date,q.number,i.id AS item_id,i.position,i.product_id,i.quantity,i.body::jsonb->>'name' AS name,a.gross_value,a.category_id,a.category_name,a.category_basis
 FROM quotations q JOIN quotation_items i ON i.quotation_id=q.id JOIN quotation_item_analytics a ON a.quotation_id=i.quotation_id AND a.item_id=i.id${clauses.length?' WHERE '+clauses.join(' AND '):''}`,values};
}
function number(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<0)fail('Report totals exceed the supported numeric range. Narrow the filters.');return n;}
async function options(db,user,scope){
 const where=scope==='own'?' WHERE owner_id=?':'',values=scope==='own'?[user.id]:[];
 // Keep wide quotation bodies out of the materialized history. Read snapshots
 // only for the latest permitted customer/employee records, after the limit.
 const rows=await db.prepare(`WITH scoped AS (SELECT id,owner_id,customer_id,date,number FROM quotations${where}),
 lines AS (SELECT i.product_id,i.body::jsonb->>'name' AS name,q.date,q.number,q.id,i.id AS item_id,i.position,a.category_id,a.category_name FROM quotation_items i JOIN scoped q ON q.id=i.quotation_id JOIN quotation_item_analytics a ON a.quotation_id=i.quotation_id AND a.item_id=i.id)
 SELECT jsonb_build_object(
 'products',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT DISTINCT ON (product_id) product_id AS id,name AS label FROM lines ORDER BY product_id,date DESC,lines.number DESC,lines.id,position,item_id LIMIT 501)x),
 'categories',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT DISTINCT ON (category_id) category_id AS id,category_name AS label FROM lines WHERE category_id IS NOT NULL ORDER BY category_id,date DESC,lines.number DESC,lines.id,position,item_id LIMIT 501)x),
 'customers',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT latest.customer_id AS id,coalesce(nullif(q.body::jsonb->'customerSnapshot'->>'name',''),latest.customer_id) AS label FROM (SELECT DISTINCT ON (customer_id) customer_id,id FROM scoped ORDER BY customer_id,date DESC,number DESC,id LIMIT 501) latest JOIN quotations q ON q.id=latest.id ORDER BY latest.customer_id)x),
 'employees',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT latest.owner_id AS id,coalesce(nullif(q.body::jsonb->>'by',''),latest.owner_id) AS label FROM (SELECT DISTINCT ON (owner_id) owner_id,id FROM scoped WHERE owner_id IS NOT NULL ORDER BY owner_id,date DESC,number DESC,id LIMIT 501) latest JOIN quotations q ON q.id=latest.id ORDER BY latest.owner_id)x),
 'years',(SELECT coalesce(jsonb_agg(year),'[]') FROM (SELECT DISTINCT substring(date,1,4) AS year FROM scoped ORDER BY year DESC LIMIT 501)x)) AS data`).get(...values);
 const truncated={};for(const key of ['products','categories','customers','employees','years']){truncated[key]=rows.data[key].length>OPTION_LIMIT;rows.data[key]=rows.data[key].slice(0,OPTION_LIMIT);}
 return {...rows.data,truncated};
}
async function productPerformance(store,params,user){
 const filters=parseFilters(params,user);
 if(!store.db.inTransaction)return store.db.readTransaction(()=>productPerformance(store,params,user));
 const db=store.db,query=eligible(filters,user),universe=eligible(filters,user,!filters.productIds.length);
 const products=await db.prepare(`WITH eligible AS (${universe.sql}),dated AS (SELECT *,date>=? AND date<=? AND substring(date,1,7)=ANY(?::text[]) AS included FROM eligible)
 SELECT product_id AS id,(array_agg(name ORDER BY included DESC,date DESC,number DESC,quotation_id,position,item_id))[1] AS label,
 coalesce((array_agg(DISTINCT name) FILTER (WHERE included))[1:20],(array_agg(DISTINCT name))[1:20]) AS names,
 CASE WHEN bool_or(included) THEN count(DISTINCT name) FILTER (WHERE included)>20 ELSE count(DISTINCT name)>20 END AS "namesTruncated"
 FROM dated GROUP BY product_id ORDER BY product_id LIMIT 51`).all(...universe.values,filters.from,filters.to,filters.periods);
 if(products.length>MAX_PRODUCTS)throw Object.assign(Error('More than 50 products match. Select products or narrow the filters.'),{status:422,code:'PRODUCT_SERIES_LIMIT',details:{options:await options(db,user,filters.scope)}});
 const monthly=await db.prepare(`WITH eligible AS (${query.sql}) SELECT substring(date,1,7) AS period,product_id AS "productId",count(DISTINCT quotation_id) AS "quotationCount",count(*) AS "lineItemCount",sum(quantity)::text AS quantity,sum(gross_value)::text AS "quotedValue",(array_agg(DISTINCT name))[1:20] AS names FROM eligible GROUP BY substring(date,1,7),product_id ORDER BY period,product_id`).all(...query.values);
 const total=await db.prepare(`WITH eligible AS (${query.sql}) SELECT count(DISTINCT quotation_id) AS "quotationCount",count(*) AS "lineItemCount",coalesce(sum(quantity),0)::text AS quantity,coalesce(sum(gross_value),0)::text AS "quotedValue",count(DISTINCT (quotation_id,product_id)) AS "productQuotationCount",count(*) FILTER (WHERE category_basis='migration-current') AS "legacyCategoryLines",count(*) FILTER (WHERE category_basis='unknown') AS "unknownCategoryLines" FROM eligible`).get(...query.values);
 for(const row of monthly)for(const key of ['quotationCount','lineItemCount','quantity','quotedValue'])row[key]=number(row[key]);
 for(const key of Object.keys(total))total[key]=number(total[key]);
 const cells=new Map(monthly.map(row=>[row.productId+'/'+row.period,row]));
 const series=products.map(product=>({productId:product.id,values:filters.periods.map(period=>cells.get(product.id+'/'+period)?.[filters.metric]||0)}));
 const {periods,timezone,scope,...appliedFilters}=filters;
 return {periods,products,series,monthly,totals:total,appliedFilters,options:await options(db,user,scope),scope,timezone,currency:'INR',moneyUnit:'paise',quantityDefinition:'Quantities use the saved line units; mixed product units are not converted.',valueDefinition:'Product value including GST after the quotation discount; excludes separate quotation delivery and other charges.',limits:{maxProducts:MAX_PRODUCTS,maxMonths:MAX_MONTHS,optionLimit:OPTION_LIMIT}};
}
module.exports={productPerformance,parseFilters};
