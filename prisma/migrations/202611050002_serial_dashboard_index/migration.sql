-- One concurrent index per migration: PostgreSQL requires a single statement outside a transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SerialItem_workspaceId_status_productId_idx" ON "SerialItem"("workspaceId", "status", "productId");
