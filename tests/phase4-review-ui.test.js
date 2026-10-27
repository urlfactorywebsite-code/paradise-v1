'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const DP=require('../shared/domain'),Catalog=require('../shared/catalog');

function workspace(){
 const elements=new Map(),node=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',style:{},dataset:{},value:'',checked:false,append(){},remove(){}});return elements.get(selector);};
 for(const selector of ['#app','#modal','#toast','#cc','#config-fields','#config-quantity','#catalog-results','#catalog-counts'])node(selector);
 const document={body:{classList:{toggle(){}}},querySelector:selector=>elements.get(selector)||null,querySelectorAll:()=>[],createElement:()=>node('element'),addEventListener(){}};
 const context=vm.createContext({DP,Catalog,crypto:crypto.webcrypto,console,AbortController,URLSearchParams,Blob,URL,setTimeout(fn,ms){const timer=setTimeout(fn,ms);timer.unref();return timer;},clearTimeout,window:{addEventListener(){}},location:{hash:'#dash'},document,fetch:async()=>({ok:true,status:200,json:async()=>({data:[]})})});
 for(const file of ['app.js','backend-ui.js','srs-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public',file),'utf8').replace(/start\(\);\s*$/,''),context,{filename:file});
 context.initial={state:DP.seed({demo:true}),revision:1,user:{id:'admin',name:'Administrator',role:'Administrator'}};const run=code=>vm.runInContext(code,context);run('adopt(initial)');return{run,node,document};
}

test('Phase 4 review UI: dimensional labels and required markers use saved product overrides',()=>{
 const app=workspace();app.run("const p=S.products.find(p=>p.m==='area');p.f=[{k:'dim',l:'Finished Banner Dimensions',t:'dim',required:true}];Q=newQ();openCfg(p.id)");
 assert.match(app.node('#modal').innerHTML,/Finished Banner Dimensions \*/);assert.doesNotMatch(app.node('#modal').innerHTML,/>Custom size</);
 assert.match(app.node('#modal').innerHTML,/data-config-field="dim"/);assert.match(app.node('#modal').innerHTML,/data-config-field="quantity"/);
});

test('Phase 4 review UI: focused numeric rows survive conditional sibling updates',()=>{
 const app=workspace(),container=app.node('#config-fields'),retained={dataset:{configField:'dim'},parentElement:container},stale={remove(){this.removed=true;}};
 const before={dataset:{configField:'proofBefore'}},fresh={dataset:{configField:'dim'}},after={dataset:{configField:'proofAfter'}},inserted=[],appended=[];
 container.children=[stale,retained];container.insertBefore=(child,target)=>inserted.push([child,target]);container.append=child=>appended.push(child);
 app.document.activeElement={tagName:'INPUT',type:'number',closest:()=>retained};app.document.createElement=()=>({children:[before,fresh,after],innerHTML:''});
 app.run('refreshConfigurationContainer("#config-fields","new conditional fields")');
 assert.equal(stale.removed,true);assert.deepEqual(inserted,[[before,retained]]);assert.deepEqual(appended,[after]);assert.equal(container.innerHTML,'');
});

test('Phase 4 review UI: a numeric row that becomes hidden is removed rather than retained',()=>{
 const app=workspace(),container=app.node('#config-fields'),retained={dataset:{configField:'conditionalQuantity'},parentElement:container};
 app.document.activeElement={tagName:'INPUT',type:'number',closest:()=>retained};app.document.createElement=()=>({children:[],innerHTML:''});
 app.run('refreshConfigurationContainer("#config-fields","remaining visible fields")');assert.equal(container.innerHTML,'remaining visible fields');
});

test('Phase 4 review UI: unchanged dependent containers avoid redundant DOM replacement',()=>{
 const app=workspace(),container=app.node('#config-quantity');let replacements=0,html='same quantity control';Object.defineProperty(container,'innerHTML',{get:()=>html,set:value=>{replacements++;html=value;}});
 app.run('refreshConfigurationContainer("#config-quantity","same quantity control")');assert.equal(replacements,0);
 app.run('refreshConfigurationContainer("#config-quantity","updated quantity control")');assert.equal(replacements,1);
});

test('Phase 4 review UI: typing a new search invalidates a response during the debounce interval',async()=>{
 const app=workspace();app.run('var finish;api=()=>new Promise(resolve=>finish=resolve);var oldRequest=loadCatalogChecklist();searchCatalog("Envelope");finish({rows:[{name:"Stale result"}],counts:{required:1},pagination:{page:1,total:1,totalPages:1}})');
 await app.run('oldRequest');assert.doesNotMatch(app.node('#catalog-results').innerHTML,/Stale result/);assert.equal(app.run('CATALOG_DATA'),null);app.run('clearTimeout(CATALOG_SEARCH_TIMER)');
});
