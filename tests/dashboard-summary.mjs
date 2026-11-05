import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "wms-prisma-client";
import { requireDisposableDatabase } from "./disposable-database.mjs";
import { loadDashboard } from "../src/services/dashboard.service.ts";
requireDisposableDatabase();
const db = new PrismaClient();
const workspaceId = "business-main";
const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
try {
  const user = await db.user.findFirst();
  assert.ok(
    user?.username.startsWith("qa."),
    "Run after stock-workflow in disposable QA only",
  );
  const product = await db.product.findFirst({
    where: { workspaceId, trackSerial: false, issuePolicy: "FIFO" },
  });
  const location = await db.location.findFirst({
    where: { workspaceId, type: "STORAGE" },
  });
  assert.ok(product && location);
  // Historical empty layers must not grow the function's summary payload.
  for (let batch = 0; batch < 10; batch++)
    await db.stockLayer.createMany({
      data: Array.from({ length: 500 }, () => ({
        id: randomUUID(),
        workspaceId,
        productId: product.id,
        locationId: location.id,
        referenceDoc: "QA-EMPTY-HISTORY",
        qtyOnHand: 0,
        qtyAllocated: 0,
      })),
    });
  const products = await db.product.findMany({
    where: { workspaceId },
    orderBy: { sku: "asc" },
    include: {
      inventories: true,
      layers: { include: { location: true, lot: true } },
      serialItems: {
        include: { location: true, stockLayer: { include: { lot: true } } },
      },
    },
  });
  const units = new Map();
  let serials = 0;
  const low = [];
  for (const p of products) {
    units.set(
      p.baseUom,
      (units.get(p.baseUom) || 0) +
        p.inventories.reduce((sum, b) => sum + b.qtyOnHand, 0),
    );
    const readySerials = p.serialItems.filter(
      (s) =>
        s.status === "IN_STOCK" &&
        s.stockLayer &&
        s.location &&
        ["STORAGE", "PICKING"].includes(s.location.type) &&
        (!s.stockLayer.lot?.expiresOn || s.stockLayer.lot.expiresOn >= today) &&
        (p.issuePolicy !== "FEFO" || !!s.stockLayer.lot?.expiresOn),
    ).length;
    serials += readySerials;
    const ready = p.trackSerial
      ? readySerials
      : p.layers
          .filter(
            (l) =>
              ["STORAGE", "PICKING"].includes(l.location.type) &&
              (!l.lot?.expiresOn || l.lot.expiresOn >= today) &&
              (p.issuePolicy !== "FEFO" || !!l.lot?.expiresOn),
          )
          .reduce(
            (sum, l) => sum + Math.max(0, l.qtyOnHand - l.qtyAllocated),
            0,
          );
    if (ready < p.minStock)
      low.push({
        sku: p.sku,
        name: p.name,
        unit: p.baseUom,
        minStock: p.minStock,
        ready,
      });
  }
  const result = await loadDashboard(workspaceId);
  assert.equal(result.products, products.length);
  assert.equal(result.readySerials, serials);
  assert.deepEqual([...result.units].sort(), [...units].sort());
  assert.equal(result.lowCount, low.length);
  assert.deepEqual(result.low, low.slice(0, 8));
  assert.ok(result.movements.length <= 7 && result.low.length <= 8);
  const empty = await loadDashboard("qa-missing-workspace");
  assert.equal(empty.products, 0);
  assert.equal(empty.readySerials, 0);
  assert.deepEqual(empty.units, []);
  assert.deepEqual(empty.low, []);
  const oldBytes = Buffer.byteLength(JSON.stringify(products));
  const newBytes = Buffer.byteLength(JSON.stringify(result));
  assert.ok(
    newBytes < oldBytes / 10,
    "Summary should not transfer full layer histories to the function",
  );
  console.log(
    `PASS: dashboard matches reference totals/expiry/FEFO/reservations and empty scope; 5,000 historical layers: reference ${oldBytes} bytes vs summary ${newBytes} bytes`,
  );
} finally {
  await db.$disconnect();
}
