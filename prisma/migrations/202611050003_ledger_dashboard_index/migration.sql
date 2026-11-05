-- One concurrent index per migration: PostgreSQL requires a single statement outside a transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "StockLedger_workspaceId_createdAt_idx" ON "StockLedger"("workspaceId", "createdAt");
