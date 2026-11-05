-- Rebuildable reporting projection; quotation bodies, values and versions stay
-- untouched. The shared engine populates amounts within this migration's tx.
CREATE TABLE quotation_item_analytics (
 quotation_id TEXT NOT NULL,
 item_id TEXT NOT NULL,
 category_id TEXT,
 category_name TEXT,
 category_basis TEXT NOT NULL CHECK(category_basis IN ('saved','migration-current','unknown')),
 net_value BIGINT NOT NULL CHECK(net_value>=0),
 PRIMARY KEY(quotation_id,item_id),
 FOREIGN KEY(quotation_id,item_id) REFERENCES quotation_items(quotation_id,id) ON DELETE CASCADE
);
-- Product/category predicates precede joins to the scoped quotation date set.
CREATE INDEX quotation_items_product_quotation ON quotation_items(product_id,quotation_id);
CREATE INDEX quotation_item_analytics_category ON quotation_item_analytics(category_id,quotation_id);
