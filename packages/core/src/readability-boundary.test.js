import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Pass-2 finding F-11: the readability gate.
 *
 * CI runs `format:check:ci`, which prettier-checks exactly two files,
 * `package.json` and `.github/workflows/ci.yml`. There is no linter. That is how
 * PR #139 landed `Track.js` and `GraphPublisher.js` rewritten into single-line
 * members with their reasoning comments deleted, on a fully green board.
 *
 * A repo-wide prettier gate is the right long-term answer but it cannot be
 * switched on in one step: roughly a dozen source files are currently dense
 * one-liners and the job would fail immediately. So this is the opposite of the
 * GSAP quarantine: instead of an exception list that may only shrink, it is a
 * PROTECTED list that may only grow. Every file whose formatting has been
 * verified goes in, and it can never silently regress again.
 *
 * Add a file here as soon as you format it. Never remove one.
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
    // A wholesale comment deletion is the specific regression this guards.
    for (const relativePath of PROTECTED_FILES) {
      const source = await readProtected(relativePath);
      expect(source, `${relativePath} lost its explanatory block comments`).toMatch(/\/\*\*/);
    }
  });

  it("never shrinks the protected list", () => {
    // Guards against the easy fix of deleting an entry instead of formatting a
    // file. If you are here to remove a name, format the file instead.
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
