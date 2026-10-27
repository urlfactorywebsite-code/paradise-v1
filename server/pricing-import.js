'use strict';
const crypto=require('node:crypto');
const DP=require('../shared/domain'),Catalog=require('../shared/catalog'),Readiness=require('../shared/pricing-readiness');
const {fail,validateProduct}=require('./validation'),{requirePermission,hasPermission,canReadPricing}=require('./access');
const HEADERS=['Product','Option','Tier Quantity','Unit Price','GST Rate','Discount Limit','Product Code','Option Code','Pricing Type','Unit of Measure'];
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const clone=value=>structuredClone(value),blank=value=>value===null||value===undefined||value==='';
const approvedTier=p=>p.priceConfigured!==false||p.pricingApproval?.base===true;
const setting=(name,fallback,max)=>{const value=Number(process.env[name]??fallback);if(!Number.isSafeInteger(value)||value<1||value>max)throw new Error('Invalid '+name);return value;};
const limits=()=>({bytes:setting('MAX_PRICING_UPLOAD_BYTES',5*1024*1024,20*1024*1024),rows:setting('MAX_PRICING_ROWS',5000,20000),entries:256,entryBytes:16*1024*1024,expandedBytes:32*1024*1024});
// Compact deterministic references keep workbook columns readable even for long option keys.
const code=(kind,parts)=>kind+':'+crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,32);
const priceUnit=type=>type==='p'?'% of base':type==='a'?'INR/sq ft':['u','q'].includes(type)?'INR/item':'INR/order';
const canonical=(integer,scale=2)=>{const text=String(integer).padStart(scale+1,'0');return text.slice(0,-scale)+'.'+text.slice(-scale);};
function scaled(value,scale=2,max=10000000){
 const text=String(value).trim();if(!/^\d+(?:\.\d+)?$/.test(text))throw Error('Enter a nonnegative literal number.');
 const [whole,fraction='']=text.split('.');if(fraction.length>scale)throw Error('Use at most '+scale+' decimal places.');
 const result=BigInt(whole)*10n**BigInt(scale)+BigInt(fraction.padEnd(scale,'0')||0);
 if(result>BigInt(max)*10n**BigInt(scale))throw Error('Value exceeds the supported limit.');return Number(result);
}
function percent(value,formatted=false){
 if(typeof value==='string'&&value.trim().endsWith('%'))return scaled(value.trim().slice(0,-1),2,100);
 return formatted?scaled(value,4,1):scaled(value,2,100);
}
function targets(raw,settings){
 const p=DP.resolveProduct(raw,settings),list=[],approved=raw.priceConfigured!==false;
 if(p.m!=='tier'&&!(p.m==='unit'&&p.tiers?.length))list.push({code:'BASE',name:'Base price',kind:'base',type:p.m,unit:p.m==='area'?'INR/sq ft':p.m==='unit'?'INR/item':'INR/order',amount:p.rate,configured:approved||raw.pricingApproval?.base===true});
 if(['unit','tier'].includes(p.m))list.push({code:'TIER',name:'Quantity tier',kind:'tier',type:'tier',unit:'INR/item'});
 for(const f of p.f||[]){
  for(const o of f.o||[])list.push({code:code('OPTION',[f.k,o[0]]),name:f.l+': '+DP.optionLabel(f,o[0]),kind:'option',field:f.k,value:o[0],type:o[1],unit:priceUnit(o[1]),amount:o[2],configured:DP.optionMeta(f,o[0]).approved!==false&&(approved||DP.optionMeta(f,o[0]).approved===true)});
  if(f.allowCustom&&f.customCharge)list.push({code:code('CUSTOM',[f.k]),name:f.l+': Custom value',kind:'custom',field:f.k,type:f.customCharge.type,unit:priceUnit(f.customCharge.type),amount:f.customCharge.amount,configured:f.customCharge.approved===true});
  for(const s of f.sizes||[])list.push({code:code('SIZE',[f.k,s.key]),name:f.l+': '+s.label,kind:'size',field:f.k,value:s.key,type:'u',unit:'INR/item',amount:s.price,configured:s.price!==undefined&&(approved||raw.pricingApproval?.base===true)});
 }
 for(const [index,c]of (p.charges||[]).entries())list.push({code:code('CHARGE',[index,c.label,c.type,c.when||null]),name:c.label,kind:'charge',index,type:c.type,unit:priceUnit(c.type),amount:c.amount,configured:approved});
 return{product:p,targets:list};
}
async function workbook(state){
 const ExcelJS=require('exceljs');
 const book=new ExcelJS.Workbook();book.creator='Design Paradise';book.created=new Date();
 const instructions=book.addWorksheet('Instructions',{views:[{showGridLines:false}]}),pricing=book.addWorksheet('Product Pricing',{views:[{state:'frozen',ySplit:1,xSplit:2,showGridLines:false}]}),products=book.addWorksheet('Product Reference',{views:[{state:'frozen',ySplit:1,showGridLines:false}]}),options=book.addWorksheet('Option Reference',{views:[{state:'frozen',ySplit:1,showGridLines:false}]});
 const notes=[
  ['Design Paradise price import','Edit approved business prices, review the upload preview, then explicitly confirm. Import never activates products.'],
  ['Source','Current authorized catalog; generated '+new Date().toISOString()+'. Currency: INR.'],
  ['Editable fields','Unit Price, GST Rate, Discount Limit and applicable Tier Quantity. Leave identifiers, Pricing Type and Unit of Measure unchanged.'],
  ['Intended rows','Remove rows you do not intend to update. Every remaining row needs a Unit Price, including an explicit 0 for an approved free rate. Blank prices are unconfigured, never zero.'],
  ['Product mapping','Product Code identifies the existing product. Product/Option names are informative; review resolved database names in the preview.'],
  ['Option mapping','Option Code identifies an existing field option, custom charge, size surcharge or conditional charge. New products/options and changed charge bases are not imported.'],
  ['Quantity tiers','Use Option Code TIER only on existing unit/tier products. Repeat rows with distinct positive whole-number breakpoints; omitted tiers remain. New boundaries must meet minimum quantity and the resulting tiers must cover it.'],
  ['Prices and units','Use up to two decimal places and the existing reference unit. Area base rates are per square foot. f/u/p/a/q retain their existing charge meaning. Percent-based option amounts are percentage points.'],
  ['GST percentage','Enter 18 for 18%, 0 for an approved zero rate. Literal 18% or Excel percentage cells are accepted. Blank retains the current value and does not approve pending GST. No default GST is assigned.'],
  ['Discount Limit','Existing company-wide employee percentage ceiling, not a per-product discount. Filled rows must agree. Blank preserves it. Changes additionally require Settings management; the fixed discount cap remains unchanged.'],
  ['Approval and availability','Numeric imported rates are approved by authorized pricing staff. Existing disabled options remain disabled. Pending base/GST approval is tracked independently until all required configuration is complete.'],
  ['Validation','Only .xlsx. No formulas, macros or external links. Unknown identifiers, negative/overprecision amounts, duplicate targets, conflicts and missing values reject the whole import.'],
  ['Upload','Products & Services > Import Prices > select workbook > Validate workbook > review every row > Confirm import. A stale preview requires reupload.'],
  ['Activation','Save configuration and available choices, import approved rates, then review the backend activation checklist in the existing product editor. Activate separately only when eligible.'],
  ['Confidentiality','Reference sheets and existing configured rates are provided only to authorized pricing readers. Uploaded files are not retained.'],
 ];
 instructions.columns=[{width:27},{width:112}];notes.forEach((row,index)=>{const r=instructions.addRow(row);r.height=index===0?44:Math.max(44,Math.ceil(row[1].length/100)*16+12);r.eachCell(cell=>{cell.font={name:'Arial',size:10,color:{argb:'FF26333B'}};cell.alignment={wrapText:true,vertical:'middle'};});r.getCell(1).font={name:'Arial',size:index===0?14:10,bold:true};if(index===0)r.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B5560'}};cell.font={...cell.font,color:{argb:'FFFFFFFF'}};});});
 pricing.columns=HEADERS.map((header,i)=>({header,width:[31,42,18,18,16,18,20,48,18,23][i]}));
 products.columns=['Product Code','Product Name','Category','Assigned Template','Existing Status'].map((header,i)=>({header,width:[20,36,29,25,24][i]}));
 options.columns=['Product Code','Option Code','Option Name','Existing Pricing Basis','Existing Unit of Measure'].map((header,i)=>({header,width:[20,48,48,25,27][i]}));
 for(const raw of state.products){const resolved=targets(raw,state.set),p=resolved.product,assignment=DP.templateAssignment(raw),template=assignment?DP.productTemplate(raw,state.set).name:'Not assigned',taxConfigured=raw.priceConfigured!==false||raw.pricingApproval?.tax===true;
  products.addRow([p.code,p.name,state.cats.find(c=>c.id===p.cat)?.name||'Unknown category',template,p.on?'Active':'Inactive']);
  for(const t of resolved.targets){
   options.addRow([p.code,t.code,t.name,t.type,t.unit]);
   const tiers=t.kind==='tier'?(p.tiers?.length?p.tiers.map(row=>[row[0],approvedTier(raw)?row[1]:null]):p.m==='tier'?[[null,null]]:[]):[[null,t.configured&&typeof t.amount==='number'?t.amount:null]];
   for(const [quantity,amount]of tiers)pricing.addRow([p.name,t.name,quantity,amount,taxConfigured?p.tax:null,state.set.employeeDiscountLimit,p.code,t.code,t.type,t.unit]);
  }
 }
 if(pricing.rowCount>limits().rows+1)fail('Catalog exceeds the configured pricing template row limit. Increase MAX_PRICING_ROWS before exporting.');
 for(const sheet of [pricing,products,options]){
  sheet.getRow(1).height=34;sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(sheet.rowCount,1),column:sheet.columnCount}};
  sheet.eachRow((row,index)=>{let lines=1;row.eachCell(cell=>{lines=Math.max(lines,Math.ceil(cell.text.length/Math.max(10,(sheet.getColumn(cell.col).width||20)-3)));});row.height=index===1?34:Math.max(30,lines*15+8);row.eachCell({includeEmpty:true},cell=>{cell.font={name:'Arial',size:10,color:{argb:index===1?'FFFFFFFF':'FF26333B'},bold:index===1};cell.alignment={vertical:'middle',wrapText:true};if(index===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B5560'}};else if(sheet===pricing&&[3,4,5,6].includes(cell.col))cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF3CD'}};});});
 }
 const last=Math.min(limits().rows+1,Math.max(pricing.rowCount+25,100));
 for(let row=2;row<=last;row++)for(const col of [3,4,5,6]){const cell=pricing.getCell(row,col);cell.numFmt=col===3?'0':'0.00';cell.dataValidation={type:col===3?'whole':'decimal',operator:'between',formulae:col===3?[1,1000000]:[0,col>=5?100:10000000],allowBlank:true,showErrorMessage:true,errorTitle:'Invalid pricing input',error:col===3?'Enter a positive whole-number tier.':'Enter a nonnegative literal number in the supported range.'};}
 return Buffer.from(await book.xlsx.writeBuffer());
}
async function preflight(buffer,bounds=limits()){
 const yauzl=require('yauzl');
 if(buffer.length>bounds.bytes)fail('Workbook exceeds the configured upload size limit.',413);
 if(buffer.length<4||buffer.readUInt32LE(0)!==0x04034b50)fail('Upload a valid .xlsx workbook.',415);
 await new Promise((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true,validateEntrySizes:true,strictFileNames:true},(error,zip)=>{
  if(error)return reject(Object.assign(Error('Malformed XLSX package.'),{status:422}));
  let count=0,expanded=0,done=false;const names=new Set(),finish=error=>{if(done)return;done=true;zip.close();error?reject(Object.assign(Error(error.message||'Unsafe XLSX package.'),{status:error.status||422})):resolve();};
  zip.on('error',()=>finish(Error('Malformed XLSX package.')));zip.on('end',()=>{if(!['[Content_Types].xml','xl/workbook.xml'].every(name=>names.has(name)))return finish(Error('The XLSX workbook structure is incomplete.'));finish();});
  zip.on('entry',async entry=>{try{
   if(++count>bounds.entries||entry.fileName.length>240||names.has(entry.fileName)||/^\/|^[a-z]:|(?:^|\/)\.\.(?:\/|$)|\\|\0/i.test(entry.fileName))throw Error('Unsafe or excessive XLSX entries.');names.add(entry.fileName);
   if(entry.generalPurposeBitFlag&1||![0,8].includes(entry.compressionMethod)||/vbaProject|macro|externalLinks|activeX|embeddings/i.test(entry.fileName))throw Error('Encrypted, macro-enabled or external workbook content is not supported.');
   if(entry.uncompressedSize>bounds.entryBytes||entry.uncompressedSize>1024*1024&&entry.uncompressedSize>Math.max(1,entry.compressedSize)*200)throw Error('Workbook content exceeds safe expansion limits.');
   if(entry.fileName.endsWith('/')){zip.readEntry();return;}
   const content=await new Promise((resolve,reject)=>zip.openReadStream(entry,(error,stream)=>{if(error)return reject(Error('Malformed XLSX entry.'));let size=0;const chunks=[];stream.on('data',chunk=>{size+=chunk.length;expanded+=chunk.length;if(size>bounds.entryBytes||expanded>bounds.expandedBytes)stream.destroy(Error('Workbook content exceeds safe expansion limits.'));else chunks.push(chunk);});stream.on('error',reject);stream.on('end',()=>resolve(Buffer.concat(chunks)));}));
   if(/\.(xml|rels)$/i.test(entry.fileName)){
    const xml=new TextDecoder('utf-8',{fatal:true}).decode(content);
    if(/\0|<!DOCTYPE|<!ENTITY|macroEnabled|vbaProject/i.test(xml)||[...xml.matchAll(/TargetMode\s*=\s*['"]([^'"]*)['"]/gi)].some(match=>match[1].toLowerCase()!=='internal'))throw Error('Macros, external relationships and XML entities are not supported.');
    if(/^xl\/worksheets\//.test(entry.fileName)){
     if((xml.match(/<row(?:\s|>)/g)||[]).length>bounds.rows+1||(xml.match(/<c(?:\s|>)/g)||[]).length>(bounds.rows+1)*20)throw Error('Workbook exceeds the configured row or cell limit.');
     for(const match of xml.matchAll(/<row\b[^>]*\br\s*=\s*["']([^"']+)["']/g))if(!/^\d+$/.test(match[1])||Number(match[1])<1||Number(match[1])>bounds.rows+1)throw Error('Workbook row address exceeds the configured limit.');
     for(const match of xml.matchAll(/<c\b[^>]*\br\s*=\s*["']([^"']+)["']/g))if(!/^[A-T][1-9]\d*$/.test(match[1])||Number(match[1].slice(1))>bounds.rows+1)throw Error('Workbook cell address exceeds the configured limit.');
    }
   }
   zip.readEntry();
  }catch(error){finish(error);}});zip.readEntry();
 }));
}
async function parseWorkbook(buffer){
 await preflight(buffer);const book=new (require('exceljs').Workbook)();try{await book.xlsx.load(buffer);}catch{fail('The spreadsheet could not be parsed. Use an unmodified XLSX structure.',422);}
 const sheet=book.getWorksheet('Product Pricing');if(!sheet)fail('Missing Product Pricing worksheet.');
 const headers=sheet.getRow(1).values.slice(1),indexes=HEADERS.map(name=>headers.indexOf(name)+1);
 if(indexes.some(index=>!index)||headers.some(name=>!HEADERS.includes(name))||new Set(headers).size!==headers.length)fail('Use the required pricing template column headings without missing, extra or duplicate columns.');
 if(sheet.rowCount>limits().rows+1||sheet.columnCount>20||book.worksheets.length>8)fail('Workbook exceeds the configured worksheet, row or column limit.');
 for(const other of book.worksheets)if(other!==sheet)other.eachRow(row=>row.eachCell(cell=>{if(cell.formula||cell.value&&typeof cell.value==='object'&&'formula'in cell.value)fail('Formulas outside the pricing table are not supported.');}));
 const records=[];
 for(let row=2;row<=sheet.rowCount;row++){
  const cells=indexes.map(index=>sheet.getRow(row).getCell(index));if(cells.every(cell=>blank(cell.value)))continue;
  const errors=[],values=cells.map((cell,index)=>{const v=cell.value;if(v!==null&&typeof v==='object'||typeof v==='string'&&v.trim().startsWith('=')){errors.push({field:HEADERS[index],code:'LITERAL_REQUIRED',message:'Use a literal value, not a formula, link or rich cell.'});return null;}if(typeof v==='string'&&v.length>1800){errors.push({field:HEADERS[index],code:'VALUE_TOO_LONG',message:'Cell text is too long.'});return null;}return typeof v==='string'?v.trim():v;});
  records.push({row,values,pricePercentFormat:/%/.test((cells[3].numFmt||'').replace(/"[^"]*"/g,'')),percentFormats:[4,5].map(i=>/%/.test((cells[i].numFmt||'').replace(/"[^"]*"/g,''))),errors});
 }
 if(!records.length)fail('The pricing worksheet has no data rows.');return records;
}
function validateRows(records,state,user){
 const rows=[],errors=[],seen=new Map(),taxes=new Map(),discounts=new Map(),products=new Map(),approvalCompletion=new Map(),normalized=[];
 for(const record of records){const v=record.values,row={rowNumber:record.row,product:String(v[0]??'').slice(0,200),option:String(v[1]??'').slice(0,300),productCode:String(v[6]??'').slice(0,80),optionCode:String(v[7]??'').slice(0,1800),errors:[...(record.errors||[])]};
  const error=(field,code,message)=>row.errors.push({field,code,message});
  const matches=state.products.filter(p=>p.code.toLowerCase()===row.productCode.toLowerCase()),raw=matches.length===1?matches[0]:null;let target,resolved;
  if(!raw)error('Product Code',matches.length?'AMBIGUOUS_PRODUCT':'UNKNOWN_PRODUCT',matches.length?'Product Code is ambiguous. Resolve duplicate catalog codes first.':'Unknown Product Code. Download current references.');
  else{row.product=raw.name;row.productId=raw.id;if(!products.has(raw.id))products.set(raw.id,targets(raw,state.set));resolved=products.get(raw.id);target=resolved.targets.find(t=>t.code===row.optionCode);if(!target)error('Option Code','UNKNOWN_OPTION','Option Code does not belong to this product.');}
  if(target){
   row.option=target.name;row.pricingType=target.type;row.unitOfMeasure=target.unit;
   if(v[8]!==target.type)error('Pricing Type','UNSUPPORTED_PRICING_TYPE','Keep the existing Pricing Type from the reference.');
   if(v[9]!==target.unit)error('Unit of Measure','INVALID_UNIT','Keep the existing pricing unit from the reference.');
   if(target.kind==='tier'){
    if(!/^\d+$/.test(String(v[2]))||Number(v[2])<1||Number(v[2])>1000000)error('Tier Quantity','INVALID_TIER','Tier Quantity must be a positive whole number up to 1000000.');
    else{row.tierQuantity=Number(v[2]);if(row.tierQuantity<(resolved.product.minQty||1)&&!resolved.product.tiers?.some(t=>t[0]===row.tierQuantity))error('Tier Quantity','BELOW_MINIMUM','New tier boundaries must meet the product minimum quantity.');}
   }else if(!blank(v[2]))error('Tier Quantity','UNSUPPORTED_TIER','Only TIER rows accept Tier Quantity.');
   try{if(blank(v[3]))throw Error('Unit Price is required; use explicit 0 only for an approved free rate.');if(target.type==='p')row.priceCents=typeof v[3]==='string'&&v[3].endsWith('%')?scaled(v[3].slice(0,-1)):record.pricePercentFormat?scaled(v[3],4,100000):scaled(v[3]);else{if(record.pricePercentFormat)throw Error('Use an INR amount, not a percentage cell.');row.priceCents=scaled(v[3]);}}catch(e){error('Unit Price','INVALID_PRICE',e.message);}
   for(const [index,key,label]of [[4,'gstHundredths','GST Rate'],[5,'discountHundredths','Discount Limit']])if(!blank(v[index]))try{row[key]=percent(v[index],record.percentFormats?.[index-4]);}catch(e){error(label,index===4?'INVALID_GST':'INVALID_DISCOUNT',e.message);}
   const existing=target.kind==='tier'?resolved.product.tiers?.find(t=>t[0]===row.tierQuantity)?.[1]:target.amount,configured=target.kind==='tier'?existing!==undefined&&approvedTier(raw):target.configured;
   row.existingPrice=configured&&typeof existing==='number'?existing:null;row.newPrice=row.priceCents===undefined?null:row.priceCents/100;
   row.gstRate=row.gstHundredths===undefined?(raw.priceConfigured!==false||raw.pricingApproval?.tax?raw.tax:null):row.gstHundredths/100;
   row.discountLimit=row.discountHundredths===undefined?state.set.employeeDiscountLimit:row.discountHundredths/100;
   if(!approvalCompletion.has(raw.id))approvalCompletion.set(raw.id,raw.priceConfigured===false&&Readiness.eligibility({...raw,priceConfigured:true},state.set,state.cats).eligible);
   const completesApproval=approvalCompletion.get(raw.id);
   row.action=!configured||existing===null?'New':existing!==row.newPrice||row.gstHundredths!==undefined&&(raw.tax!==row.gstRate||raw.priceConfigured===false&&!raw.pricingApproval?.tax)||row.discountLimit!==state.set.employeeDiscountLimit||completesApproval?'Update':'Unchanged';
   const key=JSON.stringify([raw.id,target.code,row.tierQuantity??null]);if(seen.has(key)){error('Option Code','DUPLICATE_TARGET','Duplicate product/option/tier target.');seen.get(key).errors.push({field:'Option Code',code:'DUPLICATE_TARGET',message:'Duplicate product/option/tier target.'});}else seen.set(key,row);
   if(row.gstHundredths!==undefined){const previous=taxes.get(raw.id);if(previous&&previous.value!==row.gstHundredths){error('GST Rate','CONFLICTING_GST','GST values for one product must agree.');previous.row.errors.push({field:'GST Rate',code:'CONFLICTING_GST',message:'GST values for one product must agree.'});}else taxes.set(raw.id,{value:row.gstHundredths,row});}
   if(row.discountHundredths!==undefined){discounts.set(row.discountHundredths,row);if(row.discountLimit!==state.set.employeeDiscountLimit&&!hasPermission(user,'settings.manage'))error('Discount Limit','SETTINGS_PERMISSION','Changing the company-wide discount limit requires Settings management permission.');}
   const values=[raw.name,target.name,row.tierQuantity??null,row.priceCents===undefined?null:canonical(row.priceCents),row.gstHundredths===undefined?null:canonical(row.gstHundredths),row.discountHundredths===undefined?null:canonical(row.discountHundredths),raw.code,target.code,target.type,target.unit];
   normalized.push({row:record.row,values,errors:[]});
  }
  rows.push(row);
 }
 if(discounts.size>1)for(const row of rows)if(row.discountHundredths!==undefined)row.errors.push({field:'Discount Limit',code:'CONFLICTING_DISCOUNT',message:'Discount Limit is company-wide; all filled rows must agree.'});
 if(rows.every(row=>!row.errors.length)){
  const candidate=applyRows(clone(state),{rows});
  for(const productId of new Set(rows.map(row=>row.productId))){const p=candidate.products.find(p=>p.id===productId);let message;
   try{validateProduct(clone(p),candidate.cats,candidate.set);if(p.on||DP.templateAssignment(p)){const fieldErrors=Catalog.additionalFieldErrors(DP.resolveProduct(p,candidate.set),candidate.cats);if(fieldErrors.length)throw Error(fieldErrors.join(' '));}if(p.tiers?.length&&p.tiers[0][0]>(p.minQty||1))throw Error('The resulting tiers must cover the minimum order quantity.');}catch(error){message=error.message;}
   if(message)for(const row of rows.filter(row=>row.productId===productId))row.errors.push({field:'Product',code:'INVALID_CONFIGURATION',message});
  }
 }
 for(const row of rows){row.valid=!row.errors.length;for(const error of row.errors)errors.push({rowNumber:row.rowNumber,product:row.product,option:row.option,...error});}
 const validRows=rows.filter(r=>r.valid),summary={totalRows:rows.length,validRows:validRows.length,invalidRows:rows.length-validRows.length,inserted:validRows.filter(r=>r.action==='New').length,updated:validRows.filter(r=>r.action==='Update').length,unchanged:validRows.filter(r=>r.action==='Unchanged').length,productsAffected:new Set(validRows.filter(r=>r.action!=='Unchanged').map(r=>r.productId)).size,globalDiscountChanged:validRows.some(r=>r.discountHundredths!==undefined&&r.discountLimit!==state.set.employeeDiscountLimit)};
 return{valid:!errors.length,rows,errors,summary,normalized};
}
function applyRows(state,plan){
 const changed=new Map(),addresses=new Map();
 for(const row of plan.rows){if(row.action==='Unchanged')continue;const raw=state.products.find(p=>p.id===row.productId);let p=changed.get(raw.id);if(!p){p=DP.resolveProduct(raw,state.set);p.pricingApproval={base:raw.priceConfigured!==false||raw.pricingApproval?.base===true,tax:raw.priceConfigured!==false||raw.pricingApproval?.tax===true};changed.set(raw.id,p);}
  if(!addresses.has(raw.id))addresses.set(raw.id,new Map(targets(raw,state.set).targets.map(t=>[t.code,t])));
  const t=addresses.get(raw.id).get(row.optionCode),amount=row.priceCents/100;
  if(t.kind==='base'){p.rate=amount;p.pricingApproval.base=true;}
  if(t.kind==='tier'){p.tiers=p.tiers||[];const old=p.tiers.find(t=>t[0]===row.tierQuantity);if(old)old[1]=amount;else p.tiers.push([row.tierQuantity,amount]);p.pricingApproval.base=true;}
  if(t.kind==='option'){const f=p.f.find(f=>f.k===t.field);f.o.find(o=>o[0]===t.value)[2]=amount;f.optionMeta=f.optionMeta||{};f.optionMeta[t.value]={...DP.optionMeta(f,t.value),approved:true};}
  if(t.kind==='custom'){p.f.find(f=>f.k===t.field).customCharge.amount=amount;p.f.find(f=>f.k===t.field).customCharge.approved=true;}
  if(t.kind==='size')p.f.find(f=>f.k===t.field).sizes.find(s=>s.key===t.value).price=amount;
  if(t.kind==='charge')p.charges[t.index].amount=amount;
  if(row.gstHundredths!==undefined){p.tax=row.gstHundredths/100;p.pricingApproval.tax=true;}
  if(row.discountHundredths!==undefined)state.set.employeeDiscountLimit=row.discountHundredths/100;
 }
 for(const [id,p]of changed){if(p.tiers)p.tiers.sort((a,b)=>a[0]-b[0]);const old=state.products.find(p=>p.id===id),raw=DP.stripProduct(p,state.set);if(p.pricingApproval.base&&p.pricingApproval.tax&&Readiness.eligibility({...raw,priceConfigured:true},state.set,state.cats).eligible)p.priceConfigured=true;p.on=old.on;state.products[state.products.findIndex(p=>p.id===id)]=DP.stripProduct(p,state.set);}
 return state;
}
function createPricingImports({store,body,json}){
 const permission=user=>requirePermission(user,'pricing.manage');
 const key=async()=>{const row=await store.db.prepare('SELECT pricing_import_key FROM workspace WHERE id=1').get();if(!row?.pricing_import_key)fail('Complete administrator setup first.',409);return row.pricing_import_key;};
 const sign=(encoded,secret)=>crypto.createHmac('sha256',secret).update('pricing-preview-v1:'+encoded).digest('base64url');
 const decode=async(token,user)=>{if(typeof token!=='string'||token.length>8*1024*1024||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/.test(token))fail('Invalid import preview.',422);const [encoded,signature]=token.split('.'),expected=sign(encoded,await key());if(signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))fail('Invalid or modified import preview.',403);let data;try{data=JSON.parse(Buffer.from(encoded,'base64url').toString());}catch{fail('Invalid import preview.');}if(data.actor!==user.id||data.session!==user.session_id)fail('This preview belongs to another account or session.',403);if(!Number.isSafeInteger(data.expires)||data.expires<Date.now())fail('Import preview expired. Upload the workbook again.',410);if(!Array.isArray(data.records)||!data.records.length||data.records.length>limits().rows||typeof data.id!=='string'||!/^[a-f0-9-]{36}$/.test(data.id))fail('Invalid import preview.');return data;};
 return async(req,res,url,user)=>{
  const path=url.pathname,method=req.method;
  const match=path.match(/^\/api\/products\/([A-Za-z0-9_-]{1,80})\/activation-eligibility$/);
  if(match&&method==='GET'){if(!hasPermission(user,'product.manage')&&!hasPermission(user,'pricing.manage'))fail('Product or pricing management permission is required.',403);const {state,revision}=await store.readPricingCatalog(),p=state.products.find(p=>p.id===match[1]);if(!p)fail('Product not found.',404);json(res,200,{productId:p.id,revision,...Readiness.eligibility(p,state.set,state.cats)});return true;}
  if(!path.startsWith('/api/pricing/imports')&&path!=='/api/pricing/template')return false;
  if(path==='/api/pricing/template'&&method==='GET'){
   if(!canReadPricing(user)||!['product.view','product.manage','pricing.manage'].some(p=>hasPermission(user,p)))fail('Pricing read and catalog access are required.',403);
   const {state}=await store.readPricingCatalog(),content=await workbook(state);res.writeHead(200,{'Content-Type':MIME,'Content-Disposition':'attachment; filename="design-paradise-price-template-'+new Date().toISOString().slice(0,10)+'.xlsx"','Cache-Control':'no-store'});res.end(content);return true;
  }
  permission(user);
  if(path==='/api/pricing/imports/limits'&&method==='GET'){const bounds=limits();json(res,200,{maxUploadBytes:bounds.bytes,maxRows:bounds.rows,previewMinutes:15});return true;}
  if(path==='/api/pricing/imports/preview'&&method==='POST'){
   let filename;try{filename=decodeURIComponent(req.headers['x-file-name']||'');}catch{fail('Invalid workbook file name.');}
   if(!/^[^\\/\u0000-\u001f]{1,200}\.xlsx$/i.test(filename)||(req.headers['content-type']||'').split(';')[0]!==MIME)fail('Upload an .xlsx workbook with the correct content type.',415);
   const bounds=limits();if(Number(req.headers['content-length'])>bounds.bytes){req.resume();fail('Workbook exceeds the configured upload size limit.',413);}let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>bounds.bytes)fail('Workbook exceeds the configured upload size limit.',413);chunks.push(chunk);}const buffer=Buffer.concat(chunks),records=await parseWorkbook(buffer);
   const response=await store.transaction(async()=>{const {state,revision}=await store.readPricingCatalog(),plan=validateRows(records,state,user);
    const result={valid:plan.valid,revision,rows:plan.rows,errors:plan.errors,summary:plan.summary,filename};
    if(plan.valid){const payload={id:crypto.randomUUID(),actor:user.id,session:user.session_id,revision,expires:Date.now()+15*60*1000,filename,fileHash:crypto.createHash('sha256').update(buffer).digest('hex'),records:plan.normalized},encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');if(encoded.length>8*1024*1024-100)fail('Validated preview exceeds the confirmation size limit. Split this workbook into smaller imports.',413);result.previewToken=encoded+'.'+sign(encoded,await key());result.expiresAt=new Date(payload.expires).toISOString();}return result;});json(res,200,response);return true;
  }
  if(path==='/api/pricing/imports/confirm'&&method==='POST'){
   const input=await body(req);if(Object.keys(input).some(key=>key!=='previewToken'))fail('Confirmation accepts only the server preview token.');const payload=await decode(input.previewToken,user);
   const result=await store.transaction(async()=>{
    const actor=await store.db.prepare('SELECT * FROM users WHERE id=?').get(user.id);if(!actor?.active||!(await store.db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires>?').get(user.token_hash,Date.now())))fail('Please sign in again.',401);permission(actor);
    const receipt=await store.db.prepare('SELECT summary FROM pricing_imports WHERE id=?').get(payload.id);if(receipt)return{...JSON.parse(receipt.summary),replayed:true};
    const catalog=await store.readPricingCatalog();if(catalog.revision!==payload.revision)fail('Pricing preview is stale. Upload and review the workbook again.',409);const plan=validateRows(payload.records,catalog.state,actor);if(!plan.valid)throw Object.assign(Error('Import validation failed; no rates were changed.'),{status:422,details:{errors:plan.errors}});
    const changes=plan.rows.map(row=>({productId:row.productId,productCode:row.productCode,optionCode:row.optionCode,tierQuantity:row.tierQuantity??null,oldPrice:row.existingPrice,newPrice:row.newPrice,gstRate:row.gstRate,discountLimit:row.discountLimit,action:row.action}));
    const changed=plan.summary.inserted||plan.summary.updated;
    if(changed)await store.mutate(user,state=>applyRows(state,plan),payload.revision);
    const at=new Date().toISOString(),summary={id:payload.id,actorId:actor.id,actorName:actor.name,at,filename:payload.filename,result:'Applied',...plan.summary,productsActivated:0};
    await store.db.prepare('INSERT INTO pricing_imports(id,actor_id,created_at,file_name,file_hash,summary,changes) VALUES(?,?,?,?,?,?,?)').run(payload.id,user.id,at,payload.filename,payload.fileHash,JSON.stringify(summary),JSON.stringify(changes));
    await store.audit(actor,'pricing.imported','pricing_import',payload.id,{filename:payload.filename,inserted:summary.inserted,updated:summary.updated,unchanged:summary.unchanged,productsActivated:0});return summary;
   });json(res,200,result);return true;
  }
  if(path==='/api/pricing/imports'&&method==='GET'){const page=Number(url.searchParams.get('page')||1);if(!Number.isSafeInteger(page)||page<1||page>100000)fail('Invalid import history page.');const rows=await store.db.prepare('SELECT summary,actor_id FROM pricing_imports ORDER BY created_at DESC,id LIMIT 20 OFFSET ?').all((page-1)*20);json(res,200,{data:rows.map(row=>{const summary=JSON.parse(row.summary);return{...summary,actorId:summary.actorId||row.actor_id};}),page,pageSize:20});return true;}
  const history=path.match(/^\/api\/pricing\/imports\/([a-f0-9-]{36})$/);if(history&&method==='GET'){const row=await store.db.prepare('SELECT summary,changes,actor_id FROM pricing_imports WHERE id=?').get(history[1]);if(!row)fail('Import not found.',404);const summary=JSON.parse(row.summary);json(res,200,{...summary,actorId:summary.actorId||row.actor_id,changes:JSON.parse(row.changes)});return true;}
  fail('Pricing endpoint not found.',404);
 };
}
module.exports={HEADERS,MIME,limits,scaled,percent,targets,workbook,preflight,parseWorkbook,validateRows,applyRows,createPricingImports};
