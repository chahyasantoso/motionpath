# MotionPath — Implementation Brief 2: Shared Builder

**Status:** Design-complete. Standalone spec — implement against this document only.

**Precondition (do not re-verify):** input schema has already passed `validateProject` (Brief 1) with zero errors. This module must **not** re-implement any schema-validation rule from Brief 1. If it receives invalid schema, undefined behavior is acceptable — that is not a bug in this module.

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
  domNode: Element;                 // resolved via deps.resolveElement — used ONLY for getNaturalValue() during
                                     // direction resolution (§4) and later handed to the engine for compose()'s
                                     // eventual gsap.set() write-back. This module never writes to domNode itself.
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
  getNaturalValue(propertyKey: string, domNode: Element): number | string;
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

## 4. Direction Resolution (pure function, run before `contribute()` for any property with a `stops` array)

```ts
function resolveDirection(
  stops: Array<{ p: number; v: number | string; ease?: string }>,
  direction: string | undefined,
  naturalValue: number | string
): Array<{ p: number; v: number | string; ease?: string }>
```

By the time this runs, Brief 1 guarantees the input is already in one of exactly three valid shapes — **do not add handling for other shapes, do not add error-throwing here, that's Brief 1's job and re-implementing it here is duplicated logic that can drift out of sync:**

| Input shape | Output |
|---|---|
| `stops.length >= 2` | Return `stops` unchanged. |
| `stops.length === 1`, `p` within `0.001` of `0` | Return `[stops[0], { p: 1, v: naturalValue }]` |
| `stops.length === 1`, `p` within `0.001` of `1` | Return `[{ p: 0, v: naturalValue }, stops[0]]` |

**Test cases (must pass exactly):**
- `resolveDirection([{p:0,v:10}], undefined, 0)` → `[{p:0,v:10},{p:1,v:0}]`
- `resolveDirection([{p:1,v:10}], undefined, 0)` → `[{p:0,v:0},{p:1,v:10}]`
- `resolveDirection([{p:0,v:10},{p:1,v:20}], "fromTo", 0)` → returns the two stops unchanged, untouched by `direction` at all
- `resolveDirection([{p:0.0007,v:5}], undefined, 0)` → treated as `p≈0` (within epsilon), same as first case

---

## 5. Element Build — Merge Pipeline (implement in this exact order)

**0. Before processing any property:** create `const proxy: Record<string, unknown> = {}` for this element. Resolve `const domNode = deps.resolveElement(element.id)`. `domNode` is used **only** for `getNaturalValue()` calls in step 3 below — it is never the tween target and this module never writes to it (no `.style` mutation, no `gsap.set()` on it). Both `proxy` and `domNode` get stored in the final `ElementBuild` (§2) for the engine layer to use later.

For each element in a scenario, in `keyframes` key declaration order:

1. Resolve owning plugin via `keys` lookup (build this lookup once, at module load, from the static plugin registry — not per element, not per property).
2. `await ensureLoaded(plugin)`.
3. Get `stops` for this property key. Run `resolveDirection` (§4) if the property carries a plain `stops` array (this includes `path.stops` — path's `points` is separate static data, untouched by direction resolution, passed through as-is inside `elementCfg`). `resolveDirection`'s `naturalValue` argument comes from `plugin.getNaturalValue(propertyKey, domNode)` — this is the one legitimate read of `domNode` in this whole module.
4. Call `plugin.contribute(propertyKey, effectiveStops, elementCfg)` → `{ percentPatch, tweenVars }`.
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
- **No re-validation of anything Brief 1 already checks** (trigger shape, ease collision at the schema level, timeline group rules, `stagger` non-negativity, etc.). Assume the input is valid. Re-checking it here is duplicated logic, not extra safety.
- **No `offset`/overlap support for `timelineId` groups.** Not in this schema version. Sequential-by-declaration-order only (§6). Do not add a position argument to `master.add()` beyond the default.
- **No `id` → DOM resolution logic.** `resolveElement` is injected (§2); this module calls it, never implements `querySelector` itself.
- **No `schemaVersion` checking.** That's Brief 1's job, already run before this module is invoked.
- **No caching/memoization beyond what's specified** (lazy plugin load promise, per-element plugin resolution). Do not add a generic "build cache" layer speculatively.

---

## 8. Security & Robustness

- Assume the schema is validated, but **do not assume plugin authors are bug-free** — the `tweenVars` collision check (§5.6) exists specifically because plugin bugs are a real, distinct failure class from schema errors.
- Every `throw` in this module must include the element `id` and property key in the message — a build failure with no location context is not debuggable in a real project with dozens of elements.
- `buildProject` must not leave partially-constructed GSAP objects registered globally if it throws partway through — if a throw occurs while building element 5 of 10, no dangling `gsap.to()` calls for elements 1–4 should still be sitting active in GSAP's global timeline registry. Use `paused: true` throughout (already required) and let the caller discard the whole `BuildResult` on failure; do not attempt partial cleanup logic beyond that.

---

## 9. Testing Requirements

- `resolveDirection` — pure function, test every row of the §4 table directly, no GSAP or DOM needed.
- Merge pipeline (§5) — test with a **mock plugin registry** (fake `contribute()` implementations returning controlled `percentPatch`/`tweenVars`), not real GSAP plugins. Required cases:
  - Two properties contributing to different percent keys → both present in final `sharedKeyframes`, independently.
  - Two properties contributing to the *same* percent key, different props (e.g. one contributes `x`, another `opacity`, both at `"50%"`) → both present in the merged object at that key (proves deep-merge, not overwrite).
  - Two properties contributing conflicting `tweenVars` values for the same key → throws.
  - Two properties contributing the *same* `tweenVars` key with the *same* value → no throw (not every collision is a conflict).
- Lazy plugin loading — mock a `load()` that resolves after a delay; fire two concurrent `ensureLoaded()` calls for the same plugin; assert `load()` was called exactly once.
- Scenario/group construction (§6) — assert stagger offsets are applied at the correct positions; assert grouped scenarios nest in declaration order under one master; assert `primaryScenarioIndex` is correctly recorded.
- One end-to-end test: a small valid 2-scenario project (one grouped pair) → `buildProject` resolves without throwing, returns a `BuildResult` with the expected shape, and every returned timeline has `paused: true`.
- **Proxy-not-DOM test (critical — this is the one shortcut most likely to slip through):** build an element using a synthetic property (e.g. `blur`), advance the returned tween's progress (`tween.progress(0.5)`), then assert (a) `proxy.blur` (or whichever proxy key the plugin uses) changed, and (b) the mock `domNode`'s style/attributes were **not** touched by this module at all. If this test fails, the builder is tweening the DOM node directly — a spec violation, not a passing edge case.
