import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GSAP_IMPORT_PATTERN,
  QUARANTINED_GSAP_FILES,
  isApprovedGsapPath,
  isQuarantinedGsapPath,
} from "../../../scripts/v5-gsap-allowlist.mjs";

/**
 * Pass-2 P2-02: the GSAP import boundary, enforced.
 *
 * The architecture rule is that GSAP lives behind adapters. Until this test
 * existed the rule was only ever checked by hand, which is why direct vendor
 * imports had accumulated in `lib/` while the docs described the boundary as
 * mostly done.
 *
 * This is deliberately blocking rather than advisory, with a named quarantine
 * list for the imports that are still outstanding. Advisory scans stop being
 * read; a blocking scan with a shrinking exception list cannot rot silently.
 */

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const coreSrc = fileURLToPath(new URL(".", import.meta.url));
const SELF = "packages/core/src/gsap-boundary.test.js";

function toPosix(absolutePath) {
  return relative(repoRoot, absolutePath).split(sep).join("/");
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

async function gsapImporters() {
  const importers = [];
  for (const file of await sourceFiles(coreSrc)) {
    const relativePath = toPosix(file);
    if (relativePath === SELF) continue;
    const content = await readFile(file, "utf8");
    if (GSAP_IMPORT_PATTERN.test(content)) importers.push(relativePath);
  }
  return importers.sort();
}

describe("P2-02 GSAP import boundary", () => {
  it("keeps every direct vendor import inside the adapter surface or the quarantine", async () => {
    const unexpected = (await gsapImporters()).filter(
      (path) => !isApprovedGsapPath(path) && !isQuarantinedGsapPath(path),
    );
    expect(unexpected).toEqual([]);
  });

  it("allows no production module outside adapters to import gsap directly", async () => {
    const production = (await gsapImporters()).filter((path) => {
      const isTestOrFixture =
        path.includes("/__tests__/") ||
        path.includes("/__fixtures__/") ||
        /\.test\.[jt]sx?$/.test(path);
      return !isApprovedGsapPath(path) && !isTestOrFixture;
    });
    expect(production).toEqual([]);
  });

  it("keeps the quarantine list honest by failing when an entry is already clean", async () => {
    const importers = new Set(await gsapImporters());
    const stale = QUARANTINED_GSAP_FILES.filter((path) => !importers.has(path));
    // A stale entry means someone fixed the file and left the exception behind.
    // Delete the entry: the list may only ever shrink.
    expect(stale).toEqual([]);
  });

  it("routes core orchestration through the adapter boundary instead of the vendor", async () => {
    for (const path of [
      "lib/Motion.js",
      "lib/TriggerDelegate.js",
      "usecases/BuildTrackTween.js",
      "lib/gsapTickerClock.js",
    ]) {
      const content = await readFile(join(coreSrc, path), "utf8");
      expect(
        GSAP_IMPORT_PATTERN.test(content),
        `${path} must not import gsap directly`,
      ).toBe(false);
      expect(content).toMatch(/adapters\//);
    }
  });

  it("exposes the ticker clock from the adapter surface", async () => {
    const { gsapTickerClock } = await import(
      "./adapters/gsap/gsapTickerClock.js"
    );
    const shimmed = await import("./lib/gsapTickerClock.js");
    expect(typeof gsapTickerClock.subscribe).toBe("function");
    expect(shimmed.gsapTickerClock).toBe(gsapTickerClock);
  });
});
