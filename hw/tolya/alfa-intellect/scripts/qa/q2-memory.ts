import { getHeapSnapshot } from "node:v8";

export function memory(phase: string) {
  const usage = process.memoryUsage();
  console.log("Q2_MEMORY", JSON.stringify({ phase, ...usage }));
  return usage;
}

// Snapshotting forces GC and adds diagnostic overhead. Run separately from RSS acceptance.
// Consume the V8 snapshot in memory so no confidential heap artifact is left on disk.
export async function heap(phase: string) {
  const before = memory(phase + ":before-snapshot");
  const chunks: Buffer[] = [];
  for await (const chunk of getHeapSnapshot()) chunks.push(Buffer.from(chunk));
  const snapshot = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const fields: string[] = snapshot.snapshot.meta.node_fields;
  const types: string[] = snapshot.snapshot.meta.node_types[0];
  const totals = new Map<string, { count: number; bytes: number }>();
  const label = (offset: number) => {
    const type = types[snapshot.nodes[offset + fields.indexOf("type")]];
    return ["object", "native", "closure"].includes(type)
      ? `${type}:${snapshot.strings[snapshot.nodes[offset + fields.indexOf("name")]]}`
      : type;
  };
  for (let i = 0; i < snapshot.nodes.length; i += fields.length) {
    const type = types[snapshot.nodes[i + fields.indexOf("type")]];
    const name = snapshot.strings[snapshot.nodes[i + fields.indexOf("name")]];
    // String contents can contain customer data. Aggregate by type only.
    const key = ["object", "native", "closure"].includes(type)
      ? `${type}:${name}`
      : type;
    const entry = totals.get(key) ?? { count: 0, bytes: 0 };
    entry.count++;
    entry.bytes += snapshot.nodes[i + fields.indexOf("self_size")];
    totals.set(key, entry);
  }
  const edges = snapshot.snapshot.meta.edge_fields as string[];
  const edgeTypes = snapshot.snapshot.meta.edge_types[0] as string[];
  const referrers = new Map<
    string,
    { edges: number; referencedBytes: number }
  >();
  let edge = 0;
  for (let node = 0; node < snapshot.nodes.length; node += fields.length) {
    const count = snapshot.nodes[node + fields.indexOf("edge_count")];
    for (let n = 0; n < count; n++, edge += edges.length) {
      if (edgeTypes[snapshot.edges[edge + edges.indexOf("type")]] === "weak")
        continue;
      const target = snapshot.edges[edge + edges.indexOf("to_node")];
      const type = types[snapshot.nodes[target + fields.indexOf("type")]];
      if (!["string", "array", "concatenated string"].includes(type)) continue;
      const key = label(node);
      const entry = referrers.get(key) ?? { edges: 0, referencedBytes: 0 };
      entry.edges++;
      entry.referencedBytes +=
        snapshot.nodes[target + fields.indexOf("self_size")];
      referrers.set(key, entry);
    }
  }
  console.log(
    "Q2_HEAP",
    JSON.stringify({
      phase,
      before,
      top: [...totals].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 20),
      referrers: [...referrers]
        .sort((a, b) => b[1].referencedBytes - a[1].referencedBytes)
        .slice(0, 10),
      note: "Shallow sizes and immediate strong referrers after snapshot GC, not dominator retained sizes. Referrer totals may count shared targets more than once. Native SQLite/scrypt allocations are outside V8.",
    }),
  );
}
