**MOTIONPATH PROJECT BRIEFING**

**What it is:**
A data-first animation engine that takes a JSON schema, uses GSAP under the hood, and emits animation values via pub/sub. Framework adapters (React hook) subscribe to those values and apply them directly to the DOM via `gsap.set()`. Zero React re-renders.

**Repo:** https://github.com/chahyasantoso/motionpath

**Core stack:**
- Vanilla JS engine (`motionEngine.js`) — singleton `GsapPubSub` class
- GSAP + ScrollTrigger + MotionPath plugins
- React hook (`useMotionSubscriber`) — subscribes to engine, applies via `gsap.set()`
- Vite + Vitest

**Current engine state:**
- Works but is path-only (`pathNodes` array)
- `triggerType` is scene-level only (`scroll` or `timer`)
- No keyframe system, no stops, no per-property animation
- Needs significant redesign to match new schema

**New schema decisions (locked):**
- Top level: `projectId`, `perspective`, `scenarios`
- `scenarios` is the grouping unit — replaces flat `elements`
- Each scenario has: `sceneId`, `trigger`, `stagger?`, `elements[]`
- **One trigger type per scenario, no exceptions**
- Elements have: `id`, `duration?`, `transformOrigin?`, `direction?`, `keyframes`
- `keyframes` is flat — each key is an animatable property

**Three trigger patterns:**
```json
// 1. Scroll scrubber
{ "type": "scroll", "scrub": true, "start": "...", "end": "..." }

// 2. Scroll observer (fires tween, no scrub)
{ "type": "scroll", "scrub": false, "start": "...", "toggleActions": "..." }

// 3. Pure time
{ "type": "time", "duration": 2, "repeat": -1, "yoyo": true }
```

**Trigger cascade:**
- `sceneId` = default trigger element
- `startTrigger` / `endTrigger` = override for cross-section scroll
- `endTrigger` FORBIDDEN on observer and time triggers

**Keyframe properties supported:**
- Path: `path` → `{ points: [...], stops: [...] }`
- Position: `x`, `y`, `z`
- Transform: `rotation`, `rotationX`, `rotationY`, `scaleX`, `scaleY`, `skewX`, `skewY`
- Visual: `opacity`, `blur`, `brightness`, `contrast`, `saturate`
- Color: `backgroundColor`, `color`, `borderColor` (v accepts string)
- CSS vars: `--any-custom-property`
- `path` and `x`/`y` are mutually exclusive per element

**Stops format:**
```json
{ "p": 0.0, "v": 0, "ease": "power2.out" }
// p = progress 0-1, v = value (number or string), ease = optional on entry
```

**Element-level fields:**
- `transformOrigin` — e.g. `"50% 50%"`
- `direction` — `"to"` / `"from"` / `"fromTo"`
- `duration` — overrides scenario duration for observer/time

**Scenario-level trigger extras:**
- Scroll: `pin`, `pinSpacing`, `snap`
- Time: `yoyo`, `repeatDelay`
- Both: `stagger` at scenario level

**Plugin roadmap (not in schema yet):**
- `splitText`, `morphSVG`, `drawSVG`, `scrambleText`

**Next task: redesign the engine to handle the new schema.**

Makes sense — here's a briefing doc to paste at the top of the new chat so we don't lose any of what got settled this session.

---

**MOTIONPATH — SESSION UPDATE (engine redesign continued)**

**Resolved this session:**

*Plugin architecture:* Properties split into core/eager (position, transform, opacity, color, CSS vars, path) vs lazy-loaded (`splitText`, `morphSVG`, `drawSVG`, `scrambleText` — GSAP Club add-ons). Plugin contract: `keys`, `lazy`/`load()`, `contribute(stops, elementCfg) → { percentPatch, tweenVars }`, `compose(proxyState) → DOM-ready patch`.

*Broadcast/compose split:* Engine broadcasts raw proxy values via `subscribe()` (unchanged signature). `compose(elementId, data)` is a **public method on the singleton** (not hook-internal) that runs active plugins' `compose()` and merges results into a DOM-ready patch. `useMotionSubscriber` binds it as a second arg to `transformFn`: `transformFn(rawData, compose)`. Default path (no `transformFn`) just calls `compose(rawData)` then `gsap.set()`.

*Filter consolidation:* `blur`/`brightness`/`contrast`/`saturate` write to internal proxy fields (`__blur` etc.) during tweening, never directly to `filter`. One filter plugin's `compose()` reads whichever are present and emits one composed `{ filter: "..." }` string. This is the general pattern for any property where multiple keyframe keys must merge into one CSS output.

*Path plugin — important finding:* `MotionPathPlugin` is **dropped entirely**, not used. Empirically verified via a real browser test (motionPath ignores per-segment keyframe pacing — max delta 121px when tested against manual calc). Path stops drive an internal `__pathProgress` field through the same generic keyframes mechanism as everything else; `compose()` calls existing `getPointOnCubicPath()` (already in `pathUtils.js`, already tested) to derive `{x, y, z, rotation}`. `gsap.registerPlugin()` drops to just `ScrollTrigger`.

*Merge/build pipeline:* Per element, all properties' `percentPatch`es merge into one shared GSAP percentage-keyframes object (`"0%"`, `"50%"`, etc.), one `gsap.to()` per element regardless of property count. **Ease collisions** (two properties wanting different eases at the same percent) → **throw at build time**, don't auto-nudge. `tweenVars` merge via `Object.assign`, collision = plugin bug, throw.

*`direction` field (`to`/`from`/`fromTo`):* Validated against real precedent (CSS implicit keyframes, WAAPI single-keyframe inference, GSAP's own `.to()/.from()/.fromTo()`). Resolved as a pre-pass before `contribute()` ever runs: 2+ stops = direction moot. 1 stop: if `p` is at/near 0 → infer `"from"`; at/near 1 → infer `"to"`; otherwise (ambiguous, no positional precedent) → `direction` is **required**, throw if missing. `getNaturalValue()` is plugin-supplied (computed style for real CSS props, identity value like `0`/`1` for synthetic fields like filter internals).

*Trigger system — all three patterns now fully specified:*
- **Scroll scrub:** closest to existing code. Two now-dead hacks removed: `tl.progress(0)` (was only for motionPath autorotate, no longer needed) and `tl.addLabel('end', 1)` (was guarding against short `timeframe`, but `duration` is now observer/time-only so nothing can run short under scrub). Cross-section scroll (`startTrigger`/`endTrigger`) is native GSAP `trigger`/`endTrigger` fields, no custom logic. `pin`/`pinSpacing`/`snap` are pure pass-through. `stagger` needs manual per-element position-offset in the build loop (GSAP's native `stagger` vars option doesn't fit since each element has a distinct merged keyframe shape).
- **Scroll observer:** structurally = same "autonomous timeline" builder as time triggers (real seconds duration, real per-stop eases, since not scrub-bound), wrapped in `gsap.timeline({ scrollTrigger: { trigger, start, end, toggleActions } })`. Confirmed via GSAP docs: `toggleActions` is fully handled internally by GSAP (play/pause/resume/reverse dispatch on enter/leave/enterBack/leaveBack) — **no custom dispatch logic needed engine-side**. Confirmed scrub and `toggleActions` are mutually exclusive per GSAP docs (validates the schema split). Flagged: when `end` is unspecified but more than one of the four toggle actions is non-`none`, behavior relies on ScrollTrigger's own default sizing heuristic — recommend validation-time lint requiring explicit `end` in that case, not silently relying on the default.
- **Time:** unchanged in shape from current code, but now shares the `_buildAutonomousTimeline` helper with observer.
- **`repeat`/`yoyo`/`repeatDelay` recategorized:** apply to **both** `time` and scroll-`observer` (not time-only as originally drafted) since both produce the same autonomous-timeline shape. `pin`/`pinSpacing`/`snap` stay scrub-exclusive (meaningless when progress isn't continuously scroll-bound). `stagger` stays available at scenario level regardless of trigger type.
- **Validation rule (written this session):** `endTrigger` is forbidden on anything except `scroll` with `scrub:true` — throws at build time with a clear message, runs once per scenario before GSAP construction starts.

**Architecture note (not yet resolved):** all the validation rules designed piecemeal across this session (ease collision, `endTrigger` cascade, single-stop `direction` ambiguity, `path`/`x`/`y` mutual exclusivity, one-trigger-type-per-scenario) should probably consolidate into one `validateScenario(scenarioData)` pass at the top of `initScene`, rather than tripping wherever in the pipeline they happen to fire. Not yet written.

**Open/deferred:**
- `motionPath`-vs-keyframes spike test file was created and run in-browser by the user to settle the path-plugin question (result: FAIL, confirmed above) — this is resolved, included for context only.
- GSAP `end` default-sizing heuristic for toggle mode wasn't pinned down precisely (acknowledged uncertainty, not blocking).

**Next move (pick one when resuming):**
1. Write the consolidated `validateScenario()` pass.
2. Write the actual `GsapPubSub` class skeleton (per-scenario `initScene`, plugin registry/resolution/caching, public `compose()`, the three trigger builders).
3. Write concrete `contribute()`/`compose()` implementations plugin-by-plugin for the core set.

---