'use strict';
const crypto = require('node:crypto');
const {requirePermission} = require('./access');
const {fail,id} = require('./validation');
const {integer} = require('./queries');
function createCustomerApi({store,body,json}) {
  const categoryApi=require('./customer-categories').createCustomerCategories({store,body,json});
  return async function customerApi(req,res,url,user) {
    if(await categoryApi(req,res,url,user))return true;
    const route=url.pathname;
    const match=/^\/api\/customers\/([^/]+)\/delivery-addresses(?:\/([^/]+))?$/.exec(route);
    if (!match) return false;
    requirePermission(user,req.method==='GET'?'customer.view':'customer.edit');
    const decode=value=>{try{return decodeURIComponent(value);}catch{fail('Invalid record ID.');}};
    const customerId=id(decode(match[1])),addressId=match[2]?id(decode(match[2])):null;
    if (req.method==='GET') {
      const customer=await store.get('customers',customerId),addresses=customer.data.deliveryAddresses||[];
      if (addressId) {
        const address=addresses.find(a=>a.id===addressId);
        if (!address) fail('Delivery address not found.',404);
        json(res,200,{data:address,version:customer.version});return true;
      }
      if (url.searchParams.has('includeArchived')&&!['true','false'].includes(url.searchParams.get('includeArchived'))) fail('Invalid includeArchived filter.');
      const rows=addresses.filter(a=>!a.archived||url.searchParams.get('includeArchived')==='true'),page=integer(url.searchParams.get('page'),1,1000000),pageSize=integer(url.searchParams.get('pageSize'),25,100);
      json(res,200,{data:rows.slice((page-1)*pageSize,page*pageSize),version:customer.version,pagination:{page,pageSize,total:rows.length,totalPages:Math.ceil(rows.length/pageSize)}});return true;
    }
    if (!(req.method==='POST'&&!addressId || req.method==='PATCH'&&addressId)) fail('Use PATCH to edit or archive delivery addresses.',405);
    const input=await body(req),data=input.data||input;
    if (!data||typeof data!=='object'||Array.isArray(data)) fail('Invalid delivery address.');
    const savedId=addressId||data.id||crypto.randomUUID();id(savedId);
    if (data.id!==undefined&&data.id!==savedId) fail('Delivery address ID does not match.');
    if (data.customerId!==undefined&&data.customerId!==customerId) fail('Delivery address not found.',404);
    const result=await store.mutate(user,async state=>{
      await store.expectVersion('customers',customerId,input.version,user);
      const customer=state.customers.find(c=>c.id===customerId),addresses=customer.deliveryAddresses||=[];
      const index=addresses.findIndex(a=>a.id===savedId);
      if (req.method==='POST'&&index>=0) fail('Delivery address already exists.',409);
      if (req.method==='PATCH'&&index<0) fail('Delivery address not found.',404);
      const next={...(index>=0?addresses[index]:{}),...data,id:savedId,customerId};
      delete next.version;
      if (next.archived===true) next.isDefault=false;
      if (next.isDefault===true) addresses.forEach(a=>{a.isDefault=false;});
      if (index<0) addresses.push(next);else addresses[index]=next;
      if (next.archived&&customer.deliveryAddressId===savedId) customer.deliveryAddressId=addresses.find(a=>a.isDefault&&!a.archived)?.id||null;
    });
    const saved=await store.get('customers',customerId);
    json(res,req.method==='POST'?201:200,{data:saved.data.deliveryAddresses.find(a=>a.id===savedId),version:saved.version,revision:result.revision});return true;
  };
}
module.exports={createCustomerApi};
