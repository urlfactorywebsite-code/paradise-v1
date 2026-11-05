'use strict';
const crypto=require('node:crypto');
const {requirePermission,hasPermission}=require('./access');
const {fail,id}=require('./validation');
const {integer}=require('./queries');
const {normalizeLogo,MAX_LOGO_BYTES}=require('./customer-category-logos');
const columns='id,name,slug,is_other AS "isOther",active,display_order AS "order",discount_percentage::text AS "discountPercentage",highlight_message AS "highlightMessage",highlight_enabled AS "highlightEnabled",logo_storage_key AS "logoStorageKey",created_at AS "createdAt",updated_at AS "updatedAt",archived_at AS "archivedAt",version';
function text(value,label,max,required=false){if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fail('Invalid '+label+'.');const s=value.trim();if(required&&!s)fail(label+' is required.');return s;}
function percentage(value){
 const source=typeof value==='number'&&Number.isFinite(value)?String(value):value;
 if(typeof source!=='string'||!/^\d{1,3}(?:\.\d{1,2})?$/.test(source))fail('Discount percentage must have at most two decimal places.');
 const [whole,fraction='']=source.split('.'),basisPoints=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(basisPoints>10000)fail('Discount percentage must be between 0 and 100.');
 return (Math.floor(basisPoints/100))+'.'+String(basisPoints%100).padStart(2,'0');
}
function limits(){const value=process.env.CUSTOMER_CATEGORY_HIGHLIGHT_MAX_LENGTH||'1000';if(!/^\d+$/.test(value)||Number(value)<1||Number(value)>4000)throw Error('CUSTOMER_CATEGORY_HIGHLIGHT_MAX_LENGTH must be an integer from 1 to 4000.');return {highlightMaxLength:Number(value),logoMaxBytes:MAX_LOGO_BYTES,discountDecimals:2};}
const canReference=user=>['customer.view','customer.create','customer.edit','customer_categories.view','customer_categories.manage'].some(p=>hasPermission(user,p));
const canManageRead=user=>['customer_categories.view','customer_categories.manage'].some(p=>hasPermission(user,p));
const project=row=>({...row,logoUrl:row.logoStorageKey?'/api/customer-category-logos/'+encodeURIComponent(row.logoStorageKey):null});
function normalize(data,old,categoryId,config){
 const value={...old,...data};
 for(const key of ['isOther','logoStorageKey','createdAt','updatedAt','archivedAt','tenantId','tenant_id'])if(Object.hasOwn(data,key))fail('Category ownership and storage metadata are server-managed.');
 const name=text(value.name,'category name',150,true).normalize('NFKC').replace(/\s+/g,' ');
 if(name.length>150)fail('Category name must be at most 150 characters.');
 if(name.toLowerCase()==='other')fail('Other is a special customer free-text option, not a managed category.');
 const generatedSlug=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,100).replace(/^-|-$/g,'')||('category-'+crypto.createHash('sha256').update(categoryId).digest('hex').slice(0,16));
 const slug=text(value.slug===undefined?generatedSlug:value.slug,'category slug',100,true);
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug==='other')fail('Use a unique category slug containing lowercase letters, numbers and hyphens.');
 const active=value.active===undefined?true:value.active,highlightEnabled=value.highlightEnabled===undefined?false:value.highlightEnabled;
 if(typeof active!=='boolean'||typeof highlightEnabled!=='boolean'||data.archived!==undefined&&typeof data.archived!=='boolean')fail('Invalid category flag.');
 // A reduced runtime limit must not strand previously valid configuration.
 // Retain an unchanged saved message; apply the current limit to new text.
 const highlightMessage=text(value.highlightMessage===undefined?'':value.highlightMessage,'highlight message',4000);
 if(highlightMessage.length>config.highlightMaxLength&&highlightMessage!==old?.highlightMessage)fail('Highlight message exceeds the configured maximum length.');
 if(highlightEnabled&&!highlightMessage)fail('Enter a highlight message before enabling it.');
 return {name,slug,active,discountPercentage:percentage(value.discountPercentage===undefined?'0.00':value.discountPercentage),highlightMessage,highlightEnabled};
}
function createCustomerCategories({store,body,json}){
 const config=limits();
 const get=async categoryId=>{const row=await store.db.prepare('SELECT '+columns+' FROM customer_categories WHERE id=? AND NOT is_other').get(categoryId);if(!row)fail('Customer category not found.',404);return row;};
 return async function handle(req,res,url,user){
  const route=url.pathname,asset=/^\/api\/customer-category-logos\/([A-Za-z0-9_-]{1,80})$/.exec(route);
  const match=/^\/api\/customer-categories(?:\/([A-Za-z0-9_-]{1,80})(\/logo)?)?$/.exec(route);
  if(!match&&!asset)return false;
  const send=(status,data)=>{json(res,status,data);return true;};
  if(asset||match?.[2]){
   if(!canReference(user))fail('You do not have permission for this action.',403);
   if(req.method!=='GET')fail('Replace or remove a category logo through its versioned category update.',405);
   const key=asset?.[1]||(await get(match[1])).logoStorageKey;
   const logo=key?await store.db.prepare('SELECT content,mime_type FROM customer_category_logos WHERE id=?').get(key):null;
   if(!logo)fail('Category logo not found.',404);
   res.writeHead(200,{'Content-Type':logo.mime_type,'Content-Length':logo.content.length,'Content-Disposition':'inline; filename="category-logo.png"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});res.end(logo.content);return true;
  }
  const categoryId=match[1];
  if(req.method==='GET'){
   if(!categoryId&&url.searchParams.get('manage')!=='true'){
    if(!canReference(user))fail('You do not have permission for this action.',403);
    const rows=await store.db.prepare('SELECT id,name,is_other AS "isOther",active,display_order AS "order" FROM customer_categories WHERE active AND archived_at IS NULL ORDER BY display_order,id').all();return send(200,{data:rows});
   }
   if(!canManageRead(user))fail('You do not have permission for this action.',403);
   if(categoryId)return send(200,{data:project(await get(categoryId)),limits:config});
   return store.transaction(async()=>{
    const q=url.searchParams.get('q')||'',status=url.searchParams.get('status')||'all';if(q.length>200||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(q))fail('Invalid category search.');if(!['all','active','inactive','archived'].includes(status))fail('Invalid category status filter.');
    const page=integer(url.searchParams.get('page'),1,1000000),pageSize=integer(url.searchParams.get('pageSize'),25,100),where=['NOT is_other'],values=[];
    if(q){where.push("name ILIKE ? ESCAPE '\\'");values.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');}
    if(status==='active')where.push('active AND archived_at IS NULL');if(status==='inactive')where.push('NOT active AND archived_at IS NULL');if(status==='archived')where.push('archived_at IS NOT NULL');
    const clause=' WHERE '+where.join(' AND '),total=(await store.db.prepare('SELECT count(*) AS n FROM customer_categories'+clause).get(...values)).n;
    const rows=await store.db.prepare('SELECT '+columns+' FROM customer_categories'+clause+' ORDER BY display_order,lower(name),id LIMIT ? OFFSET ?').all(...values,pageSize,(page-1)*pageSize);
    return send(200,{data:rows.map(project),pagination:{page,pageSize,total,totalPages:Math.ceil(total/pageSize)},limits:config});
   });
  }
  requirePermission(user,'customer_categories.manage');
  if(!(req.method==='POST'&&!categoryId||['PATCH','PUT','DELETE'].includes(req.method)&&categoryId))fail('Method not allowed.',405);
  const input=await body(req),data=input.data||input;if(!data||typeof data!=='object'||Array.isArray(data))fail('Invalid customer category.');
  const savedId=id(categoryId||(data.id===undefined?crypto.randomUUID():data.id));if(categoryId&&data.id!==undefined&&data.id!==categoryId)fail('Category ID does not match.');
  if(req.method==='DELETE'&&(data.logoDataUrl!==undefined||data.removeLogo!==undefined))fail('Archive the category without logo changes.');
  if(data.removeLogo!==undefined&&typeof data.removeLogo!=='boolean')fail('Invalid logo removal flag.');if(data.logoDataUrl&&data.removeLogo)fail('Choose replacement or removal of the logo.');
  const logo=data.logoDataUrl===undefined?null:await normalizeLogo(data.logoDataUrl);
  let saved;
  try{
   await store.mutate(user,async()=>{
    const old=categoryId?await get(categoryId):null;
    if(old){if(!Number.isInteger(input.version)||input.version<1)fail('A current category version is required.',428);if(old.version!==input.version)fail('This category changed in another session. Reload before saving.',409);}
    else if(await store.db.prepare('SELECT id FROM customer_categories WHERE id=?').get(savedId))fail('Customer category already exists.',409);
    const value=req.method==='DELETE'?{...old}:normalize(data,old,savedId,config),now=new Date().toISOString();
    const archived=req.method==='DELETE'||data.archived===true?now:data.archived===false?null:old?.archivedAt||null;
    if(archived)value.active=false;
    await store.db.prepare('INSERT INTO customer_categories(id,name,slug,is_other,active,display_order,discount_percentage,highlight_message,highlight_enabled,created_at,updated_at,archived_at,version) VALUES(?,?,?,FALSE,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,active=excluded.active,discount_percentage=excluded.discount_percentage,highlight_message=excluded.highlight_message,highlight_enabled=excluded.highlight_enabled,updated_at=excluded.updated_at,archived_at=excluded.archived_at,version=excluded.version').run(savedId,value.name,value.slug,value.active,old?.order??100,value.discountPercentage,value.highlightMessage,value.highlightEnabled,old?.createdAt||now,now,archived,(old?.version||0)+1);
    if(logo){const key=crypto.randomUUID();await store.db.prepare('INSERT INTO customer_category_logos(id,category_id,mime_type,content,sha256,width,height,created_at) VALUES(?,?,?,?,?,?,?,?)').run(key,savedId,logo.mime,logo.content,logo.sha256,logo.width,logo.height,now);await store.db.prepare('UPDATE customer_categories SET logo_storage_key=? WHERE id=?').run(key,savedId);}
    else if(data.removeLogo)await store.db.prepare('UPDATE customer_categories SET logo_storage_key=NULL WHERE id=?').run(savedId);
    await store.audit(user,old?'customer_category.updated':'customer_category.created','customer_categories',savedId,{message:archived?'Archived customer category':old?'Updated customer category':'Created customer category'});
    saved=project(await get(savedId));
   },undefined,{requiredPermission:'customer_categories.manage'});
  }catch(error){if(error.code==='23505')fail('A category already uses that name or slug.',409);throw error;}
  return send(categoryId?200:201,{data:saved,version:saved.version,limits:config});
 };
}
module.exports={createCustomerCategories,percentage,limits};
