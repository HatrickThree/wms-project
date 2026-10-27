-- Backfills legacy records without changing their IDs, quantities, serials, or movement history.
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;
-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeWorkspaceId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserSession_activeWorkspaceId_fkey" FOREIGN KEY ("activeWorkspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "Workspace" ("id","code","name","type") VALUES ('business-main','BUSINESS-MAIN','พื้นที่ธุรกิจหลัก','BUSINESS');

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("workspaceId", "userId"),
    CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "username" TEXT NOT NULL PRIMARY KEY,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables


CREATE TABLE "new_Warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Warehouse_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Warehouse" ("workspaceId", "code", "createdAt", "id", "name") SELECT 'business-main', "code", "createdAt", "id", "name" FROM "Warehouse";
DROP TABLE "Warehouse";
ALTER TABLE "new_Warehouse" RENAME TO "Warehouse";
CREATE UNIQUE INDEX "Warehouse_workspaceId_code_key" ON "Warehouse"("workspaceId", "code");
CREATE TABLE "new_Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "aisle" TEXT NOT NULL,
    "rack" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STORAGE',
    CONSTRAINT "Location_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Location_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Location" ("workspaceId", "aisle", "barcode", "id", "level", "rack", "type", "warehouseId", "zone") SELECT 'business-main', "aisle", "barcode", "id", "level", "rack", "type", "warehouseId", "zone" FROM "Location";
DROP TABLE "Location";
ALTER TABLE "new_Location" RENAME TO "Location";
CREATE UNIQUE INDEX "Location_workspaceId_barcode_key" ON "Location"("workspaceId", "barcode");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "baseUom" TEXT NOT NULL DEFAULT 'PCS',
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "trackSerial" BOOLEAN NOT NULL DEFAULT true,
    "trackLot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("workspaceId", "barcode", "baseUom", "category", "createdAt", "id", "minStock", "name", "sku", "trackLot", "trackSerial") SELECT 'business-main', "barcode", "baseUom", "category", "createdAt", "id", "minStock", "name", "sku", "trackLot", "trackSerial" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_workspaceId_sku_key" ON "Product"("workspaceId", "sku");
CREATE UNIQUE INDEX "Product_workspaceId_barcode_key" ON "Product"("workspaceId", "barcode");
CREATE TABLE "new_InventoryBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qtyOnHand" INTEGER NOT NULL DEFAULT 0,
    "qtyAllocated" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryBalance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InventoryBalance" ("workspaceId", "id", "locationId", "productId", "qtyAllocated", "qtyOnHand", "updatedAt") SELECT 'business-main', "id", "locationId", "productId", "qtyAllocated", "qtyOnHand", "updatedAt" FROM "InventoryBalance";
DROP TABLE "InventoryBalance";
ALTER TABLE "new_InventoryBalance" RENAME TO "InventoryBalance";
CREATE UNIQUE INDEX "InventoryBalance_productId_locationId_key" ON "InventoryBalance"("productId", "locationId");
CREATE TABLE "new_SerialItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "lotNumber" TEXT,
    "inboundDocNo" TEXT NOT NULL,
    "outboundDocNo" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shippedAt" DATETIME,
    "warrantyExp" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SerialItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SerialItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SerialItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SerialItem" ("workspaceId", "id", "inboundDocNo", "locationId", "lotNumber", "outboundDocNo", "productId", "receivedAt", "serialNumber", "shippedAt", "status", "updatedAt", "warrantyExp") SELECT 'business-main', "id", "inboundDocNo", "locationId", "lotNumber", "outboundDocNo", "productId", "receivedAt", "serialNumber", "shippedAt", "status", "updatedAt", "warrantyExp" FROM "SerialItem";
DROP TABLE "SerialItem";
ALTER TABLE "new_SerialItem" RENAME TO "SerialItem";
CREATE INDEX "SerialItem_productId_status_idx" ON "SerialItem"("productId", "status");
CREATE INDEX "SerialItem_locationId_idx" ON "SerialItem"("locationId");
CREATE UNIQUE INDEX "SerialItem_workspaceId_serialNumber_key" ON "SerialItem"("workspaceId", "serialNumber");
CREATE TABLE "new_StockLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "serialItemId" TEXT,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "qtyChange" INTEGER NOT NULL,
    "movementType" TEXT NOT NULL,
    "referenceDoc" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockLedger_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockLedger_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockLedger_serialItemId_fkey" FOREIGN KEY ("serialItemId") REFERENCES "SerialItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StockLedger" ("workspaceId", "createdAt", "fromLocationId", "id", "movementType", "note", "performedBy", "productId", "qtyChange", "referenceDoc", "serialItemId", "toLocationId") SELECT 'business-main', "createdAt", "fromLocationId", "id", "movementType", "note", "performedBy", "productId", "qtyChange", "referenceDoc", "serialItemId", "toLocationId" FROM "StockLedger";
DROP TABLE "StockLedger";
ALTER TABLE "new_StockLedger" RENAME TO "StockLedger";
CREATE INDEX "StockLedger_productId_createdAt_idx" ON "StockLedger"("productId", "createdAt");
CREATE INDEX "StockLedger_serialItemId_idx" ON "StockLedger"("serialItemId");
CREATE INDEX "StockLedger_referenceDoc_idx" ON "StockLedger"("referenceDoc");


-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_code_key" ON "Workspace"("code");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

CREATE TRIGGER "Location_workspace_insert" BEFORE INSERT ON "Location" WHEN NOT EXISTS (SELECT 1 FROM "Warehouse" WHERE "id"=NEW."warehouseId" AND "workspaceId"=NEW."workspaceId") BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;

CREATE TRIGGER "Location_workspace_update" BEFORE UPDATE ON "Location" WHEN NOT EXISTS (SELECT 1 FROM "Warehouse" WHERE "id"=NEW."warehouseId" AND "workspaceId"=NEW."workspaceId") BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;

CREATE TRIGGER "InventoryBalance_workspace_insert" BEFORE INSERT ON "InventoryBalance" WHEN NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."locationId" AND "workspaceId"=NEW."workspaceId") BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;

CREATE TRIGGER "InventoryBalance_workspace_update" BEFORE UPDATE ON "InventoryBalance" WHEN NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."locationId" AND "workspaceId"=NEW."workspaceId") BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;

CREATE TRIGGER "SerialItem_workspace_insert" BEFORE INSERT ON "SerialItem" WHEN NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR (NEW."locationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."locationId" AND "workspaceId"=NEW."workspaceId")) BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;

CREATE TRIGGER "SerialItem_workspace_update" BEFORE UPDATE ON "SerialItem" WHEN NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR (NEW."locationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."locationId" AND "workspaceId"=NEW."workspaceId")) BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;

CREATE TRIGGER "StockLedger_workspace_insert" BEFORE INSERT ON "StockLedger" WHEN NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR (NEW."serialItemId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "SerialItem" WHERE "id"=NEW."serialItemId" AND "workspaceId"=NEW."workspaceId")) OR (NEW."fromLocationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."fromLocationId" AND "workspaceId"=NEW."workspaceId")) OR (NEW."toLocationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."toLocationId" AND "workspaceId"=NEW."workspaceId")) BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;

CREATE TRIGGER "StockLedger_workspace_update" BEFORE UPDATE ON "StockLedger" WHEN NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR (NEW."serialItemId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "SerialItem" WHERE "id"=NEW."serialItemId" AND "workspaceId"=NEW."workspaceId")) OR (NEW."fromLocationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."fromLocationId" AND "workspaceId"=NEW."workspaceId")) OR (NEW."toLocationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."toLocationId" AND "workspaceId"=NEW."workspaceId")) BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;

COMMIT;
PRAGMA foreign_keys=ON;
