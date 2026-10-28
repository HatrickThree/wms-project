import assert from "node:assert/strict";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
if (
  process.env.ALLOW_DISPOSABLE_DATABASE !== "1" ||
  !/(test|qa)[^/\\]*\.db$/i.test(process.env.DATABASE_URL || "")
)
  throw new Error("Disposable test database required");
const db = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3004";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const key = () => randomUUID();
const day = (n) =>
  new Date(Date.now() + n * 86400000 + 7 * 3600000).toISOString().slice(0, 10);
function agent() {
  const jar = new Map();
  return {
    async call(
      path,
      { method = "GET", body, status = 200, workspace = "business-main" } = {},
    ) {
      const res = await fetch(base + path, {
        method,
        headers: {
          Origin: base,
          "X-Workspace-Id": workspace,
          Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      for (const v of res.headers.getSetCookie()) {
        const [pair] = v.split(";");
        const i = pair.indexOf("=");
        jar.set(pair.slice(0, i), pair.slice(i + 1));
      }
      const json = await res.json();
      assert.equal(
        res.status,
        status,
        `${method} ${path}: ${JSON.stringify(json)}`,
      );
      return json.data ?? json;
    },
  };
}
const admin = agent(),
  staff = agent();
const ws = "business-main";
try {
  const existingUsers = await db.user.findMany({ select: { username: true } });
  assert.ok(
    existingUsers.length &&
      existingUsers.every((u) => u.username.startsWith("qa.")),
    "Run after stock-workflow on the disposable QA database only",
  );
  assert.equal(await db.countRun.count(), 0);
  assert.equal(await db.aBCRun.count(), 0);
  const password = randomBytes(24).toString("hex"),
    salt = randomBytes(16).toString("hex");
  await db.user.create({
    data: {
      username: "qa.dadmin",
      displayName: "QA Count Administrator",
      role: "ADMIN",
      passwordHash: `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`,
    },
  });
  await admin.call("/api/auth/login", {
    method: "POST",
    body: { username: "qa.dadmin", password },
  });
  await admin.call("/api/workspaces/switch", {
    method: "POST",
    body: { workspaceId: ws },
  });
  const staffPassword = randomBytes(24).toString("hex");
  const staffUser = await admin.call("/api/admin/users", {
    method: "POST",
    status: 201,
    body: {
      username: "qa.dstaff",
      displayName: "QA Counter",
      role: "STAFF",
      password: staffPassword,
    },
  });
  await admin.call(`/api/workspaces/${ws}/members`, {
    method: "POST",
    body: { userId: staffUser.id },
  });
  await staff.call("/api/auth/login", {
    method: "POST",
    body: { username: staffUser.username, password: staffPassword },
  });
  const beforeOps = await db.stockOperation.count(),
    beforeEvents = await db.operationalEvent.count();
  const wh = await admin.call("/api/catalog", {
    method: "POST",
    status: 201,
    body: { kind: "warehouse", code: "D-WH", name: "Phase D QA" },
  });
  const loc = async (barcode, type = "STORAGE") =>
    admin.call("/api/catalog", {
      method: "POST",
      status: 201,
      body: {
        kind: "location",
        warehouseId: wh.id,
        barcode,
        zone: "D",
        aisle: "01",
        rack: "01",
        level: "01",
        type,
      },
    });
  const receiving = await loc("D-RCV", "RECEIVING"),
    one = await loc("D-ONE"),
    two = await loc("D-TWO"),
    quarantine = await loc("D-Q", "QUARANTINE");
  const product = async (sku, extra = {}) =>
    admin.call("/api/catalog", {
      method: "POST",
      status: 201,
      body: {
        kind: "product",
        sku,
        barcode: `BAR-${sku}`,
        name: `Disposable ${sku}`,
        baseUom: "ชิ้น",
        minStock: 0,
        trackSerial: false,
        trackLot: false,
        issuePolicy: "FIFO",
        ...extra,
      },
    });
  const normal = await product("D-NORMAL"),
    serialized = await product("D-SERIAL", { trackSerial: true }),
    b = await product("D-ABC-B"),
    zero = await product("D-ABC-ZERO");
  const pack = await admin.call("/api/catalog/units", {
    method: "POST",
    status: 201,
    body: { productId: normal.id, name: "แพ็ค", factor: 5 },
  });
  const receive = async (p, quantity, extra = {}) =>
    admin.call("/api/receipts", {
      method: "POST",
      body: {
        operationId: key(),
        referenceDoc: `D-R-${key()}`,
        sku: p.sku,
        locationBarcode: one.barcode,
        quantity,
        ...extra,
      },
    });
  const source = await receive(normal, 10, {
    locationBarcode: receiving.barcode,
  });
  const original = await db.stockLayer.findUnique({
    where: { id: source.layerId },
  });
  const putaway = {
    operationId: key(),
    referenceDoc: "D-PUTAWAY",
    layerId: source.layerId,
    fromLocationBarcode: receiving.barcode,
    toLocationBarcode: one.barcode,
    quantity: 2,
    unitId: pack.id,
  };
  const put = await staff.call("/api/transfers", {
    method: "POST",
    body: putaway,
  });
  assert.equal(put.movedCount, 10);
  assert.equal(put.movementType, "PUTAWAY");
  assert.equal(
    (
      await db.stockLayer.findUnique({ where: { id: put.destinationLayerId } })
    ).receivedAt.toISOString(),
    original.receivedAt.toISOString(),
  );
  await staff.call("/api/transfers", { method: "POST", body: putaway });
  assert.equal(
    (
      await db.inventoryBalance.aggregate({
        where: { productId: normal.id },
        _sum: { qtyOnHand: true },
      })
    )._sum.qtyOnHand,
    10,
  );
  const move = await staff.call("/api/transfers", {
    method: "POST",
    body: {
      operationId: key(),
      referenceDoc: "D-TRANSFER",
      layerId: put.destinationLayerId,
      fromLocationBarcode: one.barcode,
      toLocationBarcode: two.barcode,
      quantity: 3,
    },
  });
  assert.equal(move.movementType, "INTERNAL_TRANSFER");
  await staff.call("/api/transfers", {
    method: "POST",
    body: {
      operationId: key(),
      referenceDoc: "D-SAME-LOC",
      layerId: move.destinationLayerId,
      fromLocationBarcode: two.barcode,
      toLocationBarcode: two.barcode,
      quantity: 1,
    },
    status: 400,
  });
  const qLayer = await receive(normal, 1, {
    locationBarcode: quarantine.barcode,
  });
  await staff.call("/api/transfers", {
    method: "POST",
    body: {
      operationId: key(),
      referenceDoc: "D-Q-BLOCK",
      layerId: qLayer.layerId,
      fromLocationBarcode: quarantine.barcode,
      toLocationBarcode: one.barcode,
      quantity: 1,
    },
    status: 400,
  });
  const start = async (p, mode = "SNAPSHOT", who = staff) =>
    who.call("/api/counts", {
      method: "POST",
      status: 201,
      body: {
        operationId: key(),
        number: `D-COUNT-${key()}`,
        productId: p.id,
        mode,
      },
    });
  const detail = (run, who = staff) => who.call(`/api/counts/${run.id}`);
  const countAct = (run, action, extra = {}, status = 200, who = staff) =>
    who.call(`/api/counts/${run.id}`, {
      method: "POST",
      status,
      body: { operationId: key(), action, ...extra },
    });
  let count = await start(normal);
  let blind = await detail(count);
  assert.equal("snapshotJson" in blind, false);
  assert.ok(blind.entries.every((e) => !("expectedQuantity" in e)));
  assert.equal(JSON.stringify(blind).includes("qtyOnHand"), false);
  assert.ok(
    (await detail(count, admin)).entries.every(
      (e) => !("expectedQuantity" in e),
    ),
  );
  await countAct(count, "submit", { confirmComplete: true }, 400);
  const balancesBefore = await db.inventoryBalance.findMany({
    where: { productId: normal.id },
    orderBy: { id: "asc" },
  });
  for (const e of blind.entries) {
    const target =
      e.locationBarcode === one.barcode
        ? 6
        : e.locationBarcode === two.barcode
          ? 5
          : 1;
    await countAct(count, "entry", {
      locationBarcode: e.locationBarcode,
      lotNumber: e.lotNumber,
      expiresOn: e.expiresOn || undefined,
      quantity: e.locationBarcode === two.barcode ? 1 : target,
      unitId: e.locationBarcode === two.barcode ? pack.id : undefined,
      performedBy: "FORGED",
    });
  }
  assert.deepEqual(
    await db.inventoryBalance.findMany({
      where: { productId: normal.id },
      orderBy: { id: "asc" },
    }),
    balancesBefore,
  );
  await countAct(count, "submit", { confirmComplete: true });
  assert.ok(
    (await detail(count)).entries.every((e) => !("expectedQuantity" in e)),
  );
  const review = await detail(count, admin);
  assert.ok(
    review.entries.every((e) => typeof e.expectedQuantity === "number"),
  );
  await countAct(
    count,
    "approve",
    { reason: "เจ้าหน้าที่ไม่มีสิทธิ์อนุมัติ" },
    403,
  );
  const approve = {
    operationId: key(),
    action: "approve",
    reason: "ตรวจนับและทบทวนหลักฐานทุกตำแหน่งแล้ว",
  };
  await admin.call(`/api/counts/${count.id}`, {
    method: "POST",
    body: approve,
  });
  const qtyAfter = (
    await db.inventoryBalance.aggregate({
      where: { productId: normal.id },
      _sum: { qtyOnHand: true },
    })
  )._sum.qtyOnHand;
  assert.equal(qtyAfter, 12);
  await admin.call(`/api/counts/${count.id}`, {
    method: "POST",
    body: approve,
  });
  assert.equal(
    (
      await db.inventoryBalance.aggregate({
        where: { productId: normal.id },
        _sum: { qtyOnHand: true },
      })
    )._sum.qtyOnHand,
    qtyAfter,
  );
  assert.ok(
    (await db.aBCProfile.findUnique({ where: { productId: normal.id } }))
      .lastCountedAt,
  );
  const makeOrder = async (p) =>
    admin.call("/api/orders", {
      method: "POST",
      status: 201,
      body: {
        operationId: key(),
        number: `D-SO-${key()}`,
        lines: [{ productId: p.id, quantity: 1 }],
      },
    });
  const orderAct = (o, action, status = 200) =>
    admin.call(`/api/orders/${o.id}`, {
      method: "POST",
      status,
      body: { operationId: key(), action },
    });
  const stale = await start(normal);
  const staleDetails = await detail(stale);
  const anchor = (
    await db.aBCProfile.findUnique({ where: { productId: normal.id } })
  ).lastCountedAt.toISOString();
  const order = await makeOrder(normal);
  await orderAct(order, "reserve");
  await orderAct(order, "cancel");
  for (const e of staleDetails.entries) {
    const sum = await db.stockLayer.aggregate({
      where: { productId: normal.id, locationId: e.locationId },
      _sum: { qtyOnHand: true },
    });
    await countAct(stale, "entry", {
      locationBarcode: e.locationBarcode,
      lotNumber: e.lotNumber,
      quantity: sum._sum.qtyOnHand,
    });
  }
  await countAct(stale, "submit", { confirmComplete: true });
  const ledgerBeforeStale = await db.stockLedger.count();
  const staleResult = await countAct(
    stale,
    "approve",
    { reason: "พยายามอนุมัติแต่รายการเคยเปลี่ยนระหว่างนับ" },
    200,
    admin,
  );
  assert.equal(staleResult.status, "STALE");
  assert.equal(await db.stockLedger.count(), ledgerBeforeStale);
  assert.equal(
    (
      await db.aBCProfile.findUnique({ where: { productId: normal.id } })
    ).lastCountedAt.toISOString(),
    anchor,
  );
  const locked = await start(normal, "LOCK");
  await admin.call("/api/receipts", {
    method: "POST",
    body: {
      operationId: key(),
      referenceDoc: "D-LOCKED-RCV",
      sku: normal.sku,
      locationBarcode: one.barcode,
      quantity: 1,
    },
    status: 409,
  });
  const lockedOrder = await makeOrder(normal);
  await orderAct(lockedOrder, "reserve", 409);
  await staff.call("/api/transfers", {
    method: "POST",
    body: {
      operationId: key(),
      referenceDoc: "D-LOCKED-MOVE",
      layerId: put.destinationLayerId,
      fromLocationBarcode: one.barcode,
      toLocationBarcode: two.barcode,
      quantity: 1,
    },
    status: 409,
  });
  await countAct(locked, "cancel", { reason: "ยกเลิกเพื่อเปิดทำงานคลังต่อ" });
  await orderAct(lockedOrder, "reserve");
  await orderAct(lockedOrder, "cancel");
  await receive(serialized, 3, {
    serialNumbers: ["D-SN-1", "D-SN-2", "D-SN-3"],
  });
  const serialCount = await start(serialized);
  const serialPlan = await detail(serialCount);
  await countAct(serialCount, "entry", {
    locationBarcode: one.barcode,
    lotNumber: "",
    quantity: 3,
    serialNumbers: ["D-SN-1", "D-SN-2", "D-SN-4"],
  });
  assert.ok(
    !("expectedSerialNumbers" in (await detail(serialCount)).entries[0]),
  );
  await countAct(serialCount, "submit", { confirmComplete: true });
  const serialReview = await detail(serialCount, admin);
  assert.deepEqual(serialReview.entries[0].missingSerialNumbers, ["D-SN-3"]);
  assert.deepEqual(serialReview.entries[0].addedSerialNumbers, ["D-SN-4"]);
  await countAct(
    serialCount,
    "approve",
    { reason: "ตรวจหลักฐานราย Serial ยืนยันหน่วยที่ไม่พบและหน่วยเพิ่ม" },
    200,
    admin,
  );
  assert.equal(
    (
      await db.serialItem.findUnique({
        where: {
          workspaceId_serialNumber: { workspaceId: ws, serialNumber: "D-SN-3" },
        },
      })
    ).status,
    "MISSING",
  );
  assert.equal(
    (
      await db.serialItem.findUnique({
        where: {
          workspaceId_serialNumber: { workspaceId: ws, serialNumber: "D-SN-4" },
        },
      })
    ).inboundDocNo,
    serialCount.number,
  );
  assert.equal(
    (
      await db.inventoryBalance.findUnique({
        where: {
          productId_locationId: {
            productId: serialized.id,
            locationId: one.id,
          },
        },
      })
    ).qtyOnHand,
    3,
  );
  const wrong = await start(serialized);
  await countAct(wrong, "entry", {
    locationBarcode: one.barcode,
    quantity: 3,
    serialNumbers: ["D-SN-1", "D-SN-2", "QA-SN-1"],
  });
  await countAct(wrong, "submit", { confirmComplete: true });
  const beforeBad = await db.stockLedger.count();
  await countAct(
    wrong,
    "approve",
    { reason: "รายการผิด SKU ต้องไม่ทำให้ข้อมูลเปลี่ยน" },
    400,
    admin,
  );
  assert.equal(await db.stockLedger.count(), beforeBad);
  await countAct(wrong, "cancel", {
    reason: "ตรวจ Serial ผิดสินค้า ต้องเริ่มนับใหม่",
  });
  // Synthetic historical documents exist only in this disposable fixture.
  const history = [];
  for (let i = 0; i < 85; i++)
    history.push({
      id: key(),
      workspaceId: ws,
      productId: normal.id,
      qtyChange: -1,
      movementType: "OUTBOUND_PICK",
      referenceDoc: `D-ABC-A-${i}`,
      performedBy: "SYSTEM_QA",
      createdAt: new Date(`${day(-1)}T08:00:00+07:00`),
    });
  for (let i = 0; i < 10; i++)
    history.push({
      id: key(),
      workspaceId: ws,
      productId: b.id,
      qtyChange: -1,
      movementType: "OUTBOUND_PICK",
      referenceDoc: `D-ABC-B-${i}`,
      performedBy: "SYSTEM_QA",
      createdAt: new Date(`${day(-1)}T08:00:00+07:00`),
    });
  history.push(
    { ...history[0], id: key() },
    {
      ...history[0],
      id: key(),
      referenceDoc: "D-ABC-OUTSIDE",
      createdAt: new Date(`${day(-100)}T08:00:00+07:00`),
    },
  );
  await db.stockLedger.createMany({ data: history });
  await db.$executeRaw`INSERT INTO StockLedger(id,workspaceId,productId,qtyChange,movementType,referenceDoc,performedBy,createdAt) VALUES(${key()},${ws},${b.id},-1,'OUTBOUND_PICK','D-ABC-SQL-TIME','SYSTEM_QA',${day(0) + "T05:00:00.000Z"})`;
  const settings = {
    action: "settings",
    operationId: key(),
    windowDays: 90,
    thresholdA: 80,
    thresholdB: 95,
    tieRule: "SKU_ORDER",
    daysA: 7,
    daysB: 30,
    daysC: 90,
  };
  await staff.call("/api/abc", { method: "POST", body: settings, status: 403 });
  await admin.call("/api/abc", { method: "POST", body: settings });
  const beforeABC = await db.inventoryBalance.findMany({
    orderBy: { id: "asc" },
  });
  const analysis = await admin.call("/api/abc", {
    method: "POST",
    body: {
      action: "analyze",
      operationId: key(),
      fromDate: day(-89),
      toDate: day(0),
    },
  });
  const abc = await admin.call(`/api/abc?runId=${analysis.id}`);
  const aItem = abc.items.find((x) => x.productId === normal.id),
    bItem = abc.items.find((x) => x.productId === b.id),
    zItem = abc.items.find((x) => x.productId === zero.id);
  assert.equal(aItem.frequency, 85);
  assert.equal(aItem.recommendedClass, "A");
  assert.equal(bItem.frequency, 11);
  assert.equal(bItem.recommendedClass, "B");
  assert.equal(zItem.frequency, 0);
  assert.equal(zItem.recommendedClass, "C");
  assert.equal(
    (await db.aBCProfile.findUnique({ where: { productId: normal.id } })).class,
    null,
  );
  await admin.call("/api/abc", {
    method: "POST",
    body: {
      action: "confirm",
      operationId: key(),
      runId: analysis.id,
      changes: [
        { productId: normal.id, class: "A" },
        { productId: b.id, class: "C" },
      ],
    },
    status: 400,
  });
  assert.equal(
    (await db.aBCProfile.findUnique({ where: { productId: normal.id } })).class,
    null,
  );
  const confirmation = {
    action: "confirm",
    operationId: key(),
    runId: analysis.id,
    changes: [
      { productId: normal.id, class: "A" },
      { productId: b.id, class: "B" },
      { productId: zero.id, class: "C" },
    ],
  };
  await admin.call("/api/abc", { method: "POST", body: confirmation });
  const assignmentCount = await db.aBCAssignment.count();
  await admin.call("/api/abc", { method: "POST", body: confirmation });
  assert.equal(await db.aBCAssignment.count(), assignmentCount);
  await admin.call("/api/abc", {
    method: "POST",
    body: { ...confirmation, operationId: key() },
    status: 409,
  });
  const classified = await admin.call(`/api/abc?runId=${analysis.id}`);
  assert.equal(
    classified.items.find((x) => x.productId === normal.id).cycleDays,
    7,
  );
  assert.equal(
    classified.items.find((x) => x.productId === normal.id).dueDate,
    day(7),
  );
  assert.equal(
    classified.items.find((x) => x.productId === b.id).dueDate,
    null,
  );
  assert.deepEqual(
    await db.inventoryBalance.findMany({ orderBy: { id: "asc" } }),
    beforeABC,
  );
  const second = await admin.call("/api/abc", {
    method: "POST",
    body: {
      action: "analyze",
      operationId: key(),
      fromDate: day(-89),
      toDate: day(0),
    },
  });
  await admin.call("/api/abc", {
    method: "POST",
    body: {
      action: "confirm",
      operationId: key(),
      runId: second.id,
      changes: [
        {
          productId: normal.id,
          class: "C",
          reason: "ผู้ดูแลกำหนดรอบตรวจนับตามภาระงานที่ทบทวนแล้ว",
        },
      ],
    },
  });
  assert.equal(
    (
      await db.aBCProfile.findUnique({ where: { productId: normal.id } })
    ).lastCountedAt.toISOString(),
    anchor,
  );
  const renamed = await product("D-RENAME");
  const renameRun = await admin.call("/api/abc", {
    method: "POST",
    body: {
      action: "analyze",
      operationId: key(),
      fromDate: day(-89),
      toDate: day(0),
    },
  });
  await admin.call("/api/catalog", {
    method: "PATCH",
    body: { ...renamed, name: "Changed after ABC snapshot" },
  });
  await admin.call("/api/abc", {
    method: "POST",
    body: {
      action: "confirm",
      operationId: key(),
      runId: renameRun.id,
      changes: [{ productId: renamed.id, class: "C" }],
    },
    status: 409,
  });
  const scopeProduct = await product("D-SCOPE-ONLY");
  const audit = await staff.call("/api/activity");
  assert.ok(audit.events.some((e) => e.actor === "qa.dstaff"));
  assert.ok(
    audit.events.every((e) => !("detailsJson" in e) && !("snapshotJson" in e)),
  );
  assert.equal(
    (await db.operationalEvent.count()) - beforeEvents,
    (await db.stockOperation.count()) - beforeOps,
  );
  const beta = await admin.call("/api/workspaces", {
    method: "POST",
    status: 201,
    body: { name: "D Isolated Training", type: "TRAINING" },
  });
  await admin.call("/api/workspaces/switch", {
    method: "POST",
    body: { workspaceId: beta.id },
  });
  await admin.call(`/api/counts/${serialCount.id}`, {
    workspace: beta.id,
    status: 404,
  });
  await admin.call(`/api/abc?runId=${analysis.id}`, {
    workspace: beta.id,
    status: 404,
  });
  await assert.rejects(
    db.aBCProfile.create({
      data: { workspaceId: beta.id, productId: scopeProduct.id, class: "A" },
    }),
  );
  for (const balance of await db.inventoryBalance.findMany()) {
    const sums = await db.stockLayer.aggregate({
      where: { productId: balance.productId, locationId: balance.locationId },
      _sum: { qtyOnHand: true, qtyAllocated: true },
    });
    assert.equal(sums._sum.qtyOnHand, balance.qtyOnHand);
    assert.equal(sums._sum.qtyAllocated, balance.qtyAllocated);
    assert.ok(
      balance.qtyOnHand >= balance.qtyAllocated && balance.qtyAllocated >= 0,
    );
    const p = await db.product.findUnique({ where: { id: balance.productId } });
    if (p.trackSerial)
      assert.equal(
        await db.serialItem.count({
          where: {
            productId: p.id,
            locationId: balance.locationId,
            status: { notIn: ["SHIPPED", "MISSING"] },
          },
        }),
        balance.qtyOnHand,
      );
  }
  console.log(
    "PASS: putaway/transfer conversion, preserved FIFO age, no duplicate transfer, quarantine restriction, blind counts, whole-SKU plans, role approval, count adjustments and serial evidence, missing/new serials, stale-count rejection after reservation/cancellation, SKU locks, document-frequency ABC with legacy timestamps, manual confirmation and stale proposal protection, cycle days, audit actors and workspace isolation; all balances/layers/serials reconcile.",
  );
} finally {
  await db.$disconnect();
}
