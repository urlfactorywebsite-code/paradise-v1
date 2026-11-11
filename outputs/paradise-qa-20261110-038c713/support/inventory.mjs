import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=process.cwd();
const DP=require(path.join(root,'shared/domain.js'));
const Catalog=require(path.join(root,'shared/catalog.js'));
const Access=require(path.join(root,'server/access.js'));
const Controls=require(path.join(root,'shared/field-controls.js'));
const automated=[];
for(const f of fs.readdirSync('tests').filter(f=>f.endsWith('.test.js'))){
 const text=fs.readFileSync('tests/'+f,'utf8');
 const re=/\b(test|it|describe)(?:\.(skip|todo))?\s*\(\s*(['"`])((?:\\.|(?!\3)[^\\])*?)\3/g;
 for(const m of text.matchAll(re))automated.push({file:'tests/'+f,line:text.slice(0,m.index).split('\n').length,title:m[4],kind:m[1],declared:m[2]||'defined'});
}
const browser=fs.readdirSync('tests').filter(f=>f.endsWith('.cjs')).map(f=>({file:'tests/'+f}));
const out={commit:'038c7137b8e3769d2f4bfcf12f1db75c4d550927',date:'2026-11-10',statuses:DP.ST,permissions:Access.PERMISSIONS,defaults:Access.EMPLOYEE_PERMISSIONS,products:Catalog.manifest,coverage:Catalog.coverage,controls:Controls.controls,automated,browser,sourceFiles:fs.readdirSync('server').filter(f=>f.endsWith('.js')).map(f=>'server/'+f).concat(fs.readdirSync('shared').filter(f=>f.endsWith('.js')).map(f=>'shared/'+f))};
fs.writeFileSync(new URL('inventory.json',import.meta.url),JSON.stringify(out,null,2));
console.log(JSON.stringify({statuses:out.statuses,permissionCount:out.permissions.length,products:out.products.map(p=>[p.code,p.name,p.method,p.templateId]),automated:automated.length,browserFiles:browser.length,controls:out.controls.length,captionControls:out.controls.filter(c=>c.policy==='label_only').length},null,2));
