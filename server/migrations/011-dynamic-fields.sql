-- Additive configuration metadata only. No customer/product/quotation rewrite.
-- A deployment has one company database; ownership is never client-selectable.
CREATE TABLE field_configuration_state (
 id INTEGER PRIMARY KEY CHECK(id=1),
 revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0)
);
INSERT INTO field_configuration_state(id) VALUES(1);
CREATE TABLE configurable_fields (
 id TEXT PRIMARY KEY,
 base_field_id TEXT REFERENCES configurable_fields(id) ON DELETE RESTRICT,
 page_key TEXT NOT NULL,
 field_key TEXT NOT NULL,
 label TEXT NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 150),
 field_type TEXT NOT NULL CHECK(field_type IN ('dropdown','text','system')),
 policy TEXT NOT NULL CHECK(policy IN ('configurable','label_only','protected')),
 scope_type TEXT NOT NULL CHECK(scope_type IN ('global','page','product')),
 scope_id TEXT NOT NULL DEFAULT '',
 product_id TEXT GENERATED ALWAYS AS (CASE WHEN scope_type='product' THEN scope_id END) STORED REFERENCES products(id) ON DELETE RESTRICT,
 is_required BOOLEAN NOT NULL DEFAULT FALSE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 is_visible BOOLEAN NOT NULL DEFAULT TRUE,
 display_order INTEGER NOT NULL DEFAULT 0 CHECK(display_order BETWEEN 0 AND 10000),
 configuration JSONB NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(configuration)='object'),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((scope_type='global' AND page_key='global' AND scope_id='' AND base_field_id IS NULL)
    OR (scope_type='page' AND page_key<>'global' AND scope_id=page_key)
    OR (scope_type='product' AND page_key<>'global' AND length(scope_id)>0 AND base_field_id IS NOT NULL)),
 CHECK(base_field_id IS NULL OR base_field_id<>id)
);
CREATE UNIQUE INDEX configurable_fields_root_key ON configurable_fields(page_key,field_key) WHERE base_field_id IS NULL;
CREATE UNIQUE INDEX configurable_fields_override ON configurable_fields(base_field_id,page_key,scope_type,scope_id) WHERE base_field_id IS NOT NULL;
CREATE INDEX configurable_fields_scope ON configurable_fields(page_key,scope_type,scope_id,display_order,id);
CREATE TABLE configurable_field_options (
 id TEXT PRIMARY KEY,
 field_id TEXT NOT NULL REFERENCES configurable_fields(id) ON DELETE RESTRICT,
 value TEXT NOT NULL CHECK(value ~ '^[a-z][a-z0-9_]{0,63}$' AND value NOT IN ('constructor','prototype','__proto__')),
 label TEXT NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 150),
 display_order INTEGER NOT NULL DEFAULT 0 CHECK(display_order BETWEEN 0 AND 10000),
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 archived_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(field_id,value),
 CHECK(archived_at IS NULL OR NOT is_active)
);
CREATE INDEX configurable_field_options_order ON configurable_field_options(field_id,display_order,id);
CREATE TABLE field_configuration_audit_logs (
 id TEXT PRIMARY KEY,
 actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 field_id TEXT NOT NULL REFERENCES configurable_fields(id) ON DELETE RESTRICT,
 action TEXT NOT NULL,
 before_value JSONB,
 after_value JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX field_configuration_audit_field ON field_configuration_audit_logs(field_id,created_at DESC,id);
-- IDs/keys are immutable even if another internal caller bypasses HTTP validation.
CREATE FUNCTION preserve_field_configuration_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='configurable_fields' THEN
  IF (NEW.id,NEW.base_field_id,NEW.page_key,NEW.field_key,NEW.field_type,NEW.policy,NEW.scope_type,NEW.scope_id)
     IS DISTINCT FROM (OLD.id,OLD.base_field_id,OLD.page_key,OLD.field_key,OLD.field_type,OLD.policy,OLD.scope_type,OLD.scope_id) THEN
   RAISE EXCEPTION 'Field identity is immutable' USING ERRCODE='23514';
  END IF;
 ELSIF (NEW.id,NEW.field_id,NEW.value) IS DISTINCT FROM (OLD.id,OLD.field_id,OLD.value) THEN
  RAISE EXCEPTION 'Option identity is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER configurable_fields_identity BEFORE UPDATE ON configurable_fields FOR EACH ROW EXECUTE FUNCTION preserve_field_configuration_identity();
CREATE TRIGGER configurable_field_options_identity BEFORE UPDATE ON configurable_field_options FOR EACH ROW EXECUTE FUNCTION preserve_field_configuration_identity();
