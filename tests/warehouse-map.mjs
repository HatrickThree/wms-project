import assert from "node:assert/strict";
import {
  suggestedGraph,
  MapGraphSchema,
  shortestPath,
  calculatePickingRoute,
} from "../src/lib/warehouse-map.ts";
const g = suggestedGraph([
  { id: "l2", barcode: "B" },
  { id: "l1", barcode: "A" },
]);
assert.deepEqual(
  g,
  suggestedGraph([
    { id: "l1", barcode: "A" },
    { id: "l2", barcode: "B" },
  ]),
);
const r = calculatePickingRoute(g, ["l2", "l1", "l1"]);
assert.equal(r.stops.length, 2);
assert.equal(r.stops[0].label, "A");
assert.equal(r.distanceMeters, 22);
assert.equal(r.path[0], "start");
assert.equal(r.path.at(-1), "end");
assert.equal(
  calculatePickingRoute({ ...g, metersPerUnit: 2 }, ["l1", "l2"])
    .distanceMeters,
  44,
);
assert.throws(() => calculatePickingRoute(g, ["other"]), /ยังไม่มี/);
assert.throws(
  () =>
    calculatePickingRoute(
      { ...g, edges: g.edges.filter((e) => e.to !== "location-0") },
      ["l1"],
    ),
  /ไม่มีทางเดิน/,
);
const oneWay = {
  ...g,
  edges: g.edges.map((e) => ({ ...e, bidirectional: false })),
};
assert.throws(() => shortestPath(oneWay, "end", "start"), /ไม่มีทางเดิน/);
assert.throws(() => calculatePickingRoute(oneWay, ["l1"]), /ไม่มีทางเดิน/);
assert.equal(
  MapGraphSchema.safeParse({ ...g, nodes: [...g.nodes, g.nodes[0]] }).success,
  false,
);
assert.equal(
  MapGraphSchema.safeParse({ ...g, metersPerUnit: 0 }).success,
  false,
);
assert.equal(
  MapGraphSchema.safeParse({
    ...g,
    nodes: g.nodes.map((n) => ({ ...n, x: 1001 })),
  }).success,
  false,
);
assert.equal(
  MapGraphSchema.safeParse({
    ...g,
    edges: [...g.edges, { from: "missing", to: "end", bidirectional: true }],
  }).success,
  false,
);
const detour = MapGraphSchema.parse({
  name: "detour",
  width: 10,
  height: 10,
  metersPerUnit: 1,
  nodes: [
    { id: "s", label: "S", kind: "START", x: 1, y: 1 },
    { id: "w", label: "W", kind: "WAYPOINT", x: 1, y: 5 },
    { id: "l", label: "L", kind: "LOCATION", locationId: "L", x: 5, y: 5 },
    { id: "e", label: "E", kind: "END", x: 5, y: 1 },
  ],
  edges: [
    { from: "s", to: "w", bidirectional: true },
    { from: "w", to: "l", bidirectional: true },
    { from: "l", to: "e", bidirectional: true },
  ],
});
assert.equal(calculatePickingRoute(detour, ["L"]).distanceMeters, 12);
assert.equal(shortestPath(detour, "s", "e").distance, 12);
console.log(
  "PASS: reproducible graph, directed paths, aisle detours, scale, unique stops, missing/unreachable locations and graph validation; no direct-line fallback.",
);
