-- Extend the existing reference table without changing customer/quotation data.
ALTER TABLE customer_categories ADD COLUMN slug TEXT;
ALTER TABLE customer_categories ADD COLUMN discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(discount_percentage BETWEEN 0 AND 100);
ALTER TABLE customer_categories ADD COLUMN highlight_message TEXT NOT NULL DEFAULT '' CHECK(char_length(highlight_message)<=4000);
ALTER TABLE customer_categories ADD COLUMN highlight_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE customer_categories ADD COLUMN created_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
ALTER TABLE customer_categories ADD COLUMN updated_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
ALTER TABLE customer_categories ADD COLUMN archived_at TEXT;
ALTER TABLE customer_categories ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>0);
UPDATE customer_categories SET slug=CASE WHEN is_other THEN 'other' ELSE replace(regexp_replace(lower(id),'^cc_',''),'_','-') END;
ALTER TABLE customer_categories ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX customer_categories_slug ON customer_categories(slug);
CREATE INDEX customer_categories_status ON customer_categories(active,archived_at,display_order,id);
CREATE TABLE customer_category_logos (
 id TEXT PRIMARY KEY,
 category_id TEXT NOT NULL REFERENCES customer_categories(id),
 mime_type TEXT NOT NULL CHECK(mime_type='image/png'),
 content BYTEA NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 2097152),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 512),
 height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 512),
 created_at TEXT NOT NULL,
 UNIQUE(category_id,id)
);
ALTER TABLE customer_categories ADD COLUMN logo_storage_key TEXT;
ALTER TABLE customer_categories ADD CONSTRAINT customer_categories_logo_owner
 FOREIGN KEY(id,logo_storage_key) REFERENCES customer_category_logos(category_id,id) DEFERRABLE INITIALLY DEFERRED;
-- Stable IDs and conflict handling make the initial reference seeds repeatable;
-- never overwrite an administrator's name, discount, message or archive state.
INSERT INTO customer_categories(id,name,slug,is_other,display_order) VALUES
 ('cc_bni','BNI','bni',FALSE,1),('cc_yes','YES','yes',FALSE,2),('cc_jci','JCI','jci',FALSE,3),
 ('cc_jcom','JCOM','jcom',FALSE,4),('cc_rotary','Rotary','rotary',FALSE,5),
 ('cc_rmb','RMB','rmb',FALSE,6),('cc_icon_circle','Icon Circle','icon-circle',FALSE,7)
ON CONFLICT(id) DO NOTHING;
-- The existing Other FK sentinel remains available only as customer free text.
