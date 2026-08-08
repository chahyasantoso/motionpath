import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageFile = fileURLToPath(new URL("../../package.json", import.meta.url));
const rootFile = fileURLToPath(new URL("../index.js", import.meta.url));
const packageJson = JSON.parse(await readFile(packageFile, "utf8"));
const rootSource = await readFile(rootFile, "utf8");

describe("public package boundary", () => {
  it("allow-lists deep entrypoints and blocks wildcard internals", () => {
    const exports = packageJson.exports;
    expect(exports["./lib/*"]).toBeUndefined();
    expect(exports["./usecases/*"]).toBeUndefined();
    expect(exports["./runtime/*"]).toBeUndefined();
    expect(exports["./internal"]).toBe("./src/internal.js");
    expect(Object.keys(exports).some((key) => key.endsWith("/*"))).toBe(false);
  });

  it("keeps migration runtime classes out of the supported root source", () => {
    expect(rootSource).not.toMatch(/GraphRuntime|MotionRuntime|PatchRegistry|ProjectRuntime|GraphBinding|GraphPublisher/);
    expect(rootSource).toContain('export { Engine }');
  });
});
