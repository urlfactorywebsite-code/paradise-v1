/* Reusable, dependency-free report charts and projections of report API data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ReportCharts=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const currency=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2});
 const count=new Intl.NumberFormat('en-IN',{maximumFractionDigits:0});
 function moneyDecimal(value){const paise=BigInt(value),absolute=paise<0n?-paise:paise;return (paise<0n?'-':'')+String(absolute/100n)+'.'+String(absolute%100n).padStart(2,'0');}
 function moneyFormat(value){const paise=BigInt(value),absolute=paise<0n?-paise:paise;return (paise<0n?'-':'')+currency.format(absolute/100n).slice(0,-2)+String(absolute%100n).padStart(2,'0');}
 function format(value,unit='count'){return unit==='money'?moneyFormat(value):unit==='percent'?value.toFixed(1)+'%':count.format(value);}
 function compact(value,unit){return new Intl.NumberFormat('en-IN',{notation:'compact',maximumFractionDigits:1,...(unit==='money'?{style:'currency',currency:'INR'}:{})}).format(unit==='money'?value/100:value);}
 function color(id){let hash=2166136261;for(const c of String(id))hash=Math.imul(hash^c.charCodeAt(0),16777619);hash=Math.imul(hash^(hash>>>16),0x85ebca6b);hash=Math.imul(hash^(hash>>>13),0xc2b2ae35);hash^=hash>>>16;return `hsl(${(hash>>>0)%360} 48% 34%)`;}
 function month(period){return new Intl.DateTimeFormat('en-IN',{month:'short',year:'2-digit',timeZone:'UTC'}).format(new Date(period+'-01T00:00:00Z'));}
 function periods(filters){
  const from=filters.from,to=filters.to;if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||from>to)throw Error('Choose a valid from and to date.');
  const start=Number(from.slice(0,4))*12+Number(from.slice(5,7))-1,end=Number(to.slice(0,4))*12+Number(to.slice(5,7))-1;
  if(end-start>=60)throw Error('Choose a date range of at most 60 calendar months.');
  const result=[];for(let n=start;n<=end;n++){const year=Math.floor(n/12),m=n%12+1;if((!filters.year||year===Number(filters.year))&&(!filters.month||m===Number(filters.month)))result.push(String(year).padStart(4,'0')+'-'+String(m).padStart(2,'0'));}return result;
 }
 function summaryModel(data,months){
  const approved=data.byStatus.find(r=>r.key==='Customer Approved')?.count||0;
  const trend=new Map(months.map(p=>[p,{period:p,count:0,value:0,approved:0,rejected:0}]));
  for(const row of data.byDate){const target=trend.get(row.key.slice(0,7));if(target){target.count+=row.count;target.value+=row.quotedValue;}}
  for(const row of data.byMonthStatus||[]){const target=trend.get(row.period);if(target){if(row.status==='Customer Approved')target.approved+=row.count;if(row.status==='Customer Rejected')target.rejected+=row.count;}}
  const products=[...data.products].sort((a,b)=>(b.quotationCount||0)-(a.quotationCount||0)||a.id.localeCompare(b.id));
  return {total:data.count,quotedValue:data.quotedValue,approved,approvalRate:data.count?approved/data.count*100:null,customers:data.byCustomer.length,top:products[0]||null,products,trend:[...trend.values()]};
 }
 function sharingModel(rows,quotationIds,months,timezone){
  const selected=rows.filter(row=>quotationIds.has(row.quotationId)),map=new Map(months.map(p=>[p,{period:p,prepared:0,confirmed:0,failed:0}]));let invalidDates=0;const formatter=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',timeZone:timezone});
  for(const row of selected){const date=new Date(row.createdAt);if(!Number.isFinite(date.getTime())){invalidDates++;continue;}
   const parts=formatter.formatToParts(date),period=parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
   if(!map.has(period))map.set(period,{period,prepared:0,confirmed:0,failed:0});const target=map.get(period);
   if(row.status==='Prepared')target.prepared++;else if(row.status==='Manually Confirmed')target.confirmed++;else if(row.status==='Failed')target.failed++;
  }
  return {rows:selected,monthly:[...map.values()].sort((a,b)=>a.period.localeCompare(b.period)),invalidDates};
 }
 const mark=(label,focus=true)=>`data-chart-tip="${escape(label)}"${focus?' tabindex="0"':''} aria-label="${escape(label)}"`;
 function legend(series){return `<ul class="rd-chart-legend">${series.map(s=>`<li><i style="background:${s.color||color(s.id)}"></i>${escape(s.label)}</li>`).join('')}</ul>`;}
 function cartesian({id,title,description='',months,series,mode='line',width=860,height=285}){
  const left=64,right=series.some(s=>s.unit==='money')&&series.some(s=>s.unit!=='money')?78:25,top=22,bottom=47;
  width=Math.max(width,months.length*53+left+right);const h=height-top-bottom,step=(width-left-right)/Math.max(1,months.length),x=i=>left+step*(i+.5),units=[...new Set(series.map(s=>s.unit||'count'))];
  const ceilings=new Map(units.map(unit=>{const own=series.filter(s=>(s.unit||'count')===unit),max=mode==='stacked'?Math.max(1,...months.map((_,i)=>own.reduce((n,s)=>n+(s.values[i]||0),0))):Math.max(1,...own.flatMap(s=>s.values));return [unit,Math.max(4,Math.ceil(max/4)*4)];}));
  const y=(value,unit='count')=>top+h*(1-value/ceilings.get(unit));let drawing='';
  for(let tick=0;tick<=4;tick++){const py=top+h*(1-tick/4);drawing+=`<line x1="${left}" x2="${width-right}" y1="${py}" y2="${py}" class="rd-grid-line"/>`;units.forEach((unit,index)=>{drawing+=`<text x="${index?width-right+10:left-10}" y="${py+4}" text-anchor="${index?'start':'end'}">${escape(compact(ceilings.get(unit)*tick/4,unit))}</text>`;});}
  const stride=Math.max(1,Math.ceil(months.length/12));months.forEach((period,i)=>{if(i%stride===0||i===months.length-1)drawing+=`<text x="${x(i)}" y="${height-18}" text-anchor="middle">${escape(month(period))}</text>`;});
  const stacked=new Map(units.map(unit=>[unit,months.map(()=>0)]));
  series.forEach((s,index)=>{drawing+=`<g data-series-id="${escape(s.id)}"${s.hidden?' hidden aria-hidden="true"':''}>`;const unit=s.unit||'count',fill=s.color||color(s.id),label=i=>`${s.label} · ${month(months[i])}: ${format(s.values[i]||0,unit)}${s.notes?.[i]?' · quoted as '+s.notes[i]:''}`;
   if(mode==='grouped'||mode==='stacked')s.values.forEach((value,i)=>{const bar=step*.76/(mode==='grouped'?Math.max(1,series.length):1),base=mode==='stacked'?stacked.get(unit)[i]:0,bx=mode==='grouped'?x(i)-step*.38+bar*index:x(i)-bar/2;
    const barHeight=h*value/ceilings.get(unit),hitHeight=Math.max(8,barHeight);
    drawing+=`<rect class="rd-bar" data-product-id="${escape(s.id)}" x="${bx}" y="${y(base+value,unit)}" width="${Math.max(.4,bar-1)}" height="${barHeight}" rx="2" fill="${fill}"><title>${escape(label(i))}</title></rect><rect class="rd-chart-hit" x="${bx}" y="${Math.max(top,y(base+value,unit)-Math.max(0,hitHeight-barHeight))}" width="${Math.max(4,bar-1)}" height="${hitHeight}" fill="transparent" pointer-events="all" ${mark(label(i),months.length*series.length<=100)}/>`;stacked.get(unit)[i]+=value;
   });else{
    const points=s.values.map((v,i)=>`${x(i)},${y(v,unit)}`).join(' '),path=s.values.map((v,i)=>`${i?'L':'M'}${x(i)},${y(v,unit)}`).join(' ');
    if(mode==='area'&&months.length)drawing+=`<polygon points="${x(0)},${y(0,unit)} ${points} ${x(months.length-1)},${y(0,unit)}" fill="${fill}" fill-opacity=".09"/>`;
    drawing+=`<path class="rd-line" data-product-id="${escape(s.id)}" d="${path}" pathLength="1" fill="none" stroke="${fill}" stroke-width="2.5"/>`;
    s.values.forEach((v,i)=>{drawing+=`<circle cx="${x(i)}" cy="${y(v,unit)}" r="4" fill="${fill}" stroke="white" stroke-width="1.5" ${mark(label(i),months.length*series.length<=100)}><title>${escape(label(i))}</title></circle>`;});
   }
   drawing+='</g>';
  });
  return `<div class="rd-chart-scroll" role="region" aria-label="${escape(title)} chart; scroll for more months" tabindex="0"><svg viewBox="0 0 ${width} ${height}" style="min-width:${width}px" role="img" aria-labelledby="${escape(id)}-title ${escape(id)}-desc"><title id="${escape(id)}-title">${escape(title)}</title><desc id="${escape(id)}-desc">${escape(description)} Exact values are available in the report tables.</desc>${drawing}</svg></div><p class="rd-chart-hint" hidden>Swipe or scroll horizontally for all months and axes. Exact values are available in the tables.</p>`;
 }
 function ranking({id,title,rows,unit='count',limit=6}){
  if(!rows.length)return '<div class="rd-empty">No matching data in this period.</div>';
  const selected=[...rows].sort((a,b)=>b.value-a.value||a.id.localeCompare(b.id)).slice(0,limit),max=Math.max(1,...selected.map(r=>r.value));
  return `<div class="rd-ranking" role="group" aria-label="${escape(title)}; ${escape(unit==='money'?'quoted value in INR':'quotation count')}">${selected.map((row,index)=>`<div class="rd-rank-row"><div class="rd-rank-label"><span><small>${String(index+1).padStart(2,'0')}</small>${escape(row.label)}</span><b>${escape(format(row.value,unit))}</b></div><div class="rd-rank-track"><div class="rd-rank-fill" style="width:${Math.max(0,row.value/max*100)}%;background:${row.color||color(row.id)}" ${mark(`${row.label}: ${format(row.value,unit)}${row.detail?' · '+row.detail:''}`)}></div></div>${row.detail?`<small class="rd-rank-detail">${escape(row.detail)}</small>`:''}</div>`).join('')}</div>`;
 }
 function donut({id,title,rows}){
  const total=rows.reduce((s,r)=>s+r.count,0);if(!total)return '<div class="rd-empty">No quotations in this period.</div>';
  const radius=66,circumference=2*Math.PI*radius;let offset=0;
  const arcs=rows.filter(r=>r.count).map(row=>{const length=row.count/total*circumference,arc=`<circle cx="100" cy="100" r="${radius}" fill="none" stroke="${row.color||color(row.key)}" stroke-width="22" stroke-dasharray="${length} ${circumference-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 100 100)" ${mark(`${row.key}: ${format(row.count)} (${(row.count/total*100).toFixed(1)}%)`)}><title>${escape(row.key)}: ${format(row.count)}</title></circle>`;offset+=length;return arc;}).join('');
  return `<div class="rd-donut"><svg viewBox="0 0 200 200" role="img" aria-labelledby="${id}-title"><title id="${id}-title">${escape(title)}</title>${arcs}<text x="100" y="99" text-anchor="middle" class="rd-donut-total">${format(total)}</text><text x="100" y="118" text-anchor="middle">quotations</text></svg><ul>${rows.filter(r=>r.count).map(r=>`<li><i style="background:${r.color||color(r.key)}"></i><span>${escape(r.key)}</span><b>${format(r.count)}</b></li>`).join('')}</ul></div>`;
 }
 return {escape,format,moneyDecimal,compact,color,month,periods,summaryModel,sharingModel,cartesian,ranking,donut,legend};
});
