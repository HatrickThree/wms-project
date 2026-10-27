PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;
DROP TRIGGER IF EXISTS "Location_workspace_insert";
DROP TRIGGER IF EXISTS "Location_workspace_update";
DROP TRIGGER IF EXISTS "InventoryBalance_workspace_insert";
DROP TRIGGER IF EXISTS "InventoryBalance_workspace_update";
DROP TRIGGER IF EXISTS "SerialItem_workspace_insert";
DROP TRIGGER IF EXISTS "SerialItem_workspace_update";
DROP TRIGGER IF EXISTS "StockLedger_workspace_insert";
DROP TRIGGER IF EXISTS "StockLedger_workspace_update";
-- CreateTable
CREATE TABLE "StockLot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "expiresOn" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockLot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockLayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "lotId" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceDoc" TEXT NOT NULL,
    "qtyOnHand" INTEGER NOT NULL DEFAULT 0,
    "qtyAllocated" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "StockLayer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockLayer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockLayer_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockLayer_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockOperation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reservedAt" DATETIME,
    "shippedAt" DATETIME,
    CONSTRAINT "StockOrder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StockOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderLineId" TEXT NOT NULL,
    "stockLayerId" TEXT NOT NULL,
    "serialItemId" TEXT,
    "quantity" INTEGER NOT NULL,
    "pickedAt" DATETIME,
    "pickedBy" TEXT,
    "overrideReason" TEXT,
    "overrideBy" TEXT,
    CONSTRAINT "StockAllocation_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockAllocation_stockLayerId_fkey" FOREIGN KEY ("stockLayerId") REFERENCES "StockLayer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockAllocation_serialItemId_fkey" FOREIGN KEY ("serialItemId") REFERENCES "SerialItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables


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
    "issuePolicy" TEXT NOT NULL DEFAULT 'FIFO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("barcode", "baseUom", "category", "createdAt", "id", "minStock", "name", "sku", "trackLot", "trackSerial", "workspaceId") SELECT "barcode", "baseUom", "category", "createdAt", "id", "minStock", "name", "sku", "trackLot", "trackSerial", "workspaceId" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_workspaceId_sku_key" ON "Product"("workspaceId", "sku");
CREATE UNIQUE INDEX "Product_workspaceId_barcode_key" ON "Product"("workspaceId", "barcode");
CREATE TABLE "new_SerialItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "lotNumber" TEXT,
    "stockLayerId" TEXT,
    "inboundDocNo" TEXT NOT NULL,
    "outboundDocNo" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shippedAt" DATETIME,
    "warrantyExp" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SerialItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SerialItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SerialItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SerialItem_stockLayerId_fkey" FOREIGN KEY ("stockLayerId") REFERENCES "StockLayer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SerialItem" ("id", "inboundDocNo", "locationId", "lotNumber", "outboundDocNo", "productId", "receivedAt", "serialNumber", "shippedAt", "status", "updatedAt", "warrantyExp", "workspaceId") SELECT "id", "inboundDocNo", "locationId", "lotNumber", "outboundDocNo", "productId", "receivedAt", "serialNumber", "shippedAt", "status", "updatedAt", "warrantyExp", "workspaceId" FROM "SerialItem";
DROP TABLE "SerialItem";
ALTER TABLE "new_SerialItem" RENAME TO "SerialItem";
CREATE INDEX "SerialItem_productId_status_idx" ON "SerialItem"("productId", "status");
CREATE INDEX "SerialItem_locationId_idx" ON "SerialItem"("locationId");
CREATE UNIQUE INDEX "SerialItem_workspaceId_serialNumber_key" ON "SerialItem"("workspaceId", "serialNumber");



-- CreateIndex
CREATE INDEX "StockLot_workspaceId_expiresOn_idx" ON "StockLot"("workspaceId", "expiresOn");

-- CreateIndex
CREATE UNIQUE INDEX "StockLot_productId_number_key" ON "StockLot"("productId", "number");

-- CreateIndex
CREATE INDEX "StockLayer_workspaceId_productId_locationId_idx" ON "StockLayer"("workspaceId", "productId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "StockOperation_workspaceId_key_key" ON "StockOperation"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "StockOrder_workspaceId_createdAt_idx" ON "StockOrder"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockOrder_workspaceId_number_key" ON "StockOrder"("workspaceId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_orderId_productId_key" ON "OrderLine"("orderId", "productId");

-- CreateIndex
CREATE INDEX "StockAllocation_orderLineId_idx" ON "StockAllocation"("orderLineId");

-- CreateIndex
CREATE INDEX "StockAllocation_stockLayerId_idx" ON "StockAllocation"("stockLayerId");


-- Preserve legacy lot text; no expiry is inferred from warranty or receipt dates.
INSERT INTO StockLot (id,workspaceId,productId,number) SELECT 'legacy-lot-'||MIN(id),workspaceId,productId,lotNumber FROM SerialItem WHERE lotNumber IS NOT NULL AND lotNumber<>'' GROUP BY workspaceId,productId,lotNumber;
INSERT INTO StockLayer(id,workspaceId,productId,locationId,lotId,receivedAt,referenceDoc,qtyOnHand,qtyAllocated)
SELECT 'legacy-layer-'||s.id,s.workspaceId,s.productId,s.locationId,l.id,s.receivedAt,s.inboundDocNo,1,CASE WHEN s.status='ALLOCATED' THEN 1 ELSE 0 END FROM SerialItem s LEFT JOIN StockLot l ON l.productId=s.productId AND l.number=s.lotNumber WHERE s.locationId IS NOT NULL AND s.status<>'SHIPPED';
UPDATE SerialItem SET stockLayerId='legacy-layer-'||id WHERE locationId IS NOT NULL AND status<>'SHIPPED';
-- Abort atomically if serial evidence exceeds physical balances or allocations disagree.
CREATE TEMP TABLE migration_check(ok INTEGER CHECK(ok=1));
INSERT INTO migration_check SELECT CASE WHEN EXISTS(SELECT 1 FROM InventoryBalance b WHERE b.qtyOnHand<COALESCE((SELECT SUM(qtyOnHand) FROM StockLayer l WHERE l.productId=b.productId AND l.locationId=b.locationId),0) OR b.qtyAllocated<COALESCE((SELECT SUM(qtyAllocated) FROM StockLayer l WHERE l.productId=b.productId AND l.locationId=b.locationId),0) OR b.qtyAllocated>b.qtyOnHand) THEN 0 ELSE 1 END;
INSERT INTO StockLayer(id,workspaceId,productId,locationId,receivedAt,referenceDoc,qtyOnHand,qtyAllocated)
SELECT 'legacy-balance-'||b.id,b.workspaceId,b.productId,b.locationId,b.updatedAt,'LEGACY-BALANCE',b.qtyOnHand-COALESCE((SELECT SUM(qtyOnHand) FROM StockLayer l WHERE l.productId=b.productId AND l.locationId=b.locationId),0),b.qtyAllocated-COALESCE((SELECT SUM(qtyAllocated) FROM StockLayer l WHERE l.productId=b.productId AND l.locationId=b.locationId),0) FROM InventoryBalance b WHERE b.qtyOnHand>COALESCE((SELECT SUM(qtyOnHand) FROM StockLayer l WHERE l.productId=b.productId AND l.locationId=b.locationId),0);
DROP TABLE migration_check;

CREATE TRIGGER "Location_workspace_insert" BEFORE INSERT ON "Location" WHEN NOT EXISTS (SELECT 1 FROM "Warehouse" WHERE "id"=NEW."warehouseId" AND "workspaceId"=NEW."workspaceId") BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;
CREATE TRIGGER "Location_workspace_update" BEFORE UPDATE ON "Location" WHEN NOT EXISTS (SELECT 1 FROM "Warehouse" WHERE "id"=NEW."warehouseId" AND "workspaceId"=NEW."workspaceId") BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;
CREATE TRIGGER "InventoryBalance_workspace_insert" BEFORE INSERT ON "InventoryBalance" WHEN NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."locationId" AND "workspaceId"=NEW."workspaceId") BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;
CREATE TRIGGER "InventoryBalance_workspace_update" BEFORE UPDATE ON "InventoryBalance" WHEN NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."locationId" AND "workspaceId"=NEW."workspaceId") BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;
CREATE TRIGGER "SerialItem_workspace_insert" BEFORE INSERT ON "SerialItem" WHEN NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR (NEW."locationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."locationId" AND "workspaceId"=NEW."workspaceId")) BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;
CREATE TRIGGER "SerialItem_workspace_update" BEFORE UPDATE ON "SerialItem" WHEN NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR (NEW."locationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."locationId" AND "workspaceId"=NEW."workspaceId")) BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;
CREATE TRIGGER "StockLedger_workspace_insert" BEFORE INSERT ON "StockLedger" WHEN NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR (NEW."serialItemId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "SerialItem" WHERE "id"=NEW."serialItemId" AND "workspaceId"=NEW."workspaceId")) OR (NEW."fromLocationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."fromLocationId" AND "workspaceId"=NEW."workspaceId")) OR (NEW."toLocationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."toLocationId" AND "workspaceId"=NEW."workspaceId")) BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;
CREATE TRIGGER "StockLedger_workspace_update" BEFORE UPDATE ON "StockLedger" WHEN NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR (NEW."serialItemId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "SerialItem" WHERE "id"=NEW."serialItemId" AND "workspaceId"=NEW."workspaceId")) OR (NEW."fromLocationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."fromLocationId" AND "workspaceId"=NEW."workspaceId")) OR (NEW."toLocationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."toLocationId" AND "workspaceId"=NEW."workspaceId")) BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;
CREATE TRIGGER "StockLot_guard_insert" BEFORE INSERT ON "StockLot" WHEN NOT EXISTS(SELECT 1 FROM Product p WHERE p.id=NEW.productId AND p.workspaceId=NEW.workspaceId) BEGIN SELECT RAISE(ABORT, 'Invalid stock reference or quantity'); END;
CREATE TRIGGER "StockLot_guard_update" BEFORE UPDATE ON "StockLot" WHEN NOT EXISTS(SELECT 1 FROM Product p WHERE p.id=NEW.productId AND p.workspaceId=NEW.workspaceId) BEGIN SELECT RAISE(ABORT, 'Invalid stock reference or quantity'); END;
CREATE TRIGGER "StockLayer_guard_insert" BEFORE INSERT ON "StockLayer" WHEN NOT EXISTS(SELECT 1 FROM Product p WHERE p.id=NEW.productId AND p.workspaceId=NEW.workspaceId) OR NOT EXISTS(SELECT 1 FROM Location l WHERE l.id=NEW.locationId AND l.workspaceId=NEW.workspaceId) OR (NEW.lotId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM StockLot l WHERE l.id=NEW.lotId AND l.productId=NEW.productId AND l.workspaceId=NEW.workspaceId)) OR NEW.qtyOnHand<0 OR NEW.qtyAllocated<0 OR NEW.qtyAllocated>NEW.qtyOnHand BEGIN SELECT RAISE(ABORT, 'Invalid stock reference or quantity'); END;
CREATE TRIGGER "StockLayer_guard_update" BEFORE UPDATE ON "StockLayer" WHEN NOT EXISTS(SELECT 1 FROM Product p WHERE p.id=NEW.productId AND p.workspaceId=NEW.workspaceId) OR NOT EXISTS(SELECT 1 FROM Location l WHERE l.id=NEW.locationId AND l.workspaceId=NEW.workspaceId) OR (NEW.lotId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM StockLot l WHERE l.id=NEW.lotId AND l.productId=NEW.productId AND l.workspaceId=NEW.workspaceId)) OR NEW.qtyOnHand<0 OR NEW.qtyAllocated<0 OR NEW.qtyAllocated>NEW.qtyOnHand BEGIN SELECT RAISE(ABORT, 'Invalid stock reference or quantity'); END;
CREATE TRIGGER "OrderLine_guard_insert" BEFORE INSERT ON "OrderLine" WHEN NEW.quantity<=0 OR NOT EXISTS(SELECT 1 FROM StockOrder o JOIN Product p ON p.workspaceId=o.workspaceId WHERE o.id=NEW.orderId AND p.id=NEW.productId) BEGIN SELECT RAISE(ABORT, 'Invalid stock reference or quantity'); END;
CREATE TRIGGER "OrderLine_guard_update" BEFORE UPDATE ON "OrderLine" WHEN NEW.quantity<=0 OR NOT EXISTS(SELECT 1 FROM StockOrder o JOIN Product p ON p.workspaceId=o.workspaceId WHERE o.id=NEW.orderId AND p.id=NEW.productId) BEGIN SELECT RAISE(ABORT, 'Invalid stock reference or quantity'); END;
CREATE TRIGGER "StockAllocation_guard_insert" BEFORE INSERT ON "StockAllocation" WHEN NEW.quantity<=0 OR NOT EXISTS(SELECT 1 FROM OrderLine ol JOIN StockOrder o ON o.id=ol.orderId JOIN StockLayer l ON l.workspaceId=o.workspaceId AND l.productId=ol.productId WHERE ol.id=NEW.orderLineId AND l.id=NEW.stockLayerId) OR (NEW.serialItemId IS NOT NULL AND (NEW.quantity<>1 OR NOT EXISTS(SELECT 1 FROM SerialItem s WHERE s.id=NEW.serialItemId AND s.stockLayerId=NEW.stockLayerId))) BEGIN SELECT RAISE(ABORT, 'Invalid stock reference or quantity'); END;
CREATE TRIGGER "StockAllocation_guard_update" BEFORE UPDATE ON "StockAllocation" WHEN NEW.quantity<=0 OR NOT EXISTS(SELECT 1 FROM OrderLine ol JOIN StockOrder o ON o.id=ol.orderId JOIN StockLayer l ON l.workspaceId=o.workspaceId AND l.productId=ol.productId WHERE ol.id=NEW.orderLineId AND l.id=NEW.stockLayerId) OR (NEW.serialItemId IS NOT NULL AND (NEW.quantity<>1 OR NOT EXISTS(SELECT 1 FROM SerialItem s WHERE s.id=NEW.serialItemId AND s.stockLayerId=NEW.stockLayerId))) BEGIN SELECT RAISE(ABORT, 'Invalid stock reference or quantity'); END;
CREATE TRIGGER "InventoryBalance_nonnegative_guard_insert" BEFORE INSERT ON "InventoryBalance" WHEN NEW.qtyOnHand<0 OR NEW.qtyAllocated<0 OR NEW.qtyAllocated>NEW.qtyOnHand BEGIN SELECT RAISE(ABORT, 'Invalid stock reference or quantity'); END;
CREATE TRIGGER "InventoryBalance_nonnegative_guard_update" BEFORE UPDATE ON "InventoryBalance" WHEN NEW.qtyOnHand<0 OR NEW.qtyAllocated<0 OR NEW.qtyAllocated>NEW.qtyOnHand BEGIN SELECT RAISE(ABORT, 'Invalid stock reference or quantity'); END;
CREATE TRIGGER "SerialItem_layer_guard_insert" BEFORE INSERT ON "SerialItem" WHEN NEW.stockLayerId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM StockLayer l WHERE l.id=NEW.stockLayerId AND l.workspaceId=NEW.workspaceId AND l.productId=NEW.productId) BEGIN SELECT RAISE(ABORT, 'Invalid stock reference or quantity'); END;
CREATE TRIGGER "SerialItem_layer_guard_update" BEFORE UPDATE ON "SerialItem" WHEN NEW.stockLayerId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM StockLayer l WHERE l.id=NEW.stockLayerId AND l.workspaceId=NEW.workspaceId AND l.productId=NEW.productId) BEGIN SELECT RAISE(ABORT, 'Invalid stock reference or quantity'); END;
COMMIT;
PRAGMA foreign_keys=ON;
