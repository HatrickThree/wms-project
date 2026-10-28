import { prisma } from "@/lib/db";
import { SerialStatus } from "@prisma/client";
import type { WorkspaceAccess } from "@/lib/auth";

// Stock mutations use receiving/orders/transfers services with scoped idempotent operations.
export class WmsService {
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
      const locCode =
        item.location?.barcode ??
        (item.status === "SHIPPED"
          ? "OUT-OF-WAREHOUSE (ส่งออกแล้ว)"
          : item.status === "MISSING"
            ? "ตรวจนับไม่พบ (ไม่มีตำแหน่งปัจจุบัน)"
            : "ไม่ระบุตำแหน่งปัจจุบัน");
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
