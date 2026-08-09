# MotionPath v4 — Track as First-Class Playhead Owner

Design doc + Phase 1 implementation brief. Supersedes `driver`/`timelineId`/`primary` from v2/v3 entirely — this is a redesign, not a rename pass.

---

## 1. Locked Decisions (from architecture review)

1. **`Track` owns a playhead.** Single write path: `track.progress(p?)` — no-arg reads, one-arg writes and re-composes. No separate `setProgress`/`getProgress`.
2. **`Track` is a GSAP-compatible accessor target**, not driven via a proxy object. `gsap.to(track, { progress: 1 })` works directly because GSAP duck-types any function-valued property as a combined getter/setter. No `{p:0}` proxy object, no `onUpdate` closure.
3. **`driver` enum is DELETED.** Whether a track is "timeline" or "delegate" is no longer schema-declared — it's purely runtime: mounted (`motion.mount(track)`) or not. An unmounted track is inert by default; nothing drives it unless something calls `track.progress()`.
4. **`timelineId`/`primary` grouping is DELETED.** Two tracks that need to share one trigger are authored as two tracks under **one** `Motion` — GSAP's native `.add()` sequential positioning replaces the old same-type/exactly-one-primary validator entirely. No cross-motion grouping construct in v4.
5. **`Motion` always has exactly one `trigger`.** No more "delegate motion with no trigger" — if you don't need a trigger, you don't need a `Motion` at all; just declare bare `tracks[]` and drive them manually.
6. **Composition (`addChild`/`removeChild`) moves from `MotionInstance` to `Track`.** Spawning/reflow is a track-level concern.
7. **Self-playing (idle/ambient, no trigger, no external driver) is NOT a schema concept.** It's a tiny runtime helper (`autoPlay(track, duration, vars)`) built on the same accessor mechanism as `Motion.mount`, layered outside the schema entirely. This keeps `Track`'s contract single-purpose and avoids a third enum value.

## 2. Object Model (reference — see prior chat turns for full class bodies)

```ts
class Track {
  readonly id: string;
  progress(p?: Progress): Progress | void; // the ONLY write path, GSAP-accessor-shaped
  subscribe(cb: (patch: DOMPatch) => void): UnsubscribeFn;
  addChild(child: Track, opts: { stagger: number }): void;
  removeChild(id: string): void;
  // internal: _attach(host)/_detach()/isMounted — called only by Motion
}

class Motion {
  readonly id: string;
  constructor(config: { id: string; trigger: TriggerConfig });
  mount(track: Track, position?: gsap.Position): void; // gsap.to(track, {progress:1, ...}); masterTimeline.add(tween, position)
  unmount(track: Track): void;
  play(): void;
  pause(): void;
  seek(p: Progress): void;
  reverse(): void;
}

function autoPlay(
  track: Track,
  durationSeconds: number,
  vars?: gsap.TweenVars,
): gsap.core.Tween;
// gsap.to(track, { progress: 1, duration: durationSeconds, ...vars })
// Runtime-only. Never appears in schema.
```

## 3. Schema Shape — Top Level

```json
{
  "templates": [
    /* unchanged from v2/v3: reusable keyframe fragments, referenced via track.use */
  ],
  "motions": [
    /* zero or more — only needed when a trigger is involved */
  ],
  "tracks": [
    /* zero or more — bare, manually/externally driven tracks with NO trigger */
  ]
}
```

Track-ID uniqueness stays **project-wide** across `motions[*].tracks[]` and top-level `tracks[]` combined — same locked rule as v2/v3, same reason (one flat runtime registry, cross-collisions must be caught at build time).

### 3a. Scroll-driven example (replaces old `timelineId`/`primary` scrub group)

Old v3 way needed two motions glued by `timelineId` + exactly one `primary:true`. New way — one motion, multiple tracks, done:

```json
{
  "motions": [
    {
      "id": "iceCreamSection",
      "trigger": {
        "type": "scroll",
        "scrub": true,
        "pin": true,
        "start": "top top",
        "end": "+=2000"
      },
      "tracks": [
        {
          "id": "cone",
          "keyframes": {
            "y": [
              { "p": 0, "v": 0 },
              { "p": 1, "v": -40 }
            ]
          }
        },
        {
          "id": "scoop1",
          "keyframes": {
            "y": [
              { "p": 0, "v": 0 },
              { "p": 1, "v": -80 }
            ]
          }
        },
        { "id": "sprinkles", "use": "sparkle-template" }
      ]
    }
  ]
}
```

No `primary`, no `timelineId`, no same-type validator needed — every track under this motion shares the one real ScrollTrigger by construction.

### 3b. Time-driven example (replaces old `type:"time"` + `repeat`/`yoyo`)

```json
{
  "motions": [
    {
      "id": "toastLoop",
      "trigger": {
        "type": "time",
        "duration": 1.2,
        "repeat": -1,
        "yoyo": true
      },
      "tracks": [
        {
          "id": "toastPopup",
          "keyframes": {
            "y": [
              { "p": 0, "v": 100 },
              { "p": 1, "v": 0 }
            ]
          }
        }
      ]
    }
  ]
}
```

`repeat`/`yoyo`/`repeatDelay`/`delay` still valid on `time` and `scroll+scrub:false` (observer) triggers — that rule carries over unchanged from v2/v3, it was never about grouping.

### 3c. Manual / externally-driven example (replaces old `driver:"delegate"`)

No `Motion` at all. Track declared bare, resolved by whoever owns progress:

```json
{
  "tracks": [
    { "id": "enemy-lane-1", "keyframes": { "path": { "points": [ /* waypoints */ ] } } },
    { "id": "projectile-arc", "keyframes": { "x": [...], "y": [...] } }
  ]
}
```

Runtime (game loop, per frame, per entity):

```js
const lane1 = engine.getTrack("enemy-lane-1");
lane1.progress(enemy.progress); // direct call — no resolveMotion(), no driver check
```

`stagger`/`trigger`/`timelineId`/`primary`/`sectionId` are simply **not fields that exist** for a bare track — there's no validator carve-out needed because there's no schema slot to misuse in the first place. That whole class of build-time error from v2/v3's `motion-structure.js` disappears because the invalid state is now unrepresentable, not just rejected.

### 3d. Self-playing / idle (NOT schema — for contrast, so it's not confused with 3c)

```js
// No schema field for this. Runtime only:
const track = engine.getTrack("idle-shimmer");
autoPlay(track, 2.0, { repeat: -1, yoyo: true, ease: "sine.inOut" });
```

If someone asks "how do I make this loop forever with no trigger" — this is the answer, not a schema flag.

---

## 4. Implementation Brief — Phase 1: PasarMalam only

**Scope: prove the model on the lowest-risk demo first.** Do NOT touch Tower Defense or Spiral in this phase — separate briefs, sequenced after this one is verified.

### Non-goals (explicit — do not do these)

- Do not delete `driver`/`timelineId`/`primary` validator code yet if other demos still reference it — Phase 1 adds the new `Track`/`Motion` classes and migrates PasarMalam only. Old code paths for other demos stay as-is until their own phase.
- Do not touch `MotionInstance`, `addChild`/`removeChild`, or anything in the Spiral/Zuma demo.
- Do not touch `resolveMotion.js` or the Tower Defense demo.
- Do not add a `playback` flag, an `autoplay` schema field, or any third enum value to `Track` or `Motion` config. Self-play is a runtime helper only (§3d) — if you find yourself adding a schema field for it, stop, that's out of scope.
- Do not use a proxy object (`{p:0}` + `onUpdate`) anywhere. `Track` must be tweened directly via the accessor pattern.

### Locked implementation details

**WRONG (proxy pattern — do not implement this):**

```js
const proxy = gsap.to(
  { p: 0 },
  {
    p: 1,
    onUpdate: function () {
      track.setProgress(this.targets()[0].p);
    },
  },
);
```

**CORRECT (accessor pattern):**

```js
class Track {
  progress(p) {
    if (p === undefined) return this.#progress;
    this.#progress = clamp01(p);
    this.#recompose();
  }
}
// Motion.mount():
const tween = gsap.to(track, { progress: 1, paused: true, ease: trackEase });
this.#masterTimeline.add(tween, position);
```

**WRONG (two write paths):**

```js
class Track {
  setProgress(p) {
    /* ... */
  }
  getProgress() {
    /* ... */
  }
}
```

**CORRECT (one accessor):**

```js
class Track {
  progress(p) {
    /* get if undefined, set+recompose otherwise — the ONLY entry point */
  }
}
```

### Files to create/modify

- New: `src/lib/Track.js` — the class from §2, using `#progress` private field + `progress(p?)` accessor.
- New: `src/lib/Motion.js` — the class from §2. `mount()`/`unmount()` build/kill the accessor tween and add/remove it from an internal `gsap.timeline()`.
- New: `src/lib/schema/parseV4Project.js` — parses `{templates, motions, tracks}` top-level shape into `Track`/`Motion` instances. Reuse existing `templateResolver.js` and plugin-resolution code from v3 unchanged — only the top-level shape and Track/Motion classes are new.
- Migrate: PasarMalam's schema JSON to the `motions[].tracks[]` shape (§3a-style), one motion per pinned section, no `timelineId`/`primary` anywhere in the migrated file.
- Do not modify: `TimelineGroupController`, `resolveMotion.js`, `MotionInstance.js` — leave these fully intact for now, other demos still depend on them.

### Verification checklist (grep + behavioral, on a fresh clone — self-report not accepted)

1. `grep -rn "onUpdate" src/lib/Motion.js` → zero matches. Confirms accessor pattern, not proxy.
2. `grep -rn "setProgress\|getProgress" src/lib/Track.js` → zero matches. Confirms single accessor method only.
3. `grep -rn "timelineId\|primary" src/lib/schema/parseV4Project.js` → zero matches. Confirms new parser has no knowledge of the deleted grouping fields.
4. Behavioral test: mount two tracks under one `Motion` with a scrub trigger, spy on both tracks' `progress()` calls, scrub the master timeline via `.seek()` at 0/0.5/1, assert both tracks received calls with values consistent with their position on the master span (not just "did not throw").
5. Behavioral test: construct a `Track`, call `gsap.to(track, {progress: 1, duration: 0.1})` directly (no `Motion` involved) with real (not synchronous-stubbed) timing, `await` a small real delay, assert `track.progress()` reflects mid-tween interpolation. Confirms GSAP's accessor duck-typing actually works against the class, not just that the method exists.
6. `npx vitest run` on fresh clone — full suite green, plus the new PasarMalam-specific tests above.
7. Manual: PasarMalam demo scroll behavior visually unchanged from current `v3` branch.

### Next briefs (not in this one — for your own tracking)

- **Phase 2 — Tower Defense migration to bare `tracks[]` + direct `progress()` calls.** Priority check: confirm whether `Track` instances are long-lived per game entity (caching win is then structural/free) or re-resolved per call (caching bug re-appears) — write the behavioral spy test for this **before** declaring the migration done, not after.
- **Phase 3 — Spiral/Zuma composition move to `Track.addChild`/`removeChild`.** Treat as re-derivation, not porting: re-verify all three invariants (frontmost-child spawn placement, eager synchronous reflow write, rank-0 cascade skip) against the new class with live async GSAP reproduction scripts, same discipline as the original bug hunt.
