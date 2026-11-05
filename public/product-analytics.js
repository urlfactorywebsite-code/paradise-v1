'use strict';
const productAnalyticsState={userId:null,filters:{},mode:'grouped',data:null,request:0,hidden:new Set(),dataOpen:false};
const analyticsMetricLabels={quotationCount:'Number of quotations',quantity:'Total quantity quoted',quotedValue:'Quoted value including GST'};
const analyticsColors=['#0b5560','#a34316','#3759a0','#7b3888','#277047','#a22d45','#555d13','#356b83'];
const analyticsColor=index=>analyticsColors[index%analyticsColors.length];
function productAnalyticsView(globalFilters=false){
 if(productAnalyticsState.userId!==AUTH?.id){Object.assign(productAnalyticsState,{userId:AUTH?.id,filters:{},mode:'grouped',data:null,hidden:new Set(),dataOpen:false});productAnalyticsState.request++;}
 const f=productAnalyticsState.filters,select=(label,key,choices,current,blank)=>fld(label,`<select id="pa-${key}">${selectOptions(choices,current,blank)}</select>`);
 const global=globalFilters?'':`${fld('Analytics from date',`<input id="pa-from" type="date" value="${esc(f.from||'')}">`)}${fld('Analytics to date',`<input id="pa-to" type="date" value="${esc(f.to||'')}">`)}${fld('Analytics year',`<input id="pa-year" type="number" min="1000" max="9999" value="${esc(f.year||'')}">`)}${select('Analytics month','month',Array.from({length:12},(_,i)=>[i+1,ReportCharts.month('2026-'+String(i+1).padStart(2,'0')).split(' ')[0]]),f.month||'','All months')}${select('Analytics customer','customer',[],f.customerId||'','All permitted customers')}${select('Analytics employee','employee',[],f.employeeId||'','All permitted employees')}${select('Analytics quotation status','status',ST,f.status||'','All statuses')}`;
 return `<section id="product-analytics" class="card product-analytics" aria-labelledby="pa-heading"><div class="pa-heading"><div><span class="rd-eyebrow">PRODUCT INTELLIGENCE</span><h2 id="pa-heading">Global Product Performance</h2><p>Explore what your customers are quoting, month by month.</p></div><div class="rd-panel-actions"><button class="b2" type="button" id="pa-export" disabled onclick="exportProductPerformance()">${reportsIcon('download')} Export product CSV</button><button class="b2" type="button" id="pa-fullscreen" onclick="toggleProductFullscreen()" aria-pressed="false">${reportsIcon('expand')} View full screen</button></div></div>
 <form id="pa-form" onsubmit="event.preventDefault();loadProductPerformance(true)"><div class="pa-filters">${global}${select('Product category','category',[],f.categoryIds||'','All categories')}${select('Analytics metric','metric',Object.entries(analyticsMetricLabels),f.metric||'quotationCount')}${fld('Chart mode',`<select id="pa-mode" onchange="productAnalyticsState.mode=this.value;renderProductPerformance(true)">${selectOptions([['grouped','Grouped bar chart'],['stacked','Stacked bar chart'],['line','Multi-line chart'],['area','Area chart']],productAnalyticsState.mode)}</select>`)}</div>
 <details class="pa-product-picker" ${f.productIds?'open':''}><summary>Compare products <span id="pa-selection-label">${f.productIds?'Selected products':'All Products'}</span></summary><div class="pa-picker-content"><label class="checkbox"><input id="pa-all" type="checkbox" ${!f.productIds?'checked':''} onchange="document.getElementById('pa-products').disabled=this.checked"> All Products</label><label class="f"><span>Compare products</span><select id="pa-products" aria-label="Compare products" multiple size="5" aria-describedby="pa-products-help" ${!f.productIds?'disabled':''}></select></label><p class="mu" id="pa-products-help">Choose up to 50 products. Use Ctrl or Command to choose several on desktop.</p></div></details>
 <div class="pa-controls"><span class="rd-scope-note">Monthly grouping · Values after discount, including GST</span><button id="pa-apply" type="submit">Apply analytics filters</button><button class="b2" type="button" onclick="resetProductPerformance()">Reset chart filters</button></div></form>
 <div id="pa-results" aria-live="polite" aria-busy="true">${productAnalyticsSkeleton()}</div></section>`;
}
function productAnalyticsSkeleton(){return '<div class="rd-chart-skeleton" role="status" aria-label="Loading product analytics"><div></div><div></div><div></div><div></div><div></div><div></div></div>';}
function readProductAnalyticsFilters(){
 const f={},value=id=>document.getElementById('pa-'+id).value;
 for(const [control,key]of [['from','from'],['to','to'],['year','year'],['month','month'],['category','categoryIds'],['customer','customerId'],['employee','employeeId'],['status','status'],['metric','metric']])if(value(control))f[key]=value(control);
 if(!$('#pa-all').checked){const selected=[...$('#pa-products').selectedOptions].map(o=>o.value);if(!selected.length)throw Error('Select products to compare, or choose All Products.');f.productIds=selected.join(',');}
 return f;
}
function loadProductPerformance(read=false){
 const root=$('#product-analytics'),result=$('#pa-results');if(!root||!result)return;
 const button=$('#pa-apply');
 try{if(read)productAnalyticsState.filters=readProductAnalyticsFilters();}catch(error){productAnalyticsState.request++;productAnalyticsState.data=null;result.textContent=error.message;result.setAttribute('aria-busy','false');button.disabled=false;$('#pa-export').disabled=true;return;}
 const userId=AUTH?.id,filters={...productAnalyticsState.filters},key=new URLSearchParams(filters).toString(),pending=productAnalyticsState.pending;
 if(pending&&pending.root===root&&pending.userId===userId&&pending.key===key&&pending.request===productAnalyticsState.request)return pending.promise;
 const request=++productAnalyticsState.request,current=()=>request===productAnalyticsState.request&&userId===AUTH?.id&&root===$('#product-analytics');
 if(typeof hideReportsTooltip==='function')hideReportsTooltip();
 productAnalyticsState.data=null;result.setAttribute('aria-busy','true');result.innerHTML=productAnalyticsSkeleton();button.disabled=true;$('#pa-export').disabled=true;
 const entry={root,userId,key,request};productAnalyticsState.pending=entry;
 entry.promise=(async()=>{try{
  const data=await api('/api/reports/product-performance?'+key);if(!current())return;
  productAnalyticsState.data=data;productAnalyticsState.filters={...filters,from:data.appliedFilters.from,to:data.appliedFilters.to};
  for(const key of ['from','to']){const node=document.getElementById('pa-'+key);if(node.value===(filters[key]||''))node.value=data.appliedFilters[key];}
  populateProductAnalyticsOptions(data.options,filters);renderProductPerformance();
 }catch(error){if(current()){productAnalyticsState.data=null;if(error.status===401){failure(error);return;}if(error.details?.options)populateProductAnalyticsOptions(error.details.options,filters);result.innerHTML=`<div class="rd-error" role="alert"><b>Product analytics could not load</b><p>${esc(error.message)}</p><button class="b2" type="button" onclick="loadProductPerformance(true)">Retry product analytics</button></div>`;}}
 finally{if(productAnalyticsState.pending===entry)productAnalyticsState.pending=null;if(current()){result.setAttribute('aria-busy','false');button.disabled=false;}}})();
 return entry.promise;
}
function populateProductAnalyticsOptions(options,filters){
 const root=$('#product-analytics'),initialized=root.dataset.optionsReady==='1';
 for(const [control,key,blank,selected]of [['category','categories','All categories',filters.categoryIds],['customer','customers','All permitted customers',filters.customerId],['employee','employees','All permitted employees',filters.employeeId]]){
  const node=document.getElementById('pa-'+control),value=initialized?node.value:selected||'',choices=options[key].map(o=>[o.id,o.label||o.id]);
  if(value&&!choices.some(o=>o[0]===value))choices.push([value,[...node.options].find(o=>o.value===value)?.textContent||value]);const optionsKey=JSON.stringify(choices);if(node.dataset.optionsKey!==optionsKey){node.innerHTML=selectOptions(choices,value,blank);node.dataset.optionsKey=optionsKey;}
 }
 const picker=$('#pa-products'),selected=new Set(initialized?[...picker.selectedOptions].map(o=>o.value):(filters.productIds||'').split(',')),products=[...options.products];
 for(const option of picker.selectedOptions)if(!products.some(p=>p.id===option.value))products.push({id:option.value,label:option.textContent});
 const key=JSON.stringify(products.map(p=>[p.id,p.label]));if(picker.dataset.optionsKey!==key){picker.innerHTML=products.map(p=>`<option value="${esc(p.id)}" ${selected.has(p.id)?'selected':''}>${esc(p.label||p.id)} [${esc(p.id)}]</option>`).join('');picker.dataset.optionsKey=key;}root.dataset.optionsReady='1';
}
function resetProductPerformance(){if(typeof resetReportsChart==='function'&&$('#reports-dashboard'))return resetReportsChart();productAnalyticsState.filters={};productAnalyticsState.hidden.clear();productAnalyticsState.data=null;render();}
function analyticsNumber(value,metric){return ReportCharts.format(value,metric==='quotedValue'?'money':'count');}
function analyticsMonth(period){return new Intl.DateTimeFormat('en-IN',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(period+'-01T00:00:00Z'));}
function productPerformanceChart(data,metric){
 const lookup=new Map(data.monthly.map(r=>[r.productId+'/'+r.period,r])),products=productAnalyticsState.mode==='stacked'?data.products.filter(p=>!productAnalyticsState.hidden.has(p.id)):data.products;
 const labels=new Map();for(const p of data.products)labels.set(p.label,(labels.get(p.label)||0)+1);const label=p=>(p.label||p.id)+(labels.get(p.label)>1?' ['+p.id+']':'');
 const series=products.map(p=>({id:p.id,label:label(p),hidden:productAnalyticsState.hidden.has(p.id),unit:metric==='quotedValue'?'money':'count',color:ReportCharts.color(p.id),values:data.periods.map(period=>lookup.get(p.id+'/'+period)?.[metric]||0),notes:data.periods.map(period=>(lookup.get(p.id+'/'+period)?.names||[]).join(', '))}));
 const description=productAnalyticsState.mode==='stacked'&&metric==='quotationCount'?'Stack heights sum product-quotation counts. A quotation containing several products contributes to each product.':'Months on the horizontal axis; '+analyticsMetricLabels[metric]+(metric==='quotedValue'?' in INR':'')+' on the vertical axis.';
 return `${series.some(s=>!s.hidden)?ReportCharts.cartesian({id:'pa-chart',title:'Global Product Performance — '+analyticsMetricLabels[metric],description,months:data.periods,series,mode:productAnalyticsState.mode,width:Math.max(640,Math.floor($('#product-analytics').clientWidth-50)),height:330}):'<div class="rd-empty">All series are hidden. Select a product in the legend to show it.</div>'}<p class="rd-chart-note">${esc(description)}</p><ul class="pa-legend" aria-label="Toggle product series">${data.products.map(p=>`<li><button type="button" data-product-id="${esc(p.id)}" aria-pressed="${!productAnalyticsState.hidden.has(p.id)}" onclick="toggleProductSeries(this.dataset.productId)"><i style="background:${ReportCharts.color(p.id)}"></i><span>${esc(label(p))}</span></button></li>`).join('')}</ul><p class="rd-chart-note">Legend visibility affects the chart only. The table and CSV include all selected products.</p>`;
}
function toggleProductSeries(id){
 const hidden=productAnalyticsState.hidden;hidden.has(id)?hidden.delete(id):hidden.add(id);
 if(typeof hideReportsTooltip==='function')hideReportsTooltip();
 const visual=$('#pa-visual'),group=[...(visual?.querySelectorAll('[data-series-id]')||[])].find(n=>n.dataset.seriesId===id),button=[...document.querySelectorAll('.pa-legend button')].find(b=>b.dataset.productId===id);
 // Keep the comparison scale and bar positions stable while hiding a series.
 // Stacked charts require restacking; all-hidden charts retain their empty state.
 if(group&&productAnalyticsState.mode!=='stacked'&&hidden.size<productAnalyticsState.data.products.length){visual.classList.add('rd-static');group.toggleAttribute('hidden',hidden.has(id));group.setAttribute('aria-hidden',String(hidden.has(id)));button?.setAttribute('aria-pressed',String(!hidden.has(id)));}
 else renderProductPerformance(true);
 [...document.querySelectorAll('.pa-legend button')].find(b=>b.dataset.productId===id)?.focus({preventScroll:true});
}
function renderProductPerformance(visualOnly=false){
 const data=productAnalyticsState.data,result=$('#pa-results');if(!data||!result)return;
 const metric=data.appliedFilters.metric,visual=$('#pa-visual');
 if(typeof hideReportsTooltip==='function')hideReportsTooltip();
 if(visualOnly&&visual){visual.classList.add('rd-static');visual.innerHTML=productPerformanceChart(data,metric);if(typeof updateReportsChartOverflow==='function')updateReportsChartOverflow();return;}
 const cells=new Map(data.monthly.map(r=>[r.productId+'/'+r.period,r]));
 result.innerHTML=`<div class="pa-summary"><span>${esc(data.scope==='own'?'Your quotations only':'All permitted quotations')}</span><span>${analyticsNumber(data.totals.quotationCount,'quotationCount')} unique quotations</span><span>${analyticsNumber(data.totals.quotedValue,'quotedValue')} product value</span></div>
 ${data.totals.legacyCategoryLines||data.totals.unknownCategoryLines?'<p class="note">Older quotations have no saved product category. Their category filters use the category available when analytics was enabled; unavailable categories stay unassigned.</p>':''}
 ${Object.values(data.options.truncated).some(Boolean)?'<p class="note">Filter lists show the first 500 historical options. Reports include all matching data within the chart limits.</p>':''}
 ${!data.products.length||!data.periods.length?'<div class="rd-empty">No quoted products match these filters.</div>':`${!data.totals.quotationCount?'<p class="note">No quotations match these dates. Selected historical products are shown with zero values.</p>':''}<div id="pa-visual">${productPerformanceChart(data,metric)}</div><details class="pa-data" ${productAnalyticsState.dataOpen?'open':''} ontoggle="productAnalyticsState.dataOpen=this.open"><summary>View monthly product data <span>${esc(data.products.length)} products · ${data.periods.length} months</span></summary><div class="pa-table-scroll" role="region" aria-label="Monthly product performance data" tabindex="0"><table><caption>${esc(analyticsMetricLabels[metric])} by product and month</caption><thead><tr><th scope="col">Month</th>${data.products.map(p=>`<th scope="col">${esc(p.label||p.id)}<small> [${esc(p.id)}]</small></th>`).join('')}</tr></thead><tbody>${data.periods.map(period=>`<tr><th scope="row">${esc(analyticsMonth(period))}</th>${data.products.map(p=>`<td title="${esc((cells.get(p.id+'/'+period)?.names||[]).join(', '))}">${analyticsNumber(cells.get(p.id+'/'+period)?.[metric]||0,metric)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><details class="pa-history"><summary>Historical product names</summary>${data.products.map(p=>`<p><b>${esc(p.id)}</b>: ${p.names.map(esc).join(', ')}${p.namesTruncated?' (first 20 names)':''}</p>`).join('')}</details></details>`}
 <p class="rd-chart-note">${esc(data.valueDefinition)} ${esc(data.quantityDefinition)} Quotation dates (${esc(data.timezone)}).</p>`;
 if(typeof updateReportsChartOverflow==='function')updateReportsChartOverflow();
 result.setAttribute('aria-busy','false');$('#pa-export').disabled=!data.products.length||!data.periods.length;
 const label=$('#pa-selection-label');if(label)label.textContent=data.appliedFilters.productIds.length?data.appliedFilters.productIds.length+' selected':'All Products';
}
function exportProductPerformance(){
 const data=productAnalyticsState.data;if(!data)return;const cells=new Map(data.monthly.map(row=>[row.productId+'/'+row.period,row])),f=data.appliedFilters;
 const rows=[['Month','Product ID','Quoted product','Unique quotations','Line items','Quantity','Product value including GST (INR)','From','To','Year filter','Month filter','Customer ID','Employee ID','Status','Product category IDs']];
 for(const period of data.periods)for(const p of data.products){const cell=cells.get(p.id+'/'+period)||{};rows.push([period,p.id,p.label,cell.quotationCount||0,cell.lineItemCount||0,cell.quantity||0,ReportCharts.moneyDecimal(cell.quotedValue||0),f.from,f.to,f.year||'',f.month||'',f.customerId||'',f.employeeId||'',f.status||'',f.categoryIds.join(',')]);}
 csv(rows,'product-performance.csv');
}
async function toggleProductFullscreen(){
 const root=$('#product-analytics');if(!root)return;
 try{if(document.fullscreenElement===root)await document.exitFullscreen();else if(root.classList.contains('pa-expanded'))closeProductExpanded();else if(root.requestFullscreen)await root.requestFullscreen();else openProductExpanded();}catch{openProductExpanded();}
 syncProductFullscreen();
}
let productFullscreenInert=[];
function openProductExpanded(){
 const root=$('#product-analytics');if(!root||root.classList.contains('pa-expanded'))return;
 root.classList.add('pa-expanded');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.dataset.previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
 for(let branch=root;branch.parentElement;branch=branch.parentElement){for(const sibling of branch.parentElement.children)if(sibling!==branch&&!sibling.inert){sibling.inert=true;productFullscreenInert.push(sibling);}if(branch.parentElement===document.body)break;}
 $('#pa-fullscreen')?.focus();
}
function restoreProductExpanded(){
 const root=$('#product-analytics');if(root?.classList.contains('pa-expanded')){root.classList.remove('pa-expanded');root.removeAttribute('role');root.removeAttribute('aria-modal');document.body.style.overflow=root.dataset.previousOverflow||'';}
 for(const node of productFullscreenInert)node.inert=false;productFullscreenInert=[];
}
function closeProductExpanded(){restoreProductExpanded();syncProductFullscreen();$('#pa-fullscreen')?.focus({preventScroll:true});}
function syncProductFullscreen(){const root=$('#product-analytics'),button=$('#pa-fullscreen');if(button){const expanded=document.fullscreenElement===root||root.classList.contains('pa-expanded');button.setAttribute('aria-pressed',String(expanded));button.innerHTML=reportsIcon('expand')+' '+(expanded?'Exit full screen':'View full screen');}}
function cleanupProductFullscreen(){restoreProductExpanded();}
 document.addEventListener('fullscreenchange',syncProductFullscreen);
 document.addEventListener('keydown',event=>{const root=$('#product-analytics');if(!root?.classList.contains('pa-expanded'))return;if(event.key==='Escape'){event.preventDefault();closeProductExpanded();}if(event.key==='Tab'){const controls=[...root.querySelectorAll('button,input,select,summary,[tabindex="0"]')].filter(el=>el.tabIndex>=0&&el.getClientRects().length&&!el.disabled&&getComputedStyle(el).visibility!=='hidden'&&![...root.querySelectorAll('details:not([open])')].some(details=>details.contains(el)&&details.querySelector(':scope > summary')!==el)),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
