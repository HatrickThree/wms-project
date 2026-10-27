import { prisma } from "@/lib/db";
import { MovementType, SerialStatus } from "@prisma/client";
import { z } from "zod";
import type { WorkspaceAccess } from "@/lib/auth";
import { HttpError } from "@/lib/auth";
import {
  InboundReceiveSchema,
  OutboundPickSchema,
  TransferSerialSchema,
} from "@/lib/validations/wms.schema";

export class WmsService {
  /**
   * รับสินค้าคุม Serial Number เข้าคลัง (Inbound Receive with ACID Transaction)
   */
  static async receiveSerializedStock(
    input: z.infer<typeof InboundReceiveSchema>,
    access: WorkspaceAccess,
  ) {
    const data = InboundReceiveSchema.parse(input);

    // ตรวจสอบว่ามี Serial Number ซ้ำกันเองในรายการที่ส่งมาหรือไม่
    const uniqueSerials = Array.from(new Set(data.serialNumbers));
    if (uniqueSerials.length !== data.serialNumbers.length) {
      throw new HttpError(400, "พบหมายเลข Serial Number ซ้ำกันในรายการที่สแกน");
    }

    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: {
          workspaceId_sku: { workspaceId: access.workspace.id, sku: data.sku },
        },
      });
      if (!product) {
        throw new HttpError(400, `ไม่พบรหัสสินค้า SKU: ${data.sku}`);
      }

      const location = await tx.location.findUnique({
        where: {
          workspaceId_barcode: {
            workspaceId: access.workspace.id,
            barcode: data.locationBarcode,
          },
        },
      });
      if (!location) {
        throw new HttpError(
          400,
          `ไม่พบบาร์โค้ดชั้นวาง: ${data.locationBarcode}`,
        );
      }

      // ตรวจสอบว่ามี S/N ใดเคยถูกรับเข้าในระบบแล้วหรือยัง
      const existingSerials = await tx.serialItem.findMany({
        where: {
          workspaceId: access.workspace.id,
          serialNumber: { in: uniqueSerials },
        },
        select: { serialNumber: true },
      });

      if (existingSerials.length > 0) {
        const dupList = existingSerials.map((s) => s.serialNumber).join(", ");
        throw new HttpError(
          400,
          `Serial Number เหล่านี้มีอยู่ในระบบแล้ว: ${dupList}`,
        );
      }

      // บันทึก SerialItem รายชิ้นและสร้างสมุดบัญชี StockLedger
      const createdSerials = [];
      for (const sn of uniqueSerials) {
        const serialItem = await tx.serialItem.create({
          data: {
            workspaceId: access.workspace.id,
            serialNumber: sn,
            productId: product.id,
            locationId: location.id,
            status: SerialStatus.IN_STOCK,
            lotNumber: data.lotNumber,
            inboundDocNo: data.referenceDoc,
          },
        });

        await tx.stockLedger.create({
          data: {
            workspaceId: access.workspace.id,
            productId: product.id,
            serialItemId: serialItem.id,
            toLocationId: location.id,
            qtyChange: 1,
            movementType: MovementType.INBOUND_RECEIVE,
            referenceDoc: data.referenceDoc,
            performedBy: access.user.username,
            note: `รับเข้า S/N ${sn} ที่ชั้นวาง ${location.barcode}`,
          },
        });

        createdSerials.push(serialItem);
      }

      // อัปเดตยอดคงเหลือรวมใน InventoryBalance
      const balance = await tx.inventoryBalance.upsert({
        where: {
          productId_locationId: {
            productId: product.id,
            locationId: location.id,
          },
        },
        update: {
          qtyOnHand: { increment: uniqueSerials.length },
        },
        create: {
          workspaceId: access.workspace.id,
          productId: product.id,
          locationId: location.id,
          qtyOnHand: uniqueSerials.length,
        },
      });

      return {
        receivedCount: createdSerials.length,
        productSku: product.sku,
        locationBarcode: location.barcode,
        newQtyOnHand: balance.qtyOnHand,
      };
    });
  }

  /**
   * สแกนหยิบและตัดจ่ายสินค้าตามหมายเลข Serial Number (Outbound Pick Verification)
   */
  static async pickSerializedStock(
    input: z.infer<typeof OutboundPickSchema>,
    access: WorkspaceAccess,
  ) {
    const data = OutboundPickSchema.parse(input);

    return await prisma.$transaction(async (tx) => {
      const serialItem = await tx.serialItem.findUnique({
        where: {
          workspaceId_serialNumber: {
            workspaceId: access.workspace.id,
            serialNumber: data.serialNumber,
          },
        },
        include: { product: true, location: true },
      });

      if (!serialItem) {
        throw new HttpError(
          400,
          `ไม่พบหมายเลข Serial Number: ${data.serialNumber} ในระบบ`,
        );
      }

      if (
        serialItem.status !== SerialStatus.IN_STOCK &&
        serialItem.status !== SerialStatus.ALLOCATED
      ) {
        throw new HttpError(
          400,
          `ไม่สามารถหยิบ S/N ${data.serialNumber} ได้เนื่องจากสถานะปัจจุบันคือ ${serialItem.status}`,
        );
      }

      if (
        !serialItem.location ||
        serialItem.location.barcode !== data.locationBarcode
      ) {
        throw new HttpError(
          400,
          `ตำแหน่งชั้นวางไม่ตรงกัน! S/N ${data.serialNumber} อยู่ในชั้นวาง ${
            serialItem.location?.barcode ?? "ไม่ระบุ"
          } แต่คุณสแกนชั้นวาง ${data.locationBarcode}`,
        );
      }

      if (serialItem.location.type === "QUARANTINE")
        throw new HttpError(
          400,
          "สินค้าอยู่ในพื้นที่กักกัน ไม่สามารถจ่ายออกได้",
        );

      // หักยอดคงเหลือบนชั้นวางพร้อมป้องกันสต็อกติดลบ
      const balance = await tx.inventoryBalance.findUnique({
        where: {
          productId_locationId: {
            productId: serialItem.productId,
            locationId: serialItem.location.id,
          },
        },
      });

      if (!balance || balance.qtyOnHand < 1) {
        throw new HttpError(
          400,
          "ยอดคงเหลือในชั้นวางไม่เพียงพอสำหรับการตัดจ่าย",
        );
      }

      const claimed = await tx.inventoryBalance.updateMany({
        where: {
          id: balance.id,
          workspaceId: access.workspace.id,
          ...(serialItem.status === "ALLOCATED"
            ? { qtyOnHand: { gte: 1 }, qtyAllocated: { gte: 1 } }
            : {
                qtyOnHand: { gt: prisma.inventoryBalance.fields.qtyAllocated },
              }),
        },
        data: {
          qtyOnHand: { decrement: 1 },
          ...(serialItem.status === "ALLOCATED"
            ? { qtyAllocated: { decrement: 1 } }
            : {}),
        },
      });
      if (claimed.count !== 1)
        throw new HttpError(
          409,
          "ยอดคงเหลือหรือยอดจองเปลี่ยนไป กรุณาตรวจข้อมูลล่าสุด",
        );

      // อัปเดตสถานะ Serial Number เป็น SHIPPED และถอดออกจากชั้นวาง
      const changed = await tx.serialItem.updateMany({
        where: {
          id: serialItem.id,
          workspaceId: access.workspace.id,
          status: serialItem.status,
          locationId: serialItem.location.id,
        },
        data: {
          status: SerialStatus.SHIPPED,
          locationId: null,
          outboundDocNo: data.outboundDocNo,
          shippedAt: new Date(),
        },
      });
      if (changed.count !== 1)
        throw new HttpError(
          409,
          "Serial ถูกทำรายการไปแล้ว กรุณาตรวจข้อมูลล่าสุด",
        );

      await tx.stockLedger.create({
        data: {
          workspaceId: access.workspace.id,
          productId: serialItem.productId,
          serialItemId: serialItem.id,
          fromLocationId: serialItem.location.id,
          qtyChange: -1,
          movementType: MovementType.OUTBOUND_PICK,
          referenceDoc: data.outboundDocNo,
          performedBy: access.user.username,
          note: `หยิบจ่าย S/N ${serialItem.serialNumber} ออกจาก ${serialItem.location.barcode}`,
        },
      });

      return {
        serialNumber: serialItem.serialNumber,
        sku: serialItem.product.sku,
        productName: serialItem.product.name,
        pickedFromLocation: serialItem.location.barcode,
        outboundDocNo: data.outboundDocNo,
        status: SerialStatus.SHIPPED,
      };
    });
  }

  /**
   * ย้ายตำแหน่งจัดเก็บราย Serial Number (Putaway / Internal Bin Transfer)
   */
  static async transferSerialLocation(
    input: z.infer<typeof TransferSerialSchema>,
    access: WorkspaceAccess,
  ) {
    const data = TransferSerialSchema.parse(input);

    return await prisma.$transaction(async (tx) => {
      const serialItem = await tx.serialItem.findUnique({
        where: {
          workspaceId_serialNumber: {
            workspaceId: access.workspace.id,
            serialNumber: data.serialNumber,
          },
        },
        include: { location: true },
      });

      if (
        !serialItem ||
        serialItem.status !== SerialStatus.IN_STOCK ||
        !serialItem.locationId
      ) {
        throw new HttpError(
          400,
          `S/N ${data.serialNumber} ไม่อยู่ในสถานะพร้อมย้ายชั้นวาง`,
        );
      }

      const targetLocation = await tx.location.findUnique({
        where: {
          workspaceId_barcode: {
            workspaceId: access.workspace.id,
            barcode: data.toLocationBarcode,
          },
        },
      });

      if (!targetLocation) {
        throw new HttpError(
          400,
          `ไม่พบบาร์โค้ดชั้นวางปลายทาง: ${data.toLocationBarcode}`,
        );
      }

      if (serialItem.locationId === targetLocation.id) {
        throw new HttpError(400, "ชั้นวางต้นทางและปลายทางเป็นตำแหน่งเดียวกัน");
      }

      // ลดยอดชั้นวางต้นทาง
      const claimed = await tx.inventoryBalance.updateMany({
        where: {
          workspaceId: access.workspace.id,
          productId: serialItem.productId,
          locationId: serialItem.locationId,
          qtyOnHand: { gt: prisma.inventoryBalance.fields.qtyAllocated },
        },
        data: { qtyOnHand: { decrement: 1 } },
      });
      if (claimed.count !== 1)
        throw new HttpError(
          409,
          "ยอดต้นทางไม่เพียงพอหรือเปลี่ยนไป กรุณาตรวจข้อมูลล่าสุด",
        );

      // เพิ่มยอดชั้นวางปลายทาง
      await tx.inventoryBalance.upsert({
        where: {
          productId_locationId: {
            productId: serialItem.productId,
            locationId: targetLocation.id,
          },
        },
        update: { qtyOnHand: { increment: 1 } },
        create: {
          workspaceId: access.workspace.id,
          productId: serialItem.productId,
          locationId: targetLocation.id,
          qtyOnHand: 1,
        },
      });

      // อัปเดตตำแหน่งของ SerialItem
      const moved = await tx.serialItem.updateMany({
        where: {
          id: serialItem.id,
          workspaceId: access.workspace.id,
          status: "IN_STOCK",
          locationId: serialItem.locationId,
        },
        data: { locationId: targetLocation.id },
      });
      if (moved.count !== 1)
        throw new HttpError(409, "Serial ถูกย้ายไปแล้ว กรุณาตรวจข้อมูลล่าสุด");

      await tx.stockLedger.create({
        data: {
          workspaceId: access.workspace.id,
          productId: serialItem.productId,
          serialItemId: serialItem.id,
          fromLocationId: serialItem.locationId,
          toLocationId: targetLocation.id,
          qtyChange: 1,
          movementType: MovementType.INTERNAL_TRANSFER,
          referenceDoc: data.referenceDoc,
          performedBy: access.user.username,
          note: `ย้าย S/N ${data.serialNumber} ไปยัง ${targetLocation.barcode}`,
        },
      });

      return {
        serialNumber: data.serialNumber,
        fromLocation: serialItem.location?.barcode,
        toLocation: targetLocation.barcode,
      };
    });
  }

  /**
   * ค้นหาคลังสินค้าแบบละเอียด (รองรับกรณีไม่ทราบหมายเลข Serial Number)
   * กรองได้ตามคำค้นหา (SKU/ชื่อสินค้า/บาร์โค้ด/บางส่วนของ S/N), หมวดหมู่, โซนคลัง, ชั้นวาง, สถานะ S/N, เลขที่เอกสารรับเข้า/จ่ายออก, Lot, และช่วงวันที่รับเข้า
   */
  static async searchWarehouseInventory(
    filters: {
      keyword?: string;
      category?: string;
      zone?: string;
      locationBarcode?: string;
      status?: string;
      docNo?: string;
      lotNumber?: string;
      dateFrom?: string;
      dateTo?: string;
    },
    access: WorkspaceAccess,
  ) {
    const whereClause: Record<string, unknown> = {
      workspaceId: access.workspace.id,
    };

    if (filters.status && filters.status !== "ALL") {
      whereClause.status = filters.status;
    }

    if (filters.lotNumber?.trim()) {
      whereClause.lotNumber = { contains: filters.lotNumber.trim() };
    }

    if (filters.docNo?.trim()) {
      const doc = filters.docNo.trim();
      whereClause.OR = [
        { inboundDocNo: { contains: doc } },
        { outboundDocNo: { contains: doc } },
      ];
    }

    if (filters.dateFrom || filters.dateTo) {
      const receivedAtFilter: Record<string, Date> = {};
      if (filters.dateFrom) {
        receivedAtFilter.gte = new Date(
          `${filters.dateFrom}T00:00:00.000+07:00`,
        );
      }
      if (filters.dateTo) {
        receivedAtFilter.lte = new Date(`${filters.dateTo}T23:59:59.999+07:00`);
      }
      whereClause.receivedAt = receivedAtFilter;
    }

    const productFilter: Record<string, unknown> = {};
    if (filters.category && filters.category !== "ALL") {
      productFilter.category = filters.category;
    }

    const locationFilter: Record<string, unknown> = {};
    if (filters.zone && filters.zone !== "ALL") {
      locationFilter.zone = filters.zone;
    }
    if (filters.locationBarcode && filters.locationBarcode !== "ALL") {
      locationFilter.barcode = { contains: filters.locationBarcode.trim() };
    }

    if (Object.keys(productFilter).length > 0) {
      whereClause.product = productFilter;
    }
    if (Object.keys(locationFilter).length > 0) {
      whereClause.location = locationFilter;
    }

    if (filters.keyword?.trim()) {
      const kw = filters.keyword.trim();
      const kwConditions = [
        { serialNumber: { contains: kw } },
        { lotNumber: { contains: kw } },
        { inboundDocNo: { contains: kw } },
        { outboundDocNo: { contains: kw } },
        { product: { sku: { contains: kw } } },
        { product: { name: { contains: kw } } },
        { product: { barcode: { contains: kw } } },
        { location: { barcode: { contains: kw } } },
      ];

      if (whereClause.OR) {
        whereClause.AND = [{ OR: whereClause.OR }, { OR: kwConditions }];
        delete whereClause.OR;
      } else {
        whereClause.OR = kwConditions;
      }
    }

    const serialItems = await prisma.serialItem.findMany({
      where: whereClause,
      include: {
        product: true,
        location: true,
      },
      orderBy: [{ receivedAt: "desc" }, { serialNumber: "asc" }],
      take: 300,
    });

    // สรุปยอดคงเหลือแยกตาม รุ่นสินค้า (SKU) + ชั้นวาง (Location) จากผลลัพธ์ที่กรองได้
    const groupedMap = new Map<
      string,
      {
        sku: string;
        productName: string;
        category: string;
        locationBarcode: string;
        zone: string;
        locationType: string;
        inStockCount: number;
        totalMatchedCount: number;
        serialNumbers: Array<{
          serialNumber: string;
          status: string;
          lotNumber: string | null;
          inboundDocNo: string;
          receivedAt: Date;
        }>;
      }
    >();

    for (const item of serialItems) {
      const locCode = item.location?.barcode ?? "OUT-OF-WAREHOUSE (ส่งออกแล้ว)";
      const key = `${item.product.sku}@@${locCode}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          sku: item.product.sku,
          productName: item.product.name,
          category: item.product.category ?? "General",
          locationBarcode: locCode,
          zone: item.location?.zone ?? "-",
          locationType: item.location?.type ?? "-",
          inStockCount: 0,
          totalMatchedCount: 0,
          serialNumbers: [],
        });
      }
      const group = groupedMap.get(key)!;
      group.totalMatchedCount += 1;
      if (item.status === SerialStatus.IN_STOCK) {
        group.inStockCount += 1;
      }
      group.serialNumbers.push({
        serialNumber: item.serialNumber,
        status: item.status,
        lotNumber: item.lotNumber,
        inboundDocNo: item.inboundDocNo,
        receivedAt: item.receivedAt,
      });
    }

    // ดึงตัวเลือกสำหรับ Dropdown Filter (Categories, Zones, Locations)
    const [allProducts, allLocations] = await Promise.all([
      prisma.product.findMany({
        where: { workspaceId: access.workspace.id },
        select: { category: true, sku: true, name: true },
      }),
      prisma.location.findMany({
        where: { workspaceId: access.workspace.id },
        select: { zone: true, barcode: true },
        orderBy: { barcode: "asc" },
      }),
    ]);

    const categories = Array.from(
      new Set(allProducts.map((p) => p.category).filter(Boolean)),
    ) as string[];
    const zones = Array.from(new Set(allLocations.map((l) => l.zone)));
    const locationBarcodes = allLocations.map((l) => l.barcode);

    return {
      serialItems,
      groupedSummary: Array.from(groupedMap.values()),
      filterOptions: {
        categories,
        zones,
        locationBarcodes,
      },
    };
  }
}
