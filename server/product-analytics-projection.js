'use strict';
const DP=require('../shared/domain');

function projection(quote,settings,catalog,previous=new Map(),migration=false){
 const values=DP.itemQuotedValues(quote,settings),grossValues=DP.itemQuotedGrossValues(quote,settings);
 return quote.items.map((item,index)=>{
  const old=previous.get(item.id),product=catalog.get(item.pid);
  const category=old?.productId===item.pid?old:{categoryId:product?.categoryId||null,categoryName:product?.categoryName||null,categoryBasis:product?.categoryId?(migration?'migration-current':'saved'):'unknown'};
  return {quotationId:quote.id,itemId:item.id,categoryId:category.categoryId,categoryName:category.categoryName,categoryBasis:category.categoryBasis,netValue:values[index],grossValue:grossValues[index]};
 });
}
async function insertProjection(db,rows,withGross=true){
 if(!rows.length)return;
 const column=withGross?',gross_value':'',field=withGross?',"grossValue"':'',type=withGross?',"grossValue" bigint':'';
 await db.prepare(`INSERT INTO quotation_item_analytics(quotation_id,item_id,category_id,category_name,category_basis,net_value${column})
 SELECT "quotationId","itemId","categoryId","categoryName","categoryBasis","netValue"${field} FROM jsonb_to_recordset(?::jsonb)
 AS r("quotationId" text,"itemId" text,"categoryId" text,"categoryName" text,"categoryBasis" text,"netValue" bigint${type})`).run(JSON.stringify(rows));
}
async function backfill(db){
 const workspace=await db.prepare('SELECT settings FROM workspace WHERE id=1').get();
 if(!workspace)return;
 const settings=JSON.parse(workspace.settings),catalog=new Map((await db.prepare('SELECT p.id,p.category_id AS "categoryId",c.name AS "categoryName" FROM products p LEFT JOIN categories c ON c.id=p.category_id').all()).map(row=>[row.id,row]));
 // Bounded keyset batches, not a workspace load or a query per quotation.
 let after=null;
 for(;;){
  const quotes=await db.prepare('SELECT id,body FROM quotations WHERE (?::text IS NULL OR id>?) ORDER BY id LIMIT 50').all(after,after);
  if(!quotes.length)break;
  const items=await db.prepare(`SELECT quotation_id,body FROM quotation_items WHERE quotation_id IN (${quotes.map(()=>'?').join(',')}) ORDER BY quotation_id,position,id`).all(...quotes.map(q=>q.id));
  const byQuote=new Map(quotes.map(q=>[q.id,{...JSON.parse(q.body),id:q.id,items:[]}]));
  for(const item of items)byQuote.get(item.quotation_id).items.push(JSON.parse(item.body));
  await insertProjection(db,[...byQuote.values()].flatMap(q=>projection(q,settings,catalog,new Map(),true)),false);
  after=quotes.at(-1).id;
 }
}
async function backfillGross(db){
 const workspace=await db.prepare('SELECT settings FROM workspace WHERE id=1').get();if(!workspace)return;
 const settings=JSON.parse(workspace.settings);let after=null;
 for(;;){
  const quotes=await db.prepare('SELECT id,body FROM quotations WHERE (?::text IS NULL OR id>?) ORDER BY id LIMIT 50').all(after,after);if(!quotes.length)return;
  const items=await db.prepare(`SELECT quotation_id,body FROM quotation_items WHERE quotation_id IN (${quotes.map(()=>'?').join(',')}) ORDER BY quotation_id,position,id`).all(...quotes.map(q=>q.id));
  const grouped=new Map(quotes.map(q=>[q.id,{...JSON.parse(q.body),id:q.id,items:[]}]));for(const item of items)grouped.get(item.quotation_id).items.push(JSON.parse(item.body));
  const rows=[...grouped.values()].flatMap(q=>{const values=DP.itemQuotedGrossValues(q,settings);return q.items.map((item,index)=>({quotationId:q.id,itemId:item.id,grossValue:values[index]}));});
  if(rows.length)await db.prepare(`UPDATE quotation_item_analytics a SET gross_value=r."grossValue" FROM jsonb_to_recordset(?::jsonb) AS r("quotationId" text,"itemId" text,"grossValue" bigint) WHERE a.quotation_id=r."quotationId" AND a.item_id=r."itemId"`).run(JSON.stringify(rows));
  after=quotes.at(-1).id;
 }
}
module.exports={projection,insertProjection,backfill,backfillGross};
