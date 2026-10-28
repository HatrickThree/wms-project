import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
if (
  process.env.ALLOW_DISPOSABLE_DATABASE !== "1" ||
  !/(test|qa)[^/\\]*\.db$/i.test(process.env.DATABASE_URL || "")
)
  throw new Error("Disposable test database required");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3004";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const db = new PrismaClient();
const secret = () => randomBytes(20).toString("hex");
const key = () => randomUUID();
function agent() {
  const cookies = new Map();
  return {
    async call(
      path,
      {
        method = "GET",
        body,
        workspace = "business-main",
        status = 200,
        headers = {},
      } = {},
    ) {
      const response = await fetch(base + path, {
        method,
        headers: {
          Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
          Origin: base,
          "X-Workspace-Id": workspace,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      for (const c of response.headers.getSetCookie()) {
        const [pair] = c.split(";");
        const i = pair.indexOf("=");
        cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
      const result = await response.json();
      assert.equal(
        response.status,
        status,
        `${method} ${path}: ${JSON.stringify(result)}`,
      );
      return result.data ?? result;
    },
  };
}
const admin = agent();
const anon = agent();
const workspace = "business-main";
const day = (offset) =>
  new Date(Date.now() + offset * 86400000 + 7 * 3600000)
    .toISOString()
    .slice(0, 10);
try {
  assert.equal(
    await db.user.count(),
    0,
    "Fresh database with no users required; never reset working data",
  );
  await anon.call("/api/stock", { status: 401 });
  const adminPassword = secret();
  const setup = {
    username: "qa.stockadmin",
    displayName: "QA Stock Admin",
    password: adminPassword,
  };
  await anon.call("/api/auth/setup", {
    method: "POST",
    body: setup,
    status: 403,
    headers: { Origin: "https://outside.example" },
  });
  await admin.call("/api/auth/setup", { method: "POST", body: setup });
  await anon.call("/api/auth/setup", {
    method: "POST",
    body: setup,
    status: 409,
  });
  const warehouse = await admin.call("/api/catalog", {
    method: "POST",
    status: 201,
    body: { kind: "warehouse", code: "QA-WH", name: "QA Warehouse" },
  });
  const location = async (barcode, type = "STORAGE") =>
    admin.call("/api/catalog", {
      method: "POST",
      status: 201,
      body: {
        kind: "location",
        warehouseId: warehouse.id,
        barcode,
        zone: "QA",
        aisle: "01",
        rack: "01",
        level: "01",
        type,
      },
    });
  const storage = await location("QA-A");
  const quarantine = await location("QA-Q", "QUARANTINE");
  const makeProduct = async (sku, extra = {}) =>
    admin.call("/api/catalog", {
      method: "POST",
      status: 201,
      body: {
        kind: "product",
        sku,
        barcode: `BAR-${sku}`,
        name: `QA ${sku}`,
        baseUom: "ชิ้น",
        minStock: 0,
        trackSerial: false,
        trackLot: false,
        issuePolicy: "FIFO",
        ...extra,
      },
    });
  const food = await makeProduct("QA-FOOD", {
    trackLot: true,
    issuePolicy: "FEFO",
  });
  const serialProduct = await makeProduct("QA-SERIAL", { trackSerial: true });
  const fifo = await makeProduct("QA-FIFO");
  const box = await admin.call("/api/catalog/units", {
    method: "POST",
    status: 201,
    body: { productId: food.id, name: "กล่อง", factor: 12 },
  });
  const pair = await admin.call("/api/catalog/units", {
    method: "POST",
    status: 201,
    body: { productId: serialProduct.id, name: "แพ็ค", factor: 2 },
  });
  await admin.call("/api/catalog/units", {
    method: "POST",
    body: { productId: food.id, name: "ผิด", factor: 1.5 },
    status: 400,
  });
  const receipt = (p, extra = {}) => ({
    operationId: key(),
    referenceDoc: `QA-GRN-${key()}`,
    sku: p.sku,
    productId: p.id,
    locationBarcode: storage.barcode,
    quantity: 1,
    ...extra,
  });
  await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(food, { lotNumber: "MISSING" }),
    status: 400,
  });
  await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(food, {
      lotNumber: "CROSS",
      expiresOn: day(30),
      unitId: pair.id,
    }),
    status: 400,
  });
  await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(food, {
      productId: "stale-product-id",
      lotNumber: "STALE-MASTER",
      expiresOn: day(30),
    }),
    status: 409,
  });
  const late = receipt(food, {
    quantity: 2,
    unitId: box.id,
    lotNumber: "LATE",
    expiresOn: day(30),
  });
  const lateResult = await admin.call("/api/receipts", {
    method: "POST",
    body: late,
  });
  assert.equal(lateResult.receivedCount, 24);
  assert.deepEqual(
    await admin.call("/api/receipts", { method: "POST", body: late }),
    lateResult,
  );
  await admin.call("/api/receipts", {
    method: "POST",
    body: { ...late, quantity: 3 },
    status: 409,
  });
  await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(food, { lotNumber: "LATE", expiresOn: day(31) }),
    status: 400,
  });
  const early = await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(food, {
      quantity: 5,
      lotNumber: "EARLY",
      expiresOn: day(10),
    }),
  });
  await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(food, {
      quantity: 50,
      lotNumber: "EXPIRED",
      expiresOn: day(-1),
    }),
  });
  await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(food, {
      quantity: 50,
      lotNumber: "QUARANTINE",
      expiresOn: day(5),
      locationBarcode: quarantine.barcode,
    }),
  });
  const serialReceipt = receipt(serialProduct, {
    quantity: 2,
    unitId: pair.id,
    serialNumbers: ["QA-SN-1", "QA-SN-2", "QA-SN-3", "QA-SN-4"],
  });
  await admin.call("/api/receipts", { method: "POST", body: serialReceipt });
  const serialCount = await db.serialItem.count();
  const layerCount = await db.stockLayer.count();
  await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(serialProduct, {
      quantity: 2,
      serialNumbers: ["QA-ROLLBACK", "QA-SN-1"],
    }),
    status: 409,
  });
  assert.equal(await db.serialItem.count(), serialCount);
  assert.equal(await db.stockLayer.count(), layerCount);
  assert.equal(
    await db.serialItem.count({ where: { serialNumber: "QA-ROLLBACK" } }),
    0,
  );
  await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(serialProduct, {
      quantity: 2,
      serialNumbers: ["QA-SAME", "QA-SAME"],
    }),
    status: 400,
  });
  await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(fifo, { quantity: 0.5 }),
    status: 400,
  });
  const create = async (p, quantity, extra = {}) =>
    admin.call("/api/orders", {
      method: "POST",
      status: 201,
      body: {
        operationId: key(),
        number: `QA-SO-${key()}`,
        lines: [{ productId: p.id, quantity, ...extra }],
      },
    });
  const act = (order, action, extra = {}, status = 200, who = admin) =>
    who.call(`/api/orders/${order.id}`, {
      method: "POST",
      body: { operationId: key(), action, ...extra },
      status,
    });
  let order = await create(food, 1, { unitId: box.id });
  assert.equal(order.lines[0].quantity, 12);
  assert.equal(order.lines[0].requestedUom, "กล่อง");
  assert.equal(order.lines[0].conversionFactor, 12);
  const before = await db.inventoryBalance.aggregate({
    where: { productId: food.id },
    _sum: { qtyOnHand: true },
  });
  await act(order, "ship", {}, 409);
  order = await act(order, "reserve");
  assert.equal(order.lines[0].allocations[0].stockLayer.lot.number, "EARLY");
  assert.equal(order.lines[0].allocations[0].quantity, 5);
  assert.equal(order.lines[0].allocations[1].stockLayer.lot.number, "LATE");
  assert.equal(order.lines[0].allocations[1].quantity, 7);
  assert.deepEqual(
    await db.inventoryBalance.aggregate({
      where: { productId: food.id },
      _sum: { qtyOnHand: true },
    }),
    before,
  );
  await act(
    order,
    "pick",
    {
      allocationId: order.lines[0].allocations[0].id,
      locationBarcode: "WRONG",
      quantity: 5,
    },
    400,
  );
  for (const allocation of order.lines[0].allocations)
    order = await act(order, "pick", {
      allocationId: allocation.id,
      locationBarcode: storage.barcode,
      quantity: allocation.quantity,
    });
  assert.equal(order.status, "PICKED");
  assert.deepEqual(
    await db.inventoryBalance.aggregate({
      where: { productId: food.id },
      _sum: { qtyOnHand: true },
    }),
    before,
  );
  const ship = { operationId: key(), action: "ship" };
  order = await admin.call(`/api/orders/${order.id}`, {
    method: "POST",
    body: ship,
  });
  assert.equal(order.status, "SHIPPED");
  await admin.call(`/api/orders/${order.id}`, { method: "POST", body: ship });
  await act(order, "ship", {}, 409);
  const after = await db.inventoryBalance.aggregate({
    where: { productId: food.id },
    _sum: { qtyOnHand: true },
  });
  assert.equal(after._sum.qtyOnHand, before._sum.qtyOnHand - 12);
  const insufficient = await create(food, 18);
  await act(insufficient, "reserve", {}, 400);
  assert.equal(
    await db.stockAllocation.count({
      where: { orderLine: { orderId: insufficient.id } },
    }),
    0,
  );
  const cancelled = await create(food, 2);
  await act(cancelled, "reserve");
  await act(cancelled, "cancel");
  assert.equal(
    (
      await db.inventoryBalance.findUnique({
        where: {
          productId_locationId: { productId: food.id, locationId: storage.id },
        },
      })
    ).qtyAllocated,
    0,
  );
  let serialOrder = await create(serialProduct, 2, { unitId: pair.id });
  serialOrder = await act(serialOrder, "reserve");
  assert.equal(serialOrder.lines[0].allocations.length, 4);
  assert.equal(
    await db.serialItem.count({
      where: { productId: serialProduct.id, status: "ALLOCATED" },
    }),
    4,
  );
  const a = serialOrder.lines[0].allocations[0];
  await act(
    serialOrder,
    "pick",
    {
      allocationId: a.id,
      locationBarcode: storage.barcode,
      quantity: 1,
      serialNumber: "WRONG-SN",
    },
    400,
  );
  await act(serialOrder, "pick", {
    allocationId: a.id,
    locationBarcode: storage.barcode,
    quantity: 1,
    serialNumber: a.serialItem.serialNumber,
  });
  await act(serialOrder, "cancel", {}, 409);
  for (const allocation of serialOrder.lines[0].allocations.slice(1))
    serialOrder = await act(serialOrder, "pick", {
      allocationId: allocation.id,
      locationBarcode: storage.barcode,
      quantity: 1,
      serialNumber: allocation.serialItem.serialNumber,
    });
  await act(serialOrder, "ship");
  assert.equal(
    await db.serialItem.count({
      where: {
        productId: serialProduct.id,
        status: "SHIPPED",
        locationId: null,
      },
    }),
    4,
  );
  await admin.call("/api/outbound", {
    method: "POST",
    body: {
      outboundDocNo: "BYPASS",
      serialNumber: "QA-SN-1",
      locationBarcode: storage.barcode,
    },
    status: 410,
  });
  const old = await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(fifo, { quantity: 1 }),
  });
  const newer = await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(fifo, { quantity: 1 }),
  });
  await db.stockLayer.update({
    where: { id: old.layerId },
    data: { receivedAt: new Date("2020-01-01") },
  });
  await db.stockLayer.update({
    where: { id: newer.layerId },
    data: { receivedAt: new Date("2021-01-01") },
  });
  let fifoOrder = await create(fifo, 1);
  fifoOrder = await act(fifoOrder, "reserve");
  assert.equal(
    fifoOrder.lines[0].allocations[0].stockLayerId ??
      fifoOrder.lines[0].allocations[0].stockLayer.id,
    old.layerId,
  );
  await act(fifoOrder, "cancel");
  const overrideOrder = await create(fifo, 1);
  await act(
    overrideOrder,
    "reserve",
    { preferredLayers: [newer.layerId] },
    400,
  );
  const overrideResult = await act(overrideOrder, "reserve", {
    preferredLayers: [newer.layerId],
    reason: "ตรวจบรรจุภัณฑ์แล้ว ใช้ชุดนี้ตามอนุมัติ",
  });
  assert.equal(
    overrideResult.lines[0].allocations[0].stockLayer.id,
    newer.layerId,
  );
  assert.equal(
    overrideResult.lines[0].allocations[0].overrideBy,
    setup.username,
  );
  await act(overrideOrder, "cancel");
  const expiredOnly = await makeProduct("QA-ONLY-EXPIRED", {
    trackLot: true,
    issuePolicy: "FEFO",
  });
  const expiredLayer = await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(expiredOnly, { lotNumber: "BAD", expiresOn: day(-1) }),
  });
  const blocked = await create(expiredOnly, 1);
  await act(
    blocked,
    "reserve",
    {
      preferredLayers: [expiredLayer.layerId],
      reason: "ไม่สามารถข้ามวันหมดอายุได้",
    },
    400,
  );
  const raceProduct = await makeProduct("QA-RACE");
  await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(raceProduct),
  });
  const racers = [await create(raceProduct, 1), await create(raceProduct, 1)];
  const raced = await Promise.allSettled(racers.map((o) => act(o, "reserve")));
  assert.equal(
    raced.filter((r) => r.status === "fulfilled").length,
    1,
    "Only one order may claim the final unit",
  );
  const winning = await db.stockOrder.findFirst({
    where: { id: { in: racers.map((o) => o.id) }, status: "RESERVED" },
  });
  assert.ok(winning);
  const loser = racers.find((o) => o.id !== winning.id);
  assert.equal(
    await db.stockAllocation.count({
      where: { orderLine: { orderId: loser.id } },
    }),
    0,
  );
  const boundaryProduct = await makeProduct("QA-EXPIRY-BOUNDARY", {
    trackLot: true,
    issuePolicy: "FEFO",
  });
  const boundaryReceipt = await admin.call("/api/receipts", {
    method: "POST",
    body: receipt(boundaryProduct, {
      lotNumber: "BOUNDARY",
      expiresOn: day(1),
    }),
  });
  let boundaryOrder = await create(boundaryProduct, 1);
  boundaryOrder = await act(boundaryOrder, "reserve");
  const ba = boundaryOrder.lines[0].allocations[0];
  await act(boundaryOrder, "pick", {
    allocationId: ba.id,
    locationBarcode: storage.barcode,
    quantity: 1,
  });
  await db.stockLot.update({
    where: { id: ba.stockLayer.lot.id },
    data: { expiresOn: day(-1) },
  });
  await act(boundaryOrder, "ship", {}, 400);
  assert.equal(
    (await db.stockLayer.findUnique({ where: { id: boundaryReceipt.layerId } }))
      .qtyOnHand,
    1,
  );
  const retryProduct = await makeProduct("QA-RETRY");
  const retryReceipt = receipt(retryProduct);
  const retried = await Promise.allSettled([
    admin.call("/api/receipts", { method: "POST", body: retryReceipt }),
    admin.call("/api/receipts", { method: "POST", body: retryReceipt }),
  ]);
  assert.ok(retried.some((r) => r.status === "fulfilled"));
  await admin.call("/api/receipts", { method: "POST", body: retryReceipt });
  assert.equal(
    (
      await db.inventoryBalance.findUnique({
        where: {
          productId_locationId: {
            productId: retryProduct.id,
            locationId: storage.id,
          },
        },
      })
    ).qtyOnHand,
    1,
  );
  const studentPassword = secret();
  const studentUser = await admin.call("/api/admin/users", {
    method: "POST",
    status: 201,
    body: {
      username: "qa.learner",
      displayName: "QA Learner",
      password: studentPassword,
      role: "STUDENT",
    },
  });
  const training = await admin.call("/api/workspaces", {
    method: "POST",
    status: 201,
    body: { name: "QA Separate Training", type: "TRAINING" },
  });
  await admin.call(`/api/workspaces/${training.id}/members`, {
    method: "POST",
    body: { userId: studentUser.id },
  });
  const student = agent();
  await student.call("/api/auth/login", {
    method: "POST",
    body: { username: studentUser.username, password: studentPassword },
  });
  await student.call("/api/workspaces/switch", {
    method: "POST",
    body: { workspaceId: training.id },
  });
  await student.call("/api/catalog", {
    method: "POST",
    workspace: training.id,
    body: { kind: "warehouse", code: "NO", name: "No Access" },
    status: 403,
  });
  await student.call("/api/receipts", {
    method: "POST",
    workspace: training.id,
    body: receipt(fifo),
    status: 403,
  });
  await student.call(`/api/orders/${order.id}`, {
    method: "POST",
    workspace: training.id,
    body: { action: "ship", operationId: key() },
    status: 403,
  });
  await admin.call("/api/workspaces/switch", {
    method: "POST",
    body: { workspaceId: training.id },
  });
  await admin.call("/api/receipts", {
    method: "POST",
    workspace,
    body: receipt(fifo),
    status: 409,
  });
  await admin.call(`/api/orders/${order.id}`, {
    method: "POST",
    workspace: training.id,
    body: { action: "ship", operationId: key() },
    status: 404,
  });
  await assert.rejects(
    db.stockLayer.create({
      data: {
        workspaceId: training.id,
        productId: food.id,
        locationId: storage.id,
        referenceDoc: "CROSS",
        qtyOnHand: 1,
      },
    }),
  );
  await admin.call(`/api/admin/users/${studentUser.id}`, {
    method: "PATCH",
    body: { disabled: true },
  });
  await student.call("/api/stock", { workspace: training.id, status: 401 });
  for (const b of await db.inventoryBalance.findMany()) {
    const sum = await db.stockLayer.aggregate({
      where: { productId: b.productId, locationId: b.locationId },
      _sum: { qtyOnHand: true, qtyAllocated: true },
    });
    assert.equal(sum._sum.qtyOnHand, b.qtyOnHand);
    assert.equal(sum._sum.qtyAllocated, b.qtyAllocated);
    assert.ok(b.qtyOnHand >= b.qtyAllocated && b.qtyAllocated >= 0);
    const p = await db.product.findUnique({ where: { id: b.productId } });
    if (p.trackSerial)
      assert.equal(
        await db.serialItem.count({
          where: {
            productId: b.productId,
            locationId: b.locationId,
            status: { not: "SHIPPED" },
          },
        }),
        b.qtyOnHand,
      );
  }
  console.log(
    "PASS: unit conversions/snapshots, lot/expiry validation, idempotent receipt and shipment, duplicate rollback, FIFO/FEFO, reservations, scan verification, separate picking/shipping, cancellation, override audit, expired/quarantine blocking, competing reservations, workspace isolation and role checks; layer/balance/serial reconciliation.",
  );
} finally {
  await db.$disconnect();
}
