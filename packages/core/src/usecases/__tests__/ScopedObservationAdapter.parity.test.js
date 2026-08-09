import { describe, expect, it } from "vitest";
import { ScopedObservationAdapter } from "../ScopedObservationAdapter.js";

function track(id, leaf = id) {
  return {
    id,
    getSnapshot: () => ({ leaf }),
    composeLocal: (raw) => ({ leaf: raw?.leaf ?? leaf }),
  };
}

function scenario(Adapter) {
  const source = track("source", "s");
  const observer = track("observer", "o");
  const adapter = new Adapter({ tracks: [source, observer] });
  adapter.setObserved(observer, source, (patch) => ({ from: patch.leaf }));
  const output = adapter.compose(observer);
  const edges = adapter.getEdges(observer).map(({ source: item, role, input }) => ({
    source: item.id,
    role,
    input,
  }));
  adapter.destroy();
  return { output, edges };
}

describe("P2-03 scoped adapter parity", () => {
  it("preserves the locked output-fold result and edge shape", () => {
    const result = scenario(ScopedObservationAdapter);
    expect(result).toEqual({
      output: { leaf: "o", from: "s" },
      edges: [{ source: "source", role: "output", input: undefined }],
    });
  });
});
