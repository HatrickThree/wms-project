import { z } from "zod";

const id = z.string().trim().min(1).max(100);
export const MapGraphSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    metersPerUnit: z.number().finite().min(0.01).max(100),
    width: z.number().finite().min(4).max(1000),
    height: z.number().finite().min(4).max(1000),
    nodes: z
      .array(
        z.object({
          id,
          label: z.string().trim().min(1).max(100),
          x: z.number().finite().min(0).max(1000),
          y: z.number().finite().min(0).max(1000),
          kind: z.enum(["START", "END", "WAYPOINT", "LOCATION"]),
          locationId: id.optional(),
        }),
      )
      .min(2)
      .max(200),
    edges: z
      .array(z.object({ from: id, to: id, bidirectional: z.boolean() }))
      .min(1)
      .max(600),
  })
  .superRefine((g, ctx) => {
    const ids = new Set(g.nodes.map((n) => n.id));
    const locations = g.nodes.flatMap((n) =>
      n.locationId ? [n.locationId] : [],
    );
    if (
      ids.size !== g.nodes.length ||
      new Set(locations).size !== locations.length
    )
      ctx.addIssue({
        code: "custom",
        message: "รหัสจุดและตำแหน่งในผังต้องไม่ซ้ำ",
      });
    if (
      g.nodes.filter((n) => n.kind === "START").length !== 1 ||
      g.nodes.filter((n) => n.kind === "END").length !== 1
    )
      ctx.addIssue({
        code: "custom",
        message: "ต้องมีจุดเริ่มและจุดจบอย่างละหนึ่งจุด",
      });
    for (const n of g.nodes) {
      if (
        n.x > g.width ||
        n.y > g.height ||
        (n.kind === "LOCATION") !== !!n.locationId
      )
        ctx.addIssue({
          code: "custom",
          message: "พิกัดต้องอยู่ในผัง และจุดตำแหน่งต้องผูกชั้นวาง",
        });
    }
    const edges = new Set<string>();
    for (const e of g.edges) {
      const key = e.from + "→" + e.to;
      if (
        !ids.has(e.from) ||
        !ids.has(e.to) ||
        e.from === e.to ||
        edges.has(key)
      )
        ctx.addIssue({
          code: "custom",
          message:
            "ทางเดินต้องเชื่อมจุดที่มีอยู่ ไม่ซ้ำ และไม่เชื่อมจุดเดียวกัน",
        });
      edges.add(key);
    }
  });
export type MapGraph = z.infer<typeof MapGraphSchema>;
export interface RouteResult {
  algorithm: "DIJKSTRA_NEAREST_V1";
  distanceMeters: number;
  path: string[];
  stops: { nodeId: string; locationId: string; label: string }[];
}
export function suggestedGraph(
  locations: { id: string; barcode: string }[],
): MapGraph {
  const sorted = [...locations].sort((a, b) =>
    a.barcode.localeCompare(b.barcode, "en"),
  );
  const height = Math.max(8, Math.ceil(sorted.length / 2) * 3 + 4);
  const graph: MapGraph = {
    name: "ผังจำลองเริ่มต้น",
    width: 16,
    height,
    metersPerUnit: 1,
    nodes: [
      { id: "start", label: "เริ่ม", kind: "START", x: 8, y: 1 },
      { id: "end", label: "จบ", kind: "END", x: 8, y: height - 1 },
    ],
    edges: [],
  };
  let previous = "start";
  for (let row = 0; row < Math.ceil(sorted.length / 2); row++) {
    const aisle = `aisle-${row}`;
    graph.nodes.push({
      id: aisle,
      label: `ทางเดิน ${row + 1}`,
      kind: "WAYPOINT",
      x: 8,
      y: row * 3 + 3,
    });
    graph.edges.push({ from: previous, to: aisle, bidirectional: true });
    previous = aisle;
    for (let col = 0; col < 2; col++) {
      const location = sorted[row * 2 + col];
      if (!location) continue;
      const point = `location-${row * 2 + col}`;
      graph.nodes.push({
        id: point,
        label: location.barcode,
        kind: "LOCATION",
        locationId: location.id,
        x: col ? 12 : 4,
        y: row * 3 + 3,
      });
      graph.edges.push({ from: aisle, to: point, bidirectional: true });
    }
  }
  graph.edges.push({ from: previous, to: "end", bidirectional: true });
  return MapGraphSchema.parse(graph);
}

function pathFinder(graph: MapGraph) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const adjacency = new Map(
    graph.nodes.map((n) => [n.id, [] as { target: string; weight: number }[]]),
  );
  for (const edge of graph.edges) {
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    if (!a || !b) throw new Error("ไม่พบจุดในผัง");
    const weight = Math.hypot(a.x - b.x, a.y - b.y) * graph.metersPerUnit;
    adjacency.get(a.id)!.push({ target: b.id, weight });
    if (edge.bidirectional) adjacency.get(b.id)!.push({ target: a.id, weight });
  }
  const cache = new Map<
    string,
    { distances: Map<string, number>; previous: Map<string, string> }
  >();
  return (from: string, to: string) => {
    if (!nodes.has(from) || !nodes.has(to)) throw new Error("ไม่พบจุดในผัง");
    if (!cache.has(from)) {
      const distances = new Map<string, number>([[from, 0]]),
        previous = new Map<string, string>(),
        visited = new Set<string>();
      while (visited.size < nodes.size) {
        let next: string | undefined;
        for (const id of nodes.keys())
          if (
            !visited.has(id) &&
            distances.has(id) &&
            (!next ||
              distances.get(id)! < distances.get(next)! ||
              (distances.get(id) === distances.get(next) &&
                id.localeCompare(next, "en") < 0))
          )
            next = id;
        if (!next) break;
        visited.add(next);
        for (const edge of adjacency.get(next)!) {
          if (visited.has(edge.target)) continue;
          const value = distances.get(next)! + edge.weight;
          if (value < (distances.get(edge.target) ?? Infinity)) {
            distances.set(edge.target, value);
            previous.set(edge.target, next);
          }
        }
      }
      cache.set(from, { distances, previous });
    }
    const { distances, previous } = cache.get(from)!;
    if (!distances.has(to))
      throw new Error(
        `ไม่มีทางเดินจาก ${nodes.get(from)!.label} ไป ${nodes.get(to)!.label}`,
      );
    const path = [to];
    let p = to;
    while (p !== from) {
      p = previous.get(p)!;
      path.unshift(p);
    }
    return { distance: distances.get(to)!, path };
  };
}
export function shortestPath(graph: MapGraph, from: string, to: string) {
  return pathFinder(graph)(from, to);
}
export function calculatePickingRoute(
  input: MapGraph,
  locationIds: string[],
): RouteResult {
  const graph = MapGraphSchema.parse(input);
  const findPath = pathFinder(graph);
  const start = graph.nodes.find((n) => n.kind === "START")!.id;
  const end = graph.nodes.find((n) => n.kind === "END")!.id;
  const remaining = [...new Set(locationIds)]
    .map((id) => {
      const n = graph.nodes.find((n) => n.locationId === id);
      if (!n) throw new Error("ยังไม่มีจุดบนผังสำหรับตำแหน่งที่ต้องหยิบ");
      return n;
    })
    .sort((a, b) => a.label.localeCompare(b.label, "en"));
  let current = start;
  let total = 0;
  const path = [start];
  const stops: RouteResult["stops"] = [];
  // Validate directed reachability first; never draw a straight-line fallback.
  for (const n of remaining) {
    findPath(start, n.id);
    findPath(n.id, end);
  }
  while (remaining.length) {
    const choices = remaining
      .flatMap((n) => {
        try {
          return [{ n, route: findPath(current, n.id) }];
        } catch {
          return [];
        }
      })
      .sort(
        (a, b) =>
          a.route.distance - b.route.distance ||
          a.n.label.localeCompare(b.n.label, "en"),
      );
    if (!choices.length)
      throw new Error(
        "ทางเดินทางเดียวทำให้เข้าถึงจุดหยิบที่เหลือไม่ได้ กรุณาปรับผัง",
      );
    const { n, route } = choices[0];
    total += route.distance;
    path.push(...route.path.slice(1));
    stops.push({ nodeId: n.id, locationId: n.locationId!, label: n.label });
    current = n.id;
    remaining.splice(
      remaining.findIndex((x) => x.id === n.id),
      1,
    );
  }
  const final = findPath(current, end);
  total += final.distance;
  path.push(...final.path.slice(1));
  return {
    algorithm: "DIJKSTRA_NEAREST_V1",
    distanceMeters: Math.round(total * 100) / 100,
    path,
    stops,
  };
}
