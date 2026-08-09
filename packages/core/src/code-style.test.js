import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  READABILITY_GUARDED_FILES,
  checkReadability,
} from "../../../scripts/v5-readability-allowlist.mjs";

/**
 * Pass-2 P2-00, finding F-11.
 *
 * The repository has no linter and CI's format job covers two files, so nothing
 * stopped a reformat from folding a class onto one line per method and deleting
 * the comments that recorded its invariants. This is the floor for restored
 * files. The list may only grow.
 */
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("P2-00 readability floor", () => {
  it("keeps every guarded file readable and documented", async () => {
    const violations = [];
    for (const relativePath of READABILITY_GUARDED_FILES) {
      const source = await readFile(join(repoRoot, relativePath), "utf8");
      violations.push(...checkReadability(relativePath, source));
    }
    expect(violations).toEqual([]);
  });

  it("guards the two files that already lost their reasoning once", () => {
    expect(READABILITY_GUARDED_FILES).toContain(
      "packages/core/src/lib/Track.js",
    );
    expect(READABILITY_GUARDED_FILES).toContain(
      "packages/core/src/usecases/GraphPublisher.js",
    );
  });

  it("fails a file that folds statements onto one line", () => {
    const folded = "const a=1;const b=2;const c=3;const d=4;\n";
    expect(checkReadability("fake.js", folded).length).toBeGreaterThan(0);
  });
});
