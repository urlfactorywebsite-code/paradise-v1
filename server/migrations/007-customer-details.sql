-- Additive customer metadata. Existing bodies, statuses, billing addresses,
-- versions and quotation relationships are deliberately left untouched.
CREATE TABLE customer_categories (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 is_other BOOLEAN NOT NULL DEFAULT FALSE,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 display_order INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX customer_categories_name ON customer_categories(lower(name));
CREATE UNIQUE INDEX customer_categories_other ON customer_categories(is_other) WHERE is_other;
INSERT INTO customer_categories(id,name,is_other,display_order) VALUES
 ('cc_bni','BNI',FALSE,1),('cc_yes','YES',FALSE,2),('cc_jci','JCI',FALSE,3),
 ('cc_jcom','JCOM',FALSE,4),('cc_rotary','Rotary',FALSE,5),('cc_rmb','RMB',FALSE,6),
 ('cc_icon_circle','Icon Circle',FALSE,7),('cc_other','Other',TRUE,8);
ALTER TABLE customers ADD COLUMN category_id TEXT REFERENCES customer_categories(id);
ALTER TABLE customers ADD COLUMN custom_category_name TEXT;
ALTER TABLE customers ADD COLUMN contact_person_phone TEXT;
CREATE INDEX customers_category ON customers(category_id);
CREATE TABLE customer_delivery_addresses (
 id TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 label TEXT NOT NULL,
 line1 TEXT NOT NULL,
 line2 TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL DEFAULT '',
 postal_code TEXT NOT NULL DEFAULT '',
 country TEXT NOT NULL,
 is_default BOOLEAN NOT NULL DEFAULT FALSE,
 archived BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK (NOT (archived AND is_default))
);
CREATE INDEX customer_delivery_addresses_customer ON customer_delivery_addresses(customer_id,archived,id);
CREATE UNIQUE INDEX customer_delivery_addresses_default ON customer_delivery_addresses(customer_id) WHERE is_default AND NOT archived;
