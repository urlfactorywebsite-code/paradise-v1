'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const DP = require('../shared/domain');
function ui(role='Administrator',permissions) {
  const elements=new Map();
  const node=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',style:{},dataset:{},value:'',disabled:false,append(){},remove(){},insertAdjacentHTML(position,html){this.innerHTML+=html}});return elements.get(selector)};
  for(const key of ['#app','#modal','#toast','#connection','#cc','#wa-result'])node(key);
  const requests=[];
  const context=vm.createContext({DP,crypto:crypto.webcrypto,console,AbortController,URLSearchParams,Blob,URL,
    setTimeout(fn,ms){const t=setTimeout(fn,ms);t.unref();return t},clearTimeout,
    window:{addEventListener(){}},location:{hash:'#dash'},
    document:{body:{classList:{toggle(){}}},querySelector:s=>elements.get(s)||null,querySelectorAll:()=>[],createElement:()=>node('element'),addEventListener(){}},
    fetch:async(route,options={})=>{requests.push({route,options});const data=route==='/api/quotations/Q1'?{version:1,data:JSON.parse(JSON.stringify(vm.runInContext("getQ('Q1')",context)))}:route.endsWith('/whatsapp')?{data:{id:'attempt-1',status:'Prepared'},clickToChatUrl:'https://wa.me/919876543210?text=Quotation',pdfUrl:'/api/whatsapp/history/attempt-1/pdf'}:route==='/api/whatsapp/settings'?{data:{enabled:true,messageTemplate:'Hello {{customer_name}} — {{quotation_number}}: {{grand_total}}'},version:1}:{data:[]};return {ok:true,status:200,json:async()=>data}},
  });
  for(const file of ['app.js','backend-ui.js','srs-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public',file),'utf8').replace(/start\(\);\s*$/,''),context,{filename:file});
  context.initial={state:DP.seed({demo:true}),revision:1,user:{id:'user-1',name:'Test User',role,permissions}};
  vm.runInContext('adopt(initial);CSRF="test-csrf";',context);
  return {run:code=>vm.runInContext(code,context),node,requests};
}
test('all SRS screens render and explicit permissions govern navigation',()=>{
 const app=ui();
 for(const view of ['dash','new','list','cust','prod','cat','price','rep','team','set','wa'])assert.ok(app.run(`V.${view}()`).length>20,view);
 const limited=ui('Employee',['customer.view','product.view']);
 assert.equal(limited.run("allowedView('cust')"),true);
 assert.equal(limited.run("allowedView('prod')"),true);
 for(const view of ['new','list','cat','price','rep','team','set','wa'])assert.equal(limited.run(`allowedView('${view}')`),false,view);
 assert.doesNotMatch(limited.run('V.prod()'),/onclick="prod(?:Form|Toggle|Del)/);
});
test('customer preview excludes private item notes even for legacy showNotes setting',()=>{
 const app=ui();app.run("S.set.showNotes=true;S.quotes[0].items[0].notes='PRIVATE-COST-NOTE';");
 assert.doesNotMatch(app.run('docHTML(S.quotes[0])'),/PRIVATE-COST-NOTE/);
 assert.match(app.run('docHTML(S.quotes[0])'),/QUOTATION/);
});
test('configurator renders numeric and conditional fields and uses shared calculation validation',()=>{
 const app=ui();app.run("Q=newQ();const p=prod('p5');p.f.push({k:'copies',l:'Copies',t:'num',required:true,min:2,max:5,default:2});p.f.push({k:'special',l:'Special instructions',t:'txt',when:{key:'copies',equals:3}});openCfg('p5');");
 assert.match(app.node('#modal').innerHTML,/Copies \*/);
 assert.doesNotMatch(app.node('#modal').innerHTML,/Special instructions/);
 app.node('#config-fields');app.run("cs_('copies',3)");
 assert.match(app.node('#config-fields').innerHTML,/Special instructions/);
 app.run("cs_('copies',6)");assert.match(app.node('#cc').innerHTML,/Copies/);
});
test('manual WhatsApp preparation reviews recipient and message without changing quotation status',async()=>{
 const app=ui();app.run("S.customers[0].wa='+919876543210';");
 await app.run("shareQuotation('Q1')");
 assert.match(app.node('#modal').innerHTML,/attach it in the chat|Manual sharing/);
 assert.match(app.node('#modal').innerHTML,/\+919876543210/);
 assert.match(app.node('#modal').innerHTML,/DP\/QTN\/2026\/0001/);
 const status=app.run("getQ('Q1').status");
 app.node('#wa_number').value='+919876543210';app.node('#wa_message').value='Reviewed quotation message';
 await app.run("prepareWhatsApp('Q1')");
 assert.equal(app.run("getQ('Q1').status"),status);
 assert.match(app.node('#wa-result').innerHTML,/Opening the chat does not send the message/);
 assert.match(app.node('#wa-result').innerHTML,/I attached and sent the PDF/);
 assert.equal(app.requests.filter(r=>r.options.method==='POST').length,1);
 assert.equal(JSON.parse(app.requests.find(r=>r.route.endsWith('/whatsapp')).options.body).message,'Reviewed quotation message');
});
test('report CSV and dashboard filters include the selected customer employee and status',()=>{
 const app=ui();app.run("RF={a:'2026-10-01',b:'2026-10-23',sp:'Priya',cu:'C1',st:'Draft'}");
 const params=new URLSearchParams(app.run('reportQuery().toString()'));
 assert.equal(params.get('customer'),'C1');assert.equal(params.get('status'),'Draft');assert.equal(params.get('employee'),'Priya');
 app.run("D.sp='Priya';D.cu='C1';D.st='Sent to Customer';");assert.equal(app.run('inRange().length'),1);
});
test('legacy company labels are replaced in settings branding and customer document previews',()=>{
 const app=ui();
 app.run("Object.assign(S.set,{name:'[Placeholder company]',tag:'[Placeholder: Tagline]',addr:'[Placeholder address]',signature:'[Placeholder signature]',footer:'[Placeholder footer]',customerNotes:'[Placeholder customer notes]'});");
 const settings=app.run('V.set()');
 assert.doesNotMatch(settings,/\[\s*placeholder\b[^\]]*\]/i);
 assert.match(settings,/12 Gandhi Road/);
 assert.match(settings,/Design Paradise Team/);
 const preview=app.run('docHTML(S.quotes[0])');
 assert.doesNotMatch(preview,/\[\s*placeholder\b[^\]]*\]/i);
 assert.match(preview,/Thank you for choosing Design Paradise/);
 assert.match(preview,/approve the final artwork/);
 app.run("location.hash='#new';render()");
 assert.doesNotMatch(app.node('#app').innerHTML,/\[\s*placeholder\b[^\]]*\]/i);
 app.run("S.quotes[0].companySnapshot={...S.set,name:'[Placeholder company]',signature:'[Placeholder signature]'}");
 assert.doesNotMatch(app.run('docHTML(S.quotes[0])'),/\[\s*placeholder\b[^\]]*\]/i);
 assert.match(app.run('defaultMessage(S.quotes[0])'),/DESIGN PARADISE/);
 assert.equal(app.run('S.set.name'),'[Placeholder company]','Presentation cleanup must preserve stored source settings');
});
test('saved legacy quotation terms use clean presentation while preserving the original record',()=>{
 const app=ui();
 app.run("S.quotes[0].terms=['[Placeholder terms]','Delivery within 10 working days [Placeholder]','Production begins after artwork approval.']");
 const original=app.run('JSON.stringify(S.quotes[0])'),preview=app.run('docHTML(S.quotes[0])');
 assert.doesNotMatch(preview,/\[\s*placeholder\b[^\]]*\]/i);
 assert.match(preview,/This quotation is valid until the specified expiry date/);
 assert.match(preview,/Delivery within 10 working days/);
 assert.match(preview,/Production begins after artwork approval/);
 assert.equal(app.run('JSON.stringify(S.quotes[0])'),original);
});
