import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// This suite creates accounts and training stock. Refuse a working database.
if (process.env.ALLOW_DISPOSABLE_DATABASE !== "1" || !/(?:test|qa)[^/\\]*\.db$/i.test(process.env.DATABASE_URL || "")) {
  throw new Error("Run only against a fresh disposable test/QA database with ALLOW_DISPOSABLE_DATABASE=1.");
}
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3004";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Local test server required");
const db = new PrismaClient();
const password = () => randomBytes(16).toString("hex");
const accounts = {};
function agent() {
  const jar = new Map();
  return {
    jar,
    async call(path, { method = "GET", body, workspace, status = 200, headers = {} } = {}) {
      const cookie = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
      const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...(method !== "GET" ? { Origin: base } : {}), ...(workspace ? { "X-Workspace-Id": workspace } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual" });
      for (const value of response.headers.getSetCookie()) {
        const [pair] = value.split(";"); const separator = pair.indexOf("="); jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
      const result = await response.json();
      assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(result)}`);
      return result.data ?? result;
    },
  };
}

try {
  assert.equal(await db.user.count(), 0, "The test database must have no configured accounts; do not reset a working database");
  const businessId = "business-main";
  const sourceProduct = await db.product.findFirst({ where: { workspaceId: businessId } });
  const sourceLocation = await db.location.findFirst({ where: { workspaceId: businessId, type: "STORAGE" }, include: { warehouse: true } });
  const sourceSerial = await db.serialItem.findFirst({ where: { workspaceId: businessId } });
  assert.ok(sourceProduct && sourceLocation && sourceSerial, "Legacy stock fixtures required");
  const before = await db.inventoryBalance.aggregate({ where: { workspaceId: businessId }, _sum: { qtyOnHand: true, qtyAllocated: true } });
  const anon = agent();
  for (const path of ["/api/inventory", "/api/serials/unknown", "/api/scan/product?code=unknown", "/api/labels/catalog?kind=location", "/api/labels/image?kind=location&id=unknown"]) await anon.call(path, { status: 401 });
  const admin = agent(); const adminPassword = password();
  const setup = { username: "qa.admin", displayName: "QA Administrator", password: adminPassword };
  await anon.call("/api/auth/setup", { method: "POST", body: setup, headers: { Origin: "https://not-allowed.example" }, status: 403 });
  await admin.call("/api/auth/setup", { method: "POST", body: setup });
  assert.ok(admin.jar.get("stockspace_session"), "HttpOnly session cookie returned");
  await anon.call("/api/auth/setup", { method: "POST", body: { ...setup, username: "qa.otheradmin" }, status: 409 });
  for (const [name, role] of [["staff", "STAFF"], ["instructor", "INSTRUCTOR"], ["student", "STUDENT"], ["outsider", "STUDENT"], ["locked", "STAFF"]]) {
    const secret = password();
    const user = await admin.call("/api/admin/users", { method: "POST", body: { username: `qa.${name}`, displayName: `QA ${name}`, password: secret, role }, status: 201 });
    accounts[name] = { ...user, password: secret, agent: agent() };
  }
  const staff = accounts.staff.agent;
  const instructor = accounts.instructor.agent;
  const student = accounts.student.agent;
  const outsider = accounts.outsider.agent;
  await admin.call(`/api/workspaces/${businessId}/members`, { method: "POST", body: { userId: accounts.staff.id } });
  for (const account of Object.values(accounts)) await account.agent.call("/api/auth/login", { method: "POST", body: { username: account.username, password: account.password } });
  await student.call("/api/admin/users", { status: 403 });
  await staff.call("/api/workspaces", { method: "POST", body: { name: "Forbidden", type: "BUSINESS" }, status: 403 });
  await instructor.call("/api/workspaces", { method: "POST", body: { name: "Forbidden", type: "BUSINESS" }, status: 403 });
  const training = await instructor.call("/api/workspaces", { method: "POST", body: { name: "QA Training", type: "TRAINING" }, status: 201 });
  await instructor.call(`/api/workspaces/${training.id}/members`, { method: "POST", body: { username: accounts.student.username } });
  await instructor.call(`/api/workspaces/${training.id}/members`, { method: "POST", body: { userId: accounts.staff.id }, status: 400 });
  await admin.call(`/api/workspaces/${businessId}/members`, { method: "POST", body: { userId: accounts.student.id }, status: 400 });
  await student.call(`/api/workspaces/${training.id}/members`, { status: 403 });
  await outsider.call("/api/workspaces/switch", { method: "POST", body: { workspaceId: training.id }, status: 403 });
  await staff.call("/api/workspaces/switch", { method: "POST", body: { workspaceId: training.id }, status: 403 });
  const visibleToStudent = await student.call("/api/workspaces");
  assert.deepEqual(visibleToStudent.workspaces.map((item) => item.id), [training.id]);
  await student.call("/api/workspaces/switch", { method: "POST", body: { workspaceId: training.id } });
  const empty = await student.call("/api/inventory", { workspace: training.id }); assert.equal(empty.serialItems.length, 0);
  await student.call("/api/inventory", { workspace: businessId, status: 409 });
  const trainingWarehouse = await db.warehouse.create({ data: { workspaceId: training.id, code: sourceLocation.warehouse.code, name: "QA Warehouse" } });
  const trainingLocation = await db.location.create({ data: { workspaceId: training.id, warehouseId: trainingWarehouse.id, barcode: sourceLocation.barcode, zone: "QA", aisle: "01", rack: "01", level: "01", type: "STORAGE" } });
  const trainingProduct = await db.product.create({ data: { workspaceId: training.id, sku: sourceProduct.sku, barcode: sourceProduct.barcode, name: "QA TRAINING ITEM", baseUom: "PCS", trackSerial: true } });
  await student.call("/api/inbound", { method: "POST", workspace: training.id, body: { referenceDoc: "QA-RECEIVE", sku: trainingProduct.sku, locationBarcode: trainingLocation.barcode, serialNumbers: [sourceSerial.serialNumber], performedBy: "FORGED" } });
  const serial = await student.call(`/api/serials/${encodeURIComponent(sourceSerial.serialNumber)}`, { workspace: training.id });
  assert.equal(serial.product.id, trainingProduct.id);
  assert.equal(serial.movements[0].performedBy, accounts.student.username);
  await student.call(`/api/labels/image?kind=product&id=${sourceProduct.id}`, { status: 404 });
  const scan = await student.call(`/api/scan/product?code=${encodeURIComponent(trainingProduct.barcode)}`, { workspace: training.id }); assert.equal(scan.id, trainingProduct.id);
  // A direct cross-workspace relation is rejected even below the API layer.
  await assert.rejects(db.inventoryBalance.create({ data: { workspaceId: training.id, productId: sourceProduct.id, locationId: trainingLocation.id, qtyOnHand: 1 } }));
  const shipBody = { outboundDocNo: "QA-SHIP", locationBarcode: trainingLocation.barcode, serialNumber: sourceSerial.serialNumber, performedBy: "FORGED" };
  await student.call("/api/outbound", { method: "POST", body: shipBody, status: 409 });
  await student.call("/api/outbound", { method: "POST", workspace: training.id, body: shipBody });
  await student.call("/api/outbound", { method: "POST", workspace: training.id, body: shipBody, status: 400 });
  const balance = await db.inventoryBalance.findUnique({ where: { productId_locationId: { productId: trainingProduct.id, locationId: trainingLocation.id } } });
  assert.equal(balance.qtyOnHand, 0);
  const moved = await db.stockLedger.findMany({ where: { workspaceId: training.id } }); assert.equal(moved.length, 2); assert.ok(moved.every((item) => item.performedBy === accounts.student.username));
  const otherBusiness = await admin.call("/api/workspaces", { method: "POST", body: { name: "QA Other Business", type: "BUSINESS" }, status: 201 });
  await admin.call("/api/workspaces/switch", { method: "POST", body: { workspaceId: otherBusiness.id } });
  await admin.call("/api/inbound", { method: "POST", workspace: businessId, body: { referenceDoc: "FORBIDDEN", sku: sourceProduct.sku, locationBarcode: sourceLocation.barcode, serialNumbers: ["QA-SHOULD-NOT-EXIST"] }, status: 409 });
  assert.equal(await db.serialItem.count({ where: { serialNumber: "QA-SHOULD-NOT-EXIST" } }), 0);
  await admin.call(`/api/admin/users/${accounts.student.id}`, { method: "PATCH", body: { disabled: true } });
  await student.call("/api/inventory", { status: 401 });
  const currentAdmin = await db.user.findUnique({ where: { username: "qa.admin" } });
  await admin.call(`/api/admin/users/${currentAdmin.id}`, { method: "PATCH", body: { disabled: true }, status: 400 });
  for (let index = 0; index < 5; index++) await anon.call("/api/auth/login", { method: "POST", body: { username: accounts.locked.username, password: "not-the-password" }, status: 401 });
  await anon.call("/api/auth/login", { method: "POST", body: { username: accounts.locked.username, password: accounts.locked.password }, status: 429 });
  const changedPassword = password(); const oldCookie = staff.jar.get("stockspace_session");
  await staff.call("/api/auth/password", { method: "POST", body: { currentPassword: accounts.staff.password, password: changedPassword } });
  await staff.call("/api/workspaces", { status: 401 });
  await anon.call("/api/workspaces", { headers: { Cookie: `stockspace_session=${oldCookie}` }, status: 401 });
  await staff.call("/api/auth/login", { method: "POST", body: { username: accounts.staff.username, password: changedPassword } });
  await staff.call("/api/auth/logout", { method: "POST" }); await staff.call("/api/workspaces", { status: 401 });
  const after = await db.inventoryBalance.aggregate({ where: { workspaceId: businessId }, _sum: { qtyOnHand: true, qtyAllocated: true } }); assert.deepEqual(after, before);
  assert.ok((await db.user.findMany()).every((user) => user.passwordHash.startsWith("scrypt$") && !Object.values(accounts).some((account) => user.passwordHash.includes(account.password))));
  console.log("PASS: first-admin setup, login/logout, role checks, workspace isolation, trusted actors, stale-tab protection, database scope guards, stock balance, account revocation, password rotation, and login throttling. Legacy business balances unchanged.");
} finally { await db.$disconnect(); }
