import assert from "node:assert/strict";
import { calculateABC } from "../src/lib/abc.ts";
const item = (sku, frequency) => ({ productId: sku, sku, frequency });
assert.deepEqual(
  calculateABC(
    [item("A", 85), item("B", 10), item("C", 5)],
    80,
    95,
    "SKU_ORDER",
  ).map((x) => x.recommendedClass),
  ["A", "B", "C"],
);
assert.deepEqual(
  calculateABC(
    [item("D", 0), item("C", 5), item("B", 10), item("A", 85)],
    80,
    95,
    "SKU_ORDER",
  ).map((x) => x.sku),
  ["A", "B", "C", "D"],
);
assert.ok(
  calculateABC([item("B", 0), item("A", 0)], 80, 95, "SKU_ORDER").every(
    (x) => x.recommendedClass === "C" && x.sharePercent === 0,
  ),
);
assert.deepEqual(
  calculateABC([item("B", 5), item("A", 5)], 40, 80, "SKU_ORDER").map(
    (x) => x.recommendedClass,
  ),
  ["A", "B"],
);
assert.deepEqual(
  calculateABC(
    [item("B", 5), item("A", 5)],
    40,
    80,
    "KEEP_FREQUENCY_GROUP",
  ).map((x) => x.recommendedClass),
  ["A", "A"],
);
assert.throws(() => calculateABC([item("A", 1)], 95, 80, "SKU_ORDER"));
console.log(
  "PASS: ABC threshold crossings, deterministic SKU ties, grouped ties, zero activity and invalid thresholds",
);
