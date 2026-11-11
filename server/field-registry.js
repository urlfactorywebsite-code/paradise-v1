'use strict';
// This is an explicit integration boundary, not an alternate pricing/workflow engine.
const DP = require('../shared/domain');
const CONTROL_REGISTRY=require('../shared/field-controls');
const PAGES = Object.freeze({
  customers: ['customer.view', 'customer.create', 'customer.edit'],
  quotations: ['quotation.create', 'quotation.view_own', 'quotation.view_all'],
  products: ['product.view', 'product.manage', 'pricing.manage'],
  pricing: ['pricing.view', 'pricing.manage'],
  reports: ['reports.view_own', 'reports.view_all'],
  settings: ['settings.manage'], users: ['users.manage'],
  dashboard:['quotation.view_own','quotation.view_all'],quotation_list:['quotation.view_own','quotation.view_all'],product_categories:['product.manage'],catalog:['product.manage','pricing.manage'],whatsapp:['quotation.share_whatsapp'],customer_categories:['customer_categories.view','customer_categories.manage'],
});
const entries = [
  ['quotations', 'status', 'Quotation status', 'protected', DP.ST],
  ['quotations', 'payment_status', 'Payment status', 'protected'],
  ['quotations', 'workflow', 'Approval workflow', 'protected'],
  ['quotations', 'customer', 'Customer', 'protected'],
  ['quotations', 'delivery_address', 'Delivery address', 'protected'],
  ['quotations', 'product', 'Product', 'protected'],
  ['quotations', 'discount_source', 'Discount source', 'protected'],
  ['quotations', 'discount_type', 'Discount type', 'protected', ['p', 'f']],
  ['quotations', 'tax_display', 'Tax display', 'protected'],
  ['quotations', 'calculation_policy', 'Calculation policy', 'protected'],
  ['quotations', 'tax_classification', 'Tax classification', 'protected', DP.TAX_MODES],
  ['customers', 'category', 'Customer category', 'protected'],
  ['customers', 'status', 'Customer status', 'protected'],
  ['customers', 'name', 'Customer name', 'label_only'],
  ['customers', 'type', 'Customer type', 'label_only'],
  ['products', 'category', 'Product category', 'protected'],
  ['products', 'pricing_method', 'Pricing method', 'protected', DP.METHODS],
  ['products', 'pricing_fields', 'Product specification fields', 'protected'],
  ['products', 'catalog_template', 'Catalog template', 'protected'],
  ['products', 'option_charges', 'Priced options and compatibility', 'protected'],
  ['products', 'tax_classification', 'Tax classification', 'protected', DP.TAX_MODES],
  ['pricing', 'tax_classification', 'Tax classification', 'protected', DP.TAX_MODES],
  ['pricing', 'approval', 'Pricing approval', 'protected'],
  ['users', 'role', 'System role', 'protected', ['Administrator', 'Employee']],
  ['users', 'permissions', 'User permissions', 'protected'],
  ['reports', 'status', 'Quotation status', 'protected', DP.ST],
  ['reports', 'employee', 'Employee', 'protected'],
  ['reports', 'customer', 'Customer', 'protected'],
  ['reports', 'product', 'Product', 'protected'],
  ['reports', 'category', 'Product category', 'protected'],
  ['reports', 'metric', 'Analytics metric', 'protected'],
  ['reports', 'chart_mode', 'Chart mode', 'protected'],
].map(([pageKey, fieldKey, label, policy, canonicalValues]) => Object.freeze({
  id: 'system_' + pageKey + '_' + fieldKey, pageKey, fieldKey, label, policy,
  fieldType: policy === 'label_only' ? 'text' : 'system',
  ...(canonicalValues ? { canonicalValues } : {}),
}));
const REGISTRY = Object.freeze([...entries,...CONTROL_REGISTRY.controls.filter(control=>!entries.some(field=>field.id===control.id)).map(control=>Object.freeze({...control,fieldType:control.policy==='protected'?'system':'text'}))]);
async function seed(db) {
  let inserted=0;
  for (const field of REGISTRY) inserted+=(await db.prepare(`INSERT INTO configurable_fields
    (id,page_key,field_key,label,field_type,policy,scope_type,scope_id,configuration)
    VALUES(?,?,?,?,?,?,'page',?,?::jsonb) ON CONFLICT DO NOTHING`)
    .run(field.id, field.pageKey, field.fieldKey, field.label, field.fieldType, field.policy, field.pageKey,JSON.stringify(field.stepper?{cycleMax:field.stepper.cycleMax}:{}))).changes;
  if(inserted)await db.exec('UPDATE field_configuration_state SET revision=revision+1 WHERE id=1');
  return inserted;
}
module.exports = { PAGES, REGISTRY, seed };
