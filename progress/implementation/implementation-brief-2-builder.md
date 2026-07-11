# MotionPath — Implementation Brief 2: Shared Builder (Consolidated)

**Status:** Design-complete. Fix-note 2b (Explicit Two-Stop Keyframes — removal of direction inference) applied directly into this document.

**Editorial note on this merge:** the original Brief 2 implemented direction inference (`resolveDirection()`, `getNaturalValue()`, and Addendum A's natural-value seeding). All three are removed here per the locked "Explicit Two-Stop Keyframes" schema addendum: every property now arrives with ≥2 explicit stops, enforced upstream by Brief 1's validator, so there is nothing left to infer or seed. Every place this touches is marked **[REMOVED — see note]** inline so the diff against your original is traceable. No other content changed.

**Precondition (do not re-verify):** input schema has already passed `validateProject` (Brief 1) with zero errors, including the ≥2-stops rule. This module must **not** re-implement any schema-validation rule from Brief 1. If it receives invalid schema, undefined behavior is acceptable — that is not a bug in this module.

---

## 0. Read This Before Writing Any Code

This spec is being implemented by a fast/cheap model. Fast models reliably produce code that **runs without crashing but silently does the wrong thing** — merging when it should deep-merge, overwriting when it should throw, flattening a nested structure "for simplicity." That is a worse outcome than a crash, because it looks done and isn't.

Rules for this implementation, non-negotiable:
- **Follow the algorithms in §4–§6 exactly, step by step, in the stated order.** Do not restructure them into what seems like a cleaner equivalent. If a step says "deep-merge at each percent key," implement a deep merge — not `Object.assign` at the top level, not a flatten-then-assign.
- **Every "must throw" in this document means throw a real Error, synchronously, at build time** — not a `console.warn`, not a silently-skipped element, not a returned `null`.
- **Do not add functionality not listed here.** If something seems missing (e.g. "should this also validate X"), it is either handled in Brief 1 or intentionally deferred — see §7. Do not add it.
- **If a §8 test case fails, the code is wrong — fix the code, do not adjust the test to match the code's actual behavior.**
- **Do not touch anything under §7 (Non-Goals).** ScrollTrigger creation, `.play()`, `compose()`, `subscribe()` are explicitly other modules' jobs. Building them "since it seemed related" is a spec violation, not a bonus.
- **GSAP must tween a plain object proxy, never the DOM node directly.** This is the single easiest shortcut to take by accident, because tweening the DOM node "just works" for simple properties and looks correct in a quick test. It silently breaks the moment `blur`/`brightness`/`path` (synthetic properties with no CSS equivalent, per architecture doc §3–§4) are used, and it breaks the broadcast/compose split (§2) that another module depends on. See §5 — read it before writing the element-build loop.
- **Do not implement direction inference or natural-value lookups.** `resolveDirection()` and `getNaturalValue()` do not exist in this version of the plugin contract. Every property's `stops` array already contains ≥2 explicit entries by the time it reaches this module — treat that as a hard precondition, not something to check or work around.

---

## 1. Purpose

Turn a validated project schema into ready-to-use, **paused** GSAP timeline objects — one per scenario, nested into master timelines for `timelineId` groups. Does not attach ScrollTrigger, does not play anything, does not compose DOM patches. Purely: schema in, constructed-but-dormant GSAP objects out.

---

## 2. Public Interface

```ts
interface BuildDependencies {
  // Resolves a schema element id to its real DOM node.
  // Builder does NOT implement id->DOM lookup itself (that's a separate,
  // already-specified module using data-motion-id). It is injected here
  // so this module has zero DOM-query logic of its own and stays unit-testable
  // with a mock resolver.
  resolveElement: (elementId: string) => Element;
}

interface TriggerConfig {
  // Passed through verbatim from schema.scenario.trigger — this module does not
  // interpret trigger fields beyond reading `type` and `scrub` to pick a build path.
  [key: string]: unknown;
}

interface ScenarioBuild {
  scenarioIndex: number;             // index into schema.scenarios, stable key
  sceneId: string;
  triggerType: "scroll-scrub" | "scroll-observer" | "time";
  triggerConfig: TriggerConfig;      // raw, unmodified, for the engine to wire later
  timeline: gsap.core.Timeline;      // paused: true, fully built, contains every element's tween
  timelineId?: string;
  isPrimary: boolean;                // false if no timelineId
}

interface TimelineGroupBuild {
  timelineId: string;
  triggerType: "scroll-scrub" | "time"; // never "scroll-observer" — enforced by Brief 1, not re-checked here
  masterTimeline: gsap.core.Timeline;   // paused: true, contains nested child scenario timelines
  primaryScenarioIndex: number;
}

interface ElementBuild {
  proxy: Record<string, unknown>;   // GSAP's actual tween target. Engine's subscribe() reads from this every tick.
  domNode: Element;                 // resolved via deps.resolveElement — stored purely for the engine's later
                                     // compose()/gsap.set() write-back. This module never reads from or writes
                                     // to domNode at all now [REMOVED — see note: was also used for
                                     // getNaturalValue() during direction resolution; that call site is gone].
}

interface BuildResult {
  elementPlugins: Map<string, Plugin[]>;      // elementId -> resolved plugins, for the engine's later compose() calls
  elements: Map<string, ElementBuild>;        // elementId -> { proxy, domNode }, for the engine's subscribe()/compose()
  scenarios: ScenarioBuild[];                 // one entry per schema scenario, same order as input
  timelineGroups: Map<string, TimelineGroupBuild>;
}

function buildProject(
  schema: ValidatedProjectSchema,
  deps: BuildDependencies
): Promise<BuildResult>
```

- Async because lazy plugins (§3) may need dynamic import.
- Pure with respect to GSAP global state except for constructing timeline/tween objects — does not call `.play()`, `.pause()` beyond the initial `paused: true`, or touch `ScrollTrigger` at all.
- Must not mutate the input `schema` object.

---

## 3. Plugin Contract (restated exactly — do not alter)

```ts
interface Plugin {
  keys: string[];                 // keyframe property names this plugin owns, e.g. ["x","y","z"]
  lazy?: boolean;                 // true only for splitText/morphSVG/drawSVG/scrambleText
  load?: () => Promise<void>;     // required if lazy is true; must be idempotent (see below)
  contribute(
    propertyKey: string,
    stops: Array<{ p: number; v: number | string; ease?: string }>,
    elementCfg: unknown
  ): { percentPatch: Record<string, Record<string, unknown>>; tweenVars?: Record<string, unknown> };
  // compose() also exists on Plugin but is NEVER called by this module — it belongs
  // to the engine layer. Do not call it. Do not implement it here if it's missing;
  // that's a different module's responsibility.
}
```

**[REMOVED — see note]** `getNaturalValue(propertyKey: string, domNode: Element): number | string;` no longer exists on this interface. No plugin implements it; nothing calls it.

**Lazy plugin loading rule — implement exactly this, it is a known correctness trap:**
Two elements using the same lazy plugin (e.g. two elements both using `splitText`) in the same build pass must trigger only **one** dynamic import, not two. Cache the load with a **module-level promise**, not a boolean flag:

```ts
// CORRECT — concurrent calls share the same in-flight promise
let loadPromise: Promise<void> | null = null;
function ensureLoaded(plugin: Plugin): Promise<void> {
  if (!plugin.lazy) return Promise.resolve();
  if (!loadPromise) loadPromise = plugin.load();
  return loadPromise;
}
```

```ts
// WRONG — a boolean flag race-conditions under concurrent async calls,
// causing plugin.load() to fire twice. Do not implement it this way.
let loaded = false;
async function ensureLoaded(plugin) {
  if (!loaded) { await plugin.load(); loaded = true; } // two concurrent calls both pass the `if`
}
```

Resolve and cache each element's plugin list **once**, at build time, in `elementPlugins` — never re-resolve per tick, per §1 of the architecture doc.

---

## 4. Direction Resolution

**[REMOVED — see note]** This section, its `resolveDirection()` function, its input/output table, and its test cases have been deleted in full. Direction inference does not exist in this schema version — every property's `stops` array already contains ≥2 explicit entries, enforced upstream by Brief 1. There is no pre-pass before `contribute()` anymore; stops from schema are used as-is.

---

## 5. Element Build — Merge Pipeline (implement in this exact order)

**0. Before processing any property:** create `const proxy: Record<string, unknown> = {}` for this element. Resolve `const domNode = deps.resolveElement(element.id)`. `domNode` is stored in the final `ElementBuild` (§2) purely for the engine layer to use later — **[REMOVED — see note]** it is not read by this module at all now (previously used for `getNaturalValue()` calls; that call site is gone). It is never the tween target and this module never writes to it (no `.style` mutation, no `gsap.set()` on it). Both `proxy` and `domNode` get stored in the final `ElementBuild` (§2).

For each element in a scenario, in `keyframes` key declaration order:

1. Resolve owning plugin via `keys` lookup (build this lookup once, at module load, from the static plugin registry — not per element, not per property).
2. `await ensureLoaded(plugin)`.
3. Get `stops` for this property key **directly from schema — use as-is.** **[REMOVED — see note]** No `resolveDirection` call, no natural-value lookup. Every property (including `path.stops`; `path.points` remains separate static data, passed through as-is inside `elementCfg`) already has ≥2 explicit stops by the time this module sees it — that is a precondition, not something built here.
4. Call `plugin.contribute(propertyKey, stops, elementCfg)` → `{ percentPatch, tweenVars }`.
5. **Deep-merge `percentPatch` into one shared object, per element, keyed by percent-string.** This must be a real per-key merge, not a shallow overwrite of the whole percent key:

```ts
// CORRECT
for (const percentKey of Object.keys(percentPatch)) {
  sharedKeyframes[percentKey] = {
    ...(sharedKeyframes[percentKey] ?? {}),
    ...percentPatch[percentKey],
  };
}
```

```ts
// WRONG — overwrites any other property already contributed at this same percent
sharedKeyframes[percentKey] = percentPatch[percentKey];
```

6. **Merge `tweenVars` via `Object.assign`, and detect collisions before assigning:**

```ts
for (const key of Object.keys(tweenVars ?? {})) {
  if (key in sharedTweenVars && sharedTweenVars[key] !== tweenVars[key]) {
    throw new Error(
      `tweenVars collision on element "${elementCfg.id}": key "${key}" ` +
      `contributed twice with different values (plugin authoring bug, not a schema error).`
    );
  }
  sharedTweenVars[key] = tweenVars[key];
}
```

This check belongs in the builder, not Brief 1's validator — it depends on plugin internals (what `contribute()` actually returns), not on schema data alone, so it cannot be a static schema-validation rule.

7. **Ease collision check, defense-in-depth:** Brief 1 already rejects this at the schema level, but the merge in step 5 is the mechanical point where it would silently corrupt data if it ever slipped through. When merging `percentPatch` at a given `percentKey`, if `sharedKeyframes[percentKey].ease` is already set to a different value than the incoming contribution's `ease`, throw. Do not silently let the last-merged `ease` win.

8. After all properties are processed, construct exactly one `gsap.to()` for this element, **targeting the `proxy` object created in step 0 — never `domNode`:**

```ts
// CORRECT — GSAP writes into the plain object; nothing touches the real DOM here
gsap.to(proxy, { keyframes: sharedKeyframes, ...sharedTweenVars, paused: true });
```

```ts
// WRONG — works for x/opacity in a quick manual test, then silently breaks the moment
// a synthetic property (blur, __pathProgress) is used, since those have no CSS equivalent
// to write to on a real element. Also breaks the broadcast/compose split entirely.
gsap.to(domNode, { keyframes: sharedKeyframes, ...sharedTweenVars, paused: true });
```

**One call per element, regardless of how many properties it animates** — this is a hard invariant, not a suggestion. Store the resulting tween association implicitly via `proxy` itself — the engine layer reads current values directly off `proxy` on each tick (that mechanism lives outside this module; this module's only job is making sure `proxy` is the thing GSAP is actually updating).

---

## 6. Scenario and Group Timeline Construction

**Per scenario, after every element's tween is built:**

- Create `gsap.timeline({ paused: true })` for the scenario.
- **`scroll-scrub` scenarios:** add every element's tween at position `0` (`scenarioTimeline.add(elementTween, 0)`), unless `scenario.stagger` is set — then add at `index * scenario.stagger` seconds, `index` = declaration order in `elements[]`. Scrub elements animate in parallel against the same scroll-progress axis by default; `stagger` is the one thing allowed to offset that.
- **`time` / `scroll-observer` scenarios:** same stagger rule (`index * scenario.stagger`, default `0`). These are real-seconds timelines (`_buildAutonomousTimeline` in the architecture doc) — durations and eases are literal, not scroll-scrubbed.

**Grouped scenarios (`timelineId` present):**

- Group scenarios by `timelineId`. (Brief 1 already guarantees: same trigger type across the group, no observer in any group, exactly one `primary:true`.) **Do not re-check these — trust the validator.**
- Create one `gsap.timeline({ paused: true })` as the group's master.
- Add each scenario's own timeline as a child, **in schema-declaration order**, using GSAP's default sequential positioning (`master.add(scenarioTimeline)` — no explicit position argument). Do not add any offset/overlap logic — that field does not exist in this schema version (see §7).
- Record `primaryScenarioIndex` in the `TimelineGroupBuild` so the engine layer knows which scenario's `triggerConfig` is the one real trigger to wire.

**Return every scenario's build, whether grouped or not, in `scenarios[]`** — grouped scenarios still appear individually (their own `timeline` field is the un-nested child timeline, useful for `EditorEngine`'s per-scenario seek if ever needed), in addition to being nested inside their group's `masterTimeline`.

---

## 7. Explicit Non-Goals

Do not implement any of the following in this module. Each is either another module's job or not part of this schema version:

- **No `ScrollTrigger` creation, no `.play()`, no `.scrollTrigger` config attachment.** This module only constructs paused GSAP timeline/tween objects. Wiring them to real scroll/time playback is `ProductionEngine`'s job.
- **No `compose()` or `subscribe()` implementation.** Those are engine-layer, not builder-layer. This module's only obligation toward them is returning `elementPlugins` so the engine can call `plugin.compose()` itself, later, elsewhere.
- **No re-validation of anything Brief 1 already checks** (trigger shape, ease collision at the schema level, timeline group rules, `stagger` non-negativity, minimum-two-stops, etc.). Assume the input is valid. Re-checking it here is duplicated logic, not extra safety.
- **No `offset`/overlap support for `timelineId` groups.** Not in this schema version. Sequential-by-declaration-order only (§6). Do not add a position argument to `master.add()` beyond the default.
- **No `id` → DOM resolution logic.** `resolveElement` is injected (§2); this module calls it, never implements `querySelector` itself.
- **No `schemaVersion` checking.** That's Brief 1's job, already run before this module is invoked.
- **No caching/memoization beyond what's specified** (lazy plugin load promise, per-element plugin resolution). Do not add a generic "build cache" layer speculatively.
- **[REMOVED — see note] No direction inference, no natural-value lookup, no proxy seeding.** These do not exist in this schema version. Do not reintroduce `resolveDirection()`, `getNaturalValue()`, or any pre-`contribute()` stop-augmentation step.

---

## 8. Security & Robustness

- Assume the schema is validated, but **do not assume plugin authors are bug-free** — the `tweenVars` collision check (§5.6) exists specifically because plugin bugs are a real, distinct failure class from schema errors.
- Every `throw` in this module must include the element `id` and property key in the message — a build failure with no location context is not debuggable in a real project with dozens of elements.
- `buildProject` must not leave partially-constructed GSAP objects registered globally if it throws partway through — if a throw occurs while building element 5 of 10, no dangling `gsap.to()` calls for elements 1–4 should still be sitting active in GSAP's global timeline registry. Use `paused: true` throughout (already required) and let the caller discard the whole `BuildResult` on failure; do not attempt partial cleanup logic beyond that.

---

## 9. Testing Requirements

- **[REMOVED — see note]** `resolveDirection` test suite deleted — the function no longer exists.
- Merge pipeline (§5) — test with a **mock plugin registry** (fake `contribute()` implementations returning controlled `percentPatch`/`tweenVars`), not real GSAP plugins. Required cases:
  - Two properties contributing to different percent keys → both present in final `sharedKeyframes`, independently.
  - Two properties contributing to the *same* percent key, different props (e.g. one contributes `x`, another `opacity`, both at `"50%"`) → both present in the merged object at that key (proves deep-merge, not overwrite).
  - Two properties contributing conflicting `tweenVars` values for the same key → throws.
  - Two properties contributing the *same* `tweenVars` key with the *same* value → no throw (not every collision is a conflict).
- Lazy plugin loading — mock a `load()` that resolves after a delay; fire two concurrent `ensureLoaded()` calls for the same plugin; assert `load()` was called exactly once.
- Scenario/group construction (§6) — assert stagger offsets are applied at the correct positions; assert grouped scenarios nest in declaration order under one master; assert `primaryScenarioIndex` is correctly recorded.
- One end-to-end test: a small valid 2-scenario project (one grouped pair) → `buildProject` resolves without throwing, returns a `BuildResult` with the expected shape, and every returned timeline has `paused: true`.
- **Proxy-not-DOM test (critical — this is the one shortcut most likely to slip through):** build an element using a synthetic property (e.g. `blur`), advance the returned tween's progress (`tween.progress(0.5)`), then assert (a) `proxy.blur` (or whichever proxy key the plugin uses) changed, and (b) the mock `domNode`'s style/attributes were **not** touched by this module at all. If this test fails, the builder is tweening the DOM node directly — a spec violation, not a passing edge case.
- **New, replacing the removed direction tests:** feed `contribute()` a property with exactly 2 explicit stops (no natural-value involvement possible) and assert the builder never calls anything resembling a natural-value/direction step — i.e. assert no such function exists to call, and that `stops` reaching `contribute()` are byte-identical to the schema's declared stops (proves nothing was injected or mutated upstream).

---

## Addendum A — Single-Call Proxy Seeding

**[REMOVED — see note]** This addendum is fully superseded and deleted. It existed to fix a bug in the old natural-value seeding mechanism (`resolveDirection` + `getNaturalValue`), which no longer exists at all per the Explicit Two-Stop Keyframes schema addendum. There is nothing left to seed — every property already declares its own explicit start/end stops in schema, so `contribute()` is called once with exactly those stops, with no synthetic `p:0` entry ever injected by this module. If you are looking at older Gemini output that still contains a natural-value seeding branch, that is dead code from before this fix-note and must be deleted, not preserved.

---

## Addendum C — `trigger.delay` Handling

**Gap:** the current implementation has no handling for the schema's `trigger.delay` field at all. `delay` is only valid on `type:"time"` and `type:"scroll",scrub:false` (Brief 1 already enforces this). Per architecture §10, delay "becomes literal dead space at the front of an observer's scrubbable range" — GSAP bakes `delay` into a timeline's **total duration**. That means it must be applied here, in the builder, not in `ProductionEngine` or `EditorEngine` — both engines need to see the same total duration (one plays it, one scrubs through it), so this is shared timing data, not a playback concern either engine owns individually.

**Fix — apply once, when constructing each scenario's timeline in §6, before it's added to any group:**

```js
if ((scenario.trigger.type === "time" || (scenario.trigger.type === "scroll" && !scenario.trigger.scrub))
    && typeof scenario.trigger.delay === "number") {
  scenarioTimeline.delay(scenario.trigger.delay);
}
```

- Only applies to the scenario's own timeline, not the group's master — if this scenario is later nested into a `timelineId` group, the delay is already part of its duration and carries through naturally via `master.add(scenarioTimeline)`'s default sequential positioning. Do not also apply `.delay()` to the master timeline; that would double the delay for grouped scenarios.
- Test: a `type:"time"` scenario with `delay: 0.5` → assert the built `scenarioTimeline`'s total duration reflects the added delay (`scenarioTimeline.totalDuration()` increases by `0.5` versus an identical scenario with no `delay`).

---

## Verification Checklist (fix-note 2b specifics)

1. Grep for `resolveDirection` across the builder source — zero results.
2. Grep for `getNaturalValue` across the builder and every plugin file — zero results.
3. Grep for `direction` as a schema/elementCfg field read anywhere in the builder — zero results.
4. Confirm no build-time `domNode` read remains for the purpose of direction/natural-value inference — a targeted DOM-read spy test (same style as the existing proxy-not-DOM test) should show zero calls to `domNode` for this purpose.
5. Behavioral test: a 2-stop property builds correctly with `contribute()` called exactly once, no pre-pass invoked.
6. Existing proxy-not-DOM test, ease-collision test, and merge tests (§9, unaffected cases) still pass unmodified — confirms this fix-note didn't touch anything outside its stated scope.
