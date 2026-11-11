'use strict';
function customerRowMenu(anchor,id) {
 if(!can('customer.view')||busy)return;
 const items=[['View',()=>custView(id)]];
 if(can('customer.edit'))items.push(['Edit',()=>custForm(id)]);
 if(can('customer.delete'))items.push(['Delete',()=>deleteCustomer(id),true]);
 // Reuse the existing row menu's positioning, dismissal and keyboard handling.
 productsMenu(anchor,items);
}
let CUSTOMER_FORM=null;
const customerFieldLabels={name:'Customer name',co:'Company name',person:'Contact person',contactPersonPhone:'Contact person number',mob:'Mobile number',wa:'WhatsApp number (with country code)',email:'Email address',gstin:'GSTIN',type:'Customer type',addr:'Billing address',notes:'Internal notes'};
function customerInput(key,value,required=false,type='text') {
 const label=customerFieldLabels[key];
 return `<label class="f customer-field ${['addr','notes'].includes(key)?'customer-wide':''}"><span>${esc(label)}${required?' *':''}</span><input id="cf_${key}" aria-label="${esc(label)}${required?' *':''}" aria-describedby="cf_error_${key}" ${required?'aria-required="true"':''} type="${type}" ${type==='tel'?'inputmode="tel"':''} maxlength="${['addr','notes'].includes(key)?4000:key==='contactPersonPhone'?40:200}" value="${esc(value||'')}"><small class="customer-error" id="cf_error_${key}" hidden></small></label>`;
}
function custForm(id,fromQ) {
 if(!can(id?'customer.edit':'customer.create'))return;
 const customer=id?cust(id):{};
 CUSTOMER_FORM={id:id||'C'+uid(),existing:Boolean(id),fromQ:Boolean(fromQ),addresses:clone(customer.deliveryAddresses||[]),selected:customer.deliveryAddressId||'',editing:null,saving:false,customFields:customer.customFields===undefined?undefined:clone(customer.customFields),customFieldSnapshots:clone(customer.customFieldSnapshots||{})};
 const categories=S.customerCategories||[],categoryOptions=categories.filter(c=>c.active||c.id===customer.categoryId).map(c=>[c.id,c.name]);
 modal(`<h2>${id?'Edit':'Add'} customer</h2><form id="customer-form" novalidate onsubmit="event.preventDefault();custSave()"><div id="customer-form-error" class="customer-error" role="alert" hidden></div><div class="customer-form-grid">${customerInput('name',customer.name,true)}${customerInput('co',customer.co)}${customerInput('person',customer.person)}${customerInput('contactPersonPhone',customer.contactPersonPhone,false,'tel')}${customerInput('mob',customer.mob,true,'tel')}${customerInput('wa',customer.wa,false,'tel')}${customerInput('email',customer.email,false,'email')}${customerInput('gstin',customer.gstin)}${customerInput('type',customer.type??'Individual')}<label class="f customer-field"><span>Customer category</span><select id="cf_categoryId" aria-label="Customer category" aria-describedby="cf_error_categoryId" onchange="customerCategoryChanged()">${selectOptions(categoryOptions,customer.categoryId||'','Uncategorized')}</select><small id="cf_error_categoryId" class="customer-error" hidden></small></label><label class="f customer-field customer-wide" id="customer-other-field" hidden><span>Custom category description *</span><input id="cf_customCategoryName" aria-label="Custom category description" aria-describedby="cf_error_customCategoryName" maxlength="200" value="${esc(customer.customCategoryName||'')}"><small id="cf_error_customCategoryName" class="customer-error" hidden></small></label>${customerInput('addr',customer.addr)}${customerInput('notes',customer.notes)}</div><section id="customer-dynamic-fields" class="df-section" hidden></section><section class="customer-delivery" aria-labelledby="customer-delivery-heading"><h3 id="customer-delivery-heading">Delivery addresses</h3><p class="mu">Addresses are saved with this customer. Billing address stays separate.</p><div id="customer-addresses"></div></section><p class="mu">Example WhatsApp format: +919876543210. Contact person number accepts 8–15 digits, with an optional country code.</p><div id="customer-duplicate-warning" class="note" role="alert" hidden></div><div class="customer-form-actions"><button id="customer-save" type="submit">Save customer</button><button type="button" class="b2" onclick="closeM()">Cancel</button></div></form>`,900);
 $('#modal .box h2').id='customer-form-heading';$('#modal .box').setAttribute('role','dialog');$('#modal .box').setAttribute('aria-modal','true');$('#modal .box').setAttribute('aria-labelledby','customer-form-heading');
 customerCategoryChanged();customerRenderAddresses();$('#cf_name').focus();$('#modal').scrollTop=0;
}
function customerCategoryChanged() {
 const other=(S.customerCategories||[]).find(c=>c.id===$('#cf_categoryId').value)?.isOther;
 $('#customer-other-field').hidden=!other;$('#cf_customCategoryName').disabled=!other;
 $('#cf_customCategoryName').setAttribute('aria-required',String(Boolean(other)));
}
function customerError(key,message) {
 const input=$('#cf_'+key),error=$('#cf_error_'+key);
 if(input)input.setAttribute('aria-invalid',String(Boolean(message)));
 if(error){error.hidden=!message;error.textContent=message||'';}
}
function customerClearErrors() {
 for(const key of [...Object.keys(customerFieldLabels),'categoryId','customCategoryName'])customerError(key,'');
 $('#customer-form-error').hidden=true;
}
function customerReadForm() {
 const data=Object.fromEntries(Object.keys(customerFieldLabels).map(k=>[k,$('#cf_'+k).value.trim()]));
 data.categoryId=$('#cf_categoryId').value||null;
 data.customCategoryName=(S.customerCategories||[]).find(c=>c.id===data.categoryId)?.isOther?$('#cf_customCategoryName').value.trim():null;
 data.contactPersonPhone=data.contactPersonPhone.replace(/[ ()-]/g,'')||null;
 data.wa=data.wa.replace(/[ ()-]/g,'');
 data.deliveryAddresses=clone(CUSTOMER_FORM.addresses);data.deliveryAddressId=CUSTOMER_FORM.selected||null;
 if(CUSTOMER_FORM.customFields!==undefined)data.customFields=clone(CUSTOMER_FORM.customFields);
 return data;
}
function customerValidate(data) {
 const errors={};
 if(!data.name)errors.name='Customer name is required.';
 if(!/^[0-9+ ()-]{10,20}$/.test(data.mob))errors.mob='Enter a valid mobile number.';
 if(data.contactPersonPhone&&!/^(?:\+[1-9]\d{7,14}|\d{8,15})$/.test(data.contactPersonPhone))errors.contactPersonPhone='Enter 8–15 digits, optionally starting with + and a country code.';
 if(data.wa&&!/^\+[1-9]\d{7,14}$/.test(data.wa))errors.wa='Include + and an international country code (8–15 digits).';
 if(data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))errors.email='Enter a valid email address.';
 if((S.customerCategories||[]).find(c=>c.id===data.categoryId)?.isOther&&!data.customCategoryName)errors.customCategoryName='Enter a custom category description.';
 for(const [key,message] of Object.entries(errors))customerError(key,message);
 if(Object.keys(errors).length){$('#cf_'+Object.keys(errors)[0]).focus();return false;}return true;
}
async function custSave(id,fromQ,force=false) {
 const draft=CUSTOMER_FORM,form=$('#customer-form'),quotation=Q,userId=AUTH?.id;
 if(!draft||!form||draft.saving||busy||!can(draft.existing?'customer.edit':'customer.create'))return false;
 const current=()=>CUSTOMER_FORM===draft&&$('#customer-form')===form&&AUTH?.id===userId;
 customerClearErrors();
 if(typeof DynamicFields!=='undefined'&&!DynamicFields.validate('customers'))return false;
 if(draft.editing!==null&&!customerApplyAddress())return false;
 const data=customerReadForm();if(!customerValidate(data))return false;
 const duplicate=S.customers.find(c=>c.id!==draft.id&&['mob','wa','email','gstin'].some(k=>data[k]&&String(c[k]||'').trim().toLowerCase()===data[k].toLowerCase()));
 if(duplicate&&!force){const warning=$('#customer-duplicate-warning');warning.hidden=false;warning.innerHTML=`A matching customer already exists: ${esc(duplicate.name)}. Review the details before creating a separate customer. <button type="button" class="s b2" onclick="custSave(null,null,true)">Save separate customer</button>`;return false;}
 draft.saving=true;const save=$('#customer-save');save.textContent='Saving…';save.disabled=true;
 try {
  const existing=S.customers.find(c=>c.id===draft.id);
  if(existing)Object.assign(existing,data);else S.customers.push({id:draft.id,date:today(),...data});
  if(!await persist({allowDuplicateCustomers:force?[draft.id]:[]})){
   if(!current())return false;
   const error=$('#customer-form-error');if(error){error.hidden=false;error.innerHTML=esc(connection.text||'Customer could not be saved. Your entries are preserved.')+(conflict?' <button type="button" class="s b2" onclick="customerReloadAfterConflict()">Reload latest data (discard form changes)</button>':'');error.scrollIntoView({block:'nearest'});}return false;
  }
  if(current()){
   if(draft.fromQ&&Q&&Q===quotation){if(Q.cid!==draft.id){Q.cid=draft.id;customerResetQuotationDelivery();}}
   closeM();render();
  }
  toast('Customer saved');return true;
 } finally {draft.saving=false;save.textContent='Save customer';save.disabled=false;}
}
async function customerReloadAfterConflict(){
 const draft=CUSTOMER_FORM,form=$('#customer-form');if(!draft||busy)return;
 await reloadState();if(conflict||!AUTH||CUSTOMER_FORM!==draft||$('#customer-form')!==form)return;
 if(draft.existing&&!S.customers.some(c=>c.id===draft.id)){closeM();toast('This customer no longer exists.','er');return;}
 custForm(draft.existing?draft.id:'',draft.fromQ);
}
function customerAddressText(a){return [a.line1,a.line2,a.city,a.state,a.postalCode,a.country].filter(Boolean).join(', ');}
function customerRenderAddresses() {
 const draft=CUSTOMER_FORM,active=draft.addresses.filter(a=>!a.archived),selected=active.find(a=>a.id===draft.selected),archived=draft.addresses.filter(a=>a.archived);
 const optionRows=active.map(a=>[a.id,a.label+(a.isDefault?' (Default)':'')]);
 $('#customer-addresses').innerHTML=`<div class="customer-address-selector"><label class="f"><span>Delivery address</span><select id="cf_deliveryAddressId" aria-label="Delivery address" onchange="CUSTOMER_FORM.selected=this.value;customerRenderAddresses()" ${draft.editing!==null?'disabled':''}>${selectOptions(optionRows,draft.selected,'No delivery address selected')}</select></label><button type="button" class="b2" onclick="customerEditAddress('')" ${draft.editing!==null?'disabled':''}>Add delivery address</button></div>${selected?`<div class="customer-address-preview"><b>${esc(selected.label)}</b><p>${esc(customerAddressText(selected))}</p><div class="row"><button type="button" class="s b2" onclick="customerEditAddress(CUSTOMER_FORM.selected)" ${draft.editing!==null?'disabled':''}>Edit address</button><button type="button" class="s b2" onclick="customerDefaultAddress()" ${selected.isDefault||draft.editing!==null?'disabled':''}>Set as default</button><button type="button" class="s b2" onclick="customerArchiveAddress()" ${draft.editing!==null?'disabled':''}>Archive address</button></div></div>`:''}<div id="customer-address-editor"></div>${archived.length?`<details class="customer-archived"><summary>Archived delivery addresses (${archived.length})</summary>${archived.map(a=>`<div class="row"><span>${esc(a.label)}</span><button type="button" class="s b2" data-id="${esc(a.id)}" onclick="customerRestoreAddress(this.dataset.id)">Restore address</button></div>`).join('')}</details>`:''}`;
}
function customerEditAddress(id) {
 const draft=CUSTOMER_FORM;if(draft.saving)return;
 draft.editing=id;customerRenderAddresses();
 const a=draft.addresses.find(a=>a.id===id)||{},fields=[['label','Address label',true],['line1','Address line 1',true],['line2','Address line 2'],['city','City'],['state','State'],['postalCode','Postal code'],['country','Country',true]];
 $('#customer-address-editor').innerHTML=`<div class="customer-address-edit"><h4>${id?'Edit':'Add'} delivery address</h4><div class="customer-form-grid">${fields.map(([key,label,required])=>`<label class="f customer-field ${['line1','line2'].includes(key)?'customer-wide':''}"><span>${label}${required?' *':''}</span><input id="ca_${key}" aria-label="${label}" ${required?'aria-required="true"':''} aria-describedby="ca_error" maxlength="${['line1','line2'].includes(key)?500:key==='postalCode'?30:100}" value="${esc(a[key]||'')}"></label>`).join('')}</div><label class="checkbox"><input id="ca_isDefault" type="checkbox" ${a.isDefault||!id&&!draft.addresses.some(a=>a.isDefault&&!a.archived)?'checked':''}> Default delivery address</label><p id="ca_error" class="customer-error" role="alert" hidden></p><div class="row"><button type="button" class="b2" onclick="customerApplyAddress()">Use address</button><button type="button" class="b2" onclick="CUSTOMER_FORM.editing=null;customerRenderAddresses()">Cancel address changes</button></div><small class="mu">Save customer to persist these address changes.</small></div>`;
 $('#ca_label').focus();
}
function customerApplyAddress() {
 const draft=CUSTOMER_FORM,data=Object.fromEntries(['label','line1','line2','city','state','postalCode','country'].map(k=>[k,$('#ca_'+k).value.trim()]));
 const missing=['label','line1','country'].find(k=>!data[k]);
 if(missing){$('#ca_error').hidden=false;$('#ca_error').textContent='Address label, address line 1 and country are required.';$('#ca_'+missing).setAttribute('aria-invalid','true');$('#ca_'+missing).focus();return false;}
 data.isDefault=$('#ca_isDefault').checked;data.archived=false;data.id=draft.editing||'A'+uid();data.customerId=draft.id;
 if(data.isDefault)draft.addresses.forEach(a=>{a.isDefault=false;});
 const index=draft.addresses.findIndex(a=>a.id===data.id);if(index<0)draft.addresses.push(data);else draft.addresses[index]=data;
 draft.selected=data.id;draft.editing=null;customerRenderAddresses();return true;
}
function customerDefaultAddress(){const draft=CUSTOMER_FORM;draft.addresses.forEach(a=>{a.isDefault=a.id===draft.selected&&!a.archived;});customerRenderAddresses();}
function customerArchiveAddress(){const draft=CUSTOMER_FORM,a=draft.addresses.find(a=>a.id===draft.selected);if(!a)return;a.archived=true;a.isDefault=false;draft.selected=draft.addresses.find(a=>a.isDefault&&!a.archived)?.id||'';draft.editing=null;customerRenderAddresses();}
function customerRestoreAddress(id){const draft=CUSTOMER_FORM,a=draft.addresses.find(a=>a.id===id);if(a){a.archived=false;draft.selected=id;customerRenderAddresses();}}
function customerDefaultDeliveryId(c){return c.deliveryAddressId===undefined?(c.deliveryAddresses||[]).find(a=>a.isDefault&&!a.archived)?.id||'':c.deliveryAddressId||'';}
function customerResetQuotationDelivery(){if(!Q)return;Q.deliveryAddressId=customerDefaultDeliveryId(cust(Q.cid));delete Q.deliveryAddressSnapshot;}
function customerQuotationSelectedDelivery(){const c=cust(Q.cid),id=Q.deliveryAddressId===undefined?(Q.id?'':c.deliveryAddressId):Q.deliveryAddressId;return Q.deliveryAddressSnapshot?.id===id?Q.deliveryAddressSnapshot:(c.deliveryAddresses||[]).find(a=>a.id===id&&!a.archived)||null;}
function customerQuotationDeliveryHTML(){
 const c=cust(Q.cid),addresses=(c.deliveryAddresses||[]).filter(a=>!a.archived),saved=Q.deliveryAddressSnapshot;
 if(saved&&Q.deliveryAddressId&&!addresses.some(a=>a.id===Q.deliveryAddressId))addresses.unshift({...saved,id:Q.deliveryAddressId,label:saved.label+' (Saved quotation)'});
 if(!addresses.length)return can('customer.edit')?'<button type="button" class="editor-text-button" onclick="custForm(Q.cid,1)">Manage customer delivery addresses</button>':'';
 const selected=Q.deliveryAddressId===undefined?(Q.id?'':customerDefaultDeliveryId(c)):Q.deliveryAddressId;
 const address=saved&&selected===saved.id?saved:addresses.find(a=>a.id===selected);
 return `<div class="customer-quotation-delivery"><label class="f"><span>Delivery address</span><select aria-label="Quotation delivery address" onchange="Q.deliveryAddressId=this.value;delete Q.deliveryAddressSnapshot;$('#ci').innerHTML=editorCustomerInfo();editorChanged()">${selectOptions(addresses.map(a=>[a.id,a.label+(a.isDefault?' (Default)':'')]),selected,'No delivery address')}</select></label>${address?`<p class="mu">${esc(customerAddressText(address))}</p>`:''}${can('customer.edit')?'<button type="button" class="editor-text-button" onclick="custForm(Q.cid,1)">Manage delivery addresses</button>':''}</div>`;
}
document.addEventListener('keydown',event=>{
 if(document.querySelector('#df-editor[open]'))return;
 const form=$('#customer-form');if(!form||$('#modal').style.display==='none')return;
 if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();closeM();return;}
 if(event.key!=='Tab')return;
 const focusable=[...$('#modal .box').querySelectorAll('button,input,select,textarea,[tabindex]')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getAttribute('aria-hidden')!=='true'&&el.getClientRects().length);
 const first=focusable[0],last=focusable.at(-1);if(!first)return;
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
