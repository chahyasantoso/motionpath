import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const trackPath = fileURLToPath(new URL("../Track.js", import.meta.url));

/**
 * P2-04 baseline guard. This is intentionally not the completion gate yet:
 * Track still owns these responsibilities today. It prevents the inventory
 * from drifting while P2-03 moves observation state and P2-04 moves topology
 * and playback. The final symbol-ban flips these expectations to absence.
 */
const observationSymbols = [
  "setObserved",
  "removeObserved",
  "replaceObserved",
  "observedSources",
  "observedEdges",
  "_setGraphGuard",
];
const topologyPlaybackSymbols = [
  "addChild",
  "removeChild",
  "_attachGroupHost",
  "groupHost",
  "play()",
  "pause()",
  "seek(progress)",
  "reverse()",
];

describe("P2-04 Track ownership baseline", () => {
  it("keeps every current Track-owned seam explicit and discoverable", async () => {
    const source = await readFile(trackPath, "utf8");
    for (const symbol of [...observationSymbols, ...topologyPlaybackSymbols]) {
      expect(source, `documented Track seam missing: ${symbol}`).toContain(symbol);
    }
  });

  it("does not let the baseline inventory silently grow", async () => {
    const source = await readFile(trackPath, "utf8");
    const discovered = new Set([
      ...source.matchAll(/\b(setObserved|removeObserved|replaceObserved|observedSources|observedEdges|_setGraphGuard|addChild|removeChild|_attachGroupHost|groupHost|play|pause|seek|reverse)\b/g),
    ].map(([symbol]) => symbol));
    const documented = new Set([
      ...observationSymbols,
      "addChild",
      "removeChild",
      "_attachGroupHost",
      "groupHost",
      "play",
      "pause",
      "seek",
      "reverse",
    ]);
    expect([...discovered].filter((symbol) => !documented.has(symbol))).toEqual([]);
  });
});
