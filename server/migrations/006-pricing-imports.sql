-- Import metadata and a private cross-instance preview signing key. No business
-- product, quotation, customer, rate or activation document is rewritten.
ALTER TABLE workspace ADD COLUMN IF NOT EXISTS pricing_import_key TEXT;
CREATE TABLE IF NOT EXISTS pricing_imports (
 id TEXT PRIMARY KEY,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL,
 file_name TEXT NOT NULL,
 file_hash TEXT NOT NULL,
 summary TEXT NOT NULL,
 changes TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pricing_imports_created ON pricing_imports(created_at DESC,id);
