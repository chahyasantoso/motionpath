import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GSAP_IMPORT_PATTERN,
  QUARANTINED_GSAP_FILES,
  isApprovedGsapPath,
  isQuarantinedGsapPath,
} from "./v5-gsap-allowlist.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const strict = process.argv.includes("--strict");
const findings = [];
const SCAN_ROOTS = ["packages/core/src/", "packages/react/src/"];
const RENDERER_SURFACE = "packages/react/";

/** Complete P2-03 Track observation ban list. */
const TRACK_OBSERVATION_SYMBOLS = [
  /#observed\b/, /#observers\b/, /#graphGuard\b/, /\b_setGraphGuard\b/,
  /\b_setObservationComposer\b/, /\b_addObserver\b/, /\b_removeObserver\b/,
  /\bsetObserved\b/, /\bremoveObserved\b/, /\breplaceObserved\b/,
  /\bobservedSources\b/, /\bobservedEdges\b/, /\bobserverCount\b/, /\bobserverIds\b/,
];
const TRACK_TOPOLOGY_SYMBOLS = [
  /\baddChild\b/, /\bremoveChild\b/, /\b_attachGroupHost\b/, /\bgroupHost\b/,
];

function toPosix(absolutePath) { return relative(repoRoot, absolutePath).split(sep).join("/"); }
async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}
function addFinding(kind, file, detail, blocking, symbols) {
  findings.push(symbols ? { kind, file, detail, blocking, symbols } : { kind, file, detail, blocking });
}
function matched(patterns, text) { return patterns.filter((pattern) => pattern.test(text)).map(String); }

const files = [];
for (const root of SCAN_ROOTS) files.push(...(await walk(join(repoRoot, root))));
for (const file of files) {
  const rel = toPosix(file);
  if (rel === "packages/core/src/gsap-boundary.test.js") continue;
  const text = await readFile(file, "utf8");
  if (GSAP_IMPORT_PATTERN.test(text) && !isApprovedGsapPath(rel)) {
    if (rel.startsWith(RENDERER_SURFACE)) {
      addFinding("renderer-gsap-import", rel, "react hooks layer imports gsap directly; classify as adapter or migrate (F-14)", false);
    } else {
      const quarantined = isQuarantinedGsapPath(rel);
      addFinding("gsap-import", rel, quarantined ? "quarantined: known test/fixture import awaiting fake-port migration" : "unapproved direct vendor import outside adapters/", !quarantined);
    }
  }
  if (rel.endsWith("/Track.js")) {
    const observation = matched(TRACK_OBSERVATION_SYMBOLS, text);
    if (observation.length) {
      addFinding("track-observation", rel, "Track still exposes observation ownership, state or mutation (P2-03)", strict, observation);
    }
    const topology = matched(TRACK_TOPOLOGY_SYMBOLS, text);
    if (topology.length) {
      addFinding("track-topology-playback", rel, "Track still exposes topology or playback bridge responsibilities (P2-04)", false, topology);
    }
  }
}
const stale = QUARANTINED_GSAP_FILES.filter((path) => !findings.some((finding) => finding.kind === "gsap-import" && finding.file === path));
for (const path of stale) addFinding("gsap-quarantine-stale", path, "quarantine entry no longer imports gsap; delete it, the list may only shrink", true);
const blocking = findings.filter((finding) => finding.blocking);
const report = {
  generatedAt: new Date().toISOString(), strict, scanRoots: SCAN_ROOTS, findings,
  summary: {
    findingCount: findings.length, blockingCount: blocking.length,
    gsapImports: findings.filter(({ kind }) => kind === "gsap-import").length,
    gsapQuarantined: findings.filter(({ kind, blocking: isBlocking }) => kind === "gsap-import" && !isBlocking).length,
    rendererGsapImports: findings.filter(({ kind }) => kind === "renderer-gsap-import").length,
    trackOwnershipFindings: findings.filter(({ kind }) => kind.startsWith("track-")).length,
  },
};
console.log(JSON.stringify(report, null, 2));
// Default mode reports open ownership gaps without failing. Strict mode is the
// completion gate: Track observation ownership findings block until the symbols
// are removed, while topology remains a later P2-04 slice.
if (blocking.length) process.exitCode = 1;
else if (strict && findings.length) process.exitCode = 1;
