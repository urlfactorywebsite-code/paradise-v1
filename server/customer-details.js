'use strict';
const crypto = require('node:crypto');
const { isDeepStrictEqual: equal } = require('node:util');
const fail = (message, status = 422) => { throw Object.assign(new Error(message), {status}); };
const own = (o,k) => Object.hasOwn(o,k);
function text(value, label, max = 200, required = false) {
  if (value == null) value = '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail('Invalid '+label+'.');
  value = value.trim();
  if (required && !value) fail(label+' is required.');
  return value;
}
function phone(value) {
  const raw = text(value,'contact person number',40);
  if (!raw) return null;
  if (!/^[+0-9 ()-]+$/.test(raw)) fail('Enter a valid contact person number.');
  const number = raw.replace(/[ ()-]/g,'');
  if (!/^(?:\+[1-9]\d{7,14}|\d{8,15})$/.test(number)) fail('Enter 8–15 digits, optionally starting with + and a country code.');
  return number;
}
function normalizeDetails(input, old, categories, owners) {
  const result = {};
  if (own(input,'categoryId') || own(old||{},'categoryId')) {
    const categoryId = input.categoryId === undefined ? old?.categoryId : input.categoryId;
    if (categoryId != null && typeof categoryId !== 'string') fail('Invalid customer category ID.');
    const category = categories.find(c=>c.id===categoryId);
    if (categoryId && (!category || !category.active && old?.categoryId!==categoryId)) fail('Select an available customer category.');
    result.categoryId = categoryId || null;
    const custom = input.customCategoryName === undefined ? old?.customCategoryName : input.customCategoryName;
    result.customCategoryName = category?.isOther ? text(custom,'custom category description',200,true) : null;
  } else if (input.customCategoryName) fail('Select Other before entering a custom category.');
  if (own(input,'contactPersonPhone') || own(old||{},'contactPersonPhone'))
    result.contactPersonPhone = phone(input.contactPersonPhone === undefined ? old?.contactPersonPhone : input.contactPersonPhone);
  const previous = old?.deliveryAddresses || [];
  if (own(input,'deliveryAddresses') || previous.length) {
    const addresses = input.deliveryAddresses === undefined ? previous : input.deliveryAddresses;
    if (!Array.isArray(addresses) || addresses.length>100) fail('Use at most 100 delivery addresses per customer.');
    const seen = new Set();
    result.deliveryAddresses = addresses.map(a=>{
      if (!a || typeof a!=='object' || Array.isArray(a)) fail('Invalid delivery address.');
      const id = a.id === undefined ? crypto.randomUUID() : a.id;
      if (typeof id!=='string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) fail('Invalid delivery address ID.');
      if (seen.has(id)) fail('Duplicate delivery address IDs.');
      seen.add(id);
      if (owners.has(id) && owners.get(id)!==input.id || a.customerId!==undefined && a.customerId!==input.id) fail('Delivery address not found.',404);
      if (a.archived!==undefined && typeof a.archived!=='boolean' || a.isDefault!==undefined && typeof a.isDefault!=='boolean') fail('Invalid delivery address flag.');
      const address = {id,customerId:input.id,label:text(a.label,'address label',100,true),line1:text(a.line1,'address line 1',500,true),line2:text(a.line2,'address line 2',500),city:text(a.city,'city'),state:text(a.state,'state'),postalCode:text(a.postalCode,'postal code',30),country:text(a.country,'country',100,true),isDefault:a.isDefault??false,archived:a.archived??false};
      if (address.archived && address.isDefault) fail('An archived address cannot be the default.');
      return address;
    });
    // Older clients may omit addresses; addresses are archived, never deleted by omission.
    for (const address of previous) if (!seen.has(address.id)) result.deliveryAddresses.push(structuredClone(address));
    if (result.deliveryAddresses.length>100) fail('Use at most 100 delivery addresses per customer.');
    if (result.deliveryAddresses.filter(a=>a.isDefault&&!a.archived).length>1) fail('Select only one default delivery address.');
  }
  const addresses = result.deliveryAddresses || [];
  if (own(input,'deliveryAddressId') || own(old||{},'deliveryAddressId') || addresses.length) {
    const selected = input.deliveryAddressId === undefined ? (own(old||{},'deliveryAddressId') ? old.deliveryAddressId : addresses.find(a=>a.isDefault&&!a.archived)?.id ?? null) : input.deliveryAddressId;
    if (selected != null && typeof selected !== 'string') fail('Invalid delivery address ID.');
    if (selected && !addresses.some(a=>a.id===selected&&!a.archived)) fail('Select an active delivery address belonging to this customer.');
    result.deliveryAddressId = selected || null;
  }
  return result;
}
const addressColumns = 'id,customer_id AS "customerId",label,line1,line2,city,state,postal_code AS "postalCode",country,is_default AS "isDefault",archived';
async function categories(db) {
  return db.prepare('SELECT id,name,is_other AS "isOther",active,display_order AS "order",slug,discount_percentage::text AS "discountPercentage",highlight_message AS "highlightMessage",highlight_enabled AS "highlightEnabled",logo_storage_key AS "logoStorageKey",archived_at AS "archivedAt",version FROM customer_categories ORDER BY display_order,id').all();
}
async function hydrate(db, customers) {
  if (!customers.length) return;
  const ids=customers.map(c=>c.id),placeholders=ids.map(()=>'?').join(',');
  const metadata=await db.prepare(`SELECT id,category_id,custom_category_name,contact_person_phone FROM customers WHERE id IN (${placeholders})`).all(...ids);
  const addresses=await db.prepare(`SELECT ${addressColumns} FROM customer_delivery_addresses WHERE customer_id IN (${placeholders}) ORDER BY created_at,id`).all(...ids);
  const byId=new Map(customers.map(c=>[c.id,c]));
  for (const row of metadata) {
    const c=byId.get(row.id);
    for (const [key,column] of [['categoryId','category_id'],['customCategoryName','custom_category_name'],['contactPersonPhone','contact_person_phone']])
      if (row[column]!==null || own(c,key)) c[key]=row[column];
  }
  for (const c of customers) {
    const rows=addresses.filter(a=>a.customerId===c.id);
    if (rows.length || own(c,'deliveryAddresses')) c.deliveryAddresses=rows;
  }
}
async function writeAddresses(db, customer, old) {
  const addresses=customer.deliveryAddresses||[],previous=new Map((old?.deliveryAddresses||[]).map(a=>[a.id,a]));
  if (equal(addresses,old?.deliveryAddresses||[])) return;
  // Clear the old default first to permit an atomic default switch.
  await db.prepare('UPDATE customer_delivery_addresses SET is_default=FALSE WHERE customer_id=? AND is_default').run(customer.id);
  const now=new Date().toISOString();
  for (const a of addresses) {
    if (equal(a,previous.get(a.id)) && !a.isDefault) continue;
    await db.prepare(`INSERT INTO customer_delivery_addresses(id,customer_id,label,line1,line2,city,state,postal_code,country,is_default,archived,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,line1=excluded.line1,line2=excluded.line2,city=excluded.city,state=excluded.state,postal_code=excluded.postal_code,country=excluded.country,is_default=excluded.is_default,archived=excluded.archived,updated_at=excluded.updated_at WHERE customer_delivery_addresses.customer_id=excluded.customer_id`).run(a.id,customer.id,a.label,a.line1,a.line2,a.city,a.state,a.postalCode,a.country,a.isDefault,a.archived,now,now);
  }
}
module.exports = {normalizeDetails,phone,categories,hydrate,writeAddresses};
