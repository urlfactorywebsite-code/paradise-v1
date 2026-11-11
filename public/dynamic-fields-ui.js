/* Session-local configuration editing; record values use existing record saves. */
(() => {
 'use strict';
 const state={owner:'',enabled:false,generation:0,cache:new Map(),pending:new Map(),mounts:new Map(),editor:null},decorators=new Set();
 const labels={text:'Text',number:'Number',dropdown:'Dropdown',multi_select:'Multi-select',date:'Date',checkbox:'Checkbox',textarea:'Textarea'};
 const owner=()=>AUTH?AUTH.id+':'+CSRF:'';
 const authorized=()=>AUTH?.role==='Administrator'&&can('fields.manage');
 const clone=value=>structuredClone(value);
 const stepperFor=field=>typeof FieldControls==='undefined'?null:FieldControls.controls.find(control=>control.id===field?.id)?.stepper;
 function closeEditor(){const editor=state.editor;if(!editor)return;state.editor=null;editor.dialog.close();editor.dialog.remove();if(editor.trigger?.isConnected)editor.trigger.focus();}
 function dialogKeys(dialog,event){if(event.key==='Escape'||event.key==='Tab')event.stopPropagation();if(event.key!=='Tab')return;const controls=[...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(node=>!node.disabled&&node.getAttribute('tabindex')!=='-1'&&node.getClientRects().length&&!node.closest('[hidden]'));const first=controls[0],last=controls.at(-1);if(first&&event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(first&&!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
 function sync(){
  if(state.owner!==owner()||!authorized()&&state.enabled){state.owner=owner();state.enabled=false;state.generation++;state.cache.clear();state.pending.clear();closeEditor();window.dispatchEvent(new CustomEvent('field-edit-session-changed'));}
  document.body.classList.toggle('df-edit-mode',state.enabled&&authorized());
 }
 function header(){sync();return authorized()?`<button type="button" id="df-mode-toggle" class="b2 df-mode-toggle" aria-pressed="${state.enabled}" onclick="GlobalEditMode.toggle()">Edit Mode ${state.enabled?'ON':'OFF'}</button>`:'';}
 function applyMode(){
  sync();const toggle=document.querySelector('#df-mode-toggle');
  if(toggle){const text='Edit Mode '+(state.enabled?'ON':'OFF');if(toggle.textContent!==text)toggle.textContent=text;toggle.setAttribute('aria-pressed',String(state.enabled));toggle.hidden=!authorized();}
  for(const [element,mount] of state.mounts){if(!element.isConnected){state.mounts.delete(element);continue;}element.hidden=mount.ready&&!mount.renderedCount&&!Object.keys(mount.getValues()||{}).length&&!(state.enabled&&authorized()&&!mount.readonly);for(const control of mount.controls||[])control.hidden=!state.enabled||!authorized()||mount.readonly;}
 }
 async function load(page,force=false){
  sync();const key=state.owner+':'+page,generation=state.generation;
  if(state.pending.has(key))return state.pending.get(key);
  const promise=(async()=>{
   const cached=force?null:state.cache.get(key),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
   try{
    const response=await fetch('/api/field-configurations/resolve?pageKeys='+encodeURIComponent(page),{credentials:'same-origin',cache:'no-store',headers:cached?{'If-None-Match':cached.etag}:{},signal:controller.signal});
    let payload;if(response.status===304&&cached)payload=cached.data;else{payload=await response.json();if(!response.ok){const error=new Error(payload.error||'Could not load fields.');error.status=response.status;throw error;}}
    if(generation!==state.generation||key!==owner()+':'+page)throw new Error('The signed-in session changed.');
    state.cache.set(key,{etag:response.headers.get('etag')||cached?.etag,data:payload});return payload.data[page];
   }finally{clearTimeout(timer);}
  })();state.pending.set(key,promise);
  try{return await promise;}finally{if(state.pending.get(key)===promise)state.pending.delete(key);}
 }
 function valueControl(field,value,readonly,controlId){
  const required=field.isRequired&&!readonly?' required':'',disabled=readonly?' disabled':'',hint=field.configuration?.placeholder||'';
  const attrs=`id="${controlId}" data-df-value="${esc(field.rootFieldId)}" aria-describedby="${controlId}-error"${required}${disabled}`;
  if(DynamicValues.choices(field.fieldType)){
   const selected=Array.isArray(value)?value:[value],options=[...field.options,...field.retainedOptions.filter(option=>selected.includes(option.value))];
   return `<select ${attrs}${field.fieldType==='multi_select'?' multiple size="4"':''}>${field.fieldType==='dropdown'?'<option value="">Choose an option</option>':''}${options.map(option=>`<option value="${esc(option.value)}"${selected.includes(option.value)?' selected':''}${!option.isActive||option.archivedAt?' disabled':''}>${esc(option.label)}${option.retained?' (saved)':option.archivedAt?' (archived)':''}</option>`).join('')}</select>`;
  }
  if(field.fieldType==='textarea')return `<textarea ${attrs} rows="3" maxlength="${field.configuration?.maxLength||4000}" placeholder="${esc(hint)}">${esc(value??'')}</textarea>`;
  if(field.fieldType==='checkbox')return `<input ${attrs} type="checkbox"${value===true?' checked':''}>`;
  return `<input ${attrs} type="${field.fieldType==='number'?'number':field.fieldType==='date'?'date':'text'}" ${field.fieldType==='number'?'step="any" min="-1000000000" max="1000000000"':''} maxlength="${field.configuration?.maxLength||4000}" placeholder="${esc(hint)}" value="${esc(value??'')}">`;
 }
 function error(mount,message){const element=mount.element.querySelector('.df-section-error');if(element){element.hidden=!message;element.textContent=message||'';}}
 function renderMount(mount){
  const element=mount.element,values=mount.getValues()||{},snapshots=mount.getSnapshots()||{};
  const fields=mount.fields.filter(field=>field.policy==='configurable'&&field.isActive&&field.isVisible&&(!mount.readonly||Object.hasOwn(values,field.rootFieldId)));mount.renderedCount=fields.length;
  mount.controls=[];
  element.innerHTML=`<div class="df-section-heading"><h3>Additional ${mount.page==='customers'?'customer':'quotation'} fields</h3><button type="button" class="b2 df-add-field" hidden>+ Add field</button></div><p class="df-section-error customer-error" role="alert" hidden></p><div class="df-values-grid">${fields.map(field=>{
   const id='df-'+mount.page+'-'+field.rootFieldId,snapshot=mount.readonly&&snapshots[field.rootFieldId],caption=snapshot?.label||field.label;
   const shown=snapshot?{...field,options:field.options.map(option=>({...option,label:snapshot.options?.find(saved=>saved.value===option.value)?.label||option.label})),retainedOptions:field.retainedOptions.map(option=>({...option,label:snapshot.options?.find(saved=>saved.value===option.value)?.label||option.label}))}:field;
   return `<div class="df-field" data-df-root="${field.rootFieldId}"><div class="df-caption"><label for="${id}">${esc(caption)}${field.isRequired&&!mount.readonly?' *':''}</label><button type="button" class="b2 s df-edit-field" data-df-edit="${field.id}" aria-label="Edit field ${esc(caption)}" title="Edit field configuration" hidden>✎ Edit</button></div>${valueControl(shown,values[field.rootFieldId],mount.readonly,id)}${field.configuration?.helpText?`<small class="mu">${esc(field.configuration.helpText)}</small>`:''}<small id="${id}-error" class="customer-error" role="alert" hidden></small></div>`;
  }).join('')}</div>`;
  const add=element.querySelector('.df-add-field');add.onclick=()=>openEditor(null,mount,add);mount.controls.push(add);
  for(const button of element.querySelectorAll('[data-df-edit]')){button.onclick=()=>openEditor(button.dataset.dfEdit,mount,button);mount.controls.push(button);}
  for(const control of element.querySelectorAll('[data-df-value]'))control.addEventListener('input',()=>{const next=clone(mount.getValues()||{});next[control.dataset.dfValue]=readControl(control);mount.setValues(next);});
  const inactive=Object.keys(values).filter(root=>!fields.some(field=>field.rootFieldId===root));
  if(inactive.length){const details=document.createElement('details');details.className='df-retained';const summary=document.createElement('summary');summary.textContent='Saved fields no longer available';details.append(summary);for(const root of inactive){const snapshot=snapshots[root],row=document.createElement('p');row.textContent=(snapshot?.label||'Saved field')+': '+displayValue(values[root],snapshot);details.append(row);}element.append(details);}
  if(mount.page==='customers')decorateLabels(mount);
  applyMode();
 }
 function displayValue(value,snapshot){const values=Array.isArray(value)?value:[value];return values.map(key=>snapshot?.options?.find(option=>option.value===key)?.label??String(key??'Not set')).join(', ');}
 function decorateLabels(mount){
  for(const [key,inputId] of [['name','cf_name'],['type','cf_type']]){
   const field=mount.fields.find(value=>value.id==='system_customers_'+key),input=document.getElementById(inputId);if(!field||!input)continue;
   const label=input.closest('label'),span=label?.querySelector('span');if(!span)continue;const focused=label.contains(document.activeElement)?document.activeElement:null;span.textContent=field.label+(key==='name'?' *':'');input.setAttribute('aria-label',span.textContent);
   let wrapper=label.parentElement;if(!wrapper.classList.contains('df-builtin-wrap')){wrapper=document.createElement('div');wrapper.className='df-builtin-wrap customer-field';label.replaceWith(wrapper);wrapper.append(label);}
   wrapper.querySelector('.df-edit-field')?.remove();const button=document.createElement('button');button.type='button';button.className='b2 s df-edit-field';button.dataset.dfEdit=field.id;button.textContent='✎';button.setAttribute('aria-label','Edit field '+field.label);button.hidden=true;button.onclick=()=>openEditor(field.id,mount,button);wrapper.append(button);mount.controls.push(button);focused?.focus({preventScroll:true});
  }
 }
 function readControl(control){if(control.type==='checkbox')return control.checked;if(control.multiple)return [...control.selectedOptions].map(option=>option.value);if(control.type==='number')return control.value===''?null:control.valueAsNumber;return control.value;}
 function retainSavedChoices(fields,mount){
  return fields.map(field=>{
   if(!DynamicValues.choices(field.fieldType))return field;
   const value=mount.getValues()?.[field.rootFieldId],selected=Array.isArray(value)?value:[value],known=[...field.options,...field.retainedOptions];
   const retained=(mount.getSnapshots()?.[field.rootFieldId]?.options||[]).filter(option=>selected.includes(option.value)&&!known.some(current=>current.value===option.value)).map(option=>({...option,isActive:false,retained:true}));
   return retained.length?{...field,retainedOptions:[...field.retainedOptions,...retained]}:field;
  });
 }
 async function refreshMount(mount,force=false){
  const request=mount.request=(mount.request||0)+1;
  mount.ready=false;mount.element.setAttribute('aria-busy','true');
  if(mount.page==='customers'&&document.querySelector('#customer-save'))document.querySelector('#customer-save').disabled=true;
  try{const fields=await load(mount.page,force);if(request!==mount.request||!mount.element.isConnected||mount.owner!==owner())return;mount.fields=retainSavedChoices(fields,mount);mount.ready=true;renderMount(mount);}
  catch(failureError){if(request!==mount.request||!mount.element.isConnected||mount.owner!==owner())return;mount.element.hidden=false;mount.element.innerHTML='<p class="customer-error" role="alert"></p><button type="button" class="b2">Retry loading fields</button>';mount.element.querySelector('p').textContent=failureError.message;mount.element.querySelector('button').onclick=()=>refreshMount(mount,true);if(failureError.status===401)failure(failureError);}
  finally{if(request===mount.request){mount.element.setAttribute('aria-busy','false');const save=mount.page==='customers'&&mount.element.isConnected&&document.querySelector('#customer-save');if(save&&!mount.record.saving){if(save.dataset.wasDisabled!==undefined)save.dataset.wasDisabled='0';else save.disabled=false;}}}
 }
 function scan(){
  sync();
  for(const [selector,page] of [['#customer-dynamic-fields','customers'],['#quotation-dynamic-fields','quotations']]){
   const element=document.querySelector(selector);if(!element||state.mounts.has(element)||!AUTH)continue;
   const record=page==='customers'?CUSTOMER_FORM:Q;if(!record)continue;
   const mount={element,page,record,owner:owner(),fields:[],controls:[],ready:false,readonly:page==='quotations'&&Boolean(Q.id&&Q.status!=='Draft'),getValues:()=>record.customFields,getSnapshots:()=>record.customFieldSnapshots,setValues:value=>{record.customFields=value;if(page==='quotations')editorChanged(false);}};
   state.mounts.set(element,mount);element.hidden=false;element.innerHTML='<p class="mu" role="status">Loading additional fields…</p>';refreshMount(mount);
  }
  applyMode();
 }
 function validate(page){
  for(const mount of state.mounts.values())if(mount.element.isConnected&&mount.page===page){
   if(!mount.ready){error(mount,'Wait for additional fields to load, or retry loading them.');return false;}
   if(mount.readonly)return true;
   const next=clone(mount.getValues()||{});let invalid=false;
   for(const control of mount.element.querySelectorAll('[data-df-value]')){
    const field=mount.fields.find(value=>value.rootFieldId===control.dataset.dfValue),message=document.getElementById(control.id+'-error');
    try{if(control.validity.badInput)throw new Error(field.label+': enter a valid value.');const previous=DynamicValues.choices(field.fieldType)?(mount.getSnapshots()?.[field.rootFieldId]?.options||[]).map(option=>option.value):undefined;next[field.rootFieldId]=DynamicValues.normalize(field,readControl(control),previous);control.removeAttribute('aria-invalid');message.hidden=true;}
    catch(validation){invalid=true;message.hidden=false;message.textContent=validation.message;control.setAttribute('aria-invalid','true');}
   }
   if(invalid){mount.element.querySelector('[aria-invalid=true]')?.focus();return false;}
   if(Object.keys(next).length||mount.getValues()!==undefined)mount.setValues(next);
  }
  return true;
 }
 function dialogError(editor,message){const el=editor.dialog.querySelector('#df-editor-error');el.hidden=false;el.textContent=message;}
 function updateOptionRows(editor){
  const list=editor.dialog.querySelector('#df-options-list');if(!list)return;
  list.innerHTML=editor.draft.options.map((option,index)=>`<div class="df-option-row" role="listitem" data-index="${index}"><button type="button" class="b2 df-drag" data-action="drag" data-index="${index}" draggable="true" aria-label="Drag ${esc(option.label||'new option')} to reorder">⠿</button><label>Option label<input data-property="label" data-index="${index}" aria-label="Option ${index+1} label" maxlength="150" value="${esc(option.label)}"></label><label>Stable key<input data-property="value" data-index="${index}" aria-label="Option ${index+1} key" maxlength="64" value="${esc(option.value)}" ${option.id?'readonly':''}></label><div class="df-option-actions"><button type="button" class="b2 s" data-action="up" data-index="${index}" aria-label="Move option ${index+1} up" ${index===0?'disabled':''}>↑</button><button type="button" class="b2 s" data-action="down" data-index="${index}" aria-label="Move option ${index+1} down" ${index===editor.draft.options.length-1?'disabled':''}>↓</button><button type="button" class="b2 s" data-action="archive" data-index="${index}" ${option.savedArchived?'disabled':''}>${option.savedArchived?'Archived':option.archived?'Undo archive':option.id?'Archive':'Remove'}</button></div></div>`).join('');
 }
 function moveOption(editor,from,to){if(to<0||to>=editor.draft.options.length||from===to)return;const [option]=editor.draft.options.splice(from,1);editor.draft.options.splice(to,0,option);updateOptionRows(editor);editor.dialog.querySelector("#df-order-status").textContent=(option.label||"New option")+" moved to position "+(to+1);editor.dialog.querySelector(`[data-action=drag][data-index="${to}"]`)?.focus();}
 function renderEditor(editor){
  const draft=editor.draft,configurable=!editor.field||editor.field.policy==='configurable';
  editor.dialog.innerHTML=`<form id="df-editor-form" novalidate><div class="df-editor-heading"><h2 id="df-editor-heading">${editor.field?'Edit field':'Add field'}</h2><button type="button" class="b2" data-action="cancel" aria-label="Close field editor">✕</button></div><p class="mu">Configuration changes are saved separately from the customer or quotation.</p><p id="df-editor-error" class="customer-error" role="alert" hidden></p><div class="df-editor-grid"><label>Field label<input id="df-field-label" aria-label="Field label" maxlength="150" value="${esc(draft.label)}"></label>${editor.field?`<p class="mu">Internal key: <code>${esc(editor.field.fieldKey)}</code><br>Scope: ${esc(editor.field.scopeType)}</p>`:`<label>Internal field key<input id="df-field-key" aria-label="Internal field key" maxlength="63" value="${esc(draft.fieldKey)}"></label><label>Field type<select id="df-field-type" aria-label="Field type">${DynamicValues.TYPES.map(type=>`<option value="${type}"${type===draft.fieldType?' selected':''}>${labels[type]}</option>`).join('')}</select></label>`}${configurable?`<label class="checkbox"><input id="df-required" type="checkbox"${draft.isRequired?' checked':''}> Required field</label>`:''}</div><section id="df-options" ${DynamicValues.choices(draft.fieldType)?'':'hidden'}><h3>Dropdown options</h3><p class="mu">Drag the handles or use Move up/Move down. Existing keys are permanent; archived options stay available to saved records.</p><div id="df-options-list" role="list" aria-label="Field options"></div><p id="df-order-status" class="sr-only" role="status" aria-live="polite"></p><button type="button" class="b2" data-action="add-option">+ Add New Option</button></section><div class="df-editor-actions"><button id="df-editor-save" type="submit">Save changes</button><button type="button" class="b2" data-action="cancel">Cancel</button><button type="button" class="b2" data-action="reset">Reset unsaved edits</button><button type="button" class="b2" data-action="reload" hidden>Reload latest configuration</button></div></form>`;
  updateOptionRows(editor);
  const stepper=stepperFor(editor.field);
  if(stepper){const label=document.createElement('label'),input=document.createElement('input'),help=document.createElement('p');label.textContent='Percentage cycle limit';input.type='number';input.id='df-cycle-max';input.min=String(stepper.min);input.max=String(stepper.max);input.step='1';input.value=draft.configuration?.cycleMax??stepper.cycleMax;label.append(input);editor.dialog.querySelector('.df-editor-grid').append(label);help.className='mu';help.textContent='Percentage arrows and scrolling cycle from 1 to this limit, then return to 1. Manual and saved discounts stay unchanged. Fixed-amount discounts step by ₹5.';editor.dialog.querySelector('.df-editor-grid').after(help);}
  if(configurable){const label=document.createElement('label'),input=document.createElement('input');label.textContent='Display order';input.type='number';input.id='df-display-order';input.min='0';input.max='10000';input.step='1';input.value=draft.displayOrder??editor.field?.displayOrder??0;label.append(input);editor.dialog.querySelector('.df-editor-grid').append(label);}
  if(editor.field?.native){editor.dialog.querySelector('#df-required')?.setAttribute('disabled','');editor.dialog.querySelector('[data-action=add-option]').disabled=true;const note=document.createElement('p');note.className='mu';note.textContent='Catalog keys and pricing requirements are protected. Add priced variants through Product/Pricing Configuration.';editor.dialog.querySelector('#df-options').append(note);}
  editor.dialog.querySelector('#df-editor-form').onsubmit=event=>{event.preventDefault();saveEditor(editor);};
  editor.dialog.oninput=event=>{
   const input=event.target;
   if(input.id==='df-field-label')draft.label=input.value;
   else if(input.id==='df-field-key')draft.fieldKey=input.value;
   else if(input.id==='df-required')draft.isRequired=input.checked;
   else if(input.id==='df-display-order')draft.displayOrder=input.valueAsNumber;
   else if(input.id==='df-cycle-max')draft.configuration={cycleMax:input.valueAsNumber};
   else if(input.dataset.property)draft.options[Number(input.dataset.index)][input.dataset.property]=input.value;
  };
  editor.dialog.onchange=event=>{if(event.target.id==='df-field-type'){draft.fieldType=event.target.value;editor.dialog.querySelector('#df-options').hidden=!DynamicValues.choices(draft.fieldType);}};
  editor.dialog.onclick=event=>{
   const button=event.target.closest('[data-action]');if(!button||editor.saving)return;event.preventDefault();const index=Number(button.dataset.index);
   if(button.dataset.action==='cancel')closeEditor();
   if(button.dataset.action==='reset'){editor.draft=clone(editor.initial);renderEditor(editor);if(editor.conflict)showConflict(editor);editor.dialog.querySelector('#df-field-label').focus();}
   if(button.dataset.action==='reload')reloadEditor(editor);
   if(button.dataset.action==='add-option'){if(draft.options.length>=100){dialogError(editor,'Use at most 100 options, including archived ones.');return;}draft.options.push({value:'option_'+crypto.randomUUID().replaceAll('-','').slice(0,12),label:'',isActive:true});updateOptionRows(editor);editor.dialog.querySelector(`[data-property=label][data-index="${draft.options.length-1}"]`).focus();}
   if(button.dataset.action==='up')moveOption(editor,index,index-1);
   if(button.dataset.action==='down')moveOption(editor,index,index+1);
   if(button.dataset.action==='archive'){const option=draft.options[index];if(!option.id)draft.options.splice(index,1);else{if(!option.archived)option.beforeArchiveActive=option.isActive;option.archived=!option.archived;option.isActive=option.archived?false:option.beforeArchiveActive;}updateOptionRows(editor);(editor.dialog.querySelector(`[data-action=archive][data-index="${index}"]`)||editor.dialog.querySelector('[data-action=add-option]')).focus();}
  };
  editor.dialog.ondragstart=event=>{const handle=event.target.closest('[data-action=drag]');if(!handle)return;editor.dragIndex=Number(handle.dataset.index);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(editor.dragIndex));};
  editor.dialog.ondragover=event=>{if(event.target.closest('.df-option-row')&&editor.dragIndex!==undefined)event.preventDefault();};
  editor.dialog.ondrop=event=>{const row=event.target.closest('.df-option-row');if(!row||editor.dragIndex===undefined)return;event.preventDefault();moveOption(editor,editor.dragIndex,Number(row.dataset.index));delete editor.dragIndex;};
  editor.dialog.ondragend=()=>{delete editor.dragIndex;};
 }
 function fromField(field){return {label:field.label,fieldType:field.fieldType,isRequired:field.isRequired,...(stepperFor(field)?{configuration:{cycleMax:field.configuration?.cycleMax??stepperFor(field).cycleMax}}:{}),options:field.options.map(option=>({id:option.id,value:option.value,label:option.label,isActive:option.isActive,archived:Boolean(option.archivedAt),savedArchived:Boolean(option.archivedAt)}))};}
 async function openEditor(fieldId,mount,trigger){
  if(!authorized()||!state.enabled||mount.readonly)return;closeEditor();
  const dialog=document.createElement('dialog');dialog.id='df-editor';dialog.className='df-editor';dialog.setAttribute('aria-labelledby','df-editor-heading');dialog.innerHTML='<h2 id="df-editor-heading">Loading field editor…</h2><button type="button" class="b2">Cancel</button>';dialog.querySelector('button').onclick=closeEditor;document.body.append(dialog);
  const editor={dialog,fieldId,mount,trigger,owner:owner(),saving:false};state.editor=editor;
  // Native modal keys must not reach the ordinary customer/modal shortcuts.
  dialog.onkeydown=event=>dialogKeys(dialog,event);
  dialog.oncancel=event=>{event.preventDefault();if(!editor.saving)closeEditor();};dialog.showModal();
  try{
   const field=fieldId?(await api('/api/configurable-fields/'+encodeURIComponent(fieldId))).data:null;
   if(state.editor!==editor||editor.owner!==owner())return;
   if(field?.policy==='protected')throw new Error('This field is protected by its business workflow.');
   editor.field=field;editor.draft=field?fromField(field):{label:'',fieldKey:'custom_field_'+crypto.randomUUID().replaceAll('-','').slice(0,12),fieldType:'text',isRequired:false,options:[]};editor.initial=clone(editor.draft);renderEditor(editor);dialog.querySelector('#df-field-label').focus();
  }catch(loadError){if(state.editor===editor){dialog.innerHTML='<h2 id="df-editor-heading">Field editor unavailable</h2><p role="alert"></p><button type="button" class="b2">Cancel</button>';dialog.querySelector('p').textContent=loadError.message;dialog.querySelector('button').onclick=closeEditor;if(loadError.status===401)failure(loadError);}}
 }
 function showConflict(editor){editor.conflict=true;dialogError(editor,'This field changed in another session. Reload latest configuration before saving; your unsaved edits have been kept.');editor.dialog.querySelector('[data-action=reload]').hidden=false;editor.dialog.querySelector('#df-editor-save').disabled=true;}
 async function reloadEditor(editor){const request=editor.reloadRequest=(editor.reloadRequest||0)+1;try{const field=(await api('/api/configurable-fields/'+editor.fieldId)).data;if(request!==editor.reloadRequest||state.editor!==editor||editor.owner!==owner())return;editor.field=field;editor.draft=fromField(field);editor.initial=clone(editor.draft);editor.conflict=false;renderEditor(editor);state.generation++;state.cache.clear();state.pending.clear();for(const mount of state.mounts.values())if(mount.element.isConnected)refreshMount(mount,true);}catch(reloadError){if(state.editor===editor)dialogError(editor,reloadError.message);}}
 async function saveEditor(editor){
  if(editor.saving||editor.conflict||!authorized()||editor.owner!==owner()||!state.enabled)return;
  const draft=editor.draft;editor.dialog.querySelector('#df-editor-error').hidden=true;
  const key=/^[a-z][a-z0-9_]{0,63}$/;
  if(!draft.label.trim()||draft.label.length>150){dialogError(editor,'Enter a field label (1–150 characters).');return;}
  if(!editor.field&&!/^custom_[a-z][a-z0-9_]{0,55}$/.test(draft.fieldKey)){dialogError(editor,'Use a unique internal key beginning with custom_.');return;}
  if(DynamicValues.choices(draft.fieldType)){
   if(draft.options.some(option=>!option.label.trim()||option.label.length>150||!key.test(option.value)||['constructor','prototype','__proto__'].includes(option.value))||new Set(draft.options.map(option=>option.value)).size!==draft.options.length){dialogError(editor,'Every option needs a label and a unique valid permanent key.');return;}
   if(draft.isRequired&&!draft.options.some(option=>!option.archived&&option.isActive)){dialogError(editor,'A required dropdown needs an available option.');return;}
  }
  const options=draft.options.map(option=>({...(option.id?{id:option.id}:{}),value:option.value,label:option.label,isActive:option.isActive,archived:option.archived||false}));
  const displayOrder=draft.displayOrder??editor.field?.displayOrder??0;if(!Number.isInteger(displayOrder)||displayOrder<0||displayOrder>10000){dialogError(editor,'Display order must be an integer from 0 to 10000.');return;}
  const stepper=stepperFor(editor.field);
  if(stepper&&(!Number.isInteger(draft.configuration?.cycleMax)||draft.configuration.cycleMax<stepper.min||draft.configuration.cycleMax>stepper.max)){dialogError(editor,'Percentage cycle limit must be a whole number from '+stepper.min+' to '+stepper.max+'.');return;}
  const data={label:draft.label,...(stepper?{configuration:draft.configuration}:{}),...(!editor.field||editor.field.policy==='configurable'?{isRequired:draft.isRequired,displayOrder,...(DynamicValues.choices(draft.fieldType)?{options}:{})}:{})};
  let route='/api/configurable-fields',payload,method;
  if(editor.field){route+='/'+editor.field.id+'/editor';method='PUT';payload={version:editor.field.version,data};}
  else{method='POST';payload={data:{...data,pageKey:editor.mount.page,...(editor.mount.productId?{scopeType:'product',scopeId:editor.mount.productId}:{}),fieldKey:draft.fieldKey,fieldType:draft.fieldType,...(DynamicValues.choices(draft.fieldType)?{options:options.map(({id,archived,...option},index)=>({...option,displayOrder:index}))}:{})}};}
  editor.saving=true;for(const control of editor.dialog.querySelectorAll('input,select,button'))control.disabled=true;editor.dialog.querySelector('#df-editor-save').textContent='Saving…';editor.dialog.setAttribute('aria-busy','true');
  try{const result=await api(route,{method,body:JSON.stringify(payload)});if(state.editor!==editor||editor.owner!==owner())return;state.generation++;state.cache.clear();state.pending.clear();closeEditor();await Promise.all([...state.mounts.values()].filter(mount=>mount.element.isConnected).map(mount=>refreshMount(mount,true)));document.querySelector(`[data-df-edit="${result.data.id}"]`)?.focus();window.dispatchEvent(new CustomEvent('field-configuration-saved',{detail:{field:result.data}}));toast('Field configuration saved');}
  catch(saveError){if(state.editor!==editor||editor.owner!==owner())return;editor.saving=false;renderEditor(editor);if(saveError.status===409&&editor.field&&/changed|Reload before saving/i.test(saveError.message))showConflict(editor);else dialogError(editor,saveError.message);if(saveError.status===401)failure(saveError);}
  finally{editor.saving=false;editor.dialog.removeAttribute('aria-busy');}
 }
 window.GlobalEditMode=Object.freeze({header,beforeRender:sync,toggle(){sync();if(!authorized())return;state.enabled=!state.enabled;if(!state.enabled)closeEditor();applyMode();window.dispatchEvent(new CustomEvent('field-edit-mode-changed',{detail:{enabled:state.enabled}}));toast('Edit Mode '+(state.enabled?'ON':'OFF'));},enabled:()=>state.enabled&&authorized()});
 const baseScan=scan;scan=function(){baseScan();for(const decorate of decorators)decorate();};
 window.DynamicFields=Object.freeze({validate,scan,load,dialogKeys,decorate(fn){decorators.add(fn);fn();},control:valueControl,edit:(fieldId,mount,trigger)=>openEditor(fieldId,mount,trigger)});
 let queued=false;new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;scan();});}}).observe(document.body,{childList:true,subtree:true});
 scan();
})();
