import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";

const startedAt = new Date().toISOString();
const start = performance.now();
const output = execFileSync(
  process.execPath,
  ["performance/rig-graph-benchmark.mjs"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
  },
);
const durationMs = Number((performance.now() - start).toFixed(3));
const results = JSON.parse(output);
const report = {
  schemaVersion: 1,
  capturedAt: startedAt,
  node: process.version,
  command: "npm run benchmark:rig",
  durationMs,
  results,
};

const destination = process.argv[2] ?? "docs/benchmarks/v5-baseline.json";
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote ${destination}`);
