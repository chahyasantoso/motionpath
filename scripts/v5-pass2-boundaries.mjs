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

function toPosix(absolutePath) {
  return relative(repoRoot, absolutePath).split(sep).join("/");
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function addFinding(kind, file, detail, blocking) {
  findings.push({ kind, file, detail, blocking });
}

const files = await walk(fileURLToPath(new URL("../packages/core/src/", import.meta.url)));
for (const file of files) {
  const rel = toPosix(file);
  if (rel === "packages/core/src/gsap-boundary.test.js") continue;
  const text = await readFile(file, "utf8");

  if (GSAP_IMPORT_PATTERN.test(text) && !isApprovedGsapPath(rel)) {
    // Quarantined imports are known, owned, and non-blocking. Anything else is
    // a new violation and fails strict mode immediately.
    const quarantined = isQuarantinedGsapPath(rel);
    addFinding(
      "gsap-import",
      rel,
      quarantined ? "quarantined: known test/fixture import awaiting fake-port migration" : "unapproved direct vendor import outside adapters/",
      !quarantined,
    );
  }

  if (rel.endsWith("/Track.js")) {
    if (/\b(setObserved|removeObserved|replaceObserved|observedEdges|observedSources|_setGraphGuard)\b/.test(text)) {
      addFinding("track-observation", rel, "Track still exposes observation ownership or mutation (P2-03)", false);
    }
    if (/\b(addChild|removeChild|_attachGroupHost|groupHost)\b/.test(text)) {
      addFinding("track-topology-playback", rel, "Track still exposes topology or playback bridge responsibilities (P2-04)", false);
    }
  }
}

const stale = QUARANTINED_GSAP_FILES.filter(
  (path) => !findings.some((finding) => finding.kind === "gsap-import" && finding.file === path),
);
for (const path of stale) {
  addFinding("gsap-quarantine-stale", path, "quarantine entry no longer imports gsap; delete it, the list may only shrink", true);
}

const blocking = findings.filter((finding) => finding.blocking);
const report = {
  generatedAt: new Date().toISOString(),
  strict,
  findings,
  summary: {
    findingCount: findings.length,
    blockingCount: blocking.length,
    gsapImports: findings.filter(({ kind }) => kind === "gsap-import").length,
    gsapQuarantined: findings.filter(({ kind, blocking: isBlocking }) => kind === "gsap-import" && !isBlocking).length,
    trackOwnershipFindings: findings.filter(({ kind }) => kind.startsWith("track-")).length,
  },
};
console.log(JSON.stringify(report, null, 2));

// Default mode still reports the open P2-03/P2-04 ownership gaps without
// failing. Strict mode is the completion gate. Blocking findings, which means
// a NEW gsap import or a stale quarantine entry, fail in both modes.
if (blocking.length) process.exitCode = 1;
else if (strict && findings.length) process.exitCode = 1;
