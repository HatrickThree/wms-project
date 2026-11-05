import { prisma } from "@/lib/db";
import { businessToday } from "@/lib/business-date";

interface Summary {
  products: number;
  locations: number;
  readySerials: bigint;
  units: [string, number][];
  lowCount: number;
  low: {
    sku: string;
    name: string;
    ready: number;
    minStock: number;
    unit: string;
  }[];
}

export async function loadDashboard(workspaceId: string) {
  const today = businessToday();
  const [summary, movements] = await Promise.all([
    prisma.$queryRaw<Summary[]>`
      WITH on_hand AS (
        SELECT "productId", SUM("qtyOnHand") AS quantity
        FROM "InventoryBalance" WHERE "workspaceId"=${workspaceId} GROUP BY "productId"
      ), ready_layers AS (
        SELECT l."productId", SUM(GREATEST(0,l."qtyOnHand"-l."qtyAllocated")) AS quantity
        FROM "StockLayer" l
        JOIN "Product" p ON p.id=l."productId" AND p."workspaceId"=${workspaceId}
        JOIN "Location" loc ON loc.id=l."locationId" AND loc."workspaceId"=${workspaceId}
        LEFT JOIN "StockLot" lot ON lot.id=l."lotId"
        WHERE l."workspaceId"=${workspaceId} AND loc.type IN ('STORAGE','PICKING')
          AND (lot."expiresOn" IS NULL OR lot."expiresOn">=${today})
          AND (p."issuePolicy"<>'FEFO' OR lot."expiresOn" IS NOT NULL)
        GROUP BY l."productId"
      ), ready_serials AS (
        SELECT s."productId", COUNT(*) AS quantity FROM "SerialItem" s
        JOIN "StockLayer" l ON l.id=s."stockLayerId" AND l."workspaceId"=${workspaceId}
        JOIN "Product" p ON p.id=s."productId" AND p."workspaceId"=${workspaceId}
        JOIN "Location" loc ON loc.id=s."locationId" AND loc."workspaceId"=${workspaceId}
        LEFT JOIN "StockLot" lot ON lot.id=l."lotId"
        WHERE s."workspaceId"=${workspaceId} AND s.status='IN_STOCK'
          AND loc.type IN ('STORAGE','PICKING')
          AND (lot."expiresOn" IS NULL OR lot."expiresOn">=${today})
          AND (p."issuePolicy"<>'FEFO' OR lot."expiresOn" IS NOT NULL)
        GROUP BY s."productId"
      ), stock AS (
        SELECT p.sku,p.name,p."baseUom",p."minStock",COALESCE(h.quantity,0) AS on_hand,
          CASE WHEN p."trackSerial" THEN COALESCE(s.quantity,0) ELSE COALESCE(l.quantity,0) END AS ready
        FROM "Product" p LEFT JOIN on_hand h ON h."productId"=p.id
        LEFT JOIN ready_layers l ON l."productId"=p.id
        LEFT JOIN ready_serials s ON s."productId"=p.id WHERE p."workspaceId"=${workspaceId}
      )
      SELECT (SELECT COUNT(*)::int FROM stock) AS products,
        (SELECT COUNT(*)::int FROM "Location" WHERE "workspaceId"=${workspaceId}) AS locations,
        (SELECT COALESCE(SUM(quantity),0)::bigint FROM ready_serials) AS "readySerials",
        (SELECT COALESCE(jsonb_agg(jsonb_build_array(u."baseUom",u.quantity)), '[]'::jsonb)
          FROM (SELECT "baseUom",SUM(on_hand) AS quantity FROM stock GROUP BY "baseUom" ORDER BY "baseUom") u) AS units,
        (SELECT COUNT(*)::int FROM stock WHERE ready<"minStock") AS "lowCount",
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('sku',q.sku,'name',q.name,'ready',q.ready,'minStock',q."minStock",'unit',q."baseUom") ORDER BY q.sku),'[]'::jsonb)
          FROM (SELECT * FROM stock WHERE ready<"minStock" ORDER BY sku LIMIT 8) q) AS low
    `,
    prisma.stockLedger.findMany({
      where: { workspaceId },
      take: 7,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        movementType: true,
        referenceDoc: true,
        qtyChange: true,
        createdAt: true,
        product: { select: { sku: true, name: true, baseUom: true } },
        serialItem: { select: { serialNumber: true } },
      },
    }),
  ]);
  return {
    ...summary[0],
    readySerials: Number(summary[0].readySerials),
    movements,
    updatedAt: new Date(),
  };
}
