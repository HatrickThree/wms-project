import { prisma } from "@/lib/db";
import { MovementType, SerialStatus } from "@prisma/client";
import { z } from "zod";
import {
  InboundReceiveSchema,
  OutboundPickSchema,
  TransferSerialSchema,
} from "@/lib/validations/wms.schema";

export class WmsService {
  /**
   * รับสินค้าคุม Serial Number เข้าคลัง (Inbound Receive with ACID Transaction)
   */
  static async receiveSerializedStock(input: z.infer<typeof InboundReceiveSchema>) {
    const data = InboundReceiveSchema.parse(input);

    // ตรวจสอบว่ามี Serial Number ซ้ำกันเองในรายการที่ส่งมาหรือไม่
    const uniqueSerials = Array.from(new Set(data.serialNumbers));
    if (uniqueSerials.length !== data.serialNumbers.length) {
      throw new Error("พบหมายเลข Serial Number ซ้ำกันในรายการที่สแกน");
    }

    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { sku: data.sku },
      });
      if (!product) {
        throw new Error(`ไม่พบรหัสสินค้า SKU: ${data.sku}`);
      }

      const location = await tx.location.findUnique({
        where: { barcode: data.locationBarcode },
      });
      if (!location) {
        throw new Error(`ไม่พบบาร์โค้ดชั้นวาง: ${data.locationBarcode}`);
      }

      // ตรวจสอบว่ามี S/N ใดเคยถูกรับเข้าในระบบแล้วหรือยัง
      const existingSerials = await tx.serialItem.findMany({
        where: { serialNumber: { in: uniqueSerials } },
        select: { serialNumber: true },
      });

      if (existingSerials.length > 0) {
        const dupList = existingSerials.map((s) => s.serialNumber).join(", ");
        throw new Error(`Serial Number เหล่านี้มีอยู่ในระบบแล้ว: ${dupList}`);
      }

      // บันทึก SerialItem รายชิ้นและสร้างสมุดบัญชี StockLedger
      const createdSerials = [];
      for (const sn of uniqueSerials) {
        const serialItem = await tx.serialItem.create({
          data: {
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
            productId: product.id,
            serialItemId: serialItem.id,
            toLocationId: location.id,
            qtyChange: 1,
            movementType: MovementType.INBOUND_RECEIVE,
            referenceDoc: data.referenceDoc,
            performedBy: data.performedBy,
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
  static async pickSerializedStock(input: z.infer<typeof OutboundPickSchema>) {
    const data = OutboundPickSchema.parse(input);

    return await prisma.$transaction(async (tx) => {
      const serialItem = await tx.serialItem.findUnique({
        where: { serialNumber: data.serialNumber },
        include: { product: true, location: true },
      });

      if (!serialItem) {
        throw new Error(`ไม่พบหมายเลข Serial Number: ${data.serialNumber} ในระบบ`);
      }

      if (serialItem.status !== SerialStatus.IN_STOCK && serialItem.status !== SerialStatus.ALLOCATED) {
        throw new Error(
          `ไม่สามารถหยิบ S/N ${data.serialNumber} ได้เนื่องจากสถานะปัจจุบันคือ ${serialItem.status}`
        );
      }

      if (!serialItem.location || serialItem.location.barcode !== data.locationBarcode) {
        throw new Error(
          `ตำแหน่งชั้นวางไม่ตรงกัน! S/N ${data.serialNumber} อยู่ในชั้นวาง ${
            serialItem.location?.barcode ?? "ไม่ระบุ"
          } แต่คุณสแกนชั้นวาง ${data.locationBarcode}`
        );
      }

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
        throw new Error("ยอดคงเหลือในชั้นวางไม่เพียงพอสำหรับการตัดจ่าย");
      }

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { qtyOnHand: { decrement: 1 } },
      });

      // อัปเดตสถานะ Serial Number เป็น SHIPPED และถอดออกจากชั้นวาง
      const updatedSerial = await tx.serialItem.update({
        where: { id: serialItem.id },
        data: {
          status: SerialStatus.SHIPPED,
          locationId: null,
          outboundDocNo: data.outboundDocNo,
          shippedAt: new Date(),
        },
      });

      await tx.stockLedger.create({
        data: {
          productId: serialItem.productId,
          serialItemId: serialItem.id,
          fromLocationId: serialItem.location.id,
          qtyChange: -1,
          movementType: MovementType.OUTBOUND_PICK,
          referenceDoc: data.outboundDocNo,
          performedBy: data.performedBy,
          note: `หยิบจ่าย S/N ${serialItem.serialNumber} ออกจาก ${serialItem.location.barcode}`,
        },
      });

      return {
        serialNumber: updatedSerial.serialNumber,
        sku: serialItem.product.sku,
        productName: serialItem.product.name,
        pickedFromLocation: serialItem.location.barcode,
        outboundDocNo: data.outboundDocNo,
        status: updatedSerial.status,
      };
    });
  }

  /**
   * ย้ายตำแหน่งจัดเก็บราย Serial Number (Putaway / Internal Bin Transfer)
   */
  static async transferSerialLocation(input: z.infer<typeof TransferSerialSchema>) {
    const data = TransferSerialSchema.parse(input);

    return await prisma.$transaction(async (tx) => {
      const serialItem = await tx.serialItem.findUnique({
        where: { serialNumber: data.serialNumber },
        include: { location: true },
      });

      if (!serialItem || serialItem.status !== SerialStatus.IN_STOCK || !serialItem.locationId) {
        throw new Error(`S/N ${data.serialNumber} ไม่อยู่ในสถานะพร้อมย้ายชั้นวาง`);
      }

      const targetLocation = await tx.location.findUnique({
        where: { barcode: data.toLocationBarcode },
      });

      if (!targetLocation) {
        throw new Error(`ไม่พบบาร์โค้ดชั้นวางปลายทาง: ${data.toLocationBarcode}`);
      }

      if (serialItem.locationId === targetLocation.id) {
        throw new Error("ชั้นวางต้นทางและปลายทางเป็นตำแหน่งเดียวกัน");
      }

      // ลดยอดชั้นวางต้นทาง
      await tx.inventoryBalance.update({
        where: {
          productId_locationId: {
            productId: serialItem.productId,
            locationId: serialItem.locationId,
          },
        },
        data: { qtyOnHand: { decrement: 1 } },
      });

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
          productId: serialItem.productId,
          locationId: targetLocation.id,
          qtyOnHand: 1,
        },
      });

      // อัปเดตตำแหน่งของ SerialItem
      await tx.serialItem.update({
        where: { id: serialItem.id },
        data: { locationId: targetLocation.id },
      });

      await tx.stockLedger.create({
        data: {
          productId: serialItem.productId,
          serialItemId: serialItem.id,
          fromLocationId: serialItem.locationId,
          toLocationId: targetLocation.id,
          qtyChange: 1,
          movementType: MovementType.INTERNAL_TRANSFER,
          referenceDoc: data.referenceDoc,
          performedBy: data.performedBy,
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
}
