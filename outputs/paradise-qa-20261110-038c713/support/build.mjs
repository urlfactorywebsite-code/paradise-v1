import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
import {cases,modules,inv} from './cases.mjs';
const out=path.resolve('outputs/paradise-qa-20261110-038c713');
const support=path.join(out,'support');
const wb=Workbook.create();
const names=['Start here','Test cases','Coverage','Automation map','Fixtures','Acceptance inputs'];
const sheets=Object.fromEntries(names.map(n=>[n,wb.worksheets.add(n)]));
const colors={ink:'#182C45',header:'#233F62',muted:'#526478',blue:'#1C5BA2',input:'#FFF4D6',line:'#C7D4E0',light:'#F2F5F8',error:'#FCE7E7'};
const col=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const first=7,last=first+cases.length-1;
const mods=[...new Map(modules.map(m=>[m.code,m])).values()];
const byCode=Object.fromEntries(mods.map(m=>[m.code,cases.filter(c=>c.code===m.code)]));
function title(sheet,text,context,widths,endRow){
 const endCol=col(widths.length),r=sheet.getRange(`A1:${endCol}${endRow}`);
 r.format.font={name:'Arial',size:10,color:colors.ink};
 r.format.verticalAlignment='center';sheet.showGridLines=false;
 widths.forEach((w,i)=>sheet.getRange(`${col(i+1)}1:${col(i+1)}${endRow}`).format.columnWidth=w);
 sheet.getRange('A2').values=[[text]];sheet.getRange('A2').format.font={name:'Arial',size:16,bold:true,color:colors.ink};
 sheet.getRange(`A2:${endCol}2`).format.rowHeight=29;
 sheet.getRange(`A3:${endCol}3`).format.borders={bottom:{style:'thin',color:colors.line}};
 sheet.getRange('A4').values=[[context]];sheet.getRange('A4').format.font={name:'Arial',size:10,color:colors.muted};
 sheet.getRange(`A4:${endCol}4`).format.rowHeight=28;
}
function table(sheet,header,rows,widths,name,headerRow=6){
 const end=headerRow+rows.length,endCol=col(header.length);
 sheet.getRange(`A${headerRow}:${endCol}${end}`).values=[header,...rows];
 const t=sheet.tables.add(`A${headerRow}:${endCol}${end}`,true,name);t.style='TableStyleLight9';
 const h=sheet.getRange(`A${headerRow}:${endCol}${headerRow}`);
 h.format={fill:colors.header,font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},horizontalAlignment:'center',verticalAlignment:'center',wrapText:true,rowHeight:32};
 if(rows.length){
  const body=sheet.getRange(`A${headerRow+1}:${endCol}${end}`);body.format.wrapText=true;body.format.verticalAlignment='top';
  for(let i=0;i<rows.length;i++){
   const lines=Math.max(...rows[i].map((v,j)=>String(v??'').split('\n').reduce((s,l)=>s+Math.max(1,Math.ceil(l.length/(widths[j]*1.12))),0)));
   sheet.getRange(`A${headerRow+i+1}:${endCol}${headerRow+i+1}`).format.rowHeight=Math.max(34,Math.min(255,lines*14+12));
  }
 }
 sheet.freezePanes.freezeRows(headerRow);sheet.freezePanes.freezeColumns(2);
 return end;
}
const ranges=Object.fromEntries(mods.map(m=>{const cs=byCode[m.code];return [m.code,cs[0].id+' to '+cs.at(-1).id];}));
assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
for(const c of cases)for(const k of ['title','pre','data','steps','expected','role','source'])assert.ok(c[k],c.id+' '+k);
assert.equal(cases.filter(c=>c.code==='SKU').length,inv.products.length*2);
assert.equal(cases.filter(c=>c.code==='RBAC').length,inv.permissions.length*2);
assert.equal(cases.filter(c=>c.code==='CAP').length,31);
assert.equal(cases.filter(c=>c.code==='GUARD').length,15);
assert.equal(cases.filter(c=>c.code==='PAGE').length,39);
const testWidths=[23,35,10,16,47,64,53,77,88,30,15,64,24,23,17,32,48,62,27];
title(sheets['Test cases'],'Paradise project test cases','Filter Module / Priority / Type. Complete amber execution fields K:Q. Steps and expected results are in H:I.',testWidths,last);
const headers=['Test ID','Module','Priority','Type','Scenario','Preconditions','Test data / fixture','Steps','Expected result','Role','Status','Actual result / reason','Defect ID','Tester','Execution date','Build / environment','Evidence / link','Source reference','Execution detail check'];
const rows=cases.map(c=>[c.id,c.module,c.priority,c.type,c.title,c.pre,c.data,c.steps,c.expected,c.role,'NOT RUN','','','','','','',c.source,'']);
table(sheets['Test cases'],headers,rows,testWidths,'ProjectTestCases');
const tests=sheets['Test cases'];
tests.getRange(`K${first}:Q${last}`).format.fill=colors.input;
tests.getRange(`K${first}:Q${last}`).format.font={name:'Arial',size:10,color:colors.blue};
tests.getRange(`K${first}:K${last}`).dataValidation={rule:{type:'list',values:['NOT RUN','PASS','FAIL','BLOCKED','N/A']}};
tests.getRange(`O${first}:O${last}`).setNumberFormat('dd-mmm-yyyy');
const evidenceFormulas=cases.map((c,i)=>{const r=first+i;return [`=IF(K${r}="NOT RUN","Awaiting execution",IF(OR(K${r}="PASS",K${r}="FAIL"),IF(OR(L${r}="",N${r}="",O${r}="",P${r}="",Q${r}=""),"Missing execution details","Recorded"),IF(OR(K${r}="BLOCKED",K${r}="N/A"),IF(OR(L${r}="",N${r}=""),"Missing reason or tester","Recorded"),"Invalid status")))`];});
tests.getRange(`S${first}:S${last}`).formulas=evidenceFormulas;
tests.getRange(`K${first}:K${last}`).conditionalFormats.addCustom(`K${first}="FAIL"`,{fill:'#FDE4E4',font:{color:'#9B1C1C',bold:true}});
tests.getRange(`K${first}:K${last}`).conditionalFormats.addCustom(`K${first}="BLOCKED"`,{fill:'#FFEAC2',font:{color:'#854D0E',bold:true}});
tests.getRange(`S${first}:S${last}`).conditionalFormats.addCustom(`LEFT(S${first},7)="Missing"`,{fill:'#FDE4E4',font:{color:'#9B1C1C'}});

const start=sheets['Start here'];
title(start,'Paradise QA test pack','Prepared 10 Nov 2026. Baseline 038c713. Designed test cases only; application testing was not executed to produce this pack.',[45,16,17,17,17,17,17,17,17],113);
start.tabColor=colors.header;
start.getRange('A6:B16').values=[['Execution summary','Count'],['Total cases',null],['P0 critical cases',null],['PASS',null],['FAIL',null],['BLOCKED',null],['NOT RUN',null],['N/A',null],['Execution details missing',null],['Executed (PASS + FAIL)',null],['Execution rate excluding N/A',null]];
start.getRange('A6:B6').format={fill:colors.header,font:{name:'Arial',size:10,color:'#FFFFFF',bold:true},rowHeight:28};
start.getRange('A7:B16').format.rowHeight=23;
start.getRange('B7').formulas=[[`=COUNTA('Test cases'!$A$${first}:$A$${last})`]];
start.getRange('B8').formulas=[[`=COUNTIFS('Test cases'!$C$${first}:$C$${last},"P0")`]];
for(const [r,status] of [[9,'PASS'],[10,'FAIL'],[11,'BLOCKED'],[12,'NOT RUN'],[13,'N/A']])start.getRange('B'+r).formulas=[[`=COUNTIFS('Test cases'!$K$${first}:$K$${last},"${status}")`]];
start.getRange('B14').formulas=[[`=COUNTIFS('Test cases'!$S$${first}:$S$${last},"Missing execution details")+COUNTIFS('Test cases'!$S$${first}:$S$${last},"Missing reason or tester")+COUNTIFS('Test cases'!$S$${first}:$S$${last},"Invalid status")`]];
start.getRange('B15').formulas=[['=SUM(B9:B10)']];
start.getRange('B16').formulas=[['=IF(B7-B13=0,0,B15/(B7-B13))']];start.getRange('B16').setNumberFormat('0.0%');
start.getRange('D6:I9').values=[['Designed coverage','','','','',''],['Documented products',inv.products.length,'Permissions',inv.permissions.length,'Source unit/API definitions',inv.automated.length],['Business pages',13,'Registered captions',31,'Browser suite files',inv.browser.length],['Coverage areas',mods.length,'Protected controls',15,'Execution starts','NOT RUN']];
start.getRange('D6:I6').format={fill:colors.light,font:{name:'Arial',size:10,bold:true,color:colors.ink},rowHeight:28};
start.getRange('D7:I9').format.wrapText=true;start.getRange('D7:I9').format.rowHeight=43;
const moduleHeader=['Coverage area','Cases','P0','PASS','FAIL','BLOCKED','NOT RUN','N/A','Missing details'];
const moduleRows=mods.map(m=>[m.name,...Array(8).fill(null)]);
table(start,moduleHeader,moduleRows,[45,16,17,17,17,17,17,17,17],'ExecutionByArea',19);
for(let i=0;i<mods.length;i++){
 const r=20+i,modRange=`'Test cases'!$B$${first}:$B$${last}`,stRange=`'Test cases'!$K$${first}:$K$${last}`;
 start.getRange(`B${r}:I${r}`).formulas=[[
  `=COUNTIFS(${modRange},A${r})`,`=COUNTIFS(${modRange},A${r},'Test cases'!$C$${first}:$C$${last},"P0")`,
  ...['PASS','FAIL','BLOCKED','NOT RUN','N/A'].map(s=>`=COUNTIFS(${modRange},A${r},${stRange},"${s}")`),
  `=COUNTIFS(${modRange},A${r},'Test cases'!$S$${first}:$S$${last},"Missing execution details")+COUNTIFS(${modRange},A${r},'Test cases'!$S$${first}:$S$${last},"Missing reason or tester")`]];
}
const guide=[
 ['How to execute','Create the Fixtures in a disposable/staging environment. Record build, URL and browser. Filter P0 first, then all P1/P2 and the relevant role/product matrices.'],
 ['Status rules','PASS means every stated expected result is observed. FAIL means a mismatch. BLOCKED requires a specific unmet prerequisite. N/A requires documented scope reason. NOT RUN means no execution evidence.'],
 ['Record results','For PASS/FAIL fill Actual result, Tester, Execution date, Build/environment and Evidence. Add Defect ID for failures. For BLOCKED/N/A record reason and tester. Amber cells are intended execution inputs.'],
 ['Run evidence','Store screenshot/video/API response, generated PDF/CSV, relevant logs and independent money calculation. Remove passwords, tokens and customer secrets from attachments.'],
 ['Priorities','P0 = critical data, money, access, continuity and product smoke. P1 = main functional/boundary/negative regression. P2 = secondary compatibility or acceptance work. Priority is planning guidance, not execution evidence.'],
 ['Automation index','Automation map inventories existing literal test definitions and browser suite files. Module links help select regressions; they are not one-to-one proof that each manual case is automated or passed.'],
 ['Suggested run sequence','Startup/authentication; customers/categories/addresses; catalog/templates/fields/pricing/imports; quotation/discount/status/documents/sharing; lists/exports/reports; concurrency/security/recovery; full product/page/permission matrices.'],
 ['Test data rules','Use approved synthetic QA rates and isolated records. Do not replace business-approved production configuration or send real WhatsApp messages for ordinary regression. Check dependencies before mutation and retain stable IDs for history tests.'],
 ['Retesting','Record the same case ID, build and linked defect for retest. Preserve prior execution evidence in the team test system or a separate run copy. This workbook contains one active execution state per test case.'],
 ['Release review','All required cases executed, P0/P1 failures resolved or formally accepted, blockers/acceptance inputs addressed and backup/restore/target smoke recorded. Formula counts alone never authorize release.'],
 ['Coverage boundary','Covers current source, documented workflows and available tests at baseline. Original complete SRS product-list artifact is absent; 40 documented products are covered. New requirements, actual environment/load/language acceptance need the inputs listed in Acceptance inputs.'],
 ['Current behavior wins','Some older README/API/user-guide passages describe older schema/validity/analytics. Current source uses schema 13, fixed seven-day new expiry and GST-inclusive product value excluding separate quotation charges.'],
 ['Protected archive distinction','Generic dynamic-field option archive is permanent: no restoration/reuse. Customer category and delivery address archive support their own documented restore operations.'],
 ['Execution limitation','No application runtime test, real outbound message, deployment, data migration or production restore was performed while authoring this workbook. All cases and automated inventory rows start NOT RUN.'],
];
start.getRange('A59:A63').values=[['Execution guidance'],['Open Test cases and filter P0 first.'],['Record results and evidence in K:Q.'],['Designed cases have not been executed.'],['Read run rules in Acceptance inputs.']];
start.getRange('A59').format.font={name:'Arial',size:10,bold:true};
start.getRange('A59:I63').format.rowHeight=25;

function mapFile(f){
 const s=f.toLowerCase();
 if(/customer-category-quotation/.test(s))return 'DISC';
 if(/customer-categor/.test(s))return 'CCAT';
 if(/customer-details|customer-api/.test(s))return 'ADR';
 if(/customer/.test(s))return 'CUS';
 if(/quotation-export|quotation-filter/.test(s))return 'EXP';
 if(/quotation-pagination|quotation-list/.test(s))return 'LIST';
 if(/quotation-editor/.test(s))return 'QUOTE';
 if(/quotation-audit/.test(s))return 'DISC';
 if(/product-analytics/.test(s))return 'ANL';
 if(/reports|queries/.test(s))return 'REP';
 if(/dashboard|workspace-ui/.test(s))return 'DASH';
 if(/product-field/.test(s))return 'PFLD';
 if(/dynamic|field-registry|field-controls|field-pages|field-values/.test(s))return 'DFLD';
 if(/phase5|pricing-import/.test(s))return 'IMP';
 if(/phase4|catalog/.test(s))return 'TMPL';
 if(/phase3|phase2|phase1|pricing|domain/.test(s))return /pdf/.test(s)?'PDF':'PRICE';
 if(/pdf/.test(s))return 'PDF';
 if(/whatsapp/.test(s))return 'WA';
 if(/access/.test(s))return 'SEC';
 if(/accounts/.test(s))return 'TEAM';
 if(/postgres|database|migrat|backup|restore|recover|store|schema|import-sqlite/.test(s))return 'OPS';
 if(/products/.test(s))return 'PROD';
 if(/company-content/.test(s))return 'SET';
 if(/dropdown|frontend|browser-ui|index.html/.test(s))return 'NAV';
 if(/\.css$/.test(s))return 'NFR';
 if(/build|check|setup-docker/.test(s))return 'ENV';
 return 'API';
}
const auto=sheets['Automation map'];
function mapTest(a){
 if(!/\/(api|backend|access-whatsapp|frontend|postgres)\.test\.js$/.test(a.file))return mapFile(a.file);
 const t=a.title.toLowerCase();
 for(const [pattern,code] of [
  [/backup|restore|migration|schema upgrade/,'OPS'],[/team lifecycle|last administrator/,'TEAM'],
  [/ownership|scopes state|permission|employee restrictions|catalog and pricing managers/,'SEC'],
  [/login|password|session|initial setup|bad credentials/,'AUTH'],[/whatsapp|sharing|recipient/,'WA'],
  [/approval|draft-only|expiry action|status transition/,'STATUS'],[/reports/,'REP'],[/audit history|audit trail/,'TEAM'],
  [/customer crud/,'CUS'],[/catalog\/category/,'PROD'],[/quotation crud|quotes receive|item snapshots/,'QUOTE'],
  [/pdf/,'PDF'],[/pricing|discount|tax/,'PRICE'],[/concurr|atomic|versions|request limits|openapi/,'API']])if(pattern.test(t))return code;
 return mapFile(a.file);
}
const autoRows=inv.automated.map((a,i)=>{const code=mapTest(a);return ['AUTO-'+String(i+1).padStart(4,'0'),'Unit / API definition',a.title,a.file,a.line,mods.find(m=>m.code===code).name,ranges[code],a.declared,'NOT RUN','',''];});
autoRows.push(...inv.browser.map((b,i)=>{const code=mapFile(b.file);return ['BROWSER-'+String(i+1).padStart(3,'0'),'Browser suite file',path.basename(b.file),b.file,null,mods.find(m=>m.code===code).name,ranges[code],'file present','NOT RUN','',''];}));
const aw=[20,25,100,55,10,38,44,17,15,30,65];
title(auto,'Existing automated regression inventory','526 literal test definitions and 31 browser suite files. Suggested module linkage is broad; no automated test was executed for this deliverable.',aw,autoRows.length+6);
table(auto,['Inventory ID','Kind','Existing definition / suite','Source file','Line','Related area','Related manual case IDs','Source declaration','Execution status','Build / run date','Evidence / notes'],autoRows,aw,'AutomationInventory');
auto.getRange(`I7:K${autoRows.length+6}`).format.fill=colors.input;
auto.getRange(`I7:I${autoRows.length+6}`).dataValidation={rule:{type:'list',values:['NOT RUN','PASS','FAIL','BLOCKED','N/A']}};

const coverage=sheets['Coverage'];
const coverRows=mods.map(m=>['Behavior area',m.name,ranges[m.code],byCode[m.code].length,m.sources,'Manual design coverage. Execute each applicable row and record evidence.']);
const sourceDirs=['server','shared','public','scripts'];
let sourcePaths=['server.js','README.md','package.json','compose.yaml','compose.test.yaml','compose.npm.yaml','Dockerfile'];
for(const d of sourceDirs)for(const ent of await fs.readdir(d,{withFileTypes:true})){
 if(ent.isFile()&&/\.(js|cjs|html|css|sql)$/.test(ent.name))sourcePaths.push(d+'/'+ent.name);
 if(d==='server'&&ent.isDirectory()&&ent.name==='migrations')for(const f of await fs.readdir('server/migrations'))sourcePaths.push('server/migrations/'+f);
}
for(const f of sourcePaths.sort()){
 const code=/compose|dockerfile|readme|package.json/i.test(f)?'ENV':mapFile(f);
 coverRows.push(['Source inventory',f,ranges[code],byCode[code].length,f,'Source-to-area link for change impact; not a claim that every internal branch is exhaustively tested.']);
}
coverRows.push(['Product manifest','40 documented products; 28 placeholders',ranges.SKU,byCode.SKU.length,'shared/catalog.js','Original complete SRS list absent; do not claim unknown products are covered.']);
coverRows.push(['Security identifiers','30 current permission identifiers',ranges.RBAC,60,'server/access.js','Each permission has granted and denied counterpart with related prerequisites retained.']);
coverRows.push(['UI registry','31 caption definitions + 15 protected controls',ranges.CAP+'; '+ranges.GUARD,46,'shared/field-controls.js','One explicit case per registry control; unknown controls remain protected.']);
const cw=[25,65,50,12,83,95];
title(coverage,'Coverage and change-impact map','Maps designed cases to current modules, source files, product manifest and control registry. Existing automated definitions are separately inventoried.',cw,coverRows.length+6);
table(coverage,['Coverage kind','Feature / file','Test case IDs','Cases in area','Source / requirement reference','Coverage boundary'],coverRows,cw,'CoverageMap');

const fixtureRows=[
 ['ENV','Isolated environment','Dedicated QA Compose project/database and private backup directory. Candidate commit 038c7137b8e3769d2f4bfcf12f1db75c4d550927. PostgreSQL 17; Node 24.14+; final schema migration 13.','Record actual URL, image/build hash, database isolation, schema, OS and browser. Never point test fixtures/failure injection at production.','README.md; compose.test.yaml; server/migrations'],
 ['ACCOUNTS','A1 / A2','Two active Administrators with different IDs. A1 creates at least one quote. A2 acts as independent approver.','Generate unique synthetic 12-128-character passwords privately. Do not paste credentials/cookies into workbook.','server/access.js; server/accounts.js'],
 ['ACCOUNTS','E1 / E2 / E3','E1/E2 default Employees with own quotes, distinct display names and immutable IDs. E3 inactive.','Assign explicit override counterpart accounts for each permission case. Re-login after access changes.','server/access.js'],
 ['ACCOUNTS','Special-role fixtures','Metadata-only catalog manager (product.manage without pricing reads/writes); pricing manager; quote-only creator/viewer without customer.view; reports-own/all; fields-view/manage; bounded delegated users manager.','Grant necessary related prerequisites deliberately. Remove all alternative grants for a denied-capability test. Administrator cannot be used to prove a missing permission.','server/access.js; server/dynamic-fields.js'],
 ['COMPANY-B','Separate company database','Second independently initialized app/database with its own accounts, records and cookies. Include intentional same-looking IDs as Company A.','Use database-per-company boundary. Do not fabricate tenant columns or shared-table tenancy.','server/database.js; tests/customer-categories-api.test.js'],
 ['CUSTOMERS','C1 managed category','Active QA member, company QA Alpha, BNI category, contact person number distinct from mobile and WhatsApp, test-only email qa-alpha@example.invalid, billing address and private marker PRIVATE-CUSTOMER.','Use valid-format synthetic identifiers under app validator. No actual phone reachability/GST registration is asserted.','server/customer-details.js'],
 ['CUSTOMERS','C2 Other / C3 inactive','C2 belongs to Other with custom text QA Association. C3 is inactive via permitted legacy/API setup. Include uncategorized C4.','Other free text is not a new managed category. UI omits customer Status.','server/customer-details.js'],
 ['ADDRESSES','Warehouse and branch','C1 active warehouse default plus second active branch and archived former address. C2 owns a different address. Use fictional street/city/state/postal/country values.','Keep billing separate. Record stable IDs; archive rather than omitting rows. Parent customer version governs mutations.','server/customer-details.js'],
 ['CATEGORY','BNI / YES','Configure QA BNI=10.00%, YES=7.25% and enabled multiline QA message only in disposable environment. Keep zero/100.00/12.34 boundary variants separate.','These are test values, not actual offers. Seeds remain zero/highlight-disabled until explicit business configuration.','shared/customer-categories.js'],
 ['CATEGORY','Raster files','Valid static PNG/JPEG/WebP, no-logo, 300000-byte boundary file, oversize, >4096px side, excessive pixels, corrupt image, SVG, GIF/animated and MIME-spoof fixtures.','Retain normalized private PNG and immutable old asset IDs for historical tests. Do not use personal photos.','server/customer-category-logos.js'],
 ['CATALOG','Configured and pending products','Use current product manifest IDs/codes. Create active configured synthetic product and inactive rate/tax/choice-pending counterpart.','Approved numeric zero is intentional; null/missing stays pending. Never activate seed placeholders merely to make a test pass.','shared/catalog.js; shared/pricing-readiness.js'],
 ['TEMPLATES','Shared definitions','Print(size,paper,sides,finish), Area(dim,material,lamination,installation), Stationery(paper,size,sides,binding), Gift(model,material,color,customization,printing,packaging,artwork).','Respect exact canonical current keys/mapping. Prepare explicitly; record before/after IDs/rates/activation. Digital/Gazebo exceptions require review.','shared/domain.js; shared/catalog.js'],
 ['DYNAMIC','Typed descriptive fields','One text/number/dropdown/multi_select/date/checkbox/textarea field on supported customer/quote adapter, global root + page override, two product-owned roots and retired saved selections.','Use immutable IDs and server snapshots. Generic option archive is permanent; inactive/hidden override does not fall back. Staff metadata is private.','shared/dynamic-values.js; server/dynamic-fields.js'],
 ['PRODUCT-FIELDS','Native and custom fields','Two products with different fields/options. Initialize real native bindings, custom descriptive types, public specification and internal/private marker.','Native labels can change while canonical cfg/rate/identity stays protected. Product roots/bindings have reference restrictions.','server/product-field-values.js'],
 ['MONEY','M1 exclusive / M2 discounted','M1: unit INR100 x2, GST18 exclusive, manual0, charges0 =>23600 paise. M2: same with manual10% =>21240 paise.','Compare independent integer/rational oracle to UI/preview/save/PDF/export. Set discountSource=manual when fixture customer has category.','shared/domain.js; tests/customer-category-quotation.test.js'],
 ['MONEY','M3 inclusive / M4 exempt','M3 INR118 inclusive at18%, no discount => taxable10000, GST1800, grand11800 paise. M4 INR100 exempt => GST0, grand10000 paise.','Treat actual rates as synthetic. Test split/IGST with identical grand tax.','shared/domain.js'],
 ['MONEY','M5 area and M6 sizes','M5 2ft x3ft x2 pieces at INR10/sqft, GST0 =>12000 paise. M6 base INR100, S2+XL3, XL surcharge INR20 =>56000 paise before GST.','Equivalent1sqft:1ft,12in,30.48cm,0.3048m sides. Quantity/dimensions are JSON numbers.','shared/domain.js'],
 ['MONEY','M7 tier / minimum','Approved tiers qty1=INR100, qty10=INR90, qty100=INR80. Separately minimum monetary charge INR500 and minQty10.','Record independent expected amounts at q9/10/11/99/100. Do not mix min quantity with minimum monetary adjustment unintentionally.','shared/domain.js'],
 ['MONEY','M8 penny allocation','Saved subtotals20000/10000 paise, fixed INR1 discount, GST0 => allocated67/33, net19933/9967, grand29900 paise.','Apply whole-quote discount before filtering product analytics.','shared/domain.js'],
 ['MONEY','M9 fractional mixed tax','Line subtotals101 excl18%,118 incl18%,99 exempt0 paise; category discount12.34%; delivery INR1 exclusive18%; other0. Expected discount39, taxable363, GST50, grand413 paise; net product values89/87/87.','Use exact saved fixture. Product gross value includes allocated GST; net values here are before GST. Half-up version2 tests are separate.','tests/customer-category-quotation.test.js'],
 ['MONEY','M10 exact half-paise','Version2: subtotal1500 paise at2.3% exclusive tax=>35 paise GST; same percentage discount=>35. INR1.005 rounds to101 paise at supported monetary boundary. Legacy unversioned fixture retains34-paise tax.','Existing quotes retain policy; new/duplicates get server-owned version2. Import Unit Price still permits at most2 decimals.','tests/customer-category-quotation.test.js'],
 ['IMPORT','Valid and invalid XLSX variants','Generate template from candidate. Single valid update, mixed-validity rows, zero, blank pending GST, OPTION/SIZE/CHARGE references, tiers, conflicting discount cells and unchanged repeat.','Use raw documented XLSX MIME. Confirm preview token only. Test tampering/session/expiry/stale/replay on isolated data.','server/pricing-import.js'],
 ['IMPORT','Parser boundaries','Default compressed5MiB, rows5000, token15min, ZIP256 entries, entry16MiB, expanded32MiB; include sparse huge-address/macros/formula/external/entity/corrupt packages.','Use returned configured limits when overridden. Failed package must not extract, evaluate, fetch external data or update prices.','server/pricing-import.js'],
 ['QUOTES','Owned historical/new quotes','E1 Q1, E2 Q2, A1 Q3, legacy unresolved owner and legacy rounding/snapshots. Include private quote/item/customer markers, public requirements, saved company/category/address.','Record number/ref/version/history before changes. New 2026-11-10 expiry is2026-11-17. Save returns blank next form.','server/validation.js; server/store.js'],
 ['STATUS','Eight-state set','One controlled quote in each supported status: '+inv.statuses.join(', ')+'. Include valid today, yesterday,+7,+8.','Independent approval on by default. Explicit expiry affects only overdue pending/internal-approved/sent, never Draft/customer decisions/cancelled.','shared/domain.js; server/resources.js'],
 ['LIST','Page/filter boundaries','45+scoped records with tie positions, amount212.40, boundary dates, same product repeated, archived category/product and >100-page jump fixture.','Default10, supported10/20/30/40. Keep deterministic expected ID list for combined filters and page snapshots.','server/quotation-list.js'],
 ['EXPORT','CSV values and limits','Unicode, quotes/commas/newlines, formula-leading cells/whitespace and+phone. Multiple quotes/customer and active/archived/foreign addresses. 1000 IDs,50000/50001 rows,100MiB bound variants.','Expect UTF8 BOM, CRLF and quoted cells. Selected/all ignore active filters. Customer mode dedupes by relationship; custom is quote-wise.','server/quotation-export.js'],
 ['DOCUMENTS','Public/private and long PDFs','One short and one long/multi-page quote, long highlight/terms, varied image/logo and business-language text. Distinct PRIVATE-QUOTE/ITEM/CUSTOMER markers.','Retain generated actual PDFs/print output and text extraction. Compare totals and selected snapshots, margins/page counts and note absence.','server/pdf.js'],
 ['WHATSAPP','Manual sharing attempts','Test international+919000000001, saved protected PDF, Prepared/Failed/Manually Confirmed attempts and linked retry.','Use reviewed manual handoff. Do not send real external messages unless separately arranged. No automatic delivery/read guarantee.','server/whatsapp.js'],
 ['REPORTS','Independent record ledger','Record expected count/status/owner/customer/month totals from saved database. Include renamed masters, repeated product lines, empty months and separate handoff attempts.','Overall quoted value uses saved grand total. Product value includes GST after discount, excluding separate quote charges.','server/queries.js; server/product-analytics.js'],
 ['ANALYTICS','Saved projections','Reconcile all persisted item rows against projections with left joins so missing projection cannot disappear from oracle.','Independent integer oracle must not call same pricing/report helper being verified. Keep legacy category provenance explicit.','server/product-analytics-projection.js'],
 ['SETTINGS','Synthetic branding/policies','Fictional company/logo/signature/terms, INR currency, approved QA tax/discount controls and exact origin.','Real business approval required before production quote acceptance. No multi-currency, payments or automated provider assumed.','README.md; server/validation.js'],
 ['API','Direct-client envelopes','Maintain secure ephemeral cookie and CSRF in test harness. Use record versions/If-Match and current workspace revision. changes action is upsert/delete.','Never store auth secrets in workbook/evidence. Negative requests must preserve data/audit/sequence atomically.','docs/API.md; server/openapi.js'],
 ['RECOVERY','Dumps and legacy versions','Private QA PostgreSQL17 custom dumps of populated schema6/7/8/10/11/12/13 with all referenced assets/configuration. Use unique unused restore database names.','Validate cutoff/fingerprints and revoke restored sessions. Restore overwrite is refused. Never inject failures into persistent/production app.','scripts/restore.js; server/store.js'],
 ['VIEWPORTS','Browser/accessibility matrix','Widths320,375,390,768,1024,1440/1600;200%zoom; keyboard-only; reduced-motion; supported browsers/OS recorded.','Agree screen-reader/browser target and business languages separately; not all engines are claimed certified.','tests/*.browser.cjs; docs/reports-dashboard-final-readiness.md'],
 ['LOAD','Controlled capacity','10001+quote pagination,1000+products,50001 report quotes,50products/60months,500generic fields/100choices and40-dropdown UI.','Capture actual timings,memory,query counts,payload size and plans. Obtain target concurrency/p95/SLA from owner; local fixture is not production guarantee.','scripts/benchmark-dynamic-fields.js'],
 ['EDGE','Historical collision','Legacy reference matching next computed CR/year/sequence; minimum/tier/conditional/hidden-rate fields and reserved registry identities.','Preserve originals and record suffix behavior, price authorization and canonical constraints.','tests/quotation-editor-api.test.js; tests/phase3-domain.test.js'],
];
for(const p of inv.products)fixtureRows.push(['PRODUCT '+p.code,p.name,'Method='+p.method+'; category='+p.categoryName+'; template='+(p.templateId||'existing configuration')+'; extra fields='+(p.additionalFields.join(', ')||'none beyond canonical existing definition')+'.','Create approved synthetic happy-path and separate pending/inactive variant. '+(p.reason||'Retain existing approved canonical product options/rates in preservation tests.'),'shared/catalog.js']);
const fw=[26,39,110,110,70];
title(sheets.Fixtures,'Test fixtures and independent expected values','All amounts, contacts and policies here are synthetic QA data. Create them only in a disposable/staging environment.',fw,fixtureRows.length+6);
table(sheets.Fixtures,['Fixture group','Record / variant','Setup / exact values','Expected controls / dependencies','Source reference'],fixtureRows,fw,'TestFixtures');

const inputRows=[
 ['AI-01','Original complete requirements / SRS list','Original full product-list artifact is absent. Current manifest covers40 documented products including28 placeholders.','Supply/approve full original requirement list and map any additional products/workflows to new cases.','Business owner','OPEN','',''],
 ['AI-02','Approved commercial rates and availability','Seed/sample/QA prices are not business approval. Some templates/choices start pending.','Approve real prices, option rates, compatibility, eyelet counting, minimums and actual stock/availability policies before UAT.','Pricing owner','OPEN','',''],
 ['AI-03','Tax and discount policy','Tests verify implementation with synthetic tax/caps/category percentages, not tax-law advice.','Business approves applicable rates/treatments/display, employee caps and category offers.','Business / accounts','OPEN','',''],
 ['AI-04','Target build and environment','Only source baseline was inspected for this pack. Current deployed state was not tested.','Record target URL,image/hash,schema,proxy/TLS/cookie/origin and approve isolated QA data setup.','Release owner','OPEN','',''],
 ['AI-05','Performance acceptance','No target concurrency, p95 latency, payload/network budget or recovery time objective was supplied.','Set measurable load/SLA and backup RPO/RTO before signing capacity/recovery acceptance.','Product / operations','OPEN','',''],
 ['AI-06','Supported browsers and accessibility','Current regression files do not establish exhaustive browser or assistive-technology coverage.','Agree browser/OS/device versions, accessibility standard/screen reader and minimum viewport.','Product / QA lead','OPEN','',''],
 ['AI-07','Document languages and branding','Existing PDF font pipeline may not support every business-language glyph.','Approve actual languages, logos, signatory,terms,footer,layout and printed examples with business owner.','Business owner','OPEN','',''],
 ['AI-08','WhatsApp external acceptance','Current implementation is manual handoff. No provider credentials or actual delivery was used here.','Accept manual scope or separately define official provider integration and authorized real-recipient acceptance.','Business owner','OPEN','',''],
 ['AI-09','Backup/restore target rehearsal','Source test design is not a completed target restore drill.','Run backup/restore to fresh unused staging database, document cutoff,session revocation and rollback reconciliation.','Operations','OPEN','',''],
 ['AI-10','Retention and evidence','No team-specific defect tracker/evidence storage/retention policy supplied.','Choose private evidence location, defect IDs,run owner and retention for dumps/PDFs/CSV/logs.','QA lead','OPEN','',''],
 ['AI-11','Historical documentation drift','Older guide passages mention editable validity,older schemas and pre-GST analytics definitions.','Use current source rules in this pack. Reconcile future requirement changes before treating old report text as acceptance truth.','Product / QA lead','OPEN','',''],
 ['AI-12','Release sign-off criteria','Counts in this file are designed cases, not test outcomes.','Agree required scope,accepted N/A/risks,defect severities and authorized QA/business/release sign-offs after actual execution.','QA / business / release','OPEN','',''],
];
const iw=[16,43,95,105,30,17,32,95];
const inputs=sheets['Acceptance inputs'];
title(inputs,'Acceptance inputs and execution guidance','Open inputs are ownership/acceptance items, not reproduced defects. Complete owner/status/decision cells during QA planning.',iw,60);
table(inputs,['Input ID','Topic','Known boundary','Required decision / acceptance input','Suggested owner','Status','Assigned owner','Decision / evidence'],inputRows,iw,'AcceptanceInputs');
inputs.getRange('F7:H18').format.fill=colors.input;inputs.getRange('F7:F18').dataValidation={rule:{type:'list',values:['OPEN','RESOLVED','ACCEPTED RISK','N/A']}};
const guideHeader=23;
table(inputs,['Guidance','Instructions'],guide,[43,95],'ExecutionInstructions',guideHeader);
// Reapply A/B widths for this two-column prose block via wrapping only; rows size to actual wide B in this sheet.
inputs.getRange(`B${guideHeader+1}:B${guideHeader+guide.length}`).format.wrapText=true;
for(let i=0;i<guide.length;i++)inputs.getRange(`A${guideHeader+i+1}:H${guideHeader+i+1}`).format.rowHeight=Math.max(70,Math.ceil(guide[i][1].length/(iw[1]*1.12))*14+14);

// Structural/source verification, then calculation and representative changed-input check.
for(const ref of new Set(cases.flatMap(c=>c.source.split(';').map(s=>s.trim())))){
 if(!ref.includes('*'))await fs.access(ref);
}
wb.recalculate();
assert.equal(start.getRange('B7').values[0][0],cases.length);
assert.equal(start.getRange('B12').values[0][0],cases.length);
assert.equal(start.getRange('B9').values[0][0],0);
tests.getRange('K7').values=[['PASS']];wb.recalculate();
console.log('STATUS_MUTATION '+JSON.stringify({status:tests.getRange('K7').values,detail:tests.getRange('S7').values,summary:start.getRange('B9:B14').values}));
assert.equal(start.getRange('B9').values[0][0],1);
assert.equal(start.getRange('B14').values[0][0],1);
tests.getRange('N7').values=[['QA verification only']];wb.recalculate();
assert.equal(start.getRange('B14').values[0][0],1);
tests.getRange('L7').values=[['Temporary workbook verification']];
tests.getRange('O7').values=[[46336]];
tests.getRange('P7').values=[['Workbook formula verification']];
tests.getRange('Q7').values=[['Temporary formula fixture']];wb.recalculate();
assert.equal(tests.getRange('S7').values[0][0],'Recorded');
assert.equal(start.getRange('B14').values[0][0],0);
for(const c of ['L','N','O','P','Q'])tests.getRange(c+'7').values=[['']];
tests.getRange('K7').values=[['FAIL']];wb.recalculate();
assert.equal(start.getRange('B10').values[0][0],1);
tests.getRange('K7').values=[['NOT RUN']];
wb.recalculate();
assert.equal(start.getRange('B14').values[0][0],0);
const checks=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:30},summary:'Final formula error scan',maxChars:3000});
await fs.writeFile(path.join(support,'formula-scan.json'),checks.ndjson);
console.log('FORMULA_SCAN '+checks.ndjson);
const summary=await wb.inspect({kind:'table',range:"'Start here'!A6:B16",include:'values,formulas',tableMaxRows:11,tableMaxCols:2,maxChars:3500});
await fs.writeFile(path.join(support,'summary-inspection.json'),summary.ndjson);
const output=await SpreadsheetFile.exportXlsx(wb);
await output.save(path.join(out,'Paradise-Full-Project-QA-Test-Cases.xlsx'));
await fs.writeFile(path.join(support,'case-data.json'),JSON.stringify(cases,null,2));
const renderRanges=[['Start here','A1:I17','summary'],['Test cases','E6:I9','test-steps'],['Test cases','K6:S9','test-execution'],['Coverage','A6:F10','coverage'],['Automation map','A6:G9','automation'],['Fixtures','A6:E9','fixtures'],['Acceptance inputs','A6:H9','acceptance']];
for(const [sheetName,range,filename] of renderRanges){
 const img=await wb.render({sheetName,range,scale:1,format:'png'});
 await fs.writeFile(path.join(support,filename+'.png'),new Uint8Array(await img.arrayBuffer()));
 console.log('RENDERED '+filename);
}
await fs.writeFile(path.join(support,'verification.json'),JSON.stringify({cases:cases.length,areas:mods.length,p0:cases.filter(c=>c.priority==='P0').length,products:inv.products.length,permissions:inv.permissions.length,automatedDefinitions:inv.automated.length,browserSuiteFiles:inv.browser.length,sourceFiles:sourcePaths.length,status:'All NOT RUN',summaryStatusMutationCheck:'PASS',caseRequiredFields:'PASS',uniqueIds:'PASS',sourceReferencesExist:'PASS',rendered:renderRanges.map(r=>r[2])},null,2));
console.log(JSON.stringify({file:path.join(out,'Paradise-Full-Project-QA-Test-Cases.xlsx'),cases:cases.length,areas:mods.length,sources:sourcePaths.length,automated:inv.automated.length,browser:inv.browser.length}));
