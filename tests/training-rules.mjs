import assert from "node:assert/strict";
import {
  LessonConfigSchema,
  simulateShelves,
  seededRandom,
} from "../src/lib/training.ts";
import { FormConfigSchema, csvText } from "../src/lib/research.ts";
const rows = [
  {
    locationId: "a",
    locationBarcode: "A",
    productId: "p",
    sku: "P",
    lotNumber: "",
    expiresOn: null,
    quantity: 10,
    serials: [],
  },
  {
    locationId: "b",
    locationBarcode: "B",
    productId: "s",
    sku: "S",
    lotNumber: "LOT",
    expiresOn: "2030-01-01",
    quantity: 2,
    serials: ["S1", "S2"],
  },
];
for (const scenario of ["NORMAL", "SHORTAGE", "EXCESS"]) {
  assert.deepEqual(
    simulateShelves(rows, scenario, "seed"),
    simulateShelves([...rows].reverse(), scenario, "seed"),
  );
  const result = simulateShelves(rows, scenario, "seed");
  for (const r of result) {
    assert.ok(r.quantity >= 0);
    if (r.serials.length) assert.equal(r.quantity, r.serials.length);
  }
}
assert.deepEqual(rows[1].serials, ["S1", "S2"]);
assert.equal(rows[0].quantity, 10);
assert.equal(seededRandom("x")(), seededRandom("x")());
assert.throws(() => simulateShelves([], "SHORTAGE", "seed"));
const c = {
  task: "COUNT",
  scenario: "SHORTAGE",
  instructions: "Count all items",
  mode: "TEAM",
  seed: "seed",
  sameSeed: true,
  groups: [{ name: "team", userIds: ["s1", "s2"] }],
  criteria: [
    {
      id: "c1",
      unitCode: "LOG-EYPL-778A",
      description: "Verify count evidence",
      method: "OBSERVATION",
      required: true,
    },
  ],
};
assert.equal(LessonConfigSchema.safeParse(c).success, true);
assert.equal(
  LessonConfigSchema.safeParse({ ...c, mode: "INDIVIDUAL" }).success,
  false,
);
assert.equal(
  LessonConfigSchema.safeParse({ ...c, task: "PICK" }).success,
  false,
);
assert.equal(
  LessonConfigSchema.safeParse({
    ...c,
    groups: [...c.groups, { name: "other", userIds: ["s1"] }],
  }).success,
  false,
);
const form = {
  instrumentCode: "test",
  version: "1",
  instructions: "",
  questions: [
    {
      id: "q1",
      text: "Question",
      type: "CHOICE",
      required: true,
      options: ["One", "Two"],
      correctOption: 0,
      min: 1,
      max: 5,
    },
  ],
};
assert.equal(FormConfigSchema.safeParse(form).success, true);
assert.equal(
  FormConfigSchema.safeParse({
    ...form,
    questions: [{ ...form.questions[0], correctOption: 2 }],
  }).success,
  false,
);
const csv = csvText([
  ["=HYPERLINK(x)", " +SUM(1,2)", "normal", 'a"b', "line\nbreak"],
]);
for (const type of ["SCALE", "TEXT"]) {
  const changed = FormConfigSchema.parse({
    ...form,
    questions: [
      { ...form.questions[0], type, options: ["", ""], correctOption: 0 },
    ],
  });
  assert.deepEqual(changed.questions[0].options, []);
  assert.equal(changed.questions[0].correctOption, null);
}
assert.equal(
  FormConfigSchema.safeParse({
    ...form,
    questions: [{ ...form.questions[0], options: ["", ""] }],
  }).success,
  false,
);
assert.ok(csv.includes("'=HYPERLINK"));
assert.ok(csv.includes("' +SUM"));
assert.ok(csv.includes('"a""b"'));
console.log(
  "PASS: deterministic scenario rules, unchanged fixtures, task/team constraints, question validation and CSV formula escaping.",
);
