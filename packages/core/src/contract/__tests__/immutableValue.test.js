import { describe, expect, it } from "vitest";
import {
  isPlainObject,
  toImmutableList,
  toImmutableValue,
  toImmutableValues,
} from "../immutableValue.js";

describe("P2-01 immutable value contract", () => {
  it("freezes every level of a supported nested value", () => {
    const frozen = toImmutableValue({
      transform: { scale: { x: 1 } },
      path: [{ x: 0 }],
    });
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.transform)).toBe(true);
    expect(Object.isFrozen(frozen.transform.scale)).toBe(true);
    expect(Object.isFrozen(frozen.path)).toBe(true);
    expect(Object.isFrozen(frozen.path[0])).toBe(true);
  });

  it("rejects mutation at every reachable level", () => {
    const frozen = toImmutableValue({ transform: { scale: 1 }, path: [0] });
    expect(() => {
      frozen.transform.scale = 2;
    }).toThrow(TypeError);
    expect(() => {
      frozen.path.push(1);
    }).toThrow(TypeError);
    expect(() => {
      frozen.added = true;
    }).toThrow(TypeError);
    expect(frozen.transform.scale).toBe(1);
  });

  it("clones instead of freezing the caller's object in place", () => {
    const source = { transform: { scale: 1 } };
    const frozen = toImmutableValue(source);
    expect(frozen).not.toBe(source);
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(source.transform)).toBe(false);
    source.transform.scale = 99;
    expect(frozen.transform.scale).toBe(1);
  });

  it("passes foreign references through by identity", () => {
    class Sprite {
      constructor() {
        this.frame = 0;
      }
    }
    const sprite = new Sprite();
    const node = { nodeType: 1 };
    Object.setPrototypeOf(node, { fake: "element" });
    const frozen = toImmutableValue({
      sprite,
      node,
      fn: () => 1,
      when: new Date(0),
      set: new Set([1]),
    });
    expect(frozen.sprite).toBe(sprite);
    expect(frozen.node).toBe(node);
    expect(Object.isFrozen(sprite)).toBe(false);
    expect(typeof frozen.fn).toBe("function");
    expect(frozen.when).toBeInstanceOf(Date);
    expect(frozen.set).toBeInstanceOf(Set);
  });

  it("leaves primitives, null, and undefined alone", () => {
    expect(toImmutableValue(1)).toBe(1);
    expect(toImmutableValue("12px")).toBe("12px");
    expect(toImmutableValue(null)).toBe(null);
    expect(toImmutableValue(undefined)).toBe(undefined);
    expect(toImmutableValue(false)).toBe(false);
  });

  it("preserves shared references and terminates on cycles", () => {
    const shared = { v: 1 };
    const cyclic = { shared };
    cyclic.self = cyclic;
    const frozen = toImmutableValues({ a: shared, b: shared, cyclic });
    expect(frozen.a).toBe(frozen.b);
    expect(frozen.cyclic.self).toBe(frozen.cyclic);
    expect(frozen.cyclic.shared).toBe(frozen.a);
    expect(Object.isFrozen(frozen.cyclic)).toBe(true);
  });

  it("preserves keys whose value is undefined", () => {
    const frozen = toImmutableValue({ role: "input", input: undefined });
    expect("input" in frozen).toBe(true);
    expect(frozen.input).toBe(undefined);
  });

  it("freezes a list and each of its records", () => {
    const list = toImmutableList([{ id: "a", meta: { k: 1 } }, { id: "b" }]);
    expect(Object.isFrozen(list)).toBe(true);
    expect(Object.isFrozen(list[0])).toBe(true);
    expect(Object.isFrozen(list[0].meta)).toBe(true);
    expect(() => {
      list.push({ id: "c" });
    }).toThrow(TypeError);
    expect(() => {
      list[0].id = "z";
    }).toThrow(TypeError);
  });

  it("treats a missing list or record as empty rather than throwing", () => {
    expect(toImmutableList(undefined)).toEqual([]);
    expect(toImmutableValues(undefined)).toEqual({});
    expect(Object.isFrozen(toImmutableList(undefined))).toBe(true);
    expect(Object.isFrozen(toImmutableValues(undefined))).toBe(true);
  });

  it("classifies supported containers correctly", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
  });
});
