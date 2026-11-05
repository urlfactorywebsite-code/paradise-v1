'use strict';
let CATEGORY_PAGE={q:'',status:'all',page:1,pageSize:25,request:0,timer:null},CATEGORY_EDITOR=null;
function categoryHighlightHTML(snapshot){const highlight=CustomerCategories.highlight({categorySnapshot:snapshot});return highlight?`<aside class="category-highlight" role="note"><strong>${esc(highlight.name)} member benefit</strong><p>${esc(highlight.message)}</p></aside>`:'';}
function categorySnapshotForDraft(q){const saved=q.id?getQ(q.id):null;return saved?.cid===q.cid&&!q._applyCategoryDiscount?saved.categorySnapshot:q.categorySnapshot!==undefined?q.categorySnapshot:CustomerCategories.snapshot(cust(q.cid),S.customerCategories||[]);}
function categoryLogoHTML(category){return `<span class="category-logo">${category.logoUrl?`<img src="${esc(category.logoUrl)}" alt="${esc(category.name)} logo" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">`:''}<span ${category.logoUrl?'hidden':''} aria-hidden="true">${esc((category.name||'?').slice(0,1).toUpperCase())}</span></span>`;}
V['customer-categories']=()=>`<div class="category-page"><div class="row spread"><div><h1>Customer Category Management</h1><p class="mu">Manage customer groups, branding, default discounts and quotation highlights.</p></div>${can('customer_categories.manage')?'<button type="button" onclick="categoryForm()">+ Add category</button>':''}</div><div class="card"><div class="row category-filters"><label class="f"><span>Search categories</span><input id="category-search" type="search" maxlength="200" aria-label="Search categories" value="${esc(CATEGORY_PAGE.q)}" oninput="CATEGORY_PAGE.q=this.value;CATEGORY_PAGE.page=1;clearTimeout(CATEGORY_PAGE.timer);CATEGORY_PAGE.timer=setTimeout(loadCategoryList,250)"></label><label class="f"><span>Category status</span><select aria-label="Category status" onchange="CATEGORY_PAGE.status=this.value;CATEGORY_PAGE.page=1;loadCategoryList()">${selectOptions([['all','All categories'],['active','Active'],['inactive','Inactive'],['archived','Archived']],CATEGORY_PAGE.status)}</select></label></div><div id="category-list" aria-live="polite">Loading categories…</div></div><p class="mu">Other remains a free-text option in the customer form. New quotations use configured category discounts; saved quotations keep their original settings.</p></div>`;
async function loadCategoryList(){
 const el=$('#category-list');if(!el)return;const request=++CATEGORY_PAGE.request;
 const query=new URLSearchParams({manage:'true',q:CATEGORY_PAGE.q,status:CATEGORY_PAGE.status,page:String(CATEGORY_PAGE.page),pageSize:String(CATEGORY_PAGE.pageSize)});el.setAttribute('aria-busy','true');
 try{
  const result=await api('/api/customer-categories?'+query);if(request!==CATEGORY_PAGE.request||!$('#category-list'))return;
  if(CATEGORY_PAGE.page>1&&!result.data.length&&result.pagination.total){CATEGORY_PAGE.page--;return loadCategoryList();}
  const manage=can('customer_categories.manage');
  el.innerHTML=`<div class="tw"><table class="category-table" aria-label="Customer categories"><thead><tr><th>Logo</th><th>Category name</th><th>Default discount</th><th>Quotation highlight</th><th>Status</th>${manage?'<th>Actions</th>':''}</tr></thead><tbody>${result.data.map(c=>`<tr><td>${categoryLogoHTML(c)}</td><td><b>${esc(c.name)}</b></td><td>${esc(c.discountPercentage)}%</td><td><span class="category-message-text">${esc(c.highlightMessage||'No message')}</span><small class="mu">${c.highlightEnabled?'Enabled':'Disabled'}</small></td><td><span class="bg ${c.archivedAt?'r':c.active?'g':''}">${c.archivedAt?'Archived':c.active?'Active':'Inactive'}</span></td>${manage?`<td><div class="row"><button type="button" class="s b2" data-id="${esc(c.id)}" onclick="categoryForm(this.dataset.id)" ${c.archivedAt?'disabled':''}>Edit</button><button type="button" class="s ${c.archivedAt?'b2':'bd'}" data-id="${esc(c.id)}" data-version="${c.version}" onclick="categoryArchive(this.dataset.id,Number(this.dataset.version),${Boolean(c.archivedAt)})">${c.archivedAt?'Restore':'Archive'}</button></div></td>`:''}</tr>`).join('')||`<tr><td colspan="${manage?6:5}">No categories match these filters.</td></tr>`}</tbody></table></div><div class="row category-pagination"><span class="mu">${result.pagination.total} categories · Page ${CATEGORY_PAGE.page} of ${Math.max(1,result.pagination.totalPages)}</span><button type="button" class="s b2" ${CATEGORY_PAGE.page<=1?'disabled':''} onclick="CATEGORY_PAGE.page--;loadCategoryList()">Previous categories</button><button type="button" class="s b2" ${CATEGORY_PAGE.page>=result.pagination.totalPages?'disabled':''} onclick="CATEGORY_PAGE.page++;loadCategoryList()">Next categories</button></div>`;
 }catch(error){if(request===CATEGORY_PAGE.request&&$('#category-list'))el.innerHTML=`<div class="note" role="alert">${esc(error.message)} <button type="button" class="s b2" onclick="loadCategoryList()">Retry categories</button></div>`;}
 finally{el.removeAttribute('aria-busy');}
}
async function categoryForm(id){
 if(!can('customer_categories.manage')||busy)return;
 modal('<h2>Customer category</h2><p role="status">Loading category…</p>',850);
 const loadingBox=$('#modal .box');
 try{
  const result=await api('/api/customer-categories'+(id?'/'+encodeURIComponent(id):'?manage=true&pageSize=1'));
  if($('#modal .box')!==loadingBox)return;
  const c=id?result.data:{id:'CC'+uid(),name:'',discountPercentage:'0.00',highlightMessage:'',highlightEnabled:false,active:true};
  CATEGORY_EDITOR={...c,existing:Boolean(id),limits:result.limits,logoDataUrl:null,removeLogo:false,saving:false,logoReading:false,logoRequest:0};
  modal(`<h2 id="category-editor-heading">${id?'Edit':'Add'} customer category</h2><form id="category-editor" aria-labelledby="category-editor-heading" novalidate onsubmit="event.preventDefault();saveCategory()"><div id="category-editor-error" class="note" role="alert" hidden></div><div class="customer-form-grid"><label class="f"><span>Category name *</span><input id="ce_name" aria-label="Category name" aria-required="true" maxlength="150" value="${esc(c.name)}" oninput="categoryEditorPreview()"></label><label class="f"><span>Default discount (%) *</span><input id="ce_discount" aria-label="Default discount (%)" aria-required="true" type="number" min="0" max="100" step="0.01" value="${esc(c.discountPercentage)}"></label><label class="f"><span>Category status</span><select id="ce_active" aria-label="Category status">${selectOptions([['true','Active'],['false','Inactive']],String(c.active))}</select></label><label class="f"><span>Category logo</span><input id="ce_logo" type="file" aria-label="Category logo" accept="image/png,image/jpeg,image/webp" onchange="readCategoryLogo(this.files[0])"><small class="mu">PNG, JPEG or WebP; up to 300 KB. Static images only.</small></label><div class="category-editor-logo customer-wide"><div id="category-editor-logo"></div><button type="button" class="s b2" onclick="removeCategoryLogo()">Remove logo</button></div><label class="f customer-wide"><span>Quotation highlight message</span><textarea id="ce_message" aria-label="Quotation highlight message" rows="4" maxlength="${result.limits.highlightMaxLength}" oninput="categoryEditorPreview()">${esc(c.highlightMessage)}</textarea><small class="mu">Plain text, up to ${result.limits.highlightMaxLength} characters. Line breaks are supported.</small></label><label class="checkbox customer-wide"><input id="ce_enabled" type="checkbox" ${c.highlightEnabled?'checked':''} onchange="categoryEditorPreview()"> Enable quotation highlight</label></div><div class="category-preview-heading">Quotation message preview</div><div id="category-editor-preview" aria-live="polite"></div><p class="mu">New quotations capture this message. Existing saved quotations retain their original message.</p><div class="customer-form-actions"><button type="submit" id="category-save">Save category</button><button type="button" class="b2" onclick="closeM();CATEGORY_EDITOR=null">Cancel</button></div></form>`,850);
  $('#modal .box').setAttribute('role','dialog');$('#modal .box').setAttribute('aria-modal','true');$('#modal .box').setAttribute('aria-labelledby','category-editor-heading');
  categoryEditorPreview();$('#ce_name').focus();$('#modal').scrollTop=0;
 }catch(error){if($('#modal .box')===loadingBox)modal(`<h2>Customer category</h2><p class="note" role="alert">${esc(error.message)}</p>`,650);}
}
function categoryEditorPreview(){
 const draft=CATEGORY_EDITOR;if(!draft||!$('#category-editor'))return;
 const name=$('#ce_name').value,message=$('#ce_message').value,enabled=$('#ce_enabled').checked;
 $('#category-editor-preview').innerHTML=categoryHighlightHTML({name,highlightEnabled:enabled,highlightMessage:message})||'<div class="category-preview-empty">Highlight is disabled or empty.</div>';
 const src=draft.logoDataUrl||(!draft.removeLogo?draft.logoUrl:null);$('#category-editor-logo').innerHTML=categoryLogoHTML({name,logoUrl:src});
}
function removeCategoryLogo(){const draft=CATEGORY_EDITOR;if(!draft||draft.saving)return;draft.logoRequest++;draft.logoReading=false;draft.logoDataUrl=null;draft.removeLogo=true;$('#ce_logo').value='';$('#category-save').disabled=false;categoryEditorPreview();}
async function readCategoryLogo(file){
 const draft=CATEGORY_EDITOR;if(!file||!draft)return;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>draft.limits.logoMaxBytes){categoryFormError('Choose a PNG, JPEG or WebP logo up to 300 KB.');return;}
 const request=++draft.logoRequest;draft.logoReading=true;const button=$('#category-save');button.disabled=true;
 try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('The logo could not be read.'));reader.readAsDataURL(file);});if(CATEGORY_EDITOR===draft&&request===draft.logoRequest){draft.logoDataUrl=data;draft.removeLogo=false;categoryEditorPreview();}}
 catch(error){if(CATEGORY_EDITOR===draft&&request===draft.logoRequest)categoryFormError(error.message);}finally{if(CATEGORY_EDITOR===draft&&request===draft.logoRequest){draft.logoReading=false;if($('#category-save'))$('#category-save').disabled=draft.saving;}}
}
function categoryFormError(message,field){const el=$('#category-editor-error');if(el){el.hidden=false;el.textContent=message;el.scrollIntoView({block:'nearest'});}const input=field&&$('#'+field);input?.setAttribute('aria-invalid','true');input?.focus();}
async function saveCategory(){
 const draft=CATEGORY_EDITOR,form=$('#category-editor');if(!draft||!form||draft.saving||draft.logoReading||busy||!can('customer_categories.manage'))return;
 const current=()=>CATEGORY_EDITOR===draft&&$('#category-editor')===form;
 $('#category-editor-error').hidden=true;document.querySelectorAll('#category-editor [aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
 const name=$('#ce_name').value.trim(),discountPercentage=$('#ce_discount').value,highlightMessage=$('#ce_message').value.trim(),highlightEnabled=$('#ce_enabled').checked;
 if(!name){categoryFormError('Category name is required.','ce_name');return;}
 if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(discountPercentage)||Number(discountPercentage)>100){categoryFormError('Enter a percentage from 0 to 100 with at most two decimal places.','ce_discount');return;}
 if(highlightEnabled&&!highlightMessage){categoryFormError('Enter a message before enabling the highlight.','ce_message');return;}
 const data={id:draft.id,name,discountPercentage,highlightMessage,highlightEnabled,active:$('#ce_active').value==='true',...(draft.logoDataUrl?{logoDataUrl:draft.logoDataUrl}:{}),...(draft.removeLogo?{removeLogo:true}:{})};
 draft.saving=true;const button=$('#category-save'),controls=[...form.querySelectorAll('input,select,textarea,button')].map(el=>({el,disabled:el.disabled}));controls.forEach(({el})=>el.disabled=true);button.textContent='Saving…';
 try{
  const saved=await api('/api/customer-categories'+(draft.existing?'/'+encodeURIComponent(draft.id):''),{method:draft.existing?'PATCH':'POST',body:JSON.stringify({data,...(draft.existing?{version:draft.version}:{})})});
  Object.assign(draft,saved.data,{existing:true,logoDataUrl:null,removeLogo:false});adopt(await api('/api/state'));if(current()){closeM();CATEGORY_EDITOR=null;}await loadCategoryList();toast('Customer category saved');
 }catch(error){if(current())categoryFormError(error.message);else toast(error.message,'er');}
 finally{draft.saving=false;controls.forEach(({el,disabled})=>el.disabled=disabled);button.textContent='Save category';}
}
async function categoryArchive(id,version,restore=false){
 if(busy||!can('customer_categories.manage'))return;lock(true);
 try{await api('/api/customer-categories/'+encodeURIComponent(id),{method:restore?'PATCH':'DELETE',body:JSON.stringify({version,...(restore?{data:{archived:false,active:true}}:{})})});adopt(await api('/api/state'));await loadCategoryList();toast(restore?'Category restored':'Category archived');}catch(error){toast(error.message,'er');await loadCategoryList();}finally{lock(false);}
}
const categoryBaseLoadSrsView=loadSrsView;
loadSrsView=async function(view){await categoryBaseLoadSrsView(view);if(view==='customer-categories')await loadCategoryList();};
document.addEventListener('keydown',event=>{
 if(!$('#category-editor')||$('#modal').style.display==='none')return;
 if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();closeM();CATEGORY_EDITOR=null;return;}
 if(event.key==='Tab'){const controls=[...$('#modal .box').querySelectorAll('button,input,select,textarea')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
});
