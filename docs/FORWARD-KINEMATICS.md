# Forward kinematics and cross-track observations

MotionPath separates three things that used to be blurred together:

- `plugin.keys`: authored keyframe properties the plugin contributes to a Track's interpolation timeline.
- `plugin.inputs`: composed runtime values the plugin consumes from observations or another composition source.
- `track.observes`: declarative dependency edges connecting one Track's composed patch to another Track.

## Plugin contract

```js
createAnimationPlugin({
  keys: ["boneLength", "boneRotation"],
  inputs: ["parentWorld"],
  claimsKey: (key) => key === "boneLength" || key === "boneRotation",
  compose(raw) {
    return composeWorld(raw.parentWorld, {
      x: raw.boneLength,
      y: 0,
      rotation: raw.boneRotation ?? raw.rotation ?? 0,
    });
  },
});
```

`claimsKey` is for authored properties only. An input is not another authored property and must not be smuggled into `claimsKey`. This distinction lets the registry detect input-name collisions and lets tooling inspect what a plugin needs without executing it.

## Track contract

```js
{
  id: "elbow",
  observes: [
    { source: "shoulder", role: "input", target: "parentWorld" }
  ],
  keyframes: {
    boneLength: { stops: [{ p: 0, v: 80 }, { p: 1, v: 100 }] },
    boneRotation: { stops: [{ p: 0, v: 12 }, { p: 1, v: 44 }] }
  }
}
```

At mount time, the Engine resolves `source` within the same Motion. For an `input` edge, the source patch is wrapped under `target`, producing `{ parentWorld: sourcePatch }` before the child plugins compose. For an `output` edge, the source patch is merged over the target's final patch, preserving the existing observation behavior.

The schema contains no functions, DOM references, or plugin-specific wiring. `Track.setObserved()` remains available for dynamic or imperative cases, but ordinary authored dependencies should use `observes` so validation, tooling, and lifecycle all see the graph.

## Why `boneRotation` and not `rotation`

A joint angle is authored as `boneRotation`. That is not cosmetic naming: the simple `rotation` property plugin already declares `rotation` as its output, and `buildTrackTween`'s `assertOutputCompatibility` refuses two plugins owning the same output key on one track. Authoring `boneLength` and `rotation` together therefore threw:

```text
Output collision on track "elbow" for "rotation".
```

Which meant an FK bone could stretch but never bend -- the one thing a joint exists to do. `compose()` still falls back to `rawData.rotation` when no `boneRotation` is authored, so bones written against the original single-key contract keep working unchanged.

World rotation accumulates down the chain, so a joint's local angle is `desired world angle - parent world angle`. Author the gait in world space and convert once, at module load, not per frame.

## Why this shape

`inputs` alone is only metadata. `observes` alone still leaves plugin dependencies implicit. Together they make the data flow inspectable:

```text
shoulder patch -> parentWorld input -> FK compose -> elbow patch
```

The Engine owns wiring and teardown, while Track keeps the existing cycle-safe composition algorithm. This is deliberately narrower than a new orchestration schema: it formalizes data dependencies without turning the project format into a general-purpose graph language.

## Reference rig

`src/components/Walker` is the executable example: a scroll-scrubbed walk cycle built from 14 tracks.

- `pelvis` is the only track that authors a position (`x`, `y`, `rotation`).
- The other 13 tracks author nothing but `boneLength` and `boneRotation`, each declaring one `parentWorld` input edge.
- `spine` carries `boneLength: 0` and aims up out of the hip, so the whole upper body inherits hip sway for free.
- `head` animates `boneLength` only -- the head bob is a lengthening neck, not an authored offset.
- `src/components/Walker/__tests__/walkerRig.test.js` asserts the FK invariant directly: the distance between two joints stays equal to the authored bone length at every sampled progress.

Bone lengths live in one `RIG` constant that both the renderer and the child bone's offset read. A bone that draws 62px while its child observes 70px is the classic way a rig drifts.
