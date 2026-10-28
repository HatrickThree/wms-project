import assert from "node:assert/strict";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
if (
  process.env.ALLOW_DISPOSABLE_DATABASE !== "1" ||
  !/(test|qa)[^/\\]*\.db$/i.test(process.env.DATABASE_URL || "")
)
  throw new Error("Disposable database required");
const db = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3006";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const key = () => randomUUID();
function agent() {
  const jar = new Map();
  return {
    async call(
      path,
      {
        method = "GET",
        body,
        status = 200,
        workspace = "business-main",
        csv = false,
      } = {},
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
      if (csv) {
        const text = await r.text();
        assert.equal(r.status, status, text);
        return text;
      }
      const j = await r.json();
      assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(j)}`);
      return j.data ?? j;
    },
  };
}
const admin = agent(),
  teacher = agent(),
  s1 = agent(),
  s2 = agent();
let source,
  students,
  templateBalances,
  fixtureGuardsChecked = false;
async function fixture(username, role) {
  const password = randomBytes(24).toString("hex"),
    salt = randomBytes(16).toString("hex");
  const user = await db.user.create({
    data: {
      username,
      displayName: `Test ${username}`,
      role,
      passwordHash: `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`,
    },
  });
  return { user, password };
}
async function login(agent, f) {
  await agent.call("/api/auth/login", {
    method: "POST",
    body: { username: f.user.username, password: f.password },
  });
}
async function switchTo(a, workspaceId) {
  await a.call("/api/workspaces/switch", {
    method: "POST",
    body: { workspaceId },
  });
}
async function command(a, workspace, body, status = 200) {
  return a.call("/api/training", {
    method: "POST",
    workspace,
    body: { operationId: key(), ...body },
    status,
  });
}
async function lesson(config, title = "QA lesson") {
  const l = await command(teacher, source.id, {
    action: "save",
    title,
    config,
  });
  let view = await teacher.call("/api/training", { workspace: source.id });
  const item = view.lessons.find((x) => x.id === l.id);
  await command(teacher, source.id, { action: "publish", lessonId: l.id }, 409);
  await command(
    teacher,
    source.id,
    {
      action: "approve",
      lessonId: l.id,
      acknowledge: true,
      expectedConfigHash: "0".repeat(64),
    },
    409,
  );
  await command(teacher, source.id, {
    action: "approve",
    lessonId: l.id,
    acknowledge: true,
    expectedConfigHash: item.configHash,
  });
  if (!fixtureGuardsChecked) {
    const balance = await db.inventoryBalance.findFirst({
      where: { workspaceId: source.id, qtyOnHand: { gt: 0 } },
    });
    const count = await teacher.call("/api/counts", {
      method: "POST",
      workspace: source.id,
      status: 201,
      body: {
        operationId: key(),
        productId: balance.productId,
        number: "QA-TEMPLATE-CHECK",
        mode: "SNAPSHOT",
      },
    });
    await command(
      teacher,
      source.id,
      { action: "publish", lessonId: l.id },
      409,
    );
    await teacher.call(`/api/counts/${count.id}`, {
      method: "POST",
      workspace: source.id,
      body: {
        operationId: key(),
        action: "cancel",
        reason: "Close template QA count before publishing",
      },
    });
    await db.inventoryBalance.update({
      where: { id: balance.id },
      data: { qtyOnHand: { increment: 1 } },
    });
    await command(
      teacher,
      source.id,
      { action: "publish", lessonId: l.id },
      409,
    );
    await db.inventoryBalance.update({
      where: { id: balance.id },
      data: { qtyOnHand: { decrement: 1 } },
    });
    templateBalances = await db.inventoryBalance.findMany({
      where: { workspaceId: source.id },
      orderBy: { id: "asc" },
    });
    fixtureGuardsChecked = true;
  }
  const publish = { action: "publish", lessonId: l.id, operationId: key() };
  const result = await command(teacher, source.id, publish);
  assert.deepEqual(await command(teacher, source.id, publish), result);
  return result;
}
try {
  const users = await db.user.findMany();
  assert.ok(users.length && users.every((u) => u.username.startsWith("qa.")));
  assert.equal(await db.trainingLesson.count(), 0);
  assert.equal(await db.researchForm.count(), 0);
  const fa = await fixture("qa.learnadmin", "ADMIN"),
    ft = await fixture("qa.teacher", "INSTRUCTOR"),
    f1 = await fixture("qa.learner1", "STUDENT"),
    f2 = await fixture("qa.learner2", "STUDENT");
  students = [f1.user, f2.user];
  await login(admin, fa);
  await login(teacher, ft);
  await login(s1, f1);
  await login(s2, f2);
  source = await admin.call("/api/workspaces", {
    method: "POST",
    status: 201,
    body: { name: "QA Learning Template", type: "TRAINING" },
  });
  for (const user of [ft.user, ...students])
    await admin.call(`/api/workspaces/${source.id}/members`, {
      method: "POST",
      body: { userId: user.id },
    });
  await switchTo(teacher, source.id);
  const post = (path, body, status = 201) =>
    teacher.call(path, { method: "POST", workspace: source.id, body, status });
  const wh = await post("/api/catalog", {
    kind: "warehouse",
    code: "LEARN-WH",
    name: "Learning QA",
  });
  const storage = await post("/api/catalog", {
    kind: "location",
    warehouseId: wh.id,
    barcode: "LEARN-A",
    zone: "L",
    aisle: "1",
    rack: "1",
    level: "1",
    type: "STORAGE",
  });
  const receiving = await post("/api/catalog", {
    kind: "location",
    warehouseId: wh.id,
    barcode: "LEARN-R",
    zone: "L",
    aisle: "1",
    rack: "2",
    level: "1",
    type: "RECEIVING",
  });
  const product = async (sku, trackSerial) =>
    post("/api/catalog", {
      kind: "product",
      sku,
      barcode: `BAR-${sku}`,
      name: `QA ${sku}`,
      baseUom: "ชิ้น",
      minStock: 0,
      trackSerial,
      trackLot: false,
      issuePolicy: "FIFO",
    });
  const p = await product("LEARN-NORMAL", false),
    serial = await product("LEARN-SERIAL", true);
  await post("/api/catalog/units", {
    productId: p.id,
    name: "แพ็ค",
    factor: 5,
  });
  await post(
    "/api/receipts",
    {
      operationId: key(),
      sku: p.sku,
      productId: p.id,
      quantity: 10,
      locationBarcode: storage.barcode,
      referenceDoc: "LEARN-OPEN",
    },
    200,
  );
  await post(
    "/api/receipts",
    {
      operationId: key(),
      sku: serial.sku,
      productId: serial.id,
      quantity: 2,
      serialNumbers: ["LEARN-SN1", "LEARN-SN2"],
      locationBarcode: receiving.barcode,
      referenceDoc: "LEARN-SERIAL-OPEN",
    },
    200,
  );
  const graph = await post(
    "/api/maps",
    { action: "suggest", warehouseId: wh.id },
    200,
  );
  await post(
    "/api/maps",
    {
      action: "save",
      operationId: key(),
      warehouseId: wh.id,
      expectedVersion: 0,
      graph,
    },
    200,
  );
  templateBalances = await db.inventoryBalance.findMany({
    where: { workspaceId: source.id },
    orderBy: { id: "asc" },
  });
  const criteria = [
    {
      id: "criterion-reconcile",
      unitCode: "LOG-EYPL-778A",
      description: "ตรวจนับและอธิบายผลต่างตามหลักฐานของโจทย์",
      method: "OBSERVATION",
      required: true,
    },
  ];
  const config = {
    task: "COUNT",
    scenario: "SHORTAGE",
    mode: "TEAM",
    seed: "CLASS-2026-01",
    sameSeed: true,
    instructions:
      "ตรวจนับสินค้าทุก SKU จากชั้นจำลอง ส่งผลนับและอธิบายผลต่างรายบุคคล",
    groups: [{ name: "Team One", userIds: students.map((u) => u.id) }],
    criteria,
  };
  const published = await lesson(config);
  assert.equal(published.rounds.length, 1);
  const round = published.rounds[0];
  assert.equal(await db.trainingRound.count(), 1);
  const rawRound = await db.trainingRound.findUnique({
    where: { id: round.id },
  });
  const truth = JSON.parse(rawRound.truthJson);
  assert.equal(truth.reduce((n, r) => n + r.quantity, 0) < 12, true);
  const cloned = await db.product.findMany({
    where: { workspaceId: round.workspaceId },
  });
  assert.equal(cloned.length, 2);
  assert.equal(
    await db.productUnit.count({ where: { workspaceId: round.workspaceId } }),
    1,
  );
  assert.equal(
    await db.serialItem.count({ where: { workspaceId: round.workspaceId } }),
    2,
  );
  await switchTo(s1, round.workspaceId);
  await switchTo(s2, round.workspaceId);
  let d = await s1.call("/api/training", { workspace: round.workspaceId });
  assert.equal(d.round.truth, undefined);
  assert.equal(d.round.status, "READY");
  await s1.call("/api/receipts", {
    method: "POST",
    workspace: round.workspaceId,
    body: {},
    status: 403,
  });
  const start = { action: "start", operationId: key() };
  await command(s1, round.workspaceId, start);
  await command(s1, round.workspaceId, start);
  await s1.call("/api/stock", { workspace: round.workspaceId, status: 403 });
  await s1.call("/api/inventory", {
    workspace: round.workspaceId,
    status: 403,
  });
  await s1.call("/api/labels/catalog", {
    workspace: round.workspaceId,
    status: 403,
  });
  const childP = cloned.find((x) => x.sku === p.sku);
  await s1.call("/api/receipts", {
    method: "POST",
    workspace: round.workspaceId,
    body: {
      operationId: key(),
      sku: p.sku,
      quantity: 1,
      locationBarcode: storage.barcode,
      referenceDoc: "FORBIDDEN",
    },
    status: 403,
  });
  await command(s1, round.workspaceId, { action: "submit" }, 409);
  for (const cp of cloned) {
    const count = await s1.call("/api/counts", {
      method: "POST",
      workspace: round.workspaceId,
      status: 201,
      body: {
        operationId: key(),
        number: `LEARN-COUNT-${cp.sku}`,
        productId: cp.id,
        mode: "SNAPSHOT",
      },
    });
    const detail = await s2.call(`/api/counts/${count.id}`, {
      workspace: round.workspaceId,
    });
    assert.equal(detail.entries[0].expectedQuantity, undefined);
    for (const entry of detail.entries) {
      const physical = truth.find(
        (x) =>
          x.productId === cp.id &&
          x.locationId === entry.locationId &&
          x.lotNumber === entry.lotNumber,
      );
      assert.ok(physical);
      const shelf = await s2.call(
        `/api/training?locationBarcode=${encodeURIComponent(physical.locationBarcode)}`,
        { workspace: round.workspaceId },
      );
      assert.ok(shelf.items.some((x) => x.sku === cp.sku));
      await s2.call(`/api/counts/${count.id}`, {
        method: "POST",
        workspace: round.workspaceId,
        body: {
          operationId: key(),
          action: "entry",
          locationBarcode: entry.locationBarcode,
          lotNumber: entry.lotNumber,
          quantity: physical.quantity,
          serialNumbers: physical.serials,
        },
      });
    }
    await s2.call(`/api/counts/${count.id}`, {
      method: "POST",
      workspace: round.workspaceId,
      body: { operationId: key(), action: "submit", confirmComplete: true },
    });
  }
  await command(s2, round.workspaceId, { action: "submit" });
  d = await s1.call("/api/training", { workspace: round.workspaceId });
  assert.equal(d.round.status, "SUBMITTED");
  assert.equal(typeof d.round.metrics.elapsedSeconds, "number");
  assert.ok(d.round.metrics.successfulCommands > 0);
  await admin.call(`/api/workspaces/${round.workspaceId}/members`, {
    method: "POST",
    body: { userId: fa.user.id },
    status: 409,
  });
  await switchTo(teacher, round.workspaceId);
  const review = {
    action: "review",
    userId: f1.user.id,
    decision: "COMPETENT",
    note: "ทดสอบหลักฐานรายบุคคล",
    criteria: [
      {
        id: criteria[0].id,
        result: "MISSING",
        evidence: "ยังไม่มีหลักฐานจากการสังเกต",
      },
    ],
  };
  await command(teacher, round.workspaceId, review, 400);
  review.criteria[0] = {
    id: criteria[0].id,
    result: "MET",
    evidence: "ผู้สอนสังเกตและตรวจเอกสารนับของผู้เรียนคนที่หนึ่ง",
  };
  await command(teacher, round.workspaceId, review);
  assert.equal(
    (await db.trainingRound.findUnique({ where: { id: round.id } })).status,
    "SUBMITTED",
  );
  d = await s2.call("/api/training", { workspace: round.workspaceId });
  assert.equal(d.round.assessments.length, 0);
  assert.equal(
    d.round.events.some((e) => e.type === "training.review"),
    false,
  );
  await command(teacher, round.workspaceId, {
    ...review,
    userId: f2.user.id,
    decision: "NOT_YET",
    criteria: [
      {
        id: criteria[0].id,
        result: "NOT_MET",
        evidence: "ผู้เรียนคนที่สองยังอธิบายผลต่างไม่ได้",
      },
    ],
  });
  d = await s1.call("/api/training", { workspace: round.workspaceId });
  assert.equal(d.round.status, "REVIEWED");
  assert.equal(d.round.assessments.length, 1);
  assert.equal(d.round.assessments[0].userId, f1.user.id);
  await s1.call("/api/counts", {
    method: "POST",
    workspace: round.workspaceId,
    body: {},
    status: 403,
  });
  await command(teacher, round.workspaceId, review, 409);
  await switchTo(teacher, source.id);
  const separate = await lesson(
    {
      ...config,
      scenario: "EXCESS",
      mode: "INDIVIDUAL",
      groups: students.map((u, i) => ({
        name: `Learner ${i + 1}`,
        userIds: [u.id],
      })),
    },
    "Individual same seed",
  );
  const separateRows = await db.trainingRound.findMany({
    where: { id: { in: separate.rounds.map((r) => r.id) } },
  });
  assert.equal(separateRows.length, 2);
  assert.equal(separateRows[0].fixtureHash, separateRows[1].fixtureHash);
  const canonical = (r) =>
    JSON.parse(r.truthJson).map(({ productId, locationId, ...x }) => x);
  assert.deepEqual(canonical(separateRows[0]), canonical(separateRows[1]));
  assert.notEqual(separateRows[0].workspaceId, separateRows[1].workspaceId);
  const pick = await lesson(
    {
      ...config,
      task: "PICK",
      scenario: "URGENT",
      mode: "INDIVIDUAL",
      groups: [{ name: "Urgent Learner", userIds: [f1.user.id] }],
    },
    "Urgent picking",
  );
  const pickWs = pick.rounds[0].workspaceId;
  await switchTo(s1, pickWs);
  await command(s1, pickWs, { action: "start" });
  let orders = await s1.call("/api/orders", { workspace: pickWs });
  const order = orders.orders[0];
  assert.equal(order.number, "SIM-URGENT-001");
  await s1.call(`/api/orders/${order.id}`, {
    method: "POST",
    workspace: pickWs,
    body: { operationId: key(), action: "reserve" },
  });
  orders = await s1.call("/api/orders", { workspace: pickWs });
  const allocation = orders.orders[0].lines[0].allocations[0];
  const pickWh = await db.warehouse.findFirst({
    where: { workspaceId: pickWs },
  });
  await s1.call("/api/maps", {
    method: "POST",
    workspace: pickWs,
    body: {
      operationId: key(),
      action: "route",
      warehouseId: pickWh.id,
      orderId: order.id,
      expectedVersion: 1,
    },
  });
  const wrong = {
    operationId: key(),
    action: "pick",
    allocationId: allocation.id,
    quantity: allocation.quantity,
    locationBarcode: "WRONG",
  };
  await s1.call(`/api/orders/${order.id}`, {
    method: "POST",
    workspace: pickWs,
    body: wrong,
    status: 400,
  });
  await s1.call(`/api/orders/${order.id}`, {
    method: "POST",
    workspace: pickWs,
    body: wrong,
    status: 400,
  });
  await s1.call(`/api/orders/${order.id}`, {
    method: "POST",
    workspace: pickWs,
    body: {
      ...wrong,
      operationId: key(),
      locationBarcode: allocation.stockLayer.location.barcode,
    },
  });
  await s1.call(`/api/orders/${order.id}`, {
    method: "POST",
    workspace: pickWs,
    body: { operationId: key(), action: "ship" },
  });
  await command(s1, pickWs, { action: "submit" });
  d = await s1.call("/api/training", { workspace: pickWs });
  assert.equal(d.round.metrics.validatedPickCommands, 2);
  assert.equal(d.round.metrics.pickCommandAccuracy, 50);
  assert.ok(d.round.metrics.plannedDistanceMeters > 0);
  // Research tools use the instructor-approved frozen version and do not expose answers.
  await switchTo(teacher, source.id);
  await switchTo(s1, source.id);
  await switchTo(s2, source.id);
  const formConfig = {
    instrumentCode: "WMS-KNOWLEDGE",
    version: "1",
    instructions: "QA research instrument",
    questions: [
      {
        id: "q1",
        text: "เลือกจำนวนหนึ่งหน่วย",
        type: "CHOICE",
        required: true,
        options: ["หนึ่ง", "สอง"],
        correctOption: 0,
        min: 1,
        max: 5,
      },
      {
        id: "q2",
        text: "ประเมินความเข้าใจ",
        type: "SCALE",
        required: true,
        options: [],
        correctOption: null,
        min: 1,
        max: 5,
      },
      {
        id: "q3",
        text: "ข้อเสนอแนะเพิ่มเติม",
        type: "TEXT",
        required: false,
        options: [],
        correctOption: null,
        min: 1,
        max: 5,
      },
    ],
  };
  const saveForm = async (kind, title, config = formConfig) =>
    teacher.call("/api/research", {
      method: "POST",
      workspace: source.id,
      body: { operationId: key(), action: "save", title, kind, config },
    });
  const approveForm = async (id) => {
    const view = await teacher.call("/api/research", { workspace: source.id });
    const f = view.forms.find((f) => f.id === id);
    return teacher.call("/api/research", {
      method: "POST",
      workspace: source.id,
      body: {
        operationId: key(),
        action: "approve",
        formId: id,
        expectedConfigHash: f.configHash,
        acknowledge: true,
      },
    });
  };
  const pre = await saveForm("PRE", "QA Pre Test");
  const answer = {
    action: "answer",
    formId: pre.id,
    answers: { q1: 0, q2: 4, q3: '=HYPERLINK("http://example.invalid")' },
  };
  await s1.call("/api/research", {
    method: "POST",
    workspace: source.id,
    body: answer,
    status: 404,
  });
  await approveForm(pre.id);
  let forms = await s1.call("/api/research", { workspace: source.id });
  assert.equal(forms.forms[0].config.questions[0].correctOption, undefined);
  assert.equal(forms.forms[0].responses, undefined);
  await s1.call("/api/research", {
    method: "POST",
    workspace: source.id,
    body: { ...answer, answers: { q1: 2, q2: 4 } },
    status: 400,
  });
  await s1.call("/api/research", {
    method: "POST",
    workspace: source.id,
    body: { ...answer, answers: { q1: 0 } },
    status: 400,
  });
  await Promise.all([
    s1.call("/api/research", {
      method: "POST",
      workspace: source.id,
      body: answer,
    }),
    s1.call("/api/research", {
      method: "POST",
      workspace: source.id,
      body: answer,
    }),
  ]);
  assert.equal(
    await db.researchResponse.count({ where: { formId: pre.id } }),
    1,
  );
  await s1.call("/api/research", {
    method: "POST",
    workspace: source.id,
    body: { ...answer, answers: { q1: 1, q2: 4 } },
    status: 409,
  });
  await teacher.call("/api/research", {
    method: "POST",
    workspace: source.id,
    body: {
      operationId: key(),
      action: "save",
      id: pre.id,
      title: "Attempt rewrite",
      kind: "PRE",
      config: formConfig,
    },
    status: 409,
  });
  const postForm = await saveForm("POST", "QA Post Test");
  await approveForm(postForm.id);
  await s1.call("/api/research", {
    method: "POST",
    workspace: source.id,
    body: { ...answer, formId: postForm.id },
  });
  const responses = await db.researchResponse.findMany({
    where: { userId: f1.user.id },
  });
  assert.equal(responses[0].respondentCode, responses[1].respondentCode);
  const expert = await saveForm("EXPERT", "QA Expert Form", {
    ...formConfig,
    questions: formConfig.questions.slice(1),
  });
  await approveForm(expert.id);
  await s1.call("/api/research", {
    method: "POST",
    workspace: source.id,
    body: { action: "answer", formId: expert.id, answers: { q2: 5 } },
    status: 403,
  });
  await teacher.call("/api/research", {
    method: "POST",
    workspace: source.id,
    body: { action: "answer", formId: expert.id, answers: { q2: 5 } },
  });
  const csv = await teacher.call("/api/research/export", {
    workspace: source.id,
    csv: true,
  });
  assert.ok(csv.includes("respondent_code"));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(!csv.includes(f1.user.username));
  const report = await teacher.call("/api/training/export", {
    workspace: source.id,
    csv: true,
  });
  assert.ok(report.includes("competency_decision_individual"));
  assert.ok(report.includes(responses[0].respondentCode));
  await s1.call("/api/research/export", { workspace: source.id, status: 403 });
  await s1.call("/api/training/export", { workspace: source.id, status: 403 });
  await switchTo(s1, separate.rounds[0].workspaceId);
  await s1.call("/api/stock", {
    workspace: separate.rounds[1].workspaceId,
    status: 409,
  });
  assert.deepEqual(
    await db.inventoryBalance.findMany({
      where: { workspaceId: source.id },
      orderBy: { id: "asc" },
    }),
    templateBalances,
  );
  await assert.rejects(
    db.trainingRound.update({
      where: { id: round.id },
      data: { truthJson: "[]" },
    }),
  );
  await assert.rejects(
    db.researchResponse.update({
      where: { id: responses[0].id },
      data: { answersJson: "{}" },
    }),
  );
  for (const balance of await db.inventoryBalance.findMany()) {
    const total = await db.stockLayer.aggregate({
      where: { productId: balance.productId, locationId: balance.locationId },
      _sum: { qtyOnHand: true, qtyAllocated: true },
    });
    assert.equal(total._sum.qtyOnHand, balance.qtyOnHand);
    assert.equal(total._sum.qtyAllocated, balance.qtyAllocated);
    const product = await db.product.findUnique({
      where: { id: balance.productId },
    });
    if (product.trackSerial)
      assert.equal(
        await db.serialItem.count({
          where: {
            productId: balance.productId,
            locationId: balance.locationId,
            status: {
              in: ["IN_STOCK", "ALLOCATED", "PICKED", "RETURNED", "DEFECTIVE"],
            },
          },
        }),
        balance.qtyOnHand,
      );
  }
  assert.deepEqual(await db.$queryRawUnsafe("PRAGMA foreign_key_check"), []);
  console.log(
    "PASS: instructor approval, isolated individual/team clones, deterministic shortage/excess/urgent cases, shared blind count, task/role restrictions, server metrics and retry deduplication, individual competence evidence, private results, frozen research instruments, hidden answer keys, validated/idempotent answers, paired pseudonyms, protected CSV and preserved template stock.",
  );
} finally {
  await db.$disconnect();
}
