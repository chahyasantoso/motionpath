import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("../", import.meta.url);
const strict = process.argv.includes("--strict");
const findings = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.(js|jsx|mjs|ts|tsx|json)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function addFinding(kind, file, detail) {
  findings.push({ kind, file: relative(new URL("../", import.meta.url).pathname, file), detail });
}

const files = await walk(new URL("../packages/core/src/", import.meta.url));
for (const file of files) {
  const text = await readFile(file, "utf8");
  const rel = relative(new URL("../", import.meta.url).pathname, file);
  const isTest = /(^|\/)__tests__\//.test(rel) || /\.test\.[jt]sx?$/.test(rel);
  const gsapImport = /from\s+["']gsap(?:\/|["'])|import\s+["']gsap(?:\/|["'])/.test(text);
  if (gsapImport && !rel.includes("packages/core/src/adapters/")) {
    addFinding("gsap-import", file, isTest ? "test import outside adapter boundary" : "runtime import outside adapter boundary");
  }
  if (/\b(setObserved|removeObserved|replaceObserved|observedEdges|observedSources|_setGraphGuard)\b/.test(text) && rel.endsWith("/Track.js")) {
    addFinding("track-observation", file, "Track still exposes observation ownership or mutation");
  }
  if (/\b(addChild|removeChild|_attachGroupHost|groupHost|play\(\)|pause\(\)|reverse\(\))\b/.test(text) && rel.endsWith("/Track.js")) {
    addFinding("track-topology-playback", file, "Track still exposes topology or playback bridge responsibilities");
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  strict,
  findings,
  summary: {
    findingCount: findings.length,
    gsapImports: findings.filter(({ kind }) => kind === "gsap-import").length,
    trackOwnershipFindings: findings.filter(({ kind }) => kind !== "gsap-import").length,
  },
};
console.log(JSON.stringify(report, null, 2));
if (strict && findings.length) process.exitCode = 1;
