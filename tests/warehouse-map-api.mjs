import assert from "node:assert/strict";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
if (
  process.env.ALLOW_DISPOSABLE_DATABASE !== "1" ||
  !/(test|qa)[^/\\]*\.db$/i.test(process.env.DATABASE_URL || "")
)
  throw new Error("Disposable test database required");
const db = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3006";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const key = () => randomUUID();
function agent() {
  const jar = new Map();
  return {
    async call(
      path,
      { method = "GET", body, status = 200, workspace = "business-main" } = {},
    ) {
      const r = await fetch(base + path, {
        method,
        headers: {
          Origin: base,
          "X-Workspace-Id": workspace,
          Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      for (const c of r.headers.getSetCookie()) {
        const [p] = c.split(";");
        const i = p.indexOf("=");
        jar.set(p.slice(0, i), p.slice(i + 1));
      }
      const j = await r.json();
      assert.equal(r.status, status, `${path}: ${JSON.stringify(j)}`);
      return j.data ?? j;
    },
  };
}
const a = agent();
const student = agent();
async function fixture(username, role) {
  const password = randomBytes(24).toString("hex"),
    salt = randomBytes(16).toString("hex");
  const user = await db.user.create({
    data: {
      username,
      displayName: "QA Map",
      role,
      passwordHash: `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`,
    },
  });
  return { user, password };
}
try {
  const users = await db.user.findMany();
  assert.ok(users.length && users.every((u) => u.username.startsWith("qa.")));
  assert.equal(await db.warehouseMap.count(), 0);
  assert.equal(await db.pickingPlan.count(), 0);
  const { user, password } = await fixture("qa.mapadmin", "ADMIN");
  await a.call("/api/auth/login", {
    method: "POST",
    body: { username: user.username, password },
  });
  await a.call("/api/workspaces/switch", {
    method: "POST",
    body: { workspaceId: "business-main" },
  });
  const warehouse = await a.call("/api/catalog", {
    method: "POST",
    status: 201,
    body: { kind: "warehouse", code: "MAP-WH", name: "Map QA" },
  });
  const location = await a.call("/api/catalog", {
    method: "POST",
    status: 201,
    body: {
      kind: "location",
      warehouseId: warehouse.id,
      barcode: "MAP-LOC",
      zone: "M",
      aisle: "1",
      rack: "1",
      level: "1",
      type: "STORAGE",
    },
  });
  const p = await a.call("/api/catalog", {
    method: "POST",
    status: 201,
    body: {
      kind: "product",
      sku: "MAP-SKU",
      barcode: "MAP-BAR",
      name: "Map QA",
      baseUom: "ชิ้น",
      minStock: 0,
      trackSerial: false,
      trackLot: false,
      issuePolicy: "FIFO",
    },
  });
  await a.call("/api/receipts", {
    method: "POST",
    body: {
      operationId: key(),
      referenceDoc: "MAP-RCV",
      sku: p.sku,
      locationBarcode: location.barcode,
      quantity: 10,
    },
  });
  const order = await a.call("/api/orders", {
    method: "POST",
    status: 201,
    body: {
      operationId: key(),
      number: "MAP-ORDER",
      lines: [{ productId: p.id, quantity: 3 }],
    },
  });
  await a.call(`/api/orders/${order.id}`, {
    method: "POST",
    body: { operationId: key(), action: "reserve" },
  });
  const graph = await a.call("/api/maps", {
    method: "POST",
    body: { action: "suggest", warehouseId: warehouse.id },
  });
  const before = await db.inventoryBalance.findMany({
    where: { productId: p.id },
  });
  const save = {
    action: "save",
    operationId: key(),
    warehouseId: warehouse.id,
    expectedVersion: 0,
    graph,
  };
  await a.call("/api/maps", { method: "POST", body: save });
  await a.call("/api/maps", { method: "POST", body: save });
  assert.equal(
    (await db.warehouseMap.findUnique({ where: { warehouseId: warehouse.id } }))
      .version,
    1,
  );
  const command = {
    action: "route",
    operationId: key(),
    warehouseId: warehouse.id,
    orderId: order.id,
    expectedVersion: 1,
  };
  const plan = await a.call("/api/maps", { method: "POST", body: command });
  await a.call("/api/maps", { method: "POST", body: command });
  assert.equal(await db.pickingPlan.count(), 1);
  const view = await a.call(`/api/maps?warehouseId=${warehouse.id}`);
  const history = view.plans.find((h) => h.id === plan.id);
  assert.equal(history.result.stops[0].locationId, location.id);
  assert.equal(history.snapshot.items[0].quantity, 3);
  assert.equal(history.snapshot.orderNumber, "MAP-ORDER");
  const oldSnapshot = history.snapshot;
  await a.call("/api/maps", {
    method: "POST",
    body: {
      ...save,
      operationId: key(),
      expectedVersion: 1,
      graph: { ...graph, metersPerUnit: 2 },
    },
  });
  assert.deepEqual(
    JSON.parse(
      (await db.pickingPlan.findUnique({ where: { id: plan.id } }))
        .snapshotJson,
    ),
    oldSnapshot,
  );
  await a.call("/api/maps", {
    method: "POST",
    body: { ...save, operationId: key() },
    status: 409,
  });
  await a.call("/api/maps", {
    method: "POST",
    body: { ...command, operationId: key() },
    status: 409,
  });
  const otherLoc = await db.location.findFirst({
    where: { warehouseId: { not: warehouse.id }, workspaceId: "business-main" },
  });
  assert.ok(otherLoc);
  await a.call("/api/maps", {
    method: "POST",
    body: {
      ...save,
      operationId: key(),
      expectedVersion: 2,
      graph: {
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.locationId ? { ...n, locationId: otherLoc.id } : n,
        ),
      },
    },
    status: 400,
  });
  const broken = {
    ...graph,
    edges: graph.edges.filter(
      (e) => e.to !== graph.nodes.find((n) => n.locationId).id,
    ),
  };
  await a.call("/api/maps", {
    method: "POST",
    body: { ...save, operationId: key(), expectedVersion: 2, graph: broken },
  });
  await a.call("/api/maps", {
    method: "POST",
    body: { ...command, operationId: key(), expectedVersion: 3 },
    status: 400,
  });
  assert.equal(await db.pickingPlan.count(), 1);
  assert.deepEqual(
    await db.inventoryBalance.findMany({ where: { productId: p.id } }),
    before,
  );
  const training = await a.call("/api/workspaces", {
    method: "POST",
    status: 201,
    body: { name: "Map QA Training", type: "TRAINING" },
  });
  const st = await fixture("qa.mapstudent", "STUDENT");
  await a.call(`/api/workspaces/${training.id}/members`, {
    method: "POST",
    body: { userId: st.user.id },
  });
  await student.call("/api/auth/login", {
    method: "POST",
    body: { username: st.user.username, password: st.password },
  });
  await student.call("/api/workspaces/switch", {
    method: "POST",
    body: { workspaceId: training.id },
  });
  await student.call(`/api/maps?warehouseId=${warehouse.id}`, {
    workspace: training.id,
    status: 403,
  });
  await student.call("/api/maps", {
    method: "POST",
    workspace: training.id,
    body: { ...save, operationId: key() },
    status: 403,
  });
  await student.call("/api/maps", {
    method: "POST",
    workspace: training.id,
    body: { ...command, operationId: key() },
    status: 403,
  });
  await student.call("/api/maps", { workspace: training.id, status: 403 });
  assert.deepEqual(await db.$queryRawUnsafe("PRAGMA foreign_key_check"), []);
  console.log(
    "PASS: scoped maps, role checks, version conflict, retry safety, frozen route snapshots, allocation quantities, unreachable route rejection and no stock changes.",
  );
} finally {
  await db.$disconnect();
}
