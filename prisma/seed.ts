import {
  PrismaClient,
  LocationType,
  MovementType,
  SerialStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (
    (await prisma.user.count()) ||
    (await prisma.stockLedger.count()) ||
    (await prisma.inventoryBalance.count())
  )
    throw new Error(
      "Seed requires an empty disposable database; existing users or stock found.",
    );
  console.log("Seeding In-House WMS SQLite database with rich sample data...");
  const workspace = await prisma.workspace.upsert({
    where: { id: "business-main" },
    update: {},
    create: {
      id: "business-main",
      code: "BUSINESS-MAIN",
      name: "พื้นที่ธุรกิจหลัก",
      type: "BUSINESS",
    },
  });

  const warehouse = await prisma.warehouse.upsert({
    where: { workspaceId_code: { workspaceId: workspace.id, code: "WH-MAIN" } },
    update: {},
    create: {
      workspaceId: workspace.id,
      code: "WH-MAIN",
      name: "คลังสินค้ากลาง (In-House Main Warehouse)",
    },
  });

  const locationsData = [
    {
      barcode: "RCV-STAGE-01",
      zone: "RCV",
      aisle: "00",
      rack: "01",
      level: "01",
      type: LocationType.RECEIVING,
    },
    {
      barcode: "A-01-01-01",
      zone: "A",
      aisle: "01",
      rack: "01",
      level: "01",
      type: LocationType.STORAGE,
    },
    {
      barcode: "A-01-02-01",
      zone: "A",
      aisle: "01",
      rack: "02",
      level: "01",
      type: LocationType.STORAGE,
    },
    {
      barcode: "B-02-01-01",
      zone: "B",
      aisle: "02",
      rack: "01",
      level: "01",
      type: LocationType.PICKING,
    },
    {
      barcode: "Q-99-01-01",
      zone: "QUARANTINE",
      aisle: "99",
      rack: "01",
      level: "01",
      type: LocationType.QUARANTINE,
    },
  ];

  const locMap: Record<string, string> = {};
  for (const loc of locationsData) {
    const saved = await prisma.location.upsert({
      where: {
        workspaceId_barcode: {
          workspaceId: workspace.id,
          barcode: loc.barcode,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        warehouseId: warehouse.id,
        ...loc,
      },
    });
    locMap[loc.barcode] = saved.id;
  }

  const productsData = [
    {
      sku: "SCAN-PRO-X1",
      barcode: "8859000100012",
      name: "Industrial Wireless Barcode Scanner X1",
      category: "Scanner",
      baseUom: "PCS",
      minStock: 5,
      trackSerial: true,
    },
    {
      sku: "PDA-HANDHELD-Z9",
      barcode: "8859000100029",
      name: "Android Rugged Handheld Terminal Z9",
      category: "Handheld PDA",
      baseUom: "PCS",
      minStock: 3,
      trackSerial: true,
    },
    {
      sku: "PRN-THERMAL-T4",
      barcode: "8859000100036",
      name: "Thermal Barcode Label Printer 4-Inch",
      category: "Printer",
      baseUom: "PCS",
      minStock: 2,
      trackSerial: true,
    },
  ];

  const prodMap: Record<string, string> = {};
  for (const prod of productsData) {
    const saved = await prisma.product.upsert({
      where: { workspaceId_sku: { workspaceId: workspace.id, sku: prod.sku } },
      update: {},
      create: { ...prod, workspaceId: workspace.id },
    });
    prodMap[prod.sku] = saved.id;
  }

  const serialSeedItems = [
    {
      sn: "SN2610-0001",
      sku: "SCAN-PRO-X1",
      loc: "A-01-01-01",
      status: SerialStatus.IN_STOCK,
      lot: "LOT-2026-10A",
      inDoc: "GRN-202610-001",
      outDoc: null,
    },
    {
      sn: "SN2610-0002",
      sku: "SCAN-PRO-X1",
      loc: "A-01-01-01",
      status: SerialStatus.IN_STOCK,
      lot: "LOT-2026-10A",
      inDoc: "GRN-202610-001",
      outDoc: null,
    },
    {
      sn: "SN2610-0003",
      sku: "SCAN-PRO-X1",
      loc: "A-01-02-01",
      status: SerialStatus.IN_STOCK,
      lot: "LOT-2026-10B",
      inDoc: "GRN-202610-002",
      outDoc: null,
    },
    {
      sn: "SN2610-0004",
      sku: "SCAN-PRO-X1",
      loc: null,
      status: SerialStatus.SHIPPED,
      lot: "LOT-2026-10A",
      inDoc: "GRN-202610-001",
      outDoc: "SO-202610-015",
    },
    {
      sn: "PDA2610-1001",
      sku: "PDA-HANDHELD-Z9",
      loc: "B-02-01-01",
      status: SerialStatus.IN_STOCK,
      lot: "LOT-PDA-01",
      inDoc: "GRN-202610-003",
      outDoc: null,
    },
    {
      sn: "PDA2610-1002",
      sku: "PDA-HANDHELD-Z9",
      loc: "B-02-01-01",
      status: SerialStatus.IN_STOCK,
      lot: "LOT-PDA-01",
      inDoc: "GRN-202610-003",
      outDoc: null,
    },
    {
      sn: "PDA2610-1003",
      sku: "PDA-HANDHELD-Z9",
      loc: "Q-99-01-01",
      status: SerialStatus.RETURNED,
      lot: "LOT-PDA-01",
      inDoc: "GRN-202610-003",
      outDoc: "SO-202610-018",
    },
    {
      sn: "PRN2610-5001",
      sku: "PRN-THERMAL-T4",
      loc: "A-01-02-01",
      status: SerialStatus.IN_STOCK,
      lot: "LOT-PRN-09",
      inDoc: "GRN-202610-004",
      outDoc: null,
    },
  ];

  for (const item of serialSeedItems) {
    const existing = await prisma.serialItem.findUnique({
      where: {
        workspaceId_serialNumber: {
          workspaceId: workspace.id,
          serialNumber: item.sn,
        },
      },
    });
    if (!existing) {
      const created = await prisma.serialItem.create({
        data: {
          workspaceId: workspace.id,
          serialNumber: item.sn,
          productId: prodMap[item.sku],
          locationId: item.loc ? locMap[item.loc] : null,
          status: item.status,
          lotNumber: item.lot,
          inboundDocNo: item.inDoc,
          outboundDocNo: item.outDoc,
          shippedAt: item.status === SerialStatus.SHIPPED ? new Date() : null,
        },
      });

      await prisma.stockLedger.create({
        data: {
          workspaceId: workspace.id,
          productId: prodMap[item.sku],
          serialItemId: created.id,
          toLocationId: item.loc ? locMap[item.loc] : null,
          qtyChange: 1,
          movementType: MovementType.INBOUND_RECEIVE,
          referenceDoc: item.inDoc,
          performedBy: "SYSTEM_SEED",
          note: `รับเข้าตั้งต้น S/N ${item.sn} (Lot: ${item.lot})`,
        },
      });
    }
  }

  // Recompute InventoryBalance from IN_STOCK / ALLOCATED / RETURNED items on locations
  const activeSerials = await prisma.serialItem.findMany({
    where: { workspaceId: workspace.id, locationId: { not: null } },
  });

  const balanceCounts: Record<string, number> = {};
  for (const s of activeSerials) {
    if (!s.locationId) continue;
    const lot = s.lotNumber
      ? await prisma.stockLot.upsert({
          where: {
            productId_number: { productId: s.productId, number: s.lotNumber },
          },
          create: {
            workspaceId: workspace.id,
            productId: s.productId,
            number: s.lotNumber,
          },
          update: {},
        })
      : null;
    const layer = await prisma.stockLayer.create({
      data: {
        workspaceId: workspace.id,
        productId: s.productId,
        locationId: s.locationId,
        lotId: lot?.id,
        referenceDoc: s.inboundDocNo,
        receivedAt: s.receivedAt,
        qtyOnHand: 1,
        qtyAllocated: s.status === "ALLOCATED" ? 1 : 0,
      },
    });
    await prisma.serialItem.update({
      where: { id: s.id },
      data: { stockLayerId: layer.id },
    });
    const key = `${s.productId}::${s.locationId}`;
    balanceCounts[key] = (balanceCounts[key] || 0) + 1;
  }

  for (const [key, count] of Object.entries(balanceCounts)) {
    const [productId, locationId] = key.split("::");
    await prisma.inventoryBalance.upsert({
      where: { productId_locationId: { productId, locationId } },
      update: { qtyOnHand: count },
      create: {
        workspaceId: workspace.id,
        productId,
        locationId,
        qtyOnHand: count,
      },
    });
  }

  console.log("Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
