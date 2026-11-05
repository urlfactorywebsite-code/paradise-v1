-- Add product-owned root fields without rewriting products or quotations.
ALTER TABLE configurable_fields DROP CONSTRAINT configurable_fields_check;
ALTER TABLE configurable_fields ADD CONSTRAINT configurable_fields_scope_shape CHECK (
 (scope_type='global' AND page_key='global' AND scope_id='' AND base_field_id IS NULL)
 OR (scope_type='page' AND page_key<>'global' AND scope_id=page_key)
 OR (scope_type='product' AND page_key<>'global' AND length(scope_id)>0
     AND (base_field_id IS NOT NULL OR page_key='products'))
);
DROP INDEX configurable_fields_root_key;
CREATE UNIQUE INDEX configurable_fields_root_key ON configurable_fields(page_key,field_key)
 WHERE base_field_id IS NULL AND scope_type<>'product';
CREATE UNIQUE INDEX configurable_fields_product_key ON configurable_fields(scope_id,field_key)
 WHERE base_field_id IS NULL AND scope_type='product';
CREATE TABLE product_field_bindings (
 field_id TEXT PRIMARY KEY REFERENCES configurable_fields(id) ON DELETE RESTRICT,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 canonical_key TEXT NOT NULL,
 native_type TEXT NOT NULL,
 option_values JSONB NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(option_values)='object'),
 UNIQUE(product_id,canonical_key)
);
