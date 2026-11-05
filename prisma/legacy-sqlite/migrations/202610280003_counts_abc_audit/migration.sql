PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;
-- CreateTable
CREATE TABLE "ABCSettings" (
    "workspaceId" TEXT NOT NULL PRIMARY KEY,
    "windowDays" INTEGER NOT NULL DEFAULT 90,
    "thresholdA" INTEGER NOT NULL DEFAULT 80,
    "thresholdB" INTEGER NOT NULL DEFAULT 95,
    "tieRule" TEXT,
    "daysA" INTEGER,
    "daysB" INTEGER,
    "daysC" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT NOT NULL,
    CONSTRAINT "ABCSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ABCProfile" (
    "productId" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "class" TEXT,
    "confirmedAt" DATETIME,
    "confirmedBy" TEXT,
    "lastCountedAt" DATETIME,
    CONSTRAINT "ABCProfile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ABCProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ABCRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "thresholdA" INTEGER NOT NULL,
    "thresholdB" INTEGER NOT NULL,
    "tieRule" TEXT NOT NULL,
    "resultsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "ABCRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ABCAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "oldClass" TEXT,
    "newClass" TEXT NOT NULL,
    "reason" TEXT,
    "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedBy" TEXT NOT NULL,
    CONSTRAINT "ABCAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ABCAssignment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ABCAssignment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ABCRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperationalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "detailsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationalEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CountRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "mode" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedBy" TEXT NOT NULL,
    "submittedAt" DATETIME,
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "reason" TEXT,
    CONSTRAINT "CountRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CountRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CountEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL DEFAULT '',
    "expiresOn" TEXT,
    "actualQuantity" INTEGER,
    "enteredQuantity" INTEGER,
    "enteredUom" TEXT,
    "conversionFactor" INTEGER,
    "serialsJson" TEXT NOT NULL DEFAULT '[]',
    "countedBy" TEXT,
    "countedAt" DATETIME,
    CONSTRAINT "CountEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CountRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables


CREATE TABLE "new_InventoryBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qtyOnHand" INTEGER NOT NULL DEFAULT 0,
    "qtyAllocated" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryBalance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InventoryBalance" ("id", "locationId", "productId", "qtyAllocated", "qtyOnHand", "updatedAt", "workspaceId") SELECT "id", "locationId", "productId", "qtyAllocated", "qtyOnHand", "updatedAt", "workspaceId" FROM "InventoryBalance";
DROP TABLE "InventoryBalance";
ALTER TABLE "new_InventoryBalance" RENAME TO "InventoryBalance";
CREATE UNIQUE INDEX "InventoryBalance_productId_locationId_key" ON "InventoryBalance"("productId", "locationId");



-- CreateIndex
CREATE INDEX "ABCRun_workspaceId_createdAt_idx" ON "ABCRun"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ABCAssignment_workspaceId_productId_confirmedAt_idx" ON "ABCAssignment"("workspaceId", "productId", "confirmedAt");

-- CreateIndex
CREATE INDEX "OperationalEvent_workspaceId_createdAt_idx" ON "OperationalEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalEvent_workspaceId_operationKey_key" ON "OperationalEvent"("workspaceId", "operationKey");

-- CreateIndex
CREATE INDEX "CountRun_workspaceId_productId_status_idx" ON "CountRun"("workspaceId", "productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CountRun_workspaceId_number_key" ON "CountRun"("workspaceId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "CountEntry_runId_locationId_lotNumber_key" ON "CountEntry"("runId", "locationId", "lotNumber");


CREATE TRIGGER "InventoryBalance_workspace_insert" BEFORE INSERT ON "InventoryBalance" WHEN NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."locationId" AND "workspaceId"=NEW."workspaceId") BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;

CREATE TRIGGER "InventoryBalance_workspace_update" BEFORE UPDATE ON "InventoryBalance" WHEN NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."locationId" AND "workspaceId"=NEW."workspaceId") BEGIN SELECT RAISE(ABORT, 'Workspace reference mismatch'); END;

CREATE TRIGGER "InventoryBalance_nonnegative_guard_insert" BEFORE INSERT ON "InventoryBalance" WHEN NEW.qtyOnHand<0 OR NEW.qtyAllocated<0 OR NEW.qtyAllocated>NEW.qtyOnHand BEGIN SELECT RAISE(ABORT, 'Invalid stock reference or quantity'); END;

CREATE TRIGGER "InventoryBalance_nonnegative_guard_update" BEFORE UPDATE ON "InventoryBalance" WHEN NEW.qtyOnHand<0 OR NEW.qtyAllocated<0 OR NEW.qtyAllocated>NEW.qtyOnHand BEGIN SELECT RAISE(ABORT, 'Invalid stock reference or quantity'); END;

CREATE TRIGGER InventoryBalance_revision AFTER UPDATE OF qtyOnHand,qtyAllocated ON InventoryBalance BEGIN UPDATE InventoryBalance SET version=OLD.version+1 WHERE id=NEW.id; END;
CREATE TRIGGER "ABCProfile_guard_insert" BEFORE INSERT ON "ABCProfile" WHEN NOT EXISTS(SELECT 1 FROM Product p WHERE p.id=NEW.productId AND p.workspaceId=NEW.workspaceId) OR (NEW.class IS NOT NULL AND NEW.class NOT IN ('A','B','C')) BEGIN SELECT RAISE(ABORT,'Invalid warehouse scope or count/ABC data'); END;
CREATE TRIGGER "ABCProfile_guard_update" BEFORE UPDATE ON "ABCProfile" WHEN NOT EXISTS(SELECT 1 FROM Product p WHERE p.id=NEW.productId AND p.workspaceId=NEW.workspaceId) OR (NEW.class IS NOT NULL AND NEW.class NOT IN ('A','B','C')) BEGIN SELECT RAISE(ABORT,'Invalid warehouse scope or count/ABC data'); END;
CREATE TRIGGER "ABCAssignment_guard_insert" BEFORE INSERT ON "ABCAssignment" WHEN NOT EXISTS(SELECT 1 FROM Product p WHERE p.id=NEW.productId AND p.workspaceId=NEW.workspaceId) OR NOT EXISTS(SELECT 1 FROM ABCRun r WHERE r.id=NEW.runId AND r.workspaceId=NEW.workspaceId) OR NEW.newClass NOT IN ('A','B','C') BEGIN SELECT RAISE(ABORT,'Invalid warehouse scope or count/ABC data'); END;
CREATE TRIGGER "ABCAssignment_guard_update" BEFORE UPDATE ON "ABCAssignment" WHEN NOT EXISTS(SELECT 1 FROM Product p WHERE p.id=NEW.productId AND p.workspaceId=NEW.workspaceId) OR NOT EXISTS(SELECT 1 FROM ABCRun r WHERE r.id=NEW.runId AND r.workspaceId=NEW.workspaceId) OR NEW.newClass NOT IN ('A','B','C') BEGIN SELECT RAISE(ABORT,'Invalid warehouse scope or count/ABC data'); END;
CREATE TRIGGER "CountRun_guard_insert" BEFORE INSERT ON "CountRun" WHEN NOT EXISTS(SELECT 1 FROM Product p WHERE p.id=NEW.productId AND p.workspaceId=NEW.workspaceId) OR NEW.status NOT IN ('OPEN','SUBMITTED','APPROVED','STALE','CANCELLED') OR NEW.mode NOT IN ('SNAPSHOT','LOCK') BEGIN SELECT RAISE(ABORT,'Invalid warehouse scope or count/ABC data'); END;
CREATE TRIGGER "CountRun_guard_update" BEFORE UPDATE ON "CountRun" WHEN NOT EXISTS(SELECT 1 FROM Product p WHERE p.id=NEW.productId AND p.workspaceId=NEW.workspaceId) OR NEW.status NOT IN ('OPEN','SUBMITTED','APPROVED','STALE','CANCELLED') OR NEW.mode NOT IN ('SNAPSHOT','LOCK') BEGIN SELECT RAISE(ABORT,'Invalid warehouse scope or count/ABC data'); END;
CREATE TRIGGER "CountEntry_guard_insert" BEFORE INSERT ON "CountEntry" WHEN NOT EXISTS(SELECT 1 FROM CountRun r JOIN Location l ON l.workspaceId=r.workspaceId WHERE r.id=NEW.runId AND l.id=NEW.locationId) OR NEW.actualQuantity<0 BEGIN SELECT RAISE(ABORT,'Invalid warehouse scope or count/ABC data'); END;
CREATE TRIGGER "CountEntry_guard_update" BEFORE UPDATE ON "CountEntry" WHEN NOT EXISTS(SELECT 1 FROM CountRun r JOIN Location l ON l.workspaceId=r.workspaceId WHERE r.id=NEW.runId AND l.id=NEW.locationId) OR NEW.actualQuantity<0 BEGIN SELECT RAISE(ABORT,'Invalid warehouse scope or count/ABC data'); END;
CREATE TRIGGER "ABCSettings_guard_insert" BEFORE INSERT ON "ABCSettings" WHEN NEW.windowDays<1 OR NEW.windowDays>3650 OR NEW.thresholdA<1 OR NEW.thresholdB>99 OR NEW.thresholdA>=NEW.thresholdB OR NEW.daysA<1 OR NEW.daysB<1 OR NEW.daysC<1 OR (NEW.tieRule IS NOT NULL AND NEW.tieRule NOT IN ('SKU_ORDER','KEEP_FREQUENCY_GROUP')) BEGIN SELECT RAISE(ABORT,'Invalid warehouse scope or count/ABC data'); END;
CREATE TRIGGER "ABCSettings_guard_update" BEFORE UPDATE ON "ABCSettings" WHEN NEW.windowDays<1 OR NEW.windowDays>3650 OR NEW.thresholdA<1 OR NEW.thresholdB>99 OR NEW.thresholdA>=NEW.thresholdB OR NEW.daysA<1 OR NEW.daysB<1 OR NEW.daysC<1 OR (NEW.tieRule IS NOT NULL AND NEW.tieRule NOT IN ('SKU_ORDER','KEEP_FREQUENCY_GROUP')) BEGIN SELECT RAISE(ABORT,'Invalid warehouse scope or count/ABC data'); END;
COMMIT;
PRAGMA foreign_keys=ON;
