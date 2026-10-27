-- Reuse existing JSON documents. Historical bodies and prices are not rewritten.
-- NOT VALID preserves legacy records; all new/changed rows are checked.
CREATE OR REPLACE FUNCTION paradise_product_fields_valid(document jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE field jsonb; size jsonb;
BEGIN
 IF jsonb_typeof(document) IS DISTINCT FROM 'object'
    OR jsonb_typeof(document->'f') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 FOR field IN SELECT value FROM jsonb_array_elements(document->'f') LOOP
  IF jsonb_typeof(field) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF (field ? 'show_on_customer_pdf' AND jsonb_typeof(field->'show_on_customer_pdf') IS DISTINCT FROM 'boolean')
     OR (field ? 'internal_only' AND jsonb_typeof(field->'internal_only') IS DISTINCT FROM 'boolean') THEN RETURN false; END IF;
  IF field->>'t' = 'SIZE_BREAKDOWN' THEN
   IF jsonb_typeof(field->'sizes') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
   IF jsonb_array_length(field->'sizes') = 0 THEN RETURN false; END IF;
   FOR size IN SELECT value FROM jsonb_array_elements(field->'sizes') LOOP
    IF jsonb_typeof(size) IS DISTINCT FROM 'object'
       OR jsonb_typeof(size->'key') IS DISTINCT FROM 'string'
       OR jsonb_typeof(size->'label') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    IF size ? 'enabled' AND jsonb_typeof(size->'enabled') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
    IF size ? 'price' THEN
     IF jsonb_typeof(size->'price') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
     IF (size->>'price')::numeric < 0 THEN RETURN false; END IF;
    END IF;
   END LOOP;
  END IF;
 END LOOP;
 RETURN true;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='products'::regclass AND conname='products_configuration_shape') THEN
  ALTER TABLE products ADD CONSTRAINT products_configuration_shape
   CHECK (paradise_product_fields_valid(body::jsonb)) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='quotation_items'::regclass AND conname='quotation_items_configuration_shape') THEN
  ALTER TABLE quotation_items ADD CONSTRAINT quotation_items_configuration_shape CHECK (
   jsonb_typeof(body::jsonb) IS NOT DISTINCT FROM 'object'
   AND jsonb_typeof(body::jsonb->'cfg') IS NOT DISTINCT FROM 'object'
   AND (NOT (body::jsonb ? 'fieldSnapshot') OR jsonb_typeof(body::jsonb->'fieldSnapshot') IS NOT DISTINCT FROM 'array')
  ) NOT VALID;
 END IF;
END $$;
