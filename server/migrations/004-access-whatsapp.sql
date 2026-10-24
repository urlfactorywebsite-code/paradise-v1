ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions_json TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS owner_id TEXT;
-- Legacy owners are resolved only when a unique account name identifies them.
UPDATE quotations q SET owner_id=(SELECT min(u.id) FROM users u WHERE u.name=q.body::jsonb->>'by' HAVING count(*)=1)
 WHERE owner_id IS NULL;
UPDATE quotations SET owner_id=body::jsonb->>'createdBy' WHERE body::jsonb ? 'createdBy';
UPDATE quotations SET body=(body::jsonb || jsonb_build_object('createdBy',owner_id))::text WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quotations_owner_date ON quotations(owner_id,date);
CREATE TABLE IF NOT EXISTS whatsapp_message_logs (
 id TEXT PRIMARY KEY,
 quotation_id TEXT NOT NULL REFERENCES quotations(id),
 quotation_number TEXT NOT NULL,
 quotation_version INTEGER NOT NULL,
 customer_id TEXT NOT NULL,
 customer_name TEXT NOT NULL,
 destination TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 actor_name TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Prepared','Manually Confirmed','Failed')),
 mode TEXT NOT NULL DEFAULT 'manual',
 message TEXT NOT NULL,
 pdf BYTEA NOT NULL,
 pdf_sha256 TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '',
 retry_of TEXT REFERENCES whatsapp_message_logs(id)
);
CREATE INDEX IF NOT EXISTS whatsapp_quotation_time ON whatsapp_message_logs(quotation_id,created_at);
CREATE INDEX IF NOT EXISTS whatsapp_actor_time ON whatsapp_message_logs(actor_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_retry_once ON whatsapp_message_logs(retry_of) WHERE retry_of IS NOT NULL;
CREATE TABLE IF NOT EXISTS whatsapp_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
