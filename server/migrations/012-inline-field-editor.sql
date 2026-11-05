-- Additive field-type support. Business values use the existing transactionally
-- saved customer/quotation JSON bodies; no existing record is rewritten.
ALTER TABLE configurable_fields DROP CONSTRAINT configurable_fields_field_type_check;
ALTER TABLE configurable_fields ADD CONSTRAINT configurable_fields_field_type_check
 CHECK(field_type IN ('dropdown','text','number','multi_select','date','checkbox','textarea','system'));
