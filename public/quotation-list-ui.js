/* All Quotations: shared filter validation and server-authorized CSV exports. */
(() => {
 'use strict';
 const map={q:'q',st:'status',sp:'salesperson',customer:'customer',a:'from',b:'to',mn:'min',mx:'max',category:'customerCategory',product:'product'};
 const labels={q:'Search',st:'Status',sp:'Salesperson',customer:'Customer',a:'From date',b:'To date',mn:'Minimum amount',mx:'Maximum amount',category:'Customer category',product:'Product'};
 const state={owner:'',selected:new Set(),matches:[],frame:0,export:null,preview:0,size:10,request:0,loading:true,error:'',display:{},pages:1};
 const owner=()=>AUTH?.id+':'+CSRF;
 function resetOwner(){if(state.owner!==owner()){state.owner=owner();state.historyOwner=crypto.randomUUID();state.selected.clear();state.matches=[];state.preview++;state.request++;state.size=10;state.focusId=null;state.loading=true;state.error='';listTotal=0;for(const key of Object.keys(map))F[key]='';F.page=1;state.export=null;}}
 function filters(){return QuotationFilters.normalize(Object.fromEntries(Object.entries(map).map(([key,name])=>[name,F[key]||''])));}
 function rows(){
  if(state.loading)return '<tr><td colspan="10" role="status">Loading quotations...</td></tr>';
  if(state.error)return '<tr><td colspan="10" role="alert">'+esc(state.error)+' <button type="button" class="s b2" onclick="QuotationList.retry()">Retry</button></td></tr>';
  return state.matches.map(q=>{const d=state.display[q.id];return `<tr><td class="ql-selection-cell"><input class="ql-check" data-ql-id="${q.id}" type="checkbox" aria-label="Select ${esc(q.no)}" ${state.selected.has(q.id)?'checked':''} onchange="QuotationList.select('${q.id}',this.checked)"></td><td>${esc(q.no)}</td><td>${fd(q.date)}</td><td>${esc(d.customer.name)}</td><td>${esc(String(d.customer.co??'').trim()||'—')}</td><td class="n">${inr(d.total)}</td><td>${esc(q.by)}</td><td>${bg(q.status)}</td><td>${fd(q.valid)}</td><td><button type="button" class="s b2 ql-actions-trigger" aria-label="Actions for ${esc(q.no)}" aria-haspopup="menu" aria-expanded="false" onclick="QuotationList.rowMenu(this,'${q.id}')"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg></button></td></tr>`;}).join('')||'<tr><td colspan="10">No quotations match these filters.</td></tr>';
 }
 function rowMenu(anchor,id){
  if(busy||state.loading||!allowedView('list')||!state.matches.some(q=>q.id===id))return;
  const items=[['View',()=>viewQ(id)]];
  if(can('quotation.edit_all')||can('quotation.edit_own'))items.push(['Edit',()=>editQ(id)]);
  if(can('quotation.create'))items.push(['Duplicate',()=>dupQ(id)]);
  if(can('quotation.download_pdf'))items.push(['PDF',()=>pdfQ(id)]);
  if(can('quotation.share_whatsapp'))items.push(['Share on WhatsApp',()=>shareQuotation(id)]);
  if(can('quotation.status'))items.push(['Status',()=>statusQ(id)]);
  if(can('quotation.delete'))items.push(['Delete',()=>delQ(id),true]);
  productsMenu(anchor,items);
 }
 listPager=function(){
  const page=F.page||1,pages=state.pages,disabled=state.loading||!!state.error||!listTotal;
  const jump=pages<=100?`<select id="ql-page" aria-label="Page" aria-describedby="ql-page-total" ${disabled?'disabled':''} onchange="QuotationList.page(this.value)">${Array.from({length:pages},(_,i)=>`<option value="${i+1}" ${i+1===page?'selected':''}>${i+1}</option>`).join('')}</select>`:`<form class="ql-jump" onsubmit="event.preventDefault();QuotationList.page(this.elements.page.value)"><input id="ql-page" name="page" type="number" aria-label="Page" aria-describedby="ql-page-total" min="1" max="${pages}" step="1" required value="${page}" ${disabled?'disabled':''}><button id="ql-page-go" class="s b2" ${disabled?'disabled':''}>Go</button></form>`;
  return `<span id="ql-range" class="mu" role="status" aria-live="polite">${state.loading?'Loading quotations...':state.error?'Quotation count unavailable':`Showing ${listTotal?(page-1)*state.size+1:0}\u2013${Math.min(page*state.size,listTotal)} of ${listTotal} quotations`}</span><div class="ql-pagination-controls" role="navigation" aria-label="Quotation pagination"><label>Rows per page <select id="ql-page-size" aria-label="Rows per page" onchange="QuotationList.size(this.value)">${[10,20,30,40].map(n=>`<option ${n===state.size?'selected':''}>${n}</option>`).join('')}</select></label><div class="ql-page-choice"><span>Page</span>${jump}<span id="ql-page-total">of ${state.error?'unknown':pages}</span></div><button id="ql-previous" type="button" class="s b2" ${disabled||page<=1?'disabled':''} onclick="QuotationList.page(${page-1})">Previous Page</button><button id="ql-next" type="button" class="s b2" ${disabled||page>=pages?'disabled':''} onclick="QuotationList.page(${page+1})">Next Page</button></div>`;
 };
 function remember(push=false){
  const value={owner:state.historyOwner,filters:Object.fromEntries(Object.keys(map).map(k=>[k,F[k]||''])),page:F.page||1,size:state.size};
  if(JSON.stringify(history.state?.quotationList)===JSON.stringify(value))return;
  history[push?'pushState':'replaceState']({...history.state,quotationList:value},'',location.href);
 }
 function paint(){
  if(location.hash!=='#list'||!$('#tb'))return;
  productsCloseMenu(false);
  const focused=document.activeElement,focusId=focused?.id||focused?.closest('.dp-select')?.querySelector('select')?.id;
  if(focusId&&focused?.closest('#quote-pagination'))state.focusId=focusId;
  $('#tb').innerHTML=rows();$('#tb').setAttribute('aria-busy',String(state.loading));$('#quote-pagination').innerHTML=listPager();
  if(!state.loading&&state.focusId){const id=state.focusId;state.focusId=null;queueMicrotask(()=>{const original=document.getElementById(id),el=original&&!original.disabled?original:document.querySelector('#ql-page:not(:disabled)')||document.querySelector('#ql-page-size:not(:disabled)');if(el&&document.activeElement===document.body)(el.closest('.dp-select')?.querySelector('button')||el).focus({preventScroll:true});});}
  $('#ql-chips').innerHTML=chips();const count=Object.keys(map).filter(key=>key!=='q'&&F[key]).length;$('#ql-filter-count').textContent=count?String(count):'';updateSelection();
 }
 async function update(push=false){
  if(location.hash!=='#list'||!$('#tb'))return;
  const token=++state.request,key=owner();state.loading=true;state.error='';state.matches=[];paint();
  try{
   const params=new URLSearchParams({...filters(),page:String(F.page||1),pageSize:String(state.size)});remember(push);
   const result=await api('/api/quotation-list?'+params);
   if(token!==state.request||key!==owner()||location.hash!=='#list'||!$('#tb'))return;
   state.matches=result.data;state.display=result.display;listTotal=result.pagination.total;F.page=result.pagination.page;state.pages=result.pagination.totalPages;
   // Existing action handlers use the workspace record. Adopt only untouched
   // records and their comparison baseline; keep the workspace revision intact.
   // A concurrent workspace write still encounters the existing conflict check.
   for(const q of result.data){const i=S.quotes.findIndex(old=>old.id===q.id),j=SAVED.quotes.findIndex(old=>old.id===q.id);if(i<0&&j<0){S.quotes.push(clone(q));SAVED.quotes.push(clone(q));}else if(i>=0&&j>=0&&JSON.stringify(S.quotes[i])===JSON.stringify(SAVED.quotes[j])){S.quotes[i]=clone(q);SAVED.quotes[j]=clone(q);}}
   state.loading=false;remember();paint();
  }catch(error){if(token!==state.request||key!==owner()||location.hash!=='#list')return;state.loading=false;state.error=error.message;state.matches=[];listTotal=0;paint();if(error.status===401)failure(error);}
 }
 window.addEventListener('popstate',()=>{const saved=history.state?.quotationList;if(location.hash!=='#list'||!saved||saved.owner!==state.historyOwner)return;Object.assign(F,saved.filters,{page:saved.page});state.size=saved.size;if($('#tb')){render();}});
 function chips(){return Object.keys(map).filter(key=>F[key]).map(key=>{let value=F[key];if(key==='customer')value=cust(value).name||value;if(key==='category')value=S.customerCategories?.find(c=>c.id===value)?.name||value;if(key==='product')value=S.products.find(p=>p.id===value)?.name||S.quotes.flatMap(q=>q.items).find(i=>i.pid===value)?.name||value;return `<button type="button" class="b2 s ql-chip" aria-label="Clear ${esc(labels[key])} filter" onclick="QuotationList.clear('${key}')">${esc(labels[key])}: ${esc(value)} <span aria-hidden="true">×</span></button>`;}).join('');}
 function updateSelection(){
  if(!$('#ql-selection'))return;
  $('#ql-selection').textContent=state.selected.size+' selected';
  document.querySelectorAll('#tb [data-ql-id]').forEach(box=>box.checked=state.selected.has(box.dataset.qlId));
  const shown=state.matches,box=$('#ql-select-page');
  box.checked=!!shown.length&&shown.every(q=>state.selected.has(q.id));box.indeterminate=shown.some(q=>state.selected.has(q.id))&&!box.checked;box.disabled=!shown.length;
 }
 scheduleQuoteList=function(reset=true){if(reset)F.page=1;state.request++;clearTimeout(state.frame);state.loading=true;state.matches=[];paint();state.frame=setTimeout(()=>update(true),reset?150:0);};
 function select(id,checked){if(checked&&state.selected.size>=1000){toast('Select at most 1,000 quotations.','er');updateSelection();return;}checked?state.selected.add(id):state.selected.delete(id);updateSelection();}
 function selectPage(checked){const shown=state.matches;if(checked&&new Set([...state.selected,...shown.map(q=>q.id)]).size>1000){toast('Select at most 1,000 quotations.','er');updateSelection();return;}for(const q of shown)checked?state.selected.add(q.id):state.selected.delete(q.id);updateSelection();}
 function dialog(id){return document.getElementById(id);}
 function show(id,trigger){const el=dialog(id);el._trigger=trigger||document.activeElement;el.onkeydown=event=>DynamicFields.dialogKeys(el,event);el.onclose=()=>{if(id==='ql-export'){state.preview++;state.export=null;}el._trigger?.isConnected&&el._trigger.focus();};el.showModal();}
 function options(values,current,first){return `<option value="">${esc(first)}</option>`+values.map(([value,label])=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`).join('');}
 function openFilters(){
  for(const [key,value]of Object.entries(F)){const el=dialog('ql-'+key);if(el)el.value=value||'';}
  $('#ql-filter-error').textContent='';show('ql-filters');
 }
 function apply(){
  const draft={...F};for(const key of Object.keys(map)){if(key==='q')continue;draft[key]=dialog('ql-'+key).value;}
  try{QuotationFilters.normalize(Object.fromEntries(Object.entries(map).map(([key,name])=>[name,draft[key]||''])));}catch(error){$('#ql-filter-error').textContent=error.message;return;}
  Object.assign(F,draft);$('#ql-primary-status').value=F.st;dialog('ql-filters').close();scheduleQuoteList();
 }
 function reset(){for(const key of Object.keys(map))F[key]='';F.page=1;$('#ql-search').value='';$('#ql-primary-status').value='';for(const key of Object.keys(map)){const el=dialog('ql-'+key);if(el)el.value='';}$('#ql-filter-error').textContent='';scheduleQuoteList();}
 function clear(key){F[key]='';if(key==='q')$('#ql-search').value='';if(key==='st')$('#ql-primary-status').value='';scheduleQuoteList();}
 V.list=function(){
  resetOwner();state.request++;clearTimeout(state.frame);state.loading=true;state.matches=[];for(const id of state.selected)if(!S.quotes.some(q=>q.id===id))state.selected.delete(id);
  const customers=can('customer.view')?S.customers.map(c=>[c.id,c.name+(c.co?' · '+c.co:'')]):[];
  const products=new Map(S.products.map(p=>[p.id,p.name]));for(const q of S.quotes)for(const i of q.items)if(!products.has(i.pid))products.set(i.pid,i.name+' (historical)');
  const field=(key,label,type='text')=>`<label>${label}<input id="ql-${key}" type="${type}" ${type==='number'?'min="0" step="0.01" max="100000000000"':''}></label>`;
  return `<section class="ql-page"><div class="ql-heading"><h1>All Quotations</h1><button type="button" onclick="QuotationList.openExport()">Export CSV</button></div><div class="card"><div class="ql-toolbar"><input id="ql-search" aria-label="Search quotations" maxlength="200" placeholder="Search number, customer, mobile, product" value="${esc(F.q||'')}" oninput="F.q=this.value;scheduleQuoteList()"><select id="ql-primary-status" aria-label="Quotation status" onchange="F.st=this.value;scheduleQuoteList()">${options(ST.map(s=>[s,s]),F.st,'All statuses')}</select><button type="button" class="b2" onclick="QuotationList.openFilters()" aria-haspopup="dialog"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg> Advanced Filters <span id="ql-filter-count" class="ql-badge"></span></button></div><div id="ql-chips" class="ql-chips" aria-label="Applied filters">${chips()}</div><div class="ql-selection"><span id="ql-selection" role="status">${state.selected.size} selected</span><button type="button" class="s b2" onclick="QuotationList.clearSelection()">Clear selection</button></div><div class="tw ql-table-scroll" role="region" aria-label="Quotations table" tabindex="0"><table class="ql-table" aria-label="All quotations"><colgroup><col class="ql-col-select"><col class="ql-col-number"><col class="ql-col-date"><col class="ql-col-customer"><col class="ql-col-company"><col class="ql-col-total"><col class="ql-col-by"><col class="ql-col-status"><col class="ql-col-valid"><col class="ql-col-actions"></colgroup><thead><tr><th scope="col" class="ql-selection-cell"><input id="ql-select-page" class="ql-check" type="checkbox" aria-label="Select quotations on this page" onchange="QuotationList.selectPage(this.checked)"></th><th scope="col">Number</th><th scope="col">Date</th><th scope="col">Customer</th><th scope="col">Company</th><th scope="col" class="n">Total</th><th scope="col">By</th><th scope="col">Status</th><th scope="col">Valid until</th><th scope="col">Actions</th></tr></thead><tbody id="tb" aria-busy="true">${rows()}</tbody></table></div><div class="row quote-pagination" id="quote-pagination">${listPager()}</div></div>
  <dialog id="ql-filters" class="ql-dialog" aria-labelledby="ql-filter-title"><form onsubmit="event.preventDefault();QuotationList.apply()"><div class="ql-heading"><h2 id="ql-filter-title">Advanced Filters</h2><button type="button" class="b2 s" aria-label="Close advanced filters" onclick="document.getElementById('ql-filters').close()">×</button></div><div class="ql-grid"><label>Status<select id="ql-st" aria-label="Advanced quotation status">${options(ST.map(s=>[s,s]),F.st,'All statuses')}</select></label><label>Salesperson<select id="ql-sp" aria-label="Salesperson filter">${options([...new Set(S.quotes.map(q=>q.sales).filter(Boolean))].map(s=>[s,s]),F.sp,'All salespeople')}</select></label><label>Customer<select id="ql-customer" ${can('customer.view')?'':'disabled'}>${options(customers,F.customer,can('customer.view')?'All customers':'Customer access required')}</select></label><label>Customer category<select id="ql-category" ${can('customer.view')?'':'disabled'}>${options((S.customerCategories||[]).map(c=>[c.id,c.name+(!c.active?' (inactive)':'')]),F.category,'All categories')}</select></label>${field('a','From date','date')}${field('b','To date','date')}${field('mn','Minimum amount (₹)','number')}${field('mx','Maximum amount (₹)','number')}<label>Product<select id="ql-product">${options([...products],F.product,'All products')}</select></label></div><div class="ql-dialog-footer"><p id="ql-filter-error" class="ql-error" role="alert"></p><div class="ql-actions"><button type="submit">Apply Filters</button><button type="button" class="b2" onclick="QuotationList.reset()">Reset Filters</button><button type="button" class="b2" onclick="document.getElementById('ql-filters').close()">Cancel</button></div></div></form></dialog>
  <dialog id="ql-export" class="ql-dialog" aria-labelledby="ql-export-title"><h2 id="ql-export-title">Export CSV</h2><div id="ql-export-content"></div></dialog></section>`;
 };
 function exportPayload(){const e=state.export;return {type:e.type,scope:e.scope,columns:e.chosen,filters:filters(),selectedIds:e.scope==='selected'?[...state.selected]:[],quotationWise:e.quotationWise};}
 async function openExport(){
  show('ql-export');$('#ql-export-content').innerHTML='<p role="status">Loading export configuration…</p>';
  const key=owner(),token=++state.preview;try{const config=await api('/api/quotation-export/options');if(token!==state.preview||key!==owner()||!dialog('ql-export')?.open)return;state.export={config,type:'quotation',scope:state.selected.size?'selected':'filtered',chosen:[...config.defaults.quotation],quotationWise:false,working:false};drawExport();preview();}catch(error){if(token!==state.preview||key!==owner())return;if(dialog('ql-export')?.open)$('#ql-export-content').innerHTML=`<p role="alert">${esc(error.message)}</p><button class="b2" onclick="document.getElementById('ql-export').close()">Close</button>`;if(error.status===401)failure(error);}
 }
 function allowedColumns(){const e=state.export;return e.config.columns.filter(c=>e.type==='quotation'?c.group==='quotation':e.type==='customer'?c.group==='customer'||e.quotationWise&&c.key==='number':true);}
 function drawExport(){
  const e=state.export;if(!e)return;
  $('#ql-export-content').innerHTML=`<div class="ql-grid"><label>Export type<select id="ql-export-type" onchange="QuotationList.exportType(this.value)"><option value="quotation" ${e.type==='quotation'?'selected':''}>Quotation Details</option>${can('customer.view')?`<option value="customer" ${e.type==='customer'?'selected':''}>Customer Details</option>`:''}<option value="custom" ${e.type==='custom'?'selected':''}>Custom Field Selection</option></select></label><label>Export scope<select id="ql-export-scope" onchange="QuotationList.exportScope(this.value)"><option value="selected" ${e.scope==='selected'?'selected':''}>Selected quotations (${state.selected.size})</option><option value="filtered" ${e.scope==='filtered'?'selected':''}>Current filtered records — all pages</option><option value="all" ${e.scope==='all'?'selected':''}>All authorized quotation records</option></select></label></div>${e.type==='customer'?`<label class="ql-checkbox"><input id="ql-quote-wise" type="checkbox" ${e.quotationWise?'checked':''} onchange="QuotationList.quotationWise(this.checked)"> One customer row per quotation (quotation-wise)</label>`:''}<p class="mu">${e.type==='customer'&&!e.quotationWise?'Customers are deduplicated across the chosen quotations.':'One row per quotation.'} Customer details use current customer records. Active delivery addresses are combined in one cell, separated by line breaks.</p><div class="ql-column-actions"><button type="button" class="s b2" onclick="QuotationList.allColumns(true)">Select All</button><button type="button" class="s b2" onclick="QuotationList.allColumns(false)">Deselect All</button><span class="mu">Use arrows to set CSV column order.</span></div><div id="ql-columns" class="ql-columns">${columnHTML()}</div><div class="ql-dialog-footer"><div id="ql-preview" role="status" aria-live="polite"></div><p id="ql-export-error" class="ql-error" role="alert"></p><div class="ql-actions"><button id="ql-download" disabled onclick="QuotationList.download()">Export CSV</button><button type="button" class="b2" onclick="document.getElementById('ql-export').close()">Cancel</button></div></div>`;
 }
 function columnHTML(){const e=state.export,cols=allowedColumns(),ordered=[...e.chosen.map(k=>cols.find(c=>c.key===k)).filter(Boolean),...cols.filter(c=>!e.chosen.includes(c.key))];return ordered.map(c=>{const index=e.chosen.indexOf(c.key);return `<div class="ql-column"><label class="ql-checkbox"><input type="checkbox" value="${c.key}" ${index>=0?'checked':''} onchange="QuotationList.column('${c.key}',this.checked)">${esc(c.label)}</label><span><button type="button" class="s b2" aria-label="Move ${esc(c.label)} up" ${index<=0?'disabled':''} onclick="QuotationList.move('${c.key}',-1)">↑</button><button type="button" class="s b2" aria-label="Move ${esc(c.label)} down" ${index<0||index===e.chosen.length-1?'disabled':''} onclick="QuotationList.move('${c.key}',1)">↓</button></span></div>`;}).join('');}
 function refreshColumns(){const active=document.activeElement,focused=active?.getAttribute('aria-label'),value=active?.matches('#ql-columns input')?active.value:null;$('#ql-columns').innerHTML=columnHTML();const target=value?[...$('#ql-columns').querySelectorAll('input')].find(node=>node.value===value):focused?[...$('#ql-columns').querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===focused):null;if(target)(target.disabled?target.closest('.ql-column').querySelector('input'):target)?.focus();preview();}
 async function preview(){
  const e=state.export;if(!e)return;const token=++state.preview,key=owner();$('#ql-download').disabled=true;$('#ql-export-error').textContent='';
  if(!e.chosen.length){$('#ql-preview').textContent='Select at least one column.';return;}
  $('#ql-preview').textContent='Counting export records…';
  try{const result=await api('/api/quotation-export/preview',{method:'POST',body:JSON.stringify(exportPayload())});if(token!==state.preview||key!==owner()||state.export!==e)return;$('#ql-preview').textContent=`${result.rows} rows from ${result.quotations} quotations · ${e.scope==='all'?'All authorized records':e.scope==='selected'?'Selected records':'All matching pages'} · ${e.chosen.length} columns`;$('#ql-download').disabled=result.rows===0||e.working;}catch(error){if(token!==state.preview||state.export!==e)return;$('#ql-preview').textContent='Export count unavailable.';$('#ql-export-error').textContent=error.message;if(error.status===401)failure(error);}
 }
 async function download(){
  const e=state.export;if(!e||e.working)return;e.working=true;const key=owner(),disabled=[...$('#ql-export-content').querySelectorAll('button,input,select')].map(node=>({node,disabled:node.disabled}));disabled.forEach(({node})=>node.disabled=true);$('#ql-export-error').textContent='';$('#ql-preview').textContent='Preparing CSV download…';
  try{const response=await fetch('/api/quotation-export/csv',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify(exportPayload())});if(!response.ok){const data=await response.json();throw Object.assign(Error(data.error||'Export failed.'),{status:response.status});}const blob=await response.blob();if(state.export!==e||key!==owner())return;await out(blob,e.type==='customer'?'customer-details.csv':'quotation-details.csv');dialog('ql-export').close();toast('CSV exported successfully');}
  catch(error){if(state.export!==e||key!==owner())return;$('#ql-export-error').textContent=error.message;$('#ql-preview').textContent='Export failed. Review the error and retry.';if(error.status===401)failure(error);}
  finally{e.working=false;disabled.forEach(({node,disabled})=>{if(node.isConnected)node.disabled=disabled;});if(state.export===e)$('#ql-download').disabled=false;}
 }
 window.QuotationList={rowMenu,retry(){update();},page(value){const next=Number(value);if(!Number.isSafeInteger(next)||next<1||next>state.pages||next===(F.page||1))return;F.page=next;scheduleQuoteList(false);},size(value){const size=Number(value);if(![10,20,30,40].includes(size)||size===state.size)return;state.size=size;F.page=1;scheduleQuoteList(false);},openFilters,apply,reset,clear,select,selectPage,clearSelection(){state.selected.clear();updateSelection();},openExport,download,
  exportType(type){const e=state.export;e.type=type;e.quotationWise=false;e.chosen=[...e.config.defaults[type]];drawExport();preview();},
  exportScope(scope){state.export.scope=scope;preview();},quotationWise(value){const e=state.export;e.quotationWise=value;e.chosen=e.chosen.filter(k=>k!=='number');if(value)e.chosen.unshift('number');drawExport();preview();},
  allColumns(checked){state.export.chosen=checked?allowedColumns().map(c=>c.key):[];refreshColumns();},column(key,checked){const e=state.export;e.chosen=e.chosen.filter(k=>k!==key);if(checked)e.chosen.push(key);refreshColumns();},move(key,delta){const e=state.export,index=e.chosen.indexOf(key),next=index+delta;if(index<0||next<0||next>=e.chosen.length)return;[e.chosen[index],e.chosen[next]]=[e.chosen[next],e.chosen[index]];refreshColumns();}
 };
 const before=typeof workspaceBeforeRender==='function'?workspaceBeforeRender:()=>{};workspaceBeforeRender=function(){before();resetOwner();state.preview++;state.export=null;};
 const after=workspaceAfterRender;workspaceAfterRender=function(view){after(view);if(view==='list')update();};
})();
