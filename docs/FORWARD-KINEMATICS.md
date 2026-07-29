# Forward kinematics and cross-track observations

MotionPath separates three things that used to be blurred together:

- `plugin.keys`: authored keyframe properties the plugin contributes to a Track's interpolation timeline.
- `plugin.inputs`: composed runtime values the plugin consumes from observations or another composition source.
- `track.observes`: declarative dependency edges connecting one Track's composed patch to another Track.

## Plugin contract

```js
createAnimationPlugin({
  keys: ["boneLength"],
  inputs: ["parentWorld"],
  claimsKey: (key) => key === "boneLength",
  compose(raw) {
    return composeWorld(raw.parentWorld, {
      x: raw.boneLength,
      y: 0,
      rotation: raw.rotation ?? 0,
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
    boneLength: {
      stops: [{ p: 0, v: 80 }, { p: 1, v: 100 }]
    }
  }
}
```

At mount time, the Engine resolves `source` within the same Motion. For an `input` edge, the source patch is wrapped under `target`, producing `{ parentWorld: sourcePatch }` before the child plugins compose. For an `output` edge, the source patch is merged over the target's final patch, preserving the existing observation behavior.

The schema contains no functions, DOM references, or plugin-specific wiring. `Track.setObserved()` remains available for dynamic or imperative cases, but ordinary authored dependencies should use `observes` so validation, tooling, and lifecycle all see the graph.

## Why this shape

`inputs` alone is only metadata. `observes` alone still leaves plugin dependencies implicit. Together they make the data flow inspectable:

```text
shoulder patch -> parentWorld input -> FK compose -> elbow patch
```

The Engine owns wiring and teardown, while Track keeps the existing cycle-safe composition algorithm. This is deliberately narrower than a new orchestration schema: it formalizes data dependencies without turning the project format into a general-purpose graph language.
