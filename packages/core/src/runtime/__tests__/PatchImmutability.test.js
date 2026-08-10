import { describe, expect, it } from "vitest";
import { PatchRegistry } from "../PatchRegistry.js";
import {
  toImmutablePatchValue,
  toImmutablePatchValues,
} from "../immutablePatchValue.js";

describe("PR-06 follow-up: deep patch immutability", () => {
  it("freezes every level of the supported value shape", () => {
    const registry = new PatchRegistry();
    const patch = registry.publish("n0", {
      transform: { scale: { x: 1 } },
      path: [{ x: 0 }],
    });
    expect(Object.isFrozen(patch)).toBe(true);
    expect(Object.isFrozen(patch.values)).toBe(true);
    expect(Object.isFrozen(patch.values.transform)).toBe(true);
    expect(Object.isFrozen(patch.values.transform.scale)).toBe(true);
    expect(Object.isFrozen(patch.values.path)).toBe(true);
    expect(Object.isFrozen(patch.values.path[0])).toBe(true);
  });

  it("rejects nested mutation instead of silently accepting it", () => {
    const registry = new PatchRegistry();
    const patch = registry.publish("n0", {
      transform: { scale: 1 },
      path: [0],
    });
    expect(() => {
      patch.values.transform.scale = 2;
    }).toThrow(TypeError);
    expect(() => {
      patch.values.path.push(1);
    }).toThrow(TypeError);
    expect(patch.values.transform.scale).toBe(1);
  });

  it("leaves the caller's source objects mutable and owned by the caller", () => {
    const registry = new PatchRegistry();
    const source = { transform: { scale: 1 } };
    registry.publish("n0", source);
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(source.transform)).toBe(false);
    source.transform.scale = 2;
    expect(source.transform.scale).toBe(2);
  });

  it("isolates a published patch from later mutation of its source", () => {
    const registry = new PatchRegistry();
    const source = { transform: { scale: 1 } };
    const patch = registry.publish("n0", source);
    source.transform.scale = 99;
    expect(patch.values.transform.scale).toBe(1);
  });

  it("passes foreign references through by identity without freezing them", () => {
    class Sprite {
      constructor() {
        this.frame = 0;
      }
    }
    const sprite = new Sprite();
    const registry = new PatchRegistry();
    const patch = registry.publish("n0", { sprite });
    expect(patch.values.sprite).toBe(sprite);
    expect(Object.isFrozen(sprite)).toBe(false);
    sprite.frame = 3;
    expect(patch.values.sprite.frame).toBe(3);
  });

  it("preserves shared references and terminates on cycles", () => {
    const shared = { v: 1 };
    const cyclic = { shared };
    cyclic.self = cyclic;
    const frozen = toImmutablePatchValues({ a: shared, b: shared, cyclic });
    expect(frozen.a).toBe(frozen.b);
    expect(frozen.cyclic.self).toBe(frozen.cyclic);
    expect(frozen.cyclic.shared).toBe(frozen.a);
    expect(Object.isFrozen(frozen.cyclic)).toBe(true);
  });

  it("leaves primitives and null alone", () => {
    expect(toImmutablePatchValue(1)).toBe(1);
    expect(toImmutablePatchValue("12px")).toBe("12px");
    expect(toImmutablePatchValue(null)).toBe(null);
    expect(toImmutablePatchValue(undefined)).toBe(undefined);
  });

  it("keeps revision dedupe intact after cloning", () => {
    const registry = new PatchRegistry();
    const first = registry.publish("n0", { transform: { scale: 1 } });
    const second = registry.publish("n0", { transform: { scale: 1 } });
    expect(second).toBe(first);
    expect(second.revision).toBe(1);
    const third = registry.publish("n0", { transform: { scale: 2 } });
    expect(third.revision).toBe(2);
  });
});
