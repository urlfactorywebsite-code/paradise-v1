'use strict';
const categoryDraftCustomers=new WeakMap();
let categoryPreviewRequest=0,categoryPreviewTimer=null,categoryPreviewStatus='idle',categoryPreviewMessage='';
function categoryPrepareDraft(){
 if(!Q)return;
 const previous=categoryDraftCustomers.get(Q);
 if(previous===Q.cid)return;
 categoryDraftCustomers.set(Q,Q.cid);
 const saved=Q.id?getQ(Q.id):null;
 if(previous!==undefined)delete Q.contact;
 if(saved?.cid===Q.cid){
  if(previous!==undefined){for(const key of ['disc','categorySnapshot','discountSource','categoryDiscountAmount','calculationVersion','contact']){if(Object.hasOwn(saved,key))Q[key]=clone(saved[key]);else delete Q[key];}delete Q._applyCategoryDiscount;}
  return;
 }
 if(Q.discountSource==='category'){Q.disc={t:'p',v:0};delete Q.discountSource;}
 delete Q.discountSource;
 delete Q._applyCategoryDiscount;
 const resolved=CustomerCategories.resolve(Q,null,cust(Q.cid),S.customerCategories||[]);
 Q.categorySnapshot=resolved.categorySnapshot;Q.disc=resolved.disc;
 if(resolved.discountSource===undefined)delete Q.discountSource;else Q.discountSource=resolved.discountSource;
}
function categoryDiscountContext(){
 const el=$('#category-discount-context');if(!el||!Q)return;
 const category=categorySnapshotForDraft(Q),label=CustomerCategories.discountLabel({...Q,categorySnapshot:category});
 const current=CustomerCategories.snapshot(cust(Q.cid),S.customerCategories||[]),canApply=typeof current?.discountPercentage==='string'&&(!Q.id||getQ(Q.id)?.status==='Draft')&&editorCanSave();
 el.innerHTML=`${label?`<p><b>${esc(label)}</b><br><small>This replaces other quotation discounts. Delivery and other quotation charges are excluded.</small></p>`:Q.cid?`<p class="mu">${category?esc(category.name)+' · ':''}Manual quotation discount${category?.discountPercentage!=null?' (category default '+esc(category.discountPercentage)+'%)':''}.</p>`:''}${canApply?'<button type="button" class="b2 s" onclick="categoryApplyCurrentDiscount()">Apply current category settings</button><small class="mu"> Replaces the discount and category message for this draft.</small>':''}<p id="category-calculation-status" class="${categoryPreviewStatus==='error'?'customer-error':'mu'}" role="status" aria-live="polite">${esc(categoryPreviewMessage)}</p>`;
}
function categoryApplyCurrentDiscount(){
 if(!Q||!editorCanSave()||Q.id&&getQ(Q.id)?.status!=='Draft')return;
 Q._applyCategoryDiscount=true;Q.discountSource='category';
 const resolved=CustomerCategories.resolve(Q,Q.id?getQ(Q.id):null,cust(Q.cid),S.customerCategories||[]);
 Q.categorySnapshot=resolved.categorySnapshot;Q.disc=resolved.disc;
 categorySyncDiscountControls();editorChanged();
}
function categorySyncDiscountControls(){const type=document.querySelector('select[aria-label="Discount type"]');if(type&&type.value!==Q.disc.t){type.value=Q.disc.t;type.dispatchEvent(new Event('input',{bubbles:true}));}if($('#editor-discount'))$('#editor-discount').value=Q.disc.v;}
const categoryOriginalSelect=editorSelectCustomer;
editorSelectCustomer=function(id){if(Q&&Q.cid!==id){Q.cid=id;categoryPrepareDraft();}categoryOriginalSelect(id);categorySyncDiscountControls();};
const categoryOriginalDiscount=editorDiscount;
editorDiscount=function(key,value){Q.discountSource='manual';delete Q._applyCategoryDiscount;categoryOriginalDiscount(key,value);};
const categoryOriginalChanged=editorChanged;
editorChanged=function(recalculate=true){categoryOriginalChanged(recalculate);if(!$('#quotation-editor')||!Q)return;categoryDiscountContext();categoryQueuePreview();};
const categoryOriginalView=V.new;
V.new=function(){if(!Q)Q=newQ();categoryPrepareDraft();const html=categoryOriginalView();queueMicrotask(()=>{if($('#quotation-editor')){categoryDiscountContext();categoryQueuePreview();}});return html;};
function categoryQueuePreview(){
 clearTimeout(categoryPreviewTimer);const request=++categoryPreviewRequest;
 if(!Q?.cid){categoryPreviewStatus='idle';categoryPreviewMessage='';categoryDiscountContext();return;}
 categoryPreviewStatus='pending';categoryPreviewMessage='Checking totals with the server…';categoryDiscountContext();
 const draft=Q,userId=AUTH?.id;
 categoryPreviewTimer=setTimeout(async()=>{
  try{
   const result=await api('/api/quotations/preview',{method:'POST',body:JSON.stringify(draft)});
   if(request!==categoryPreviewRequest||Q!==draft||AUTH?.id!==userId||!$('#quotation-editor'))return;
   const checked=result.quotation;
   for(const key of ['disc','categorySnapshot','discountSource','categoryDiscountAmount','calculationVersion']){if(key==='categorySnapshot'&&draft.id&&getQ(draft.id)?.cid===draft.cid&&!draft._applyCategoryDiscount)continue;if(Object.hasOwn(checked,key))draft[key]=clone(checked[key]);else delete draft[key];}
   let itemPricesChanged=false;
   for(const item of draft.items){const validated=checked.items.find(row=>row.id===item.id);if(!validated)continue;
    if(['sub','base','qty','tax','taxMode'].some(key=>item[key]!==validated[key])){
     for(const key of ['name','code','unit','qty','sub','base','tax','taxMode','sp'])if(Object.hasOwn(validated,key))item[key]=clone(validated[key]);
     item.L=[['Product base amount',item.base],...(item.sub!==item.base?[['Options and item-level charges',item.sub-item.base]]:[])];itemPricesChanged=true;
    }
   }
   for(const key of ['chargeTax','chargeTaxMode','taxDisplay'])if(Object.hasOwn(checked,key))draft[key]=checked[key];
   if(itemPricesChanged)$('#its').innerHTML=editorItemsHTML();
   categoryPreviewStatus='confirmed';categoryPreviewMessage='Totals checked by the server.';
   categorySyncDiscountControls();
   categoryOriginalChanged();categoryDiscountContext();
  }catch(error){if(request!==categoryPreviewRequest||Q!==draft||AUTH?.id!==userId||!$('#quotation-editor'))return;categoryPreviewStatus='error';categoryPreviewMessage=error.message;categoryDiscountContext();}
 },250);
}
function categorySuspendPreview(){clearTimeout(categoryPreviewTimer);categoryPreviewRequest++;}
