import { describe, expect, it } from "vitest";
import { ScopedObservationAdapter } from "../ScopedObservationAdapter.js";
import { StandaloneObservationAdapter } from "../StandaloneObservationAdapter.js";

/**
 * P2-03 adapter equivalence, the gate the scoped migration actually needs.
 *
 * The previous parity coverage compared one output fold. That is not enough to
 * justify switching ownership: the two adapters can agree on the simple case and
 * still disagree on identity dedupe, context memoization or lifecycle, which is
 * exactly what happened. So every scenario below runs against BOTH adapters
 * through one runner, and every result is checked twice:
 *
 * 1. scoped equals compatibility, so the migration is behaviour preserving;
 * 2. both equal a locked literal, so parity cannot be satisfied by two adapters
 *    being identically wrong.
 *
 * Rules for adding a scenario: build the Tracks INSIDE it and always destroy the
 * adapter. The compatibility adapter's registry is module-global, so a scenario
 * that leaks Tracks changes the result of the next one.
 */

function makeTrack(id, leaf = id, onCompose = () => {}) {
  const lifecycleSubscribers = new Set();
  const destroySubscribers = new Set();
  return {
    id,
    getSnapshot: () => ({ leaf }),
    composeLocal: (raw) => {
      onCompose(id);
      return { leaf: raw?.leaf ?? leaf };
    },
    onLifecycle(callback) {
      lifecycleSubscribers.add(callback);
      return () => lifecycleSubscribers.delete(callback);
    },
    onSourceDestroyed(callback) {
      destroySubscribers.add(callback);
      return () => destroySubscribers.delete(callback);
    },
    emitDetached() {
      for (const callback of [...lifecycleSubscribers])
        callback({ type: "detached", track: this });
    },
    /** Mirrors Track.destroy(): subscribers read observerIds off the event. */
    emitDestroySnapshot() {
      const event = { id, observerIds: ["stale"] };
      for (const callback of [...destroySubscribers]) callback(event);
      return event.observerIds;
    },
  };
}

function edgeShape(adapter, track) {
  return adapter.getEdges(track).map(({ source, role, input, mapFn }) => ({
    source: source.id,
    role,
    input,
    mapper: typeof mapFn === "function" ? "fn" : "none",
  }));
}

function sourceIds(adapter, track) {
  return adapter.getSources(track).map(({ id }) => id);
}

function throwsWith(action, pattern) {
  try {
    action();
    return { threw: false, matched: false };
  } catch (error) {
    return {
      threw: true,
      matched: pattern.test(String(error?.message ?? error)),
    };
  }
}

function safeCall(action) {
  try {
    action();
    return { threw: false };
  } catch (error) {
    return { threw: true, message: String(error?.message ?? error) };
  }
}

const SCENARIOS = {
  outputFold(Adapter) {
    const source = makeTrack("source", "s");
    const observer = makeTrack("observer", "o");
    const adapter = new Adapter({ tracks: [source, observer] });
    adapter.setObserved(observer, source, (patch) => ({ from: patch.leaf }));
    const result = {
      edges: edgeShape(adapter, observer),
      sources: sourceIds(adapter, observer),
      observerIds: adapter.getObserverIds(source),
      composed: adapter.compose(observer),
    };
    adapter.destroy();
    return result;
  },

  inputFold(Adapter) {
    const source = makeTrack("source", "s");
    const target = makeTrack("target", "base");
    const adapter = new Adapter({ tracks: [source, target] });
    adapter.setObserved(target, source, () => ({ leaf: "injected" }), {
      role: "input",
      target: "target",
    });
    adapter.setObserved(target, source, (patch) => ({ from: patch.leaf }), {
      role: "output",
    });
    const result = {
      edges: edgeShape(adapter, target),
      // One source, two roles, one entry. Dedupe is by Track identity.
      sources: sourceIds(adapter, target),
      observerIds: adapter.getObserverIds(source),
      composed: adapter.compose(target),
    };
    adapter.destroy();
    return result;
  },

  repeatedReplacement(Adapter) {
    const first = makeTrack("first", "1");
    const second = makeTrack("second", "2");
    const third = makeTrack("third", "3");
    const observer = makeTrack("observer", "o");
    const adapter = new Adapter({ tracks: [first, second, third, observer] });
    adapter.setObserved(observer, first, () => ({ value: "a" }));
    adapter.setObserved(observer, first, () => ({ value: "b" }));
    const afterRepeat = {
      edges: edgeShape(adapter, observer),
      composed: adapter.compose(observer),
    };
    adapter.replaceObserved(observer, first, second, (patch) => ({
      value: patch.leaf,
    }));
    const afterFirstSwap = {
      edges: edgeShape(adapter, observer),
      composed: adapter.compose(observer),
      firstObservers: adapter.getObserverIds(first),
      secondObservers: adapter.getObserverIds(second),
    };
    adapter.replaceObserved(observer, second, third, (patch) => ({
      value: patch.leaf,
    }));
    const afterSecondSwap = {
      edges: edgeShape(adapter, observer),
      composed: adapter.compose(observer),
      secondObservers: adapter.getObserverIds(second),
      thirdObservers: adapter.getObserverIds(third),
    };
    adapter.removeObserved(observer, third);
    const afterRemoval = {
      edges: edgeShape(adapter, observer),
      composed: adapter.compose(observer),
      thirdObservers: adapter.getObserverIds(third),
    };
    adapter.destroy();
    return { afterRepeat, afterFirstSwap, afterSecondSwap, afterRemoval };
  },

  mutualCycle(Adapter) {
    const a = makeTrack("a");
    const b = makeTrack("b");
    const adapter = new Adapter({ tracks: [a, b] });
    adapter.setObserved(a, b, (patch) => ({ fromB: patch.leaf }));
    adapter.setObserved(b, a, (patch) => ({ fromA: patch.leaf }));
    const result = {
      fromA: adapter.compose(a),
      fromB: adapter.compose(b),
      aObservers: adapter.getObserverIds(a),
      bObservers: adapter.getObserverIds(b),
    };
    adapter.destroy();
    return result;
  },

  diamondMemoization(Adapter) {
    const calls = [];
    const record = (id) => calls.push(id);
    const a = makeTrack("a", "a", record);
    const b = makeTrack("b", "b", record);
    const c = makeTrack("c", "c", record);
    const d = makeTrack("d", "d", record);
    const adapter = new Adapter({ tracks: [a, b, c, d] });
    adapter.setObserved(b, a, (patch) => ({ fromA1: patch.leaf }));
    adapter.setObserved(c, a, (patch) => ({ fromA2: patch.leaf }));
    adapter.setObserved(d, b, (patch) => ({ fromB: patch.leaf }));
    adapter.setObserved(d, c, (patch) => ({ fromC: patch.leaf }));
    const composed = adapter.compose(d);
    const result = { composed, calls: [...calls].sort(), total: calls.length };
    adapter.destroy();
    return result;
  },

  lightweightEdge(Adapter) {
    const source = makeTrack("source", "s");
    const observer = makeTrack("observer", "o");
    const adapter = new Adapter({ tracks: [source, observer] });
    adapter.setObserved(observer, source);
    const result = {
      edges: edgeShape(adapter, observer),
      composed: adapter.compose(observer),
      observerIds: adapter.getObserverIds(source),
    };
    adapter.destroy();
    return result;
  },

  destroySnapshot(Adapter) {
    const source = makeTrack("source", "s");
    const observer = makeTrack("observer", "o");
    const adapter = new Adapter({ tracks: [source, observer] });
    adapter.setObserved(observer, source, (patch) => ({ from: patch.leaf }));
    const before = adapter.getObserverIds(source);
    const snapshotIds = source.emitDestroySnapshot();
    adapter.removeObserved(observer, source);
    const after = adapter.getObserverIds(source);
    adapter.destroy();
    return { before, snapshotIds, after };
  },

  detached(Adapter) {
    const source = makeTrack("source", "s");
    const observer = makeTrack("observer", "o");
    const adapter = new Adapter({ tracks: [source, observer] });
    adapter.setObserved(observer, source, (patch) => ({ from: patch.leaf }));
    const before = edgeShape(adapter, observer);
    source.emitDetached();
    const result = {
      before,
      after: edgeShape(adapter, observer),
      observers: adapter.getObserverIds(source),
    };
    adapter.destroy();
    return result;
  },

  duplicateIds(Adapter) {
    const left = makeTrack("bone", "left");
    const right = makeTrack("bone", "right");
    const adapter = new Adapter({ tracks: [left, right] });
    adapter.setObserved(right, left, (patch) => ({ fromLeft: patch.leaf }));
    const result = {
      sourceIds: sourceIds(adapter, right),
      sourceIsLeftTrack: adapter.getSources(right)[0] === left,
      leftEdges: edgeShape(adapter, left),
      rightEdges: edgeShape(adapter, right),
      composedRight: adapter.compose(right),
      composedLeft: adapter.compose(left),
      leftObservers: adapter.getObserverIds(left),
    };
    adapter.destroy();
    return result;
  },

  sharedContext(Adapter) {
    const calls = [];
    const record = (id) => calls.push(id);
    const shared = makeTrack("shared", "sh", record);
    const first = makeTrack("first", "1", record);
    const second = makeTrack("second", "2", record);
    const adapter = new Adapter({ tracks: [shared, first, second] });
    adapter.setObserved(first, shared, (patch) => ({ from: patch.leaf }));
    adapter.setObserved(second, shared, (patch) => ({ from: patch.leaf }));
    // One public context across two composes: the shared upstream is composed
    // once, and the context stays keyed by public Track id.
    const ctx = new Map();
    const composedFirst = adapter.compose(first, undefined, ctx);
    const composedSecond = adapter.compose(second, undefined, ctx);
    const result = {
      composedFirst,
      composedSecond,
      contextKeys: [...ctx.keys()],
      sharedComposeCount: calls.filter((id) => id === "shared").length,
    };
    adapter.destroy();
    return result;
  },

  clearObserved(Adapter) {
    const a = makeTrack("a");
    const b = makeTrack("b");
    const observer = makeTrack("observer", "o");
    const adapter = new Adapter({ tracks: [a, b, observer] });
    adapter.setObserved(observer, a, (patch) => ({ fromA: patch.leaf }));
    adapter.setObserved(observer, b, () => ({ leaf: "input" }), {
      role: "input",
      target: "observer",
    });
    const before = edgeShape(adapter, observer);
    adapter.clearObserved(observer);
    const result = {
      before,
      after: edgeShape(adapter, observer),
      aObservers: adapter.getObserverIds(a),
      bObservers: adapter.getObserverIds(b),
      composed: adapter.compose(observer),
    };
    adapter.destroy();
    return result;
  },

  unregisterObserver(Adapter) {
    const source = makeTrack("source", "s");
    const observer = makeTrack("observer", "o");
    const downstream = makeTrack("downstream", "d");
    const adapter = new Adapter({ tracks: [source, observer, downstream] });
    adapter.setObserved(observer, source, (patch) => ({ from: patch.leaf }));
    adapter.setObserved(downstream, observer, (patch) => ({ via: patch.leaf }));
    const before = {
      observerEdges: edgeShape(adapter, observer),
      downstreamEdges: edgeShape(adapter, downstream),
    };
    adapter.unregister(observer);
    const after = {
      observerEdges: edgeShape(adapter, observer),
      downstreamEdges: edgeShape(adapter, downstream),
      sourceObservers: adapter.getObserverIds(source),
      tracked: adapter.tracks.size,
    };
    adapter.destroy();
    return { before, after };
  },

  afterDestroy(Adapter) {
    const source = makeTrack("source", "s");
    const observer = makeTrack("observer", "o");
    const adapter = new Adapter({ tracks: [source, observer] });
    adapter.setObserved(observer, source, (patch) => ({ from: patch.leaf }));
    adapter.destroy();
    return {
      isDestroyed: adapter.isDestroyed,
      edges: adapter.getEdges(observer),
      sources: adapter.getSources(observer),
      observerIds: adapter.getObserverIds(source),
      tracked: adapter.tracks.size,
      composeThrows: throwsWith(() => adapter.compose(observer), /destroyed/i),
      registerThrows: throwsWith(
        () => adapter.register(makeTrack("late")),
        /destroyed/i,
      ),
      removeObservedIsSafe: safeCall(() =>
        adapter.removeObserved(observer, source),
      ),
      destroyIsIdempotent: safeCall(() => adapter.destroy()),
    };
  },

  errorPaths(Adapter) {
    const source = makeTrack("source", "s");
    const stranger = makeTrack("stranger", "x");
    const observer = makeTrack("observer", "o");
    const adapter = new Adapter({ tracks: [source, observer] });
    adapter.setObserved(observer, source, (patch) => ({ from: patch.leaf }));
    const result = {
      registerWithoutId: throwsWith(
        () => adapter.register({}),
        /requires a track/i,
      ),
      selfObservation: throwsWith(
        () => adapter.setObserved(observer, observer, () => ({})),
        /cannot observe itself/i,
      ),
      replaceUnknownSource: throwsWith(
        () => adapter.replaceObserved(observer, stranger, source, () => ({})),
        /does not observe/i,
      ),
      removeUnknownIsSafe: safeCall(() =>
        adapter.removeObserved(observer, stranger),
      ),
      edges: edgeShape(adapter, observer),
    };
    adapter.destroy();
    return result;
  },
};

/** The contract, written out. Never relax an entry to make a run green. */
const LOCKED = {
  outputFold: {
    edges: [{ source: "source", role: "output", mapper: "fn" }],
    sources: ["source"],
    observerIds: ["observer"],
    composed: { leaf: "o", from: "s" },
  },
  inputFold: {
    edges: [
      { source: "source", role: "input", input: "target", mapper: "fn" },
      { source: "source", role: "output", mapper: "fn" },
    ],
    sources: ["source"],
    observerIds: ["target"],
    composed: { leaf: "injected", from: "s" },
  },
  repeatedReplacement: {
    afterRepeat: {
      edges: [{ source: "first", role: "output", mapper: "fn" }],
      composed: { leaf: "o", value: "b" },
    },
    afterFirstSwap: {
      edges: [{ source: "second", role: "output", mapper: "fn" }],
      composed: { leaf: "o", value: "2" },
      firstObservers: [],
      secondObservers: ["observer"],
    },
    afterSecondSwap: {
      edges: [{ source: "third", role: "output", mapper: "fn" }],
      composed: { leaf: "o", value: "3" },
      secondObservers: [],
      thirdObservers: ["observer"],
    },
    afterRemoval: { edges: [], composed: { leaf: "o" }, thirdObservers: [] },
  },
  mutualCycle: {
    fromA: { leaf: "a", fromB: "b" },
    fromB: { leaf: "b", fromA: "a" },
    aObservers: ["b"],
    bObservers: ["a"],
  },
  diamondMemoization: {
    composed: { leaf: "d", fromB: "b", fromC: "c" },
    calls: ["a", "b", "c", "d"],
    total: 4,
  },
  lightweightEdge: {
    edges: [{ source: "source", role: "output", mapper: "none" }],
    composed: { leaf: "o" },
    observerIds: ["observer"],
  },
  destroySnapshot: {
    before: ["observer"],
    snapshotIds: ["observer"],
    after: [],
  },
  detached: {
    before: [{ source: "source", role: "output", mapper: "fn" }],
    after: [],
    observers: [],
  },
  duplicateIds: {
    sourceIds: ["bone"],
    sourceIsLeftTrack: true,
    leftEdges: [],
    rightEdges: [{ source: "bone", role: "output", mapper: "fn" }],
    composedRight: { leaf: "right", fromLeft: "left" },
    composedLeft: { leaf: "left" },
    leftObservers: ["bone"],
  },
  sharedContext: {
    composedFirst: { leaf: "1", from: "sh" },
    composedSecond: { leaf: "2", from: "sh" },
    contextKeys: ["first", "second"],
    sharedComposeCount: 1,
  },
  clearObserved: {
    before: [
      { source: "a", role: "output", mapper: "fn" },
      { source: "b", role: "input", input: "observer", mapper: "fn" },
    ],
    after: [],
    aObservers: [],
    bObservers: [],
    composed: { leaf: "o" },
  },
  unregisterObserver: {
    before: {
      observerEdges: [{ source: "source", role: "output", mapper: "fn" }],
      downstreamEdges: [{ source: "observer", role: "output", mapper: "fn" }],
    },
    after: {
      observerEdges: [],
      downstreamEdges: [],
      sourceObservers: [],
      tracked: 2,
    },
  },
  afterDestroy: {
    isDestroyed: true,
    edges: [],
    sources: [],
    observerIds: [],
    tracked: 0,
    composeThrows: { threw: true, matched: true },
    registerThrows: { threw: true, matched: true },
    removeObservedIsSafe: { threw: false },
    destroyIsIdempotent: { threw: false },
  },
  errorPaths: {
    registerWithoutId: { threw: true, matched: true },
    selfObservation: { threw: true, matched: true },
    replaceUnknownSource: { threw: true, matched: true },
    removeUnknownIsSafe: { threw: false },
    edges: [{ source: "source", role: "output", mapper: "fn" }],
  },
};

describe("P2-03 observation adapter scenario parity", () => {
  it("covers every locked scenario", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(Object.keys(LOCKED).sort());
  });

  it("exposes one public adapter contract", () => {
    const surface = (Adapter) =>
      Object.getOwnPropertyNames(Adapter.prototype).sort();
    expect(surface(ScopedObservationAdapter)).toEqual(
      surface(StandaloneObservationAdapter),
    );
  });

  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    it(`holds the locked contract in compatibility ownership: ${name}`, () => {
      expect(scenario(StandaloneObservationAdapter)).toEqual(LOCKED[name]);
    });

    it(`holds the locked contract in scoped ownership: ${name}`, () => {
      expect(scenario(ScopedObservationAdapter)).toEqual(LOCKED[name]);
    });

    it(`produces identical results in both ownership modes: ${name}`, () => {
      expect(scenario(ScopedObservationAdapter)).toEqual(
        scenario(StandaloneObservationAdapter),
      );
    });
  }
});
