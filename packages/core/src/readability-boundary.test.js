import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Pass-2 finding F-11: the readability gate.
 *
 * Protected files are held to a reviewable line length and statement density.
 * These checks prevent dense rewrites from deleting the reasoning behind graph
 * ownership and atomicity invariants.
 */
const coreSrc = fileURLToPath(new URL(".", import.meta.url));
const MAX_LINE_LENGTH = 140;
const MAX_STATEMENTS_PER_LINE = 3;
const PROTECTED_FILES = [
  "contract/immutableValue.js",
  "lib/Track.js",
  "usecases/GraphPublisher.js",
  "usecases/ScopedObservationAdapter.js",
  "usecases/StandaloneObservationAdapter.js",
  "usecases/TrackObservationOwner.js",
];

async function readProtected(relativePath) {
  return readFile(new URL(relativePath, new URL(".", import.meta.url)), "utf8");
}

describe("P2 readability boundary", () => {
  it("keeps protected files within a reviewable line length", async () => {
    const violations = [];
    for (const relativePath of PROTECTED_FILES) {
      const lines = (await readProtected(relativePath)).split("\n");
      lines.forEach((line, index) => {
        if (line.length > MAX_LINE_LENGTH) {
          violations.push(`${relativePath}:${index + 1} is ${line.length} chars`);
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it("does not let statements be stacked onto one line", async () => {
    const violations = [];
    for (const relativePath of PROTECTED_FILES) {
      const lines = (await readProtected(relativePath)).split("\n");
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
        const statements = (line.match(/;/g) ?? []).length;
        if (statements > MAX_STATEMENTS_PER_LINE) {
          violations.push(`${relativePath}:${index + 1} has ${statements} statements`);
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it("keeps the recorded reasoning in place", async () => {
    for (const relativePath of PROTECTED_FILES) {
      const source = await readProtected(relativePath);
      expect(source, `${relativePath} lost its explanatory block comments`).toMatch(/\/\*\*/);
    }
  });

  it("never shrinks the protected list", () => {
    expect(PROTECTED_FILES).toEqual(
      expect.arrayContaining([
        "contract/immutableValue.js",
        "lib/Track.js",
        "usecases/GraphPublisher.js",
        "usecases/StandaloneObservationAdapter.js",
        "usecases/TrackObservationOwner.js",
      ]),
    );
    expect(new Set(PROTECTED_FILES).size).toBe(PROTECTED_FILES.length);
    expect(coreSrc.endsWith("/")).toBe(true);
  });
});
