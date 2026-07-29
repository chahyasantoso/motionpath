// @vitest-environment jsdom
import { render, cleanup } from "@testing-library/react";
import { useRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("../../../../../packages/core/src/engines/Engine.js", () => ({ engine: { mountWithDelegate: vi.fn((id, delegate) => ({ id, delegate })), unmount: vi.fn() } }));
import { engine } from "../../../../../packages/core/src/engines/Engine.js";
import useScrollMotion from "../useScrollMotion.js";
const scrubScene = { id: "scrub-scene", trigger: { type: "scroll", scrub: 0.5, pin: "pin", start: "top top" }, tracks: [] };
const observerScene = { id: "observer-scene", trigger: { type: "scroll", scrub: false, start: "50% top", toggleActions: "play pause resume pause" }, tracks: [] };
function SharedTriggerHarness() { const sectionRef = useRef(null); const stageRef = useRef(null); useScrollMotion(scrubScene, { trigger: sectionRef, pin: stageRef }); useScrollMotion(observerScene, { trigger: sectionRef }); return <section ref={sectionRef} data-testid="section"><div ref={stageRef} data-testid="stage" /></section>; }
function OwnRefsHarness() { const { refs } = useScrollMotion(scrubScene); return <section ref={refs.trigger} data-testid="section"><div ref={refs.pin} data-testid="stage" /></section>; }
function NullSchemaHarness() { const { refs } = useScrollMotion(null); return <section ref={refs.trigger} />; }
describe("useScrollMotion", () => { beforeEach(() => vi.clearAllMocks()); afterEach(() => cleanup()); it("mounts shared trigger motions", () => { const { getByTestId } = render(<SharedTriggerHarness />); expect(engine.mountWithDelegate).toHaveBeenCalledTimes(2); expect(engine.mountWithDelegate.mock.calls[0][0]).toBe("scrub-scene"); expect(engine.mountWithDelegate.mock.calls[1][0]).toBe("observer-scene"); }); it("allocates own refs", () => { render(<OwnRefsHarness />); expect(engine.mountWithDelegate).toHaveBeenCalledTimes(1); }); it("defers null schema", () => { render(<NullSchemaHarness />); expect(engine.mountWithDelegate).not.toHaveBeenCalled(); }); it("unmounts through engine", () => { const { unmount } = render(<OwnRefsHarness />); unmount(); expect(engine.unmount).toHaveBeenCalledTimes(1); }); });
