-- One concurrent index per migration: PostgreSQL requires a single statement outside a transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "InventoryBalance_workspaceId_productId_idx" ON "InventoryBalance"("workspaceId", "productId");
