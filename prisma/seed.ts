import { PrismaClient, LocationType, MovementType, SerialStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding In-House WMS database...");

  const warehouse = await prisma.warehouse.upsert({
    where: { code: "WH-MAIN" },
    update: {},
    create: {
      code: "WH-MAIN",
      name: "คลังสินค้ากลาง (In-House Main Warehouse)",
    },
  });

  const rcvLoc = await prisma.location.upsert({
    where: { barcode: "RCV-STAGE-01" },
    update: {},
    create: {
      warehouseId: warehouse.id,
      barcode: "RCV-STAGE-01",
      zone: "RCV",
      aisle: "00",
      rack: "01",
      level: "01",
      type: LocationType.RECEIVING,
    },
  });

  const binA01 = await prisma.location.upsert({
    where: { barcode: "A-01-01-01" },
    update: {},
    create: {
      warehouseId: warehouse.id,
      barcode: "A-01-01-01",
      zone: "A",
      aisle: "01",
      rack: "01",
      level: "01",
      type: LocationType.STORAGE,
    },
  });

  const product = await prisma.product.upsert({
    where: { sku: "SCAN-PRO-X1" },
    update: {},
    create: {
      sku: "SCAN-PRO-X1",
      barcode: "8859000100012",
      name: "Industrial Wireless Barcode Scanner X1",
      category: "Hardware",
      baseUom: "PCS",
      minStock: 5,
      trackSerial: true,
    },
  });

  const sampleSerials = ["SN2610-0001", "SN2610-0002", "SN2610-0003"];
  for (const sn of sampleSerials) {
    const existing = await prisma.serialItem.findUnique({ where: { serialNumber: sn } });
    if (!existing) {
      const serial = await prisma.serialItem.create({
        data: {
          serialNumber: sn,
          productId: product.id,
          locationId: binA01.id,
          status: SerialStatus.IN_STOCK,
          inboundDocNo: "GRN-202610-001",
        },
      });

      await prisma.stockLedger.create({
        data: {
          productId: product.id,
          serialItemId: serial.id,
          toLocationId: binA01.id,
          qtyChange: 1,
          movementType: MovementType.INBOUND_RECEIVE,
          referenceDoc: "GRN-202610-001",
          performedBy: "SYSTEM_SEED",
          note: "Initial seed serial item",
        },
      });
    }
  }

  await prisma.inventoryBalance.upsert({
    where: {
      productId_locationId: {
        productId: product.id,
        locationId: binA01.id,
      },
    },
    update: { qtyOnHand: sampleSerials.length },
    create: {
      productId: product.id,
      locationId: binA01.id,
      qtyOnHand: sampleSerials.length,
    },
  });

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
