# MotionPath — Brief 4: EditorEngine

**Audience:** AI coding agent (Gemini Flash) implementing directly against `lib/builder.js`'s `BuildResult`.
**Precondition:** Read `brief3-shared-utilities.md` FIRST and confirm `lib/timelineResolver.js` and `lib/compose.js` are already implemented (from Brief 3's shared section). This brief imports both — it does not redefine them.
**Scope:** deliberately the simpler of the two engines. No ScrollTrigger, no autoplay, no live-scroll simulation. Architecture §10: "isolated canvas only" — this engine exists for a preview/editing UI that scrubs by explicit user input, not real scroll or real time.

---

## §0 — Warning: known failure modes for fast/cheap models

1. **Do not import, reference, or call `ScrollTrigger` anywhere in this file.** Not even conditionally, not even in a code path that "would only run in production." If the string `ScrollTrigger` appears anywhere in `EditorEngine.js`, that is a scope violation — grep for it before considering this brief done.

2. **Do not call `.play()`, `.pause()` on a ticker, or anything that starts autonomous playback.** This engine only moves timelines when explicitly told to, via `setProgress`/`seek`. If you find yourself writing a `requestAnimationFrame` loop or a GSAP ticker callback in this file, stop — that is ProductionEngine's job (Brief 3), not this one.

3. **Do not build `pauseTimer`/`playTimer`/`enableScroll`/`disableScroll` here.** Those four functions belong exclusively to ProductionEngine. If asked to expose something in EditorEngine that resembles them, that is a request to re-read this brief's non-goals, not to implement it.

4. **Do not run a continuous `subscribe()` loop.** EditorEngine calls `compose()` directly, once, immediately after each `setProgress`/`seek` call — it does not `subscribe()` to ongoing ticks, because there are no ongoing ticks; nothing is playing.

5. **Do not inline timeline resolution logic.** Import `resolveTimeline` from `lib/timelineResolver.js`. See that file's CORRECT/WRONG examples in the shared utilities brief — the same duplication risk applies here as in ProductionEngine.

6. **Do not build a shared `MotionEngine` base class with ProductionEngine.** See "Why no unified interface" in the shared utilities brief. This file's only relationship to `ProductionEngine.js` is that both import `timelineResolver.js` and `compose.js` — nothing else is shared, and nothing else should be.

If uncertain whether a feature belongs in this file, the default answer is no — this engine's entire job is to do LESS than ProductionEngine, not an equal-but-different amount.

---

## Responsibilities

### 1. `setProgress(target, progress)`

```js
import { resolveTimeline } from './timelineResolver.js';
import { compose } from './compose.js';

export function setProgress(target, progress, buildResult) {
  const timeline = resolveTimeline(target, buildResult);
  timeline.progress(progress);
  composeAllElements(buildResult);
}
```

`target` is a `sceneId` or `timelineId`, exactly as consumed by `resolveTimeline`. `progress` is a 0–1 float, passed straight to GSAP's native `.progress()` — no clamping or validation needed here (GSAP already clamps internally).

### 2. `seek(target, time, buildResult)`

Same resolution path as `setProgress`, calling `.seek(time)` instead of `.progress(progress)`, for callers that want to scrub by absolute time rather than fractional progress.

```js
export function seek(target, time, buildResult) {
  const timeline = resolveTimeline(target, buildResult);
  timeline.seek(time);
  composeAllElements(buildResult);
}
```

### 3. Rendering after scrub

After either `setProgress` or `seek` moves a timeline, call `compose(elementId, buildResult)` for every element affected. Since `EditorEngine` doesn't track which elements belong to which timeline internally (that mapping lives in `buildResult.scenarios`), the simplest correct approach is to compose every element in `buildResult.elements` on every call — do not try to optimize this into a partial recompose unless a performance problem is actually reported; premature optimization here risks composing the wrong subset and missing an update.

```js
function composeAllElements(buildResult) {
  for (const elementId of buildResult.elements.keys()) {
    compose(elementId, buildResult);
  }
}
```

---

## Explicitly not doing here

- No `ScrollTrigger.create()` anywhere in this file.
- No `.play()`/`.pause()` on a timer.
- No `pauseTimer`/`playTimer`/`enableScroll`/`disableScroll` — those are ProductionEngine-only (§9 vs §10 split, see shared utilities brief).
- No continuous `subscribe()` ticker loop — compose is called once per explicit scrub call, not continuously.
- No shared base class with ProductionEngine.

**File:** `lib/EditorEngine.js`

**Tests:** `lib/__tests__/EditorEngine.test.js`
- `setProgress('grouped-id', 0.5, buildResult)` calls `.progress(0.5)` on the group's `masterTimeline` (assert via spy on the timeline object, not just "no error thrown").
- `setProgress('ungrouped-scene-id', 0.5, buildResult)` falls back to the scenario's own `timeline` when no matching group exists.
- `seek('some-id', 1.2, buildResult)` calls `.seek(1.2)`, not `.progress(1.2)` — assert the correct method was called with the correct argument.
- Grep-style test or static assertion: `EditorEngine.js`'s source does not contain the substring `ScrollTrigger` (can be done as a simple `fs.readFileSync` + `expect(source).not.toContain('ScrollTrigger')` test, or equivalent).
- `compose` (import from `lib/compose.js`, mocked) is called once per element after `setProgress`, and again after `seek` — assert call count matches `buildResult.elements.size` for each scrub call.
- Calling `setProgress` with an unknown target throws (delegated from `resolveTimeline`, but confirm the error propagates uncaught rather than being swallowed).
