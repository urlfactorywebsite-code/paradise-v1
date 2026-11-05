-- Additive, rebuildable GST-inclusive reporting amount. The migration runner
-- backfills this column with the canonical engine before making it NOT NULL.
-- Existing net values, category snapshots and quotation records are retained.
ALTER TABLE quotation_item_analytics ADD COLUMN gross_value BIGINT CHECK(gross_value>=0);
