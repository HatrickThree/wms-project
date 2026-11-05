-- Fresh Supabase/PostgreSQL installation; existing SQLite data is imported separately.
BEGIN;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('RECEIVING', 'STORAGE', 'PICKING', 'PACKING', 'QUARANTINE');

-- CreateEnum
CREATE TYPE "SerialStatus" AS ENUM ('IN_STOCK', 'ALLOCATED', 'PICKED', 'MISSING', 'SHIPPED', 'RETURNED', 'DEFECTIVE');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('INBOUND_RECEIVE', 'PUTAWAY', 'INTERNAL_TRANSFER', 'OUTBOUND_PICK', 'OUTBOUND_SHIP', 'RETURN_IN', 'ADJUSTMENT_PLUS', 'ADJUSTMENT_MINUS');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STAFF', 'INSTRUCTOR', 'STUDENT');

-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('BUSINESS', 'TRAINING');

-- CreateEnum
CREATE TYPE "IssuePolicy" AS ENUM ('FIFO', 'FEFO');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'RESERVED', 'PICKED', 'SHIPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "aisle" TEXT NOT NULL,
    "rack" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "type" "LocationType" NOT NULL DEFAULT 'STORAGE',

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "baseUom" TEXT NOT NULL DEFAULT 'PCS',
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "trackSerial" BOOLEAN NOT NULL DEFAULT true,
    "trackLot" BOOLEAN NOT NULL DEFAULT false,
    "issuePolicy" "IssuePolicy" NOT NULL DEFAULT 'FIFO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qtyOnHand" INTEGER NOT NULL DEFAULT 0,
    "qtyAllocated" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerialItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT,
    "status" "SerialStatus" NOT NULL DEFAULT 'IN_STOCK',
    "lotNumber" TEXT,
    "stockLayerId" TEXT,
    "inboundDocNo" TEXT NOT NULL,
    "outboundDocNo" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shippedAt" TIMESTAMP(3),
    "warrantyExp" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SerialItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLedger" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "serialItemId" TEXT,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "qtyChange" INTEGER NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "referenceDoc" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeWorkspaceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkspaceType" NOT NULL,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceDeletion" (
    "workspaceId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedBy" TEXT NOT NULL,

    CONSTRAINT "WorkspaceDeletion_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("workspaceId","userId")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "username" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "StockLot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "expiresOn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLayer" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "lotId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceDoc" TEXT NOT NULL,
    "qtyOnHand" INTEGER NOT NULL DEFAULT 0,
    "qtyAllocated" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOperation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOrder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reservedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),

    CONSTRAINT "StockOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "requestedQuantity" INTEGER NOT NULL DEFAULT 1,
    "requestedUom" TEXT NOT NULL DEFAULT 'PCS',
    "conversionFactor" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUnit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "factor" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAllocation" (
    "id" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "stockLayerId" TEXT NOT NULL,
    "serialItemId" TEXT,
    "quantity" INTEGER NOT NULL,
    "pickedAt" TIMESTAMP(3),
    "pickedBy" TEXT,
    "overrideReason" TEXT,
    "overrideBy" TEXT,

    CONSTRAINT "StockAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ABCSettings" (
    "workspaceId" TEXT NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 90,
    "thresholdA" INTEGER NOT NULL DEFAULT 80,
    "thresholdB" INTEGER NOT NULL DEFAULT 95,
    "tieRule" TEXT,
    "daysA" INTEGER,
    "daysB" INTEGER,
    "daysC" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "ABCSettings_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "ABCProfile" (
    "productId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "class" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "lastCountedAt" TIMESTAMP(3),

    CONSTRAINT "ABCProfile_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "ABCRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "thresholdA" INTEGER NOT NULL,
    "thresholdB" INTEGER NOT NULL,
    "tieRule" TEXT NOT NULL,
    "resultsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "ABCRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ABCAssignment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "oldClass" TEXT,
    "newClass" TEXT NOT NULL,
    "reason" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedBy" TEXT NOT NULL,

    CONSTRAINT "ABCAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "detailsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "mode" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedBy" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "reason" TEXT,

    CONSTRAINT "CountRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountEntry" (
    "id" TEXT NOT NULL,
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
    "countedAt" TIMESTAMP(3),

    CONSTRAINT "CountEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseMap" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "graphJson" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "WarehouseMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickingPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "mapVersion" INTEGER NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "PickingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingLesson" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "configJson" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRound" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "seed" TEXT NOT NULL,
    "fixtureHash" TEXT NOT NULL,
    "configJson" TEXT NOT NULL,
    "truthJson" TEXT NOT NULL,
    "assessmentJson" TEXT,
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingEvent" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "detailsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchForm" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "configJson" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchResponse" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "respondentCode" TEXT NOT NULL,
    "answersJson" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_workspaceId_code_key" ON "Warehouse"("workspaceId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_workspaceId_barcode_key" ON "Location"("workspaceId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_workspaceId_sku_key" ON "Product"("workspaceId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_workspaceId_barcode_key" ON "Product"("workspaceId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_productId_locationId_key" ON "InventoryBalance"("productId", "locationId");

-- CreateIndex
CREATE INDEX "SerialItem_productId_status_idx" ON "SerialItem"("productId", "status");

-- CreateIndex
CREATE INDEX "SerialItem_locationId_idx" ON "SerialItem"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "SerialItem_workspaceId_serialNumber_key" ON "SerialItem"("workspaceId", "serialNumber");

-- CreateIndex
CREATE INDEX "StockLedger_productId_createdAt_idx" ON "StockLedger"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "StockLedger_serialItemId_idx" ON "StockLedger"("serialItemId");

-- CreateIndex
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
CREATE UNIQUE INDEX "ProductUnit_productId_name_key" ON "ProductUnit"("productId", "name");

-- CreateIndex
CREATE INDEX "StockAllocation_orderLineId_idx" ON "StockAllocation"("orderLineId");

-- CreateIndex
CREATE INDEX "StockAllocation_stockLayerId_idx" ON "StockAllocation"("stockLayerId");

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

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseMap_warehouseId_key" ON "WarehouseMap"("warehouseId");

-- CreateIndex
CREATE INDEX "PickingPlan_workspaceId_orderId_createdAt_idx" ON "PickingPlan"("workspaceId", "orderId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingLesson_workspaceId_createdAt_idx" ON "TrainingLesson"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingRound_workspaceId_key" ON "TrainingRound"("workspaceId");

-- CreateIndex
CREATE INDEX "TrainingRound_lessonId_idx" ON "TrainingRound"("lessonId");

-- CreateIndex
CREATE INDEX "TrainingEvent_roundId_createdAt_idx" ON "TrainingEvent"("roundId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingEvent_roundId_operationKey_key" ON "TrainingEvent"("roundId", "operationKey");

-- CreateIndex
CREATE INDEX "ResearchForm_workspaceId_createdAt_idx" ON "ResearchForm"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchResponse_formId_userId_key" ON "ResearchResponse"("formId", "userId");

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialItem" ADD CONSTRAINT "SerialItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialItem" ADD CONSTRAINT "SerialItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialItem" ADD CONSTRAINT "SerialItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialItem" ADD CONSTRAINT "SerialItem_stockLayerId_fkey" FOREIGN KEY ("stockLayerId") REFERENCES "StockLayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_serialItemId_fkey" FOREIGN KEY ("serialItemId") REFERENCES "SerialItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_activeWorkspaceId_fkey" FOREIGN KEY ("activeWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceDeletion" ADD CONSTRAINT "WorkspaceDeletion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLayer" ADD CONSTRAINT "StockLayer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLayer" ADD CONSTRAINT "StockLayer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLayer" ADD CONSTRAINT "StockLayer_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLayer" ADD CONSTRAINT "StockLayer_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOperation" ADD CONSTRAINT "StockOperation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOrder" ADD CONSTRAINT "StockOrder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StockOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAllocation" ADD CONSTRAINT "StockAllocation_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAllocation" ADD CONSTRAINT "StockAllocation_stockLayerId_fkey" FOREIGN KEY ("stockLayerId") REFERENCES "StockLayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAllocation" ADD CONSTRAINT "StockAllocation_serialItemId_fkey" FOREIGN KEY ("serialItemId") REFERENCES "SerialItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ABCSettings" ADD CONSTRAINT "ABCSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ABCProfile" ADD CONSTRAINT "ABCProfile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ABCProfile" ADD CONSTRAINT "ABCProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ABCRun" ADD CONSTRAINT "ABCRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ABCAssignment" ADD CONSTRAINT "ABCAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ABCAssignment" ADD CONSTRAINT "ABCAssignment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ABCAssignment" ADD CONSTRAINT "ABCAssignment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ABCRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountRun" ADD CONSTRAINT "CountRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountRun" ADD CONSTRAINT "CountRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountEntry" ADD CONSTRAINT "CountEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CountRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseMap" ADD CONSTRAINT "WarehouseMap_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseMap" ADD CONSTRAINT "WarehouseMap_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickingPlan" ADD CONSTRAINT "PickingPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickingPlan" ADD CONSTRAINT "PickingPlan_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StockOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickingPlan" ADD CONSTRAINT "PickingPlan_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLesson" ADD CONSTRAINT "TrainingLesson_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRound" ADD CONSTRAINT "TrainingRound_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "TrainingLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRound" ADD CONSTRAINT "TrainingRound_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEvent" ADD CONSTRAINT "TrainingEvent_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "TrainingRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchForm" ADD CONSTRAINT "ResearchForm_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchResponse" ADD CONSTRAINT "ResearchResponse_formId_fkey" FOREIGN KEY ("formId") REFERENCES "ResearchForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "wms_ABCAssignment_guard_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Product" p WHERE p."id"=NEW."productId" AND p."workspaceId"=NEW."workspaceId") OR NOT EXISTS(SELECT 1 FROM "ABCRun" r WHERE r."id"=NEW."runId" AND r."workspaceId"=NEW."workspaceId") OR NEW."newClass" NOT IN ('A','B','C') THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid warehouse scope or count/ABC data';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "ABCAssignment_guard_insert" BEFORE INSERT ON "ABCAssignment" FOR EACH ROW EXECUTE FUNCTION "wms_ABCAssignment_guard_insert"();

CREATE FUNCTION "wms_ABCAssignment_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Product" p WHERE p."id"=NEW."productId" AND p."workspaceId"=NEW."workspaceId") OR NOT EXISTS(SELECT 1 FROM "ABCRun" r WHERE r."id"=NEW."runId" AND r."workspaceId"=NEW."workspaceId") OR NEW."newClass" NOT IN ('A','B','C') THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid warehouse scope or count/ABC data';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "ABCAssignment_guard_update" BEFORE UPDATE ON "ABCAssignment" FOR EACH ROW EXECUTE FUNCTION "wms_ABCAssignment_guard_update"();

CREATE FUNCTION "wms_ABCProfile_guard_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Product" p WHERE p."id"=NEW."productId" AND p."workspaceId"=NEW."workspaceId") OR (NEW."class" IS NOT NULL AND NEW."class" NOT IN ('A','B','C')) THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid warehouse scope or count/ABC data';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "ABCProfile_guard_insert" BEFORE INSERT ON "ABCProfile" FOR EACH ROW EXECUTE FUNCTION "wms_ABCProfile_guard_insert"();

CREATE FUNCTION "wms_ABCProfile_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Product" p WHERE p."id"=NEW."productId" AND p."workspaceId"=NEW."workspaceId") OR (NEW."class" IS NOT NULL AND NEW."class" NOT IN ('A','B','C')) THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid warehouse scope or count/ABC data';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "ABCProfile_guard_update" BEFORE UPDATE ON "ABCProfile" FOR EACH ROW EXECUTE FUNCTION "wms_ABCProfile_guard_update"();

CREATE FUNCTION "wms_ABCSettings_guard_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."windowDays"<1 OR NEW."windowDays">3650 OR NEW."thresholdA"<1 OR NEW."thresholdB">99 OR NEW."thresholdA">=NEW."thresholdB" OR NEW."daysA"<1 OR NEW."daysB"<1 OR NEW."daysC"<1 OR (NEW."tieRule" IS NOT NULL AND NEW."tieRule" NOT IN ('SKU_ORDER','KEEP_FREQUENCY_GROUP')) THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid warehouse scope or count/ABC data';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "ABCSettings_guard_insert" BEFORE INSERT ON "ABCSettings" FOR EACH ROW EXECUTE FUNCTION "wms_ABCSettings_guard_insert"();

CREATE FUNCTION "wms_ABCSettings_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."windowDays"<1 OR NEW."windowDays">3650 OR NEW."thresholdA"<1 OR NEW."thresholdB">99 OR NEW."thresholdA">=NEW."thresholdB" OR NEW."daysA"<1 OR NEW."daysB"<1 OR NEW."daysC"<1 OR (NEW."tieRule" IS NOT NULL AND NEW."tieRule" NOT IN ('SKU_ORDER','KEEP_FREQUENCY_GROUP')) THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid warehouse scope or count/ABC data';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "ABCSettings_guard_update" BEFORE UPDATE ON "ABCSettings" FOR EACH ROW EXECUTE FUNCTION "wms_ABCSettings_guard_update"();

CREATE FUNCTION "wms_CountEntry_guard_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "CountRun" r JOIN "Location" l ON l."workspaceId"=r."workspaceId" WHERE r."id"=NEW."runId" AND l."id"=NEW."locationId") OR NEW."actualQuantity"<0 THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid warehouse scope or count/ABC data';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "CountEntry_guard_insert" BEFORE INSERT ON "CountEntry" FOR EACH ROW EXECUTE FUNCTION "wms_CountEntry_guard_insert"();

CREATE FUNCTION "wms_CountEntry_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "CountRun" r JOIN "Location" l ON l."workspaceId"=r."workspaceId" WHERE r."id"=NEW."runId" AND l."id"=NEW."locationId") OR NEW."actualQuantity"<0 THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid warehouse scope or count/ABC data';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "CountEntry_guard_update" BEFORE UPDATE ON "CountEntry" FOR EACH ROW EXECUTE FUNCTION "wms_CountEntry_guard_update"();

CREATE FUNCTION "wms_CountRun_guard_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Product" p WHERE p."id"=NEW."productId" AND p."workspaceId"=NEW."workspaceId") OR NEW."status" NOT IN ('OPEN','SUBMITTED','APPROVED','STALE','CANCELLED') OR NEW."mode" NOT IN ('SNAPSHOT','LOCK') THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid warehouse scope or count/ABC data';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "CountRun_guard_insert" BEFORE INSERT ON "CountRun" FOR EACH ROW EXECUTE FUNCTION "wms_CountRun_guard_insert"();

CREATE FUNCTION "wms_CountRun_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Product" p WHERE p."id"=NEW."productId" AND p."workspaceId"=NEW."workspaceId") OR NEW."status" NOT IN ('OPEN','SUBMITTED','APPROVED','STALE','CANCELLED') OR NEW."mode" NOT IN ('SNAPSHOT','LOCK') THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid warehouse scope or count/ABC data';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "CountRun_guard_update" BEFORE UPDATE ON "CountRun" FOR EACH ROW EXECUTE FUNCTION "wms_CountRun_guard_update"();

CREATE FUNCTION "wms_InventoryBalance_nonnegative_guard_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."qtyOnHand"<0 OR NEW."qtyAllocated"<0 OR NEW."qtyAllocated">NEW."qtyOnHand" THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid stock reference or quantity';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "InventoryBalance_nonnegative_guard_insert" BEFORE INSERT ON "InventoryBalance" FOR EACH ROW EXECUTE FUNCTION "wms_InventoryBalance_nonnegative_guard_insert"();

CREATE FUNCTION "wms_InventoryBalance_nonnegative_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."qtyOnHand"<0 OR NEW."qtyAllocated"<0 OR NEW."qtyAllocated">NEW."qtyOnHand" THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid stock reference or quantity';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "InventoryBalance_nonnegative_guard_update" BEFORE UPDATE ON "InventoryBalance" FOR EACH ROW EXECUTE FUNCTION "wms_InventoryBalance_nonnegative_guard_update"();

CREATE FUNCTION "wms_balance_revision"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW."version" := OLD."version" + 1;
 RETURN NEW;
END; $$;
CREATE TRIGGER "InventoryBalance_revision" BEFORE UPDATE OF "qtyOnHand", "qtyAllocated" ON "InventoryBalance" FOR EACH ROW EXECUTE FUNCTION "wms_balance_revision"();

CREATE FUNCTION "wms_InventoryBalance_workspace_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."locationId" AND "workspaceId"=NEW."workspaceId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace reference mismatch';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "InventoryBalance_workspace_insert" BEFORE INSERT ON "InventoryBalance" FOR EACH ROW EXECUTE FUNCTION "wms_InventoryBalance_workspace_insert"();

CREATE FUNCTION "wms_InventoryBalance_workspace_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."locationId" AND "workspaceId"=NEW."workspaceId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace reference mismatch';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "InventoryBalance_workspace_update" BEFORE UPDATE ON "InventoryBalance" FOR EACH ROW EXECUTE FUNCTION "wms_InventoryBalance_workspace_update"();

CREATE FUNCTION "wms_Location_workspace_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Warehouse" WHERE "id"=NEW."warehouseId" AND "workspaceId"=NEW."workspaceId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace reference mismatch';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "Location_workspace_insert" BEFORE INSERT ON "Location" FOR EACH ROW EXECUTE FUNCTION "wms_Location_workspace_insert"();

CREATE FUNCTION "wms_Location_workspace_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Warehouse" WHERE "id"=NEW."warehouseId" AND "workspaceId"=NEW."workspaceId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace reference mismatch';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "Location_workspace_update" BEFORE UPDATE ON "Location" FOR EACH ROW EXECUTE FUNCTION "wms_Location_workspace_update"();

CREATE FUNCTION "wms_OrderLine_guard_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."quantity"<=0 OR NOT EXISTS(SELECT 1 FROM "StockOrder" o JOIN "Product" p ON p."workspaceId"=o."workspaceId" WHERE o."id"=NEW."orderId" AND p."id"=NEW."productId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid stock reference or quantity';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "OrderLine_guard_insert" BEFORE INSERT ON "OrderLine" FOR EACH ROW EXECUTE FUNCTION "wms_OrderLine_guard_insert"();

CREATE FUNCTION "wms_OrderLine_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."quantity"<=0 OR NOT EXISTS(SELECT 1 FROM "StockOrder" o JOIN "Product" p ON p."workspaceId"=o."workspaceId" WHERE o."id"=NEW."orderId" AND p."id"=NEW."productId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid stock reference or quantity';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "OrderLine_guard_update" BEFORE UPDATE ON "OrderLine" FOR EACH ROW EXECUTE FUNCTION "wms_OrderLine_guard_update"();

CREATE FUNCTION "wms_PickingPlan_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TRUE THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'picking plan is immutable';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "PickingPlan_immutable" BEFORE UPDATE ON "PickingPlan" FOR EACH ROW EXECUTE FUNCTION "wms_PickingPlan_immutable"();

CREATE FUNCTION "wms_PickingPlan_scope_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Warehouse" WHERE "id"=NEW."warehouseId" AND "workspaceId"=NEW."workspaceId")
 OR NOT EXISTS(SELECT 1 FROM "StockOrder" WHERE "id"=NEW."orderId" AND "workspaceId"=NEW."workspaceId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'workspace mismatch';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "PickingPlan_scope_insert" BEFORE INSERT ON "PickingPlan" FOR EACH ROW EXECUTE FUNCTION "wms_PickingPlan_scope_insert"();

CREATE FUNCTION "wms_ProductUnit_guard_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Product" p WHERE p."id"=NEW."productId" AND p."workspaceId"=NEW."workspaceId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Unit product workspace mismatch';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "ProductUnit_guard_insert" BEFORE INSERT ON "ProductUnit" FOR EACH ROW EXECUTE FUNCTION "wms_ProductUnit_guard_insert"();

CREATE FUNCTION "wms_ProductUnit_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Product" p WHERE p."id"=NEW."productId" AND p."workspaceId"=NEW."workspaceId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Unit product workspace mismatch';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "ProductUnit_guard_update" BEFORE UPDATE ON "ProductUnit" FOR EACH ROW EXECUTE FUNCTION "wms_ProductUnit_guard_update"();

CREATE FUNCTION "wms_ResearchForm_training_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Workspace" WHERE "id"=NEW."workspaceId" AND "type"='TRAINING') THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'training workspace required';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "ResearchForm_training_insert" BEFORE INSERT ON "ResearchForm" FOR EACH ROW EXECUTE FUNCTION "wms_ResearchForm_training_insert"();

CREATE FUNCTION "wms_ResearchForm_training_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Workspace" WHERE "id"=NEW."workspaceId" AND "type"='TRAINING') THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'training workspace required';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "ResearchForm_training_update" BEFORE UPDATE ON "ResearchForm" FOR EACH ROW EXECUTE FUNCTION "wms_ResearchForm_training_update"();

CREATE FUNCTION "wms_ResearchResponse_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TRUE THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'submitted response is immutable';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "ResearchResponse_immutable" BEFORE UPDATE ON "ResearchResponse" FOR EACH ROW EXECUTE FUNCTION "wms_ResearchResponse_immutable"();

CREATE FUNCTION "wms_SerialItem_layer_guard_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."stockLayerId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "StockLayer" l WHERE l."id"=NEW."stockLayerId" AND l."workspaceId"=NEW."workspaceId" AND l."productId"=NEW."productId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid stock reference or quantity';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "SerialItem_layer_guard_insert" BEFORE INSERT ON "SerialItem" FOR EACH ROW EXECUTE FUNCTION "wms_SerialItem_layer_guard_insert"();

CREATE FUNCTION "wms_SerialItem_layer_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."stockLayerId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "StockLayer" l WHERE l."id"=NEW."stockLayerId" AND l."workspaceId"=NEW."workspaceId" AND l."productId"=NEW."productId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid stock reference or quantity';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "SerialItem_layer_guard_update" BEFORE UPDATE ON "SerialItem" FOR EACH ROW EXECUTE FUNCTION "wms_SerialItem_layer_guard_update"();

CREATE FUNCTION "wms_SerialItem_workspace_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR (NEW."locationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."locationId" AND "workspaceId"=NEW."workspaceId")) THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace reference mismatch';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "SerialItem_workspace_insert" BEFORE INSERT ON "SerialItem" FOR EACH ROW EXECUTE FUNCTION "wms_SerialItem_workspace_insert"();

CREATE FUNCTION "wms_SerialItem_workspace_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR (NEW."locationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."locationId" AND "workspaceId"=NEW."workspaceId")) THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace reference mismatch';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "SerialItem_workspace_update" BEFORE UPDATE ON "SerialItem" FOR EACH ROW EXECUTE FUNCTION "wms_SerialItem_workspace_update"();

CREATE FUNCTION "wms_StockAllocation_guard_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."quantity"<=0 OR NOT EXISTS(SELECT 1 FROM "OrderLine" ol JOIN "StockOrder" o ON o."id"=ol."orderId" JOIN "StockLayer" l ON l."workspaceId"=o."workspaceId" AND l."productId"=ol."productId" WHERE ol."id"=NEW."orderLineId" AND l."id"=NEW."stockLayerId") OR (NEW."serialItemId" IS NOT NULL AND (NEW."quantity"<>1 OR NOT EXISTS(SELECT 1 FROM "SerialItem" s WHERE s."id"=NEW."serialItemId" AND s."stockLayerId"=NEW."stockLayerId"))) THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid stock reference or quantity';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockAllocation_guard_insert" BEFORE INSERT ON "StockAllocation" FOR EACH ROW EXECUTE FUNCTION "wms_StockAllocation_guard_insert"();

CREATE FUNCTION "wms_StockAllocation_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."quantity"<=0 OR NOT EXISTS(SELECT 1 FROM "OrderLine" ol JOIN "StockOrder" o ON o."id"=ol."orderId" JOIN "StockLayer" l ON l."workspaceId"=o."workspaceId" AND l."productId"=ol."productId" WHERE ol."id"=NEW."orderLineId" AND l."id"=NEW."stockLayerId") OR (NEW."serialItemId" IS NOT NULL AND (NEW."quantity"<>1 OR NOT EXISTS(SELECT 1 FROM "SerialItem" s WHERE s."id"=NEW."serialItemId" AND s."stockLayerId"=NEW."stockLayerId"))) THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid stock reference or quantity';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockAllocation_guard_update" BEFORE UPDATE ON "StockAllocation" FOR EACH ROW EXECUTE FUNCTION "wms_StockAllocation_guard_update"();

CREATE FUNCTION "wms_StockLayer_guard_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Product" p WHERE p."id"=NEW."productId" AND p."workspaceId"=NEW."workspaceId") OR NOT EXISTS(SELECT 1 FROM "Location" l WHERE l."id"=NEW."locationId" AND l."workspaceId"=NEW."workspaceId") OR (NEW."lotId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "StockLot" l WHERE l."id"=NEW."lotId" AND l."productId"=NEW."productId" AND l."workspaceId"=NEW."workspaceId")) OR NEW."qtyOnHand"<0 OR NEW."qtyAllocated"<0 OR NEW."qtyAllocated">NEW."qtyOnHand" THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid stock reference or quantity';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockLayer_guard_insert" BEFORE INSERT ON "StockLayer" FOR EACH ROW EXECUTE FUNCTION "wms_StockLayer_guard_insert"();

CREATE FUNCTION "wms_StockLayer_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Product" p WHERE p."id"=NEW."productId" AND p."workspaceId"=NEW."workspaceId") OR NOT EXISTS(SELECT 1 FROM "Location" l WHERE l."id"=NEW."locationId" AND l."workspaceId"=NEW."workspaceId") OR (NEW."lotId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "StockLot" l WHERE l."id"=NEW."lotId" AND l."productId"=NEW."productId" AND l."workspaceId"=NEW."workspaceId")) OR NEW."qtyOnHand"<0 OR NEW."qtyAllocated"<0 OR NEW."qtyAllocated">NEW."qtyOnHand" THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid stock reference or quantity';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockLayer_guard_update" BEFORE UPDATE ON "StockLayer" FOR EACH ROW EXECUTE FUNCTION "wms_StockLayer_guard_update"();

CREATE FUNCTION "wms_StockLedger_workspace_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR (NEW."serialItemId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "SerialItem" WHERE "id"=NEW."serialItemId" AND "workspaceId"=NEW."workspaceId")) OR (NEW."fromLocationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."fromLocationId" AND "workspaceId"=NEW."workspaceId")) OR (NEW."toLocationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."toLocationId" AND "workspaceId"=NEW."workspaceId")) THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace reference mismatch';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockLedger_workspace_insert" BEFORE INSERT ON "StockLedger" FOR EACH ROW EXECUTE FUNCTION "wms_StockLedger_workspace_insert"();

CREATE FUNCTION "wms_StockLedger_workspace_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"=NEW."productId" AND "workspaceId"=NEW."workspaceId") OR (NEW."serialItemId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "SerialItem" WHERE "id"=NEW."serialItemId" AND "workspaceId"=NEW."workspaceId")) OR (NEW."fromLocationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."fromLocationId" AND "workspaceId"=NEW."workspaceId")) OR (NEW."toLocationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "id"=NEW."toLocationId" AND "workspaceId"=NEW."workspaceId")) THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace reference mismatch';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockLedger_workspace_update" BEFORE UPDATE ON "StockLedger" FOR EACH ROW EXECUTE FUNCTION "wms_StockLedger_workspace_update"();

CREATE FUNCTION "wms_StockLot_guard_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Product" p WHERE p."id"=NEW."productId" AND p."workspaceId"=NEW."workspaceId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid stock reference or quantity';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockLot_guard_insert" BEFORE INSERT ON "StockLot" FOR EACH ROW EXECUTE FUNCTION "wms_StockLot_guard_insert"();

CREATE FUNCTION "wms_StockLot_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Product" p WHERE p."id"=NEW."productId" AND p."workspaceId"=NEW."workspaceId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid stock reference or quantity';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockLot_guard_update" BEFORE UPDATE ON "StockLot" FOR EACH ROW EXECUTE FUNCTION "wms_StockLot_guard_update"();

CREATE FUNCTION "wms_TrainingLesson_training_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Workspace" WHERE "id"=NEW."workspaceId" AND "type"='TRAINING') THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'training workspace required';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "TrainingLesson_training_insert" BEFORE INSERT ON "TrainingLesson" FOR EACH ROW EXECUTE FUNCTION "wms_TrainingLesson_training_insert"();

CREATE FUNCTION "wms_TrainingLesson_training_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Workspace" WHERE "id"=NEW."workspaceId" AND "type"='TRAINING') THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'training workspace required';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "TrainingLesson_training_update" BEFORE UPDATE ON "TrainingLesson" FOR EACH ROW EXECUTE FUNCTION "wms_TrainingLesson_training_update"();

CREATE FUNCTION "wms_TrainingRound_training_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Workspace" WHERE "id"=NEW."workspaceId" AND "type"='TRAINING')
 OR EXISTS(SELECT 1 FROM "TrainingLesson" WHERE "id"=NEW."lessonId" AND "workspaceId"=NEW."workspaceId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'separate training workspace required';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "TrainingRound_training_insert" BEFORE INSERT ON "TrainingRound" FOR EACH ROW EXECUTE FUNCTION "wms_TrainingRound_training_insert"();

CREATE FUNCTION "wms_TrainingRound_training_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."workspaceId"!=OLD."workspaceId" OR NEW."lessonId"!=OLD."lessonId" OR NEW."truthJson"!=OLD."truthJson" OR NEW."configJson"!=OLD."configJson" OR NEW."seed"!=OLD."seed" OR NEW."fixtureHash"!=OLD."fixtureHash" THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'round fixture is immutable';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "TrainingRound_training_update" BEFORE UPDATE ON "TrainingRound" FOR EACH ROW EXECUTE FUNCTION "wms_TrainingRound_training_update"();

CREATE FUNCTION "wms_WarehouseMap_scope_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Warehouse" WHERE "id"=NEW."warehouseId" AND "workspaceId"=NEW."workspaceId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'workspace mismatch';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "WarehouseMap_scope_insert" BEFORE INSERT ON "WarehouseMap" FOR EACH ROW EXECUTE FUNCTION "wms_WarehouseMap_scope_insert"();

CREATE FUNCTION "wms_WarehouseMap_scope_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Warehouse" WHERE "id"=NEW."warehouseId" AND "workspaceId"=NEW."workspaceId") THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'workspace mismatch';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "WarehouseMap_scope_update" BEFORE UPDATE ON "WarehouseMap" FOR EACH ROW EXECUTE FUNCTION "wms_WarehouseMap_scope_update"();

ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_factor_positive" CHECK ("factor" > 0);
ALTER TABLE "WarehouseMap" ADD CONSTRAINT "WarehouseMap_version_positive" CHECK ("version" > 0);
ALTER TABLE "PickingPlan" ADD CONSTRAINT "PickingPlan_version_positive" CHECK ("mapVersion" > 0);

-- Browser clients use the WMS server and its role checks, never the Supabase Data API.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoginAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Warehouse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Location" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockLot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockLayer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockOperation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SerialItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductUnit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ABCSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ABCProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ABCRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ABCAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OperationalEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CountRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CountEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WarehouseMap" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PickingPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrainingLesson" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrainingRound" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrainingEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResearchForm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResearchResponse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceDeletion" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON TABLE "User" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "UserSession" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "Workspace" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "WorkspaceMember" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "LoginAttempt" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "Warehouse" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "Location" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "StockLedger" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "StockLot" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "StockLayer" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "StockOperation" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "StockOrder" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "OrderLine" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "StockAllocation" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "Product" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "SerialItem" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "ProductUnit" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "ABCSettings" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "ABCProfile" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "ABCRun" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "ABCAssignment" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "OperationalEvent" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "CountRun" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "CountEntry" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "InventoryBalance" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "WarehouseMap" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "PickingPlan" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "TrainingLesson" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "TrainingRound" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "TrainingEvent" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "ResearchForm" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "ResearchResponse" FROM %I', role_name);
   EXECUTE format('REVOKE ALL ON TABLE "WorkspaceDeletion" FROM %I', role_name);
 END IF;
 END LOOP;
END; $$;
COMMIT;
