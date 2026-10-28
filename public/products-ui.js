/* Catalog presentation. Product forms, imports, writes and pricing remain canonical. */
'use strict';
const productsView={owner:null,q:'',category:'',active:'',readiness:'',page:1,pageSize:25,request:0,timer:null,data:null,menu:null};
function productsManage(){return can('product.manage')||can('pricing.manage');}
function productsIcon(path){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="${path}"/></svg>`;}
V.prod=()=>{
 if(productsView.owner!==AUTH.id){Object.assign(productsView,{owner:AUTH.id,q:'',category:'',active:'',readiness:'',page:1,data:null});}
 return `<section id="products-page" aria-labelledby="products-title"><header class="products-heading"><div><h1 id="products-title">Products &amp; Services</h1><p id="products-summary" aria-live="polite">Loading catalog summary…</p></div><div class="products-heading-actions">${can('pricing.manage')?`<button class="b2" onclick="openPricingImport()">${productsIcon('M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6')}Import prices</button>`:''}${can('product.manage')?`<button onclick="prodForm()">${wi('new')}Add product</button>`:''}</div></header>
 <div class="products-card"><div class="products-toolbar"><label class="products-search">${wi('search')}<input type="search" aria-label="Search by name or code" placeholder="Search by name or code" maxlength="200" value="${esc(productsView.q)}" oninput="productsSearch(this.value)"></label><div class="products-filters"><label>Category<select id="products-category" onchange="productsFilter('category',this.value)">${selectOptions(S.cats.map(c=>[c.id,c.name]),productsView.category,'All categories')}</select></label><label>Status<select onchange="productsFilter('active',this.value)">${selectOptions([['1','Active'],['0','Inactive']],productsView.active,'All statuses')}</select></label><label>Readiness<select onchange="productsFilter('readiness',this.value)">${selectOptions([['ready','Ready to quote'],['attention','Needs attention'],['configuration','Missing configuration'],['pricing','Prices pending']],productsView.readiness,'All readiness')}</select></label></div>${canReadPricing()||productsManage()?'<button id="products-tools" class="b2 products-tools" aria-haspopup="menu" aria-expanded="false" onclick="productsTools(this)">Catalog tools '+wi('down')+'</button>':''}</div>
 <div id="products-results" aria-live="polite"></div></div></section>`;
};
function productsLoading(){return `<div class="products-loading" role="status"><span>Loading products…</span>${Array.from({length:6},()=>'<div class="products-skeleton"></div>').join('')}</div>`;}
function productsSearch(value){productsView.q=value;productsView.page=1;++productsView.request;clearTimeout(productsView.timer);productsView.timer=setTimeout(productsLoad,250);}
function productsFilter(key,value){clearTimeout(productsView.timer);productsView[key]=value;productsView.page=1;productsLoad();}
function productsPage(page){productsView.page=page;productsLoad();}
async function productsLoad(){
 clearTimeout(productsView.timer);productsCloseMenu(false);
 const el=$('#products-results');if(!el)return;
 const sequence=++productsView.request,owner=AUTH.id;
 el.setAttribute('aria-busy','true');el.innerHTML=productsLoading();
 const query=new URLSearchParams({view:'catalog',page:productsView.page,pageSize:productsView.pageSize});
 for(const key of ['q','category','active','readiness'])if(productsView[key]!=='')query.set(key,key==='q'?productsView.q.trim():productsView[key]);
 try{
  const data=await api('/api/products?'+query);
  if(sequence!==productsView.request||AUTH?.id!==owner||!el.isConnected)return;
  productsView.data=data;productsView.page=data.pagination.page;
  $('#products-summary').textContent=`${data.summary.total} products · ${data.summary.attention} need attention before they can be quoted`;
  const select=$('#products-category'),options=selectOptions(data.categories.map(c=>[c.id,c.name]),productsView.category,'All categories');
  if(select.innerHTML!==options)select.innerHTML=options;
  el.innerHTML=productsTable(data);
 }catch(error){
  if(sequence!==productsView.request||AUTH?.id!==owner||!el.isConnected)return;
  productsView.data=null;$('#products-summary').textContent='Catalog summary unavailable';
  el.innerHTML=`<div class="products-empty" role="alert"><h2>Unable to load products</h2><p>${esc(error.message)}</p><button class="b2" onclick="productsLoad()">Retry products</button></div>`;
 }finally{if(sequence===productsView.request&&el.isConnected)el.setAttribute('aria-busy','false');}
}
function productsBadge(label,state){return `<span class="products-badge ${state}"><i aria-hidden="true"></i>${label}</span>`;}
function productsMethod(p){return p.tiered?'Tiered per unit':({unit:'Per unit',area:'Per sq ft',fixed:'Fixed',base:'Base price + options',package:'Package',tier:'Tiered per unit'}[p.m]||p.m);}
function productsGST(p){return !p.pricingVisible?'Restricted':p.tax===null?'Pending':p.taxMode==='exempt'?'Exempt':esc(p.tax)+'%'+(p.taxMode==='inclusive'?' incl.':'');}
function productsTable({data,pagination:p,summary}){
 const filtered=productsView.q.trim()||productsView.category||productsView.active||productsView.readiness;
 const empty=`<div class="products-empty"><h2>${summary.total?'No matching products':'No products yet'}</h2><p>${summary.total?'Try changing the search or filters.':'Add your first product using the existing product editor.'}</p>${filtered?'<button class="b2" onclick="productsClear()">Clear filters</button>':''}</div>`;
 const table=`<div class="products-table-scroll" role="region" aria-label="Products and services table" tabindex="0"><table class="products-table"><thead><tr>${['Code','Product name','Category','Pricing method','GST','Status','Configuration','Pricing','Actions'].map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${data.map(row=>{
  const id=esc(JSON.stringify(row.id));
  return `<tr data-product-id="${esc(row.id)}"><td class="products-code">${esc(row.code)}</td><th scope="row">${esc(row.name)}</th><td>${esc(row.category)}</td><td>${esc(productsMethod(row))}</td><td class="products-tax">${productsGST(row)}</td><td>${productsBadge(row.on?'Active':'Inactive',row.on?'ready':'inactive')}</td><td>${productsBadge(row.configurationReady?'Ready':'Missing configuration',row.configurationReady?'ready':'missing')}</td><td>${row.pricingVisible?productsBadge(row.pricingReady?'Ready':'Prices pending',row.pricingReady?'ready':'pending'):productsBadge('Restricted','inactive')}</td><td><div class="products-row-actions">${can('product.manage')?`<button class="products-edit b2" onclick="prodForm(${id})">Edit<span class="sr-only"> ${esc(row.name)}</span></button>`:''}${productsManage()?`<button class="products-more b2" aria-label="Actions for ${esc(row.name)}" aria-haspopup="menu" aria-expanded="false" onclick="productsRowMenu(this,${id})">${productsIcon('M5 12h.01M12 12h.01M19 12h.01')}</button>`:'<span class="products-readonly">View only</span>'}</div></td></tr>`;
 }).join('')}</tbody></table></div>`;
 return (data.length?table:empty)+`<footer class="products-pagination"><span>Showing ${p.total?(p.page-1)*p.pageSize+1:0}–${Math.min(p.page*p.pageSize,p.total)} of ${p.total} products</span><div><label>Per page <select aria-label="Products per page" onchange="productsFilter('pageSize',Number(this.value))">${selectOptions([10,25,50,100],p.pageSize)}</select></label><button class="b2" ${p.page<=1?'disabled':''} aria-label="Previous products page" onclick="productsPage(${p.page-1})">${wi('chevron')}</button><span>Page ${p.page} of ${Math.max(1,p.totalPages)}</span><button class="b2" ${p.page>=p.totalPages?'disabled':''} aria-label="Next products page" onclick="productsPage(${p.page+1})">${wi('chevron')}</button></div></footer>`;
}
function productsClear(){Object.assign(productsView,{q:'',category:'',active:'',readiness:'',page:1});render();}
function productsMenu(anchor,items){
 const wasOpen=productsView.menu?.anchor===anchor;productsCloseMenu(false);if(wasOpen)return;
 const popup=document.createElement('div');popup.className='products-menu';popup.setAttribute('role','menu');popup.setAttribute('aria-label',anchor.id==='products-tools'?'Catalog tools':anchor.getAttribute('aria-label'));
 for(const [label,action,danger]of items){const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.textContent=label;if(danger)button.className='products-danger';button.onclick=()=>{productsCloseMenu(false);action();};popup.append(button);}
 document.body.append(popup);anchor.setAttribute('aria-expanded','true');productsView.menu={anchor,popup};
 const rect=anchor.getBoundingClientRect(),width=popup.offsetWidth,height=popup.offsetHeight;
 popup.style.left=Math.max(8,Math.min(rect.right-width,innerWidth-width-8))+'px';popup.style.top=Math.max(8,rect.bottom+height+8<=innerHeight?rect.bottom+6:rect.top-height-6)+'px';
 popup.firstElementChild?.focus();
}
function productsCloseMenu(focus=true){const menu=productsView.menu;if(!menu)return;productsView.menu=null;menu.anchor.setAttribute('aria-expanded','false');menu.popup.remove();if(focus&&menu.anchor.isConnected)menu.anchor.focus();}
function productsTools(anchor){const items=[];
 if(canReadPricing())items.push(['Download Price Template',downloadPriceTemplate]);
 if(can('pricing.manage'))items.push(['Price Import History',pricingImportHistory]);
 if(can('product.manage')&&can('pricing.manage'))items.push(['Add missing SRS catalog entries',addMissingCatalog]);
 if(productsManage())items.push(['Manage promotional gift template',giftTemplateForm],['Manage catalog templates',catalogTemplatesForm],['Catalog Verification',()=>go('catalog')]);
 productsMenu(anchor,items);
}
function productsRowMenu(anchor,id){const row=productsView.data?.data.find(p=>p.id===id);if(!row)return;const items=[];
 if(can('product.manage'))items.push(['Edit product',()=>prodForm(id)]);
 if(can('pricing.manage'))items.push(['Open Pricing Configuration',()=>productsPricing(id)]);
 if(productsManage())items.push(['View Catalog Verification',()=>{CATALOG_FILTER.q=row.code;CATALOG_FILTER.page=1;CATALOG_FILTER.category='';CATALOG_FILTER.status='';CATALOG_FILTER.template='';go('catalog');}]);
 if(can('product.manage'))items.push([row.on?'Deactivate':'Activate',()=>prodToggle(id)],['Remove product',()=>prodDel(id),true]);
 productsMenu(anchor,items);
}
async function productsPricing(id){
 if(busy||!can('pricing.manage'))return;
 if(!prod(id)){try{adopt(await api('/api/state'));}catch(error){failure(error);return;}}
 if(pricingEditor.owner!==AUTH.id){pcReset();pricingEditor.owner=AUTH.id;}
 pricingEditor.selected=id;go('price');
}
document.addEventListener('pointerdown',event=>{const menu=productsView.menu;if(menu&&!menu.popup.contains(event.target)&&!menu.anchor.contains(event.target))productsCloseMenu(false);});
document.addEventListener('keydown',event=>{
 const menu=productsView.menu;if(!menu)return;
 if(event.key==='Escape'){event.preventDefault();productsCloseMenu();}
 else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
  event.preventDefault();const buttons=[...menu.popup.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);
  buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus();
 }else if(event.key==='Tab')productsCloseMenu(false);
});
window.addEventListener('resize',()=>productsCloseMenu(false));
window.addEventListener('scroll',()=>productsCloseMenu(false),true);
const productsOriginalBeforeRender=workspaceBeforeRender;
workspaceBeforeRender=function(){++productsView.request;clearTimeout(productsView.timer);productsCloseMenu(false);productsView.data=null;productsOriginalBeforeRender();};
const productsOriginalAfterRender=workspaceAfterRender;
workspaceAfterRender=function(view){productsOriginalAfterRender(view);if(view==='prod')productsLoad();};
