import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const trackPath = fileURLToPath(new URL("../Track.js", import.meta.url));

describe("P2-04 Track topology ownership", () => {
  it("documents the remaining topology seams before their removal", async () => {
    const source = await readFile(trackPath, "utf8");
    for (const symbol of ["addChild", "removeChild", "_attachGroupHost", "childCount", "getChild"]) {
      expect(source, `expected current topology seam: ${symbol}`).toContain(symbol);
    }
  });

  it("keeps the Motion-facing composite API available", async () => {
    const motion = await import("../Motion.js");
    expect(motion.Motion.prototype.mountChild).toBeTypeOf("function");
    expect(motion.Motion.prototype.unmountChild).toBeTypeOf("function");
    expect(motion.Motion.prototype.reflowChild).toBeTypeOf("function");
  });
});
