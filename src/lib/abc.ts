export type ABCClass = "A" | "B" | "C";
export type ABCTieRule = "SKU_ORDER" | "KEEP_FREQUENCY_GROUP";
export interface ABCInput {
  productId: string;
  sku: string;
  frequency: number;
}
export interface ABCResult extends ABCInput {
  recommendedClass: ABCClass;
  sharePercent: number;
  cumulativePercent: number;
}

// The item crossing a threshold remains in the preceding band. A zero-frequency
// item is always C. This is a proposal; no product class is changed here.
export function calculateABC(
  items: ABCInput[],
  a: number,
  b: number,
  tieRule: ABCTieRule,
): ABCResult[] {
  if (!(a > 0 && a < b && b < 100))
    throw new Error("ABC thresholds must satisfy 0 < A < B < 100");
  if (items.some((x) => !Number.isInteger(x.frequency) || x.frequency < 0))
    throw new Error("Document frequency must be a nonnegative integer");
  const sorted = [...items].sort(
    (x, y) =>
      y.frequency - x.frequency || (x.sku < y.sku ? -1 : x.sku > y.sku ? 1 : 0),
  );
  const total = sorted.reduce((sum, x) => sum + x.frequency, 0);
  let cumulative = 0;
  let groupClass: ABCClass = "C";
  return sorted.map((item, index) => {
    const band: ABCClass =
      item.frequency === 0
        ? "C"
        : cumulative * 100 < a * total
          ? "A"
          : cumulative * 100 < b * total
            ? "B"
            : "C";
    if (
      index === 0 ||
      sorted[index - 1].frequency !== item.frequency ||
      tieRule === "SKU_ORDER"
    )
      groupClass = band;
    cumulative += item.frequency;
    return {
      ...item,
      recommendedClass: item.frequency === 0 ? "C" : groupClass,
      sharePercent: total ? (100 * item.frequency) / total : 0,
      cumulativePercent: total ? (100 * cumulative) / total : 0,
    };
  });
}
