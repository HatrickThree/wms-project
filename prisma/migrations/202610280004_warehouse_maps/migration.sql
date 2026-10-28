BEGIN IMMEDIATE;
CREATE TABLE "WarehouseMap" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "workspaceId" TEXT NOT NULL,
 "warehouseId" TEXT NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
 "graphJson" TEXT NOT NULL,
 "updatedAt" DATETIME NOT NULL,
 "updatedBy" TEXT NOT NULL,
 CONSTRAINT "WarehouseMap_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "WarehouseMap_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WarehouseMap_warehouseId_key" ON "WarehouseMap"("warehouseId");
CREATE TABLE "PickingPlan" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "workspaceId" TEXT NOT NULL,
 "orderId" TEXT NOT NULL,
 "warehouseId" TEXT NOT NULL,
 "mapVersion" INTEGER NOT NULL CHECK ("mapVersion" > 0),
 "snapshotJson" TEXT NOT NULL,
 "resultJson" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdBy" TEXT NOT NULL,
 CONSTRAINT "PickingPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PickingPlan_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StockOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PickingPlan_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PickingPlan_workspaceId_orderId_createdAt_idx" ON "PickingPlan"("workspaceId", "orderId", "createdAt");
CREATE TRIGGER "WarehouseMap_scope_insert" BEFORE INSERT ON "WarehouseMap"
WHEN NOT EXISTS(SELECT 1 FROM "Warehouse" WHERE "id"=NEW."warehouseId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT,'workspace mismatch'); END;
CREATE TRIGGER "WarehouseMap_scope_update" BEFORE UPDATE ON "WarehouseMap"
WHEN NOT EXISTS(SELECT 1 FROM "Warehouse" WHERE "id"=NEW."warehouseId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT,'workspace mismatch'); END;
CREATE TRIGGER "PickingPlan_scope_insert" BEFORE INSERT ON "PickingPlan"
WHEN NOT EXISTS(SELECT 1 FROM "Warehouse" WHERE "id"=NEW."warehouseId" AND "workspaceId"=NEW."workspaceId")
 OR NOT EXISTS(SELECT 1 FROM "StockOrder" WHERE "id"=NEW."orderId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT,'workspace mismatch'); END;
CREATE TRIGGER "PickingPlan_immutable" BEFORE UPDATE ON "PickingPlan"
BEGIN SELECT RAISE(ABORT,'picking plan is immutable'); END;
COMMIT;
