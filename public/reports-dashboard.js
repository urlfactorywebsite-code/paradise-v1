/* Reports-only presentation. Existing APIs and document workflows remain authoritative. */
'use strict';
const reportsDashboardState={userId:null,request:0,summary:null,model:null,history:null,appliedQuery:'',previousKpis:null,openDetails:new Set(['status']),employeeMetric:'money',months:[]};
function reportsIcon(name){
 const paths={download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',expand:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',filter:'M4 7h16M7 12h10m-7 5h4',trend:'m3 17 6-6 4 4 8-11m-6 0h6v6',check:'m5 12 4 4L19 6',percent:'m5 19 14-14M7 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4m10 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4',customers:workspaceIcons.cust,product:workspaceIcons.prod,quotes:workspaceIcons.list,value:'M6 4h12M6 8h12M8 4c7 0 7 10 0 10H6l10 7'};
 return `<svg class="wi" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.trend}"/></svg>`;
}
function reportsToday(timezone=reportsDashboardState.timezone||workspaceTimezone){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function reportsDefaultFilters(){const year=reportsToday().slice(0,4);return {a:year+'-01-01',b:year+'-12-31',y:'',m:'',cu:'',sp:'',st:'',range:'year'};}
function reportsSkeleton(count=6){return `<div class="rd-kpis" role="status" aria-label="Loading report totals">${Array.from({length:count},()=>'<div class="rd-kpi rd-skeleton"><span></span><b></b><small></small></div>').join('')}</div>`;}
function reportsSecondarySkeleton(){return Array.from({length:7},()=>'<section class="rd-panel rd-skeleton-panel" aria-label="Loading report chart"><div class="rd-skeleton-line"></div>'+productAnalyticsSkeleton()+'</section>').join('');}
V.rep=()=>{
 if(reportsDashboardState.userId!==AUTH?.id){Object.assign(reportsDashboardState,{userId:AUTH?.id,summary:null,model:null,history:null,previousKpis:null,appliedQuery:'',openDetails:new Set(['status']),employeeMetric:'money'});reportsDashboardState.request++;RF=reportsDefaultFilters();}
 const field=(label,key,options,blank)=>fld(label,`<select id="pa-${key}" onchange="reportsGlobalChanged('${key}')">${selectOptions(options,RF[{customer:'cu',employee:'sp',status:'st',month:'m'}[key]]||'',blank)}</select>`);
 return `<div id="reports-dashboard" class="reports-dashboard"><header class="rd-header"><div><span class="rd-eyebrow">BUSINESS INTELLIGENCE</span><h1>Reports &amp; Analytics</h1><p>Analyze quotations, products, customers, and employee performance.</p></div><button id="rd-export" class="rd-export" onclick="repCsv()" disabled>${reportsIcon('download')} Export reports</button></header>
 <details id="rd-filter-panel" class="rd-filter-panel" open><summary>${reportsIcon('filter')} Global filters <span>Dates, customers &amp; team</span></summary><div class="rd-filter-content"><form id="rd-filter-form" onsubmit="event.preventDefault();applyReportsFilters()"><div class="rd-filters">
 ${fld('Date range',`<select id="rd-range" onchange="reportsRangeChanged(this.value)">${selectOptions([['year','This year'],['month','This month'],['30days','Last 30 days'],['custom','Custom range']],RF.range||'custom')}</select>`)}
 ${fld('From date',`<input id="pa-from" type="date" value="${esc(RF.a)}" required onchange="reportsGlobalChanged('from')">`)}${fld('To date',`<input id="pa-to" type="date" value="${esc(RF.b)}" required onchange="reportsGlobalChanged('to')">`)}
 ${fld('Year',`<input id="pa-year" type="number" min="1000" max="9999" step="1" placeholder="Any year" value="${esc(RF.y||'')}" onchange="reportsGlobalChanged('year')">`)}
 ${field('Month','month',Array.from({length:12},(_,i)=>[i+1,new Intl.DateTimeFormat('en',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2000,i,1)))]),'All months')}${field('Customer','customer',[],'All permitted customers')}${field('Employee','employee',[],'All permitted employees')}${field('Status','status',ST,'All statuses')}
 </div><div class="rd-filter-footer"><p id="rd-filter-note">Filters apply to all quotations, charts and detailed reports.</p><div><button type="submit" class="b2">Apply global filters</button><button type="button" class="rd-reset" onclick="resetReportsFilters()">Reset filters</button></div></div></form></div></details>
 <div id="rd-errors" aria-live="polite"></div><section id="rd-kpi-results" aria-label="Quotation performance indicators" aria-busy="true">${reportsSkeleton()}</section>
 ${productAnalyticsView(true)}
 <div class="rd-section-heading"><div><span class="rd-eyebrow">A CLOSER LOOK</span><h2>Quotation insights</h2></div><p>Quoted values include GST and separate charges. They are not revenue.</p></div><div id="rd-secondary" class="rd-secondary">${reportsSecondarySkeleton()}</div>
 <section class="rd-details-section" aria-labelledby="rd-details-title"><div class="rd-section-heading"><div><span class="rd-eyebrow">THE COMPLETE PICTURE</span><h2 id="rd-details-title">Detailed Reports</h2></div><span>Explore the records behind your charts</span></div><div id="server-reports" aria-live="polite" aria-busy="true"><div class="rd-empty">Loading detailed reports…</div></div></section>
 <p class="rd-footnote">Quoted values are not revenue or payments received. Product analytics includes GST after discounts and excludes separate quotation charges.</p></div>`;
};
reportQuery=function(){const p=new URLSearchParams();for(const [key,param]of [['a','from'],['b','to'],['y','year'],['m','month'],['sp','employee'],['cu','customer'],['st','status']])if(RF[key])p.set(param,RF[key]);return p;};
function readReportsGlobalFilters(){const result={range:$('#rd-range').value};for(const [key,id]of [['a','from'],['b','to'],['y','year'],['m','month'],['cu','customer'],['sp','employee'],['st','status']])result[key]=$('#pa-'+id).value;return result;}
function reportsSetControl(id,value){const node=document.getElementById(id);node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));}
function reportsGlobalChanged(key){
 if(key==='year'&&$('#pa-year').value&&$('#pa-year').checkValidity()){const year=$('#pa-year').value.padStart(4,'0');$('#pa-from').value=year+'-01-01';$('#pa-to').value=year+'-12-31';}
 if(key==='from'||key==='to')$('#pa-year').value='';if(['from','to','year','month'].includes(key))reportsSetControl('rd-range','custom');return applyReportsFilters();
}
function reportsRangeChanged(value){
 const date=reportsToday(),year=date.slice(0,4),month=date.slice(0,7);let from=year+'-01-01',to=year+'-12-31';
 if(value==='custom')return;
 if(value==='month'){from=month+'-01';const next=new Date(date+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1,0);to=next.toISOString().slice(0,10);}
 if(value==='30days'){from=addD(date,-29);to=date;}
 $('#pa-from').value=from;$('#pa-to').value=to;$('#pa-year').value='';reportsSetControl('pa-month','');return applyReportsFilters();
}
function applyReportsFilters(){if(!$('#reports-dashboard'))return;RF=readReportsGlobalFilters();return loadServerReports();}
function resetReportsChartControls(){productAnalyticsState.hidden.clear();productAnalyticsState.mode='grouped';reportsSetControl('pa-mode','grouped');reportsSetControl('pa-metric','quotationCount');reportsSetControl('pa-category','');$('#pa-all').checked=true;$('#pa-products').disabled=true;for(const option of $('#pa-products').options)option.selected=false;}
function resetReportsChart(){resetReportsChartControls();return applyReportsFilters();}
function resetReportsFilters(){
 RF=reportsDefaultFilters();for(const [key,id]of [['a','from'],['b','to'],['y','year'],['m','month'],['cu','customer'],['sp','employee'],['st','status']])reportsSetControl('pa-'+id,RF[key]);reportsSetControl('rd-range',RF.range);resetReportsChartControls();return loadServerReports();
}
const loadReportsProductPerformance=loadProductPerformance;
loadProductPerformance=function(read=false){return read&&$('#reports-dashboard')?loadServerReports({chartOnly:true}):loadReportsProductPerformance(read);};
const loadReportsLegacySrs=loadSrsView;
loadSrsView=function(view){if(view==='rep'&&$('#reports-dashboard'))return;return loadReportsLegacySrs(view);};
const loadReportsLegacy=loadServerReports;
loadServerReports=function({chartOnly=false}={}){
 const root=$('#reports-dashboard');if(!root)return loadReportsLegacy();
 const user=AUTH?.id;let query,months,productTask;
 try{
  if(!$('#rd-filter-form').checkValidity())throw Error('Enter valid dates and a year from 1000 through 9999.');
  RF=readReportsGlobalFilters();query=reportQuery();months=ReportCharts.periods(Object.fromEntries(query));
 }catch(error){reportsDashboardState.request++;productAnalyticsState.request++;productAnalyticsState.data=null;$('#pa-export').disabled=true;$('#pa-apply').disabled=false;$('#pa-results').setAttribute('aria-busy','false');$('#pa-results').innerHTML='<div class="rd-empty">Choose valid global filters to load the chart.</div>';reportsLoadError(error);return Promise.resolve();}
 // Product selection errors must not suppress otherwise valid global reports.
 try{productAnalyticsState.filters=readProductAnalyticsFilters();productTask=loadReportsProductPerformance(false);}
 catch(error){productAnalyticsState.request++;productAnalyticsState.data=null;$('#pa-export').disabled=true;$('#pa-apply').disabled=false;$('#pa-results').setAttribute('aria-busy','false');$('#pa-results').innerHTML=`<div class="rd-error" role="alert">${esc(error.message)}</div>`;productTask=Promise.resolve();}
 const key=query.toString(),pending=reportsDashboardState.pendingSummary;
 if(pending&&pending.root===root&&pending.user===user&&pending.key===key&&pending.request===reportsDashboardState.request)return Promise.allSettled([pending.promise,productTask]);
 if(chartOnly&&reportsDashboardState.summary&&reportsDashboardState.appliedQuery===key)return productTask;
 const request=++reportsDashboardState.request,current=()=>request===reportsDashboardState.request&&user===AUTH?.id&&root===$('#reports-dashboard');
 const previous=reportsDashboardState.summary?reportsDashboardState.model:reportsDashboardState.previousKpis;
 reportsDashboardState.summary=null;reportsDashboardState.model=null;reportsDashboardState.history=null;$('#rd-export').disabled=true;$('#rd-errors').textContent='';$('#rd-kpi-results').setAttribute('aria-busy','true');$('#rd-kpi-results').innerHTML=reportsSkeleton();$('#rd-secondary').innerHTML=reportsSecondarySkeleton();$('#server-reports').setAttribute('aria-busy','true');$('#server-reports').innerHTML='<div class="rd-empty">Loading detailed reports...</div>';
 const entry={root,user,key,request};reportsDashboardState.pendingSummary=entry;
 entry.promise=(async()=>{
  try{
   const data=await api('/api/reports/summary?'+query);if(!current())return;
   const oldZone=reportsDashboardState.timezone||workspaceTimezone;reportsDashboardState.timezone=data.timezone||oldZone;
   const range=$('#rd-range').value,keyForDate=date=>range==='year'?date.slice(0,4):range==='month'?date.slice(0,7):date;
   if(data.timezone&&data.timezone!==oldZone&&['year','month','30days'].includes(range)&&key===reportQuery().toString()&&keyForDate(reportsToday(oldZone))!==keyForDate(reportsToday()))return reportsRangeChanged(range);
   const model=ReportCharts.summaryModel(data,months);Object.assign(reportsDashboardState,{summary:data,model,months,appliedQuery:key,previousKpis:model});
   $('#rd-filter-note').textContent=`${query.get('employee')||!can('reports.view_all')?'Permitted employee scope':'All permitted employees'} \u00b7 ${query.get('from')} to ${query.get('to')}${query.get('year')?' \u00b7 '+query.get('year'):''}${query.get('month')?' \u00b7 month '+query.get('month'):''} \u00b7 Quotation dates`;
   populateReportsFallbackOptions(data);renderReportKpis(model,previous,request);renderReportsSecondary(data,model,months);renderReportsDetails(data);$('#rd-export').disabled=reportsDashboardState.exportRequest?.root===root;
   await loadReportSharing(data,months,current);
  }catch(error){if(!current())return;if(error.status===401){failure(error);return;}reportsLoadError(error);}
  finally{if(reportsDashboardState.pendingSummary===entry)reportsDashboardState.pendingSummary=null;}
 })();
 return Promise.allSettled([entry.promise,productTask]);
};
function reportsLoadError(error){
 reportsDashboardState.summary=null;reportsDashboardState.model=null;reportsDashboardState.history=null;$('#rd-export').disabled=true;
 $('#rd-errors').innerHTML=`<div class="rd-error" role="alert"><b>Reports could not load</b><p>${esc(error.message)}</p><button class="b2" onclick="applyReportsFilters()">Retry reports</button></div>`;
 $('#rd-kpi-results').setAttribute('aria-busy','false');$('#rd-kpi-results').innerHTML='<p class="rd-unavailable">Report totals are unavailable until the filters load successfully.</p>';$('#rd-secondary').innerHTML='';$('#server-reports').setAttribute('aria-busy','false');$('#server-reports').innerHTML='<div class="rd-empty">Detailed reports are unavailable. Retry to load them.</div>';
}
function populateReportsFallbackOptions(data){
 for(const [id,rows]of [['customer',data.byCustomer],['employee',data.byEmployee||[]]]){const node=$('#pa-'+id);if(node.options.length>1)continue;const selected=node.value||RF[id==='customer'?'cu':'sp']||'',choices=rows.filter(r=>r.key).map(r=>[r.key,r.name||r.key]);if(selected&&!choices.some(c=>c[0]===selected))choices.push([selected,selected]);node.innerHTML=selectOptions(choices,selected,id==='customer'?'All permitted customers':'All permitted employees');}
}
function renderReportKpis(model,previous,request){
 const entries=[['total','Total quotations',model.total,'count','Across the selected quotation dates','quotes'],['quotedValue','Total quoted value',model.quotedValue,'money','Includes GST & separate charges','value'],['approved','Approved quotations',model.approved,'count','Customer Approved status','check'],['approvalRate','Approval rate',model.approvalRate,'percent','Customer approved / total quotations','percent'],['customers','Total customers',model.customers,'count','Distinct customers with matching quotations','customers'],['top','Most quoted product',model.top?.name||'—','text',model.top?ReportCharts.format(model.top.quotationCount)+' unique quotations':'No quoted products in this period','product']];
 const root=$('#rd-kpi-results');root.innerHTML=`<div class="rd-kpis">${entries.map(([key,label,value,unit,context,icon])=>`<article class="rd-kpi"><div class="rd-kpi-label"><span>${label}</span>${reportsIcon(icon)}</div><b data-kpi="${key}" ${unit==='text'?'class="rd-kpi-product"':''} aria-label="${esc(label+': '+(value==null?'Not available':unit==='text'?value:ReportCharts.format(value,unit)))}">${value==null?'—':unit==='text'?esc(value):ReportCharts.format(value,unit)}</b><small>${esc(context)}</small></article>`).join('')}</div>`;root.setAttribute('aria-busy','false');
 if(!previous||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const start=performance.now(),elements=entries.filter(([key,,value,unit])=>unit!=='text'&&value!=null&&previous[key]!=null&&previous[key]!==value).map(([key,,value,unit])=>({element:root.querySelector(`[data-kpi="${key}"]`),from:previous[key],to:value,unit}));
 function tick(now){if(request!==reportsDashboardState.request||!root.isConnected)return;const p=Math.min(1,(now-start)/320),ease=1-Math.pow(1-p,3);for(const row of elements)row.element.textContent=ReportCharts.format(row.unit==='percent'?row.from+(row.to-row.from)*ease:Math.round(row.from+(row.to-row.from)*ease),row.unit);if(p<1)requestAnimationFrame(tick);}
 if(elements.length)requestAnimationFrame(tick);
}
function reportsPanel(id,title,subtitle,content,extra=''){return `<section id="${id}" class="rd-panel"><div class="rd-panel-heading"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div>${extra}</div><div class="rd-panel-body">${content}</div></section>`;}
function renderReportsSecondary(data,model,months){
 const trend=[{id:'quotation-count',label:'Quotations · left axis',unit:'count',color:'#155d68',values:model.trend.map(r=>r.count)},{id:'quotation-value',label:'Quoted value · right axis (INR)',unit:'money',color:'#ab6a2c',values:model.trend.map(r=>r.value)}];
 const decisions=[{id:'approved',label:'Customer approved',color:'#22725a',values:model.trend.map(r=>r.approved)},{id:'rejected',label:'Customer rejected',color:'#b34d42',values:model.trend.map(r=>r.rejected)}];
 const chart=(id,title,series,mode='line')=>months.length?ReportCharts.cartesian({id,title,description:'Quotation month. '+series.map(s=>s.label).join('; '),months,series,mode,width:600})+ReportCharts.legend(series):'<div class="rd-empty">No months match these filters.</div>';
 $('#rd-secondary').innerHTML=reportsPanel('rd-trend','Overall Quotation Trend','Monthly count and quoted value, on separate axes',chart('rd-trend-chart','Overall Quotation Trend',trend,'area'))+
 reportsPanel('rd-status','Quotation Status Distribution','Current status of matching quotations',ReportCharts.donut({id:'rd-status-chart',title:'Quotation Status Distribution',rows:data.byStatus.map(row=>({...row,color:({'Draft':'#69758c','Pending Internal Review':'#926f2d','Approved Internally':'#326b99','Sent to Customer':'#327b8c','Customer Approved':'#23775f','Customer Rejected':'#b34d42','Expired':'#8b5a36','Cancelled':'#67717a'})[row.key]}))}))+
 reportsPanel('rd-products','Top Quoted Products','Unique quotations per product · top 6',ReportCharts.ranking({id:'rd-product-rank',title:'Top Quoted Products',rows:model.products.map(p=>({id:p.id,label:p.name,value:p.quotationCount||0,detail:ReportCharts.format(p.quantity)+' quantity · '+ReportCharts.format(p.timesQuoted)+' line items'}))}))+
 reportsPanel('rd-employees','Employee Performance','Compare quotation counts and quoted values','<div id="rd-employee-chart"></div>',fld('Employee metric',`<select id="rd-employee-metric" onchange="reportsDashboardState.employeeMetric=this.value;renderReportEmployee()">${selectOptions([['money','Quoted value'],['count','Quotation count']],reportsDashboardState.employeeMetric)}</select>`))+
 reportsPanel('rd-customers','Customer Performance','Customer-wise quoted value · top 6',ReportCharts.ranking({id:'rd-customer-rank',title:'Customer Performance',unit:'money',rows:data.byCustomer.map(r=>({id:r.key,label:r.name||r.key,value:r.quotedValue,detail:ReportCharts.format(r.count)+' quotations'}))}))+
 reportsPanel('rd-decisions','Approval vs Rejection','Current customer decision, grouped by quotation month',chart('rd-decision-chart','Approval vs Rejection',decisions,'grouped'))+
 reportsPanel('rd-whatsapp','WhatsApp Sharing Analytics','Recorded sharing activity for the selected quotations','<div id="rd-whatsapp-chart">'+productAnalyticsSkeleton()+'</div>');renderReportEmployee();updateReportsChartOverflow();
}
function renderReportEmployee(){const data=reportsDashboardState.summary,root=$('#rd-employee-chart');if(!data||!root)return;const unit=reportsDashboardState.employeeMetric;root.innerHTML=ReportCharts.ranking({id:'rd-employee-rank',title:'Employee Performance',unit,rows:(data.byEmployee||[]).map(r=>({id:r.key||'unassigned',label:r.name||'Legacy / unassigned',value:unit==='money'?r.quotedValue:r.count,detail:ReportCharts.format(r.count)+' quotations · '+ReportCharts.format(r.quotedValue,'money')}))});}
function reportsDetail(key,title,columns,rows){
 return `<details class="rd-detail" data-report-detail="${key}" ${reportsDashboardState.openDetails.has(key)?'open':''}><summary><span>${esc(title)}</span><small>${ReportCharts.format(rows.length)} ${rows.length===1?'row':'rows'}</small></summary><div class="rd-detail-body rd-table-scroll" tabindex="0" role="region" aria-label="${esc(title)}"><table><caption>${esc(title)}</caption><thead><tr>${columns.map(c=>`<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${columns.length}" class="rd-table-empty">No matching records.</td></tr>`}</tbody></table></div></details>`;
}
function renderReportsDetails(data){
 const rows=items=>items.map(r=>[r.name||r.key,r.count,ReportCharts.format(r.quotedValue,'money')]),columns=['Group','Quotations','Quoted value (INR)'];
 $('#server-reports').innerHTML=reportsDetail('status','Quotations by status',columns,rows(data.byStatus))+reportsDetail('date','Quotations by date',columns,rows(data.byDate))+reportsDetail('employee','Quotations by employee',columns,rows(data.byEmployee||[]))+reportsDetail('products','Most frequently quoted products',['Product','Unique quotations','Line items','Quantity'],data.products.map(p=>[p.name,p.quotationCount,p.timesQuoted,p.quantity]))+reportsDetail('customers','Customer-wise history',columns,rows(data.byCustomer))+reportsDetail('decisions','Approved vs rejected',columns,rows(data.byStatus.filter(r=>['Customer Approved','Customer Rejected'].includes(r.key))))+reportsDetail('expired','Expired quotations',['Quotation','Customer','Quoted value (INR)'],data.expired.map(q=>[q.number,q.customer,ReportCharts.format(q.quotedValue,'money')]))+`<details class="rd-detail" data-report-detail="sharing" ${reportsDashboardState.openDetails.has('sharing')?'open':''}><summary><span>WhatsApp sharing report</span><small>Recorded attempts</small></summary><div id="report-wa" class="rd-detail-body">Loading sharing history…</div></details>`;$('#server-reports').setAttribute('aria-busy','false');
}
async function loadReportSharing(data,months,current){
 const permitted=can('quotation.share_whatsapp')&&(can('quotation.view_all')||can('quotation.view_own'));
 if(!permitted){const text='WhatsApp sharing history is outside your permissions.';if(current()){$('#rd-whatsapp-chart').innerHTML='<p class="rd-empty">'+text+'</p>';$('#report-wa').textContent=text;}return;}
 try{const rows=await allSharingHistory();if(!current())return;const model=ReportCharts.sharingModel(rows,new Set(data.sharingQuotationIds||[]),months,data.timezone||workspaceTimezone);reportsDashboardState.history=model;
  const series=[{id:'wa-confirmed',label:'Manually Confirmed',color:'#23775f',values:model.monthly.map(r=>r.confirmed)},{id:'wa-failed',label:'Failed',color:'#b34d42',values:model.monthly.map(r=>r.failed)},{id:'wa-prepared',label:'Prepared (unverified)',color:'#887443',values:model.monthly.map(r=>r.prepared)}];
  $('#rd-whatsapp-chart').innerHTML=(model.rows.length?ReportCharts.cartesian({id:'rd-whatsapp-data',title:'WhatsApp Sharing Analytics',description:'Current recorded attempt statuses, grouped by sharing month. Manual confirmation does not verify delivery.',months:model.monthly.map(r=>r.period),series,mode:'stacked',width:800})+ReportCharts.legend(series):'<div class="rd-empty">No sharing attempts for these quotations.</div>')+'<p class="rd-chart-note">Prepared is not successful delivery. Manually Confirmed is a staff confirmation; automated delivery and read status are unavailable. Sharing months use '+esc(data.timezone||workspaceTimezone)+'. Events belong to the selected quotations and may occur outside their quotation dates.</p>'+(model.invalidDates?'<p class="note">Some recorded events have no valid sharing date and cannot be plotted.</p>':'');
  updateReportsChartOverflow();$('#report-wa').innerHTML='<p class="rd-chart-note">Only sharing records permitted by your quotation permissions are shown. Delivery is unverified.</p>'+historyRows(model.rows,false);
 }catch(error){if(!current())return;if(error.status===401){failure(error);return;}const html=`<div class="rd-error" role="alert"><p>${esc(error.message)}</p><button class="b2" onclick="retryReportSharing()">Retry sharing history</button></div>`;$('#rd-whatsapp-chart').innerHTML=html;$('#report-wa').innerHTML=html;}
}
function retryReportSharing(){const root=$('#reports-dashboard'),request=reportsDashboardState.request,user=AUTH?.id;if(!reportsDashboardState.summary)return;return loadReportSharing(reportsDashboardState.summary,reportsDashboardState.months,()=>root===$('#reports-dashboard')&&request===reportsDashboardState.request&&user===AUTH?.id);}
repCsv=async function(){
 const root=$('#reports-dashboard'),user=AUTH?.id,active=reportsDashboardState.exportRequest;if(!root||!reportsDashboardState.summary||active?.root===root&&active.user===user)return;
 const entry={root,user,query:reportsDashboardState.appliedQuery},button=$('#rd-export'),controller=new AbortController();reportsDashboardState.exportRequest=entry;button.disabled=true;button.setAttribute('aria-busy','true');const timer=setTimeout(()=>controller.abort(),20000);
 const mounted=()=>root===$('#reports-dashboard')&&user===AUTH?.id;
 try{
  const response=await fetch('/api/reports/quotations.csv?'+entry.query,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
  if(!response.ok){const data=await response.json();throw Object.assign(Error(data.error||'Report export failed.'),{status:response.status});}
  const blob=await response.blob();if(!mounted())return;
  if(!reportsDashboardState.summary||reportsDashboardState.appliedQuery!==entry.query){toast('Report changed while the export was loading. Export again.');return;}
  await out(blob,'quotation-report.csv');toast('Download ready');
 }catch(error){if(mounted()){if(error.status===401)failure(error);else toast(error.name==='AbortError'?'Report export timed out. Narrow the filters or retry.':error.message,'er');}}
 finally{clearTimeout(timer);if(reportsDashboardState.exportRequest===entry){reportsDashboardState.exportRequest=null;if(mounted()){button.removeAttribute('aria-busy');button.disabled=!reportsDashboardState.summary;}}}
};
document.addEventListener('toggle',event=>{const key=event.target.dataset?.reportDetail;if(key){event.target.open?reportsDashboardState.openDetails.add(key):reportsDashboardState.openDetails.delete(key);}},true);
// Observe only the Reports container; expose scrolling when months or axes overflow.
let reportsChartResizeObserver=null,reportsObservedRoot=null;
function updateReportsChartOverflow(){
 const root=$('#reports-dashboard');if(!root)return;
 if(reportsObservedRoot!==root){reportsChartResizeObserver?.disconnect();reportsObservedRoot=root;reportsChartResizeObserver=new ResizeObserver(updateReportsChartOverflow);reportsChartResizeObserver.observe(root);}
 for(const chart of root.querySelectorAll('.rd-chart-scroll')){const hint=chart.nextElementSibling;if(hint?.classList.contains('rd-chart-hint'))hint.hidden=chart.scrollWidth<=chart.clientWidth+1;}
}
// Shared tooltips are text-only and support pointer, focus and Escape.
let reportsTooltipTarget=null;
function hideReportsTooltip(){
 if(reportsTooltipTarget){const ids=(reportsTooltipTarget.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!=='rd-tooltip');if(ids.length)reportsTooltipTarget.setAttribute('aria-describedby',ids.join(' '));else reportsTooltipTarget.removeAttribute('aria-describedby');}
 reportsTooltipTarget=null;document.getElementById('rd-tooltip')?.remove();
}
function showReportsTooltip(target,event){
 hideReportsTooltip();if(!target?.closest('#reports-dashboard'))return;reportsTooltipTarget=target;const tip=document.createElement('div');tip.id='rd-tooltip';tip.className='rd-tooltip';tip.setAttribute('role','tooltip');target.setAttribute('aria-describedby',[(target.getAttribute('aria-describedby')||''),'rd-tooltip'].filter(Boolean).join(' '));tip.textContent=target.dataset.chartTip;(document.fullscreenElement||document.body).append(tip);
 const rect=target.getBoundingClientRect(),x=event?.clientX||rect.left+rect.width/2,y=event?.clientY||rect.top;tip.style.left=Math.max(8,Math.min(x+12,innerWidth-tip.offsetWidth-12))+'px';tip.style.top=Math.max(8,Math.min(y+14,innerHeight-tip.offsetHeight-12))+'px';
}
document.addEventListener('pointerover',event=>{if(event.target.closest?.('#rd-tooltip'))return;const target=event.target.closest?.('[data-chart-tip]');if(target!==reportsTooltipTarget){if(target)showReportsTooltip(target,event);else hideReportsTooltip();}});
document.addEventListener('focusin',event=>{const target=event.target.closest?.('[data-chart-tip]');if(target)showReportsTooltip(target);else hideReportsTooltip();});
document.addEventListener('pointerout',event=>{if(reportsTooltipTarget&&!reportsTooltipTarget.contains(event.relatedTarget)&&!document.getElementById('rd-tooltip')?.contains(event.relatedTarget))hideReportsTooltip();});
document.addEventListener('keydown',event=>{if(event.key==='Escape')hideReportsTooltip();});
document.addEventListener('scroll',hideReportsTooltip,true);
const reportsBeforeRender=workspaceBeforeRender;
workspaceBeforeRender=function(){cleanupProductFullscreen();hideReportsTooltip();reportsChartResizeObserver?.disconnect();reportsObservedRoot=null;reportsBeforeRender();};
const reportsAfterRender=workspaceAfterRender;
workspaceAfterRender=function(view){reportsAfterRender(view);if(view==='rep'&&matchMedia('(max-width:600px)').matches)$('#rd-filter-panel').open=false;};
