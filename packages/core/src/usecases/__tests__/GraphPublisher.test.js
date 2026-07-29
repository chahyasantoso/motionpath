import { describe, expect, it } from "vitest";
import { GraphPublisher } from "../GraphPublisher.js";

describe("GraphPublisher", () => {
  it("publishes dirty nodes once in compiled order", () => {
    const calls = [];
    const tracks = new Map([
      ["parent", { compose: () => ({ x: 1 }) }],
      ["child", { compose: (_raw, composed) => ({ parent: composed.get("parent") }) }],
    ]);
    const publisher = new GraphPublisher({ order: ["parent", "child"], tracks, publish: (id, patch) => calls.push([id, patch]) });
    publisher.markDirty("child");
    publisher.markDirty("child");
    expect(publisher.flush()).toBe(1);
    expect(calls).toEqual([["child", { parent: undefined }]]);
  });

  it("flushes all graph nodes in order and coalesces the next frame", () => {
    const calls = [];
    const tracks = new Map([
      ["parent", { compose: () => ({ x: 1 }) }],
      ["child", { compose: (_raw, composed) => ({ parent: composed.get("parent") }) }],
    ]);
    const publisher = new GraphPublisher({ order: ["parent", "child"], tracks, publish: (id) => calls.push(id) });
    publisher.markAllDirty();
    expect(publisher.flush()).toBe(2);
    expect(calls).toEqual(["parent", "child"]);
    expect(publisher.flush()).toBe(0);
  });
});
