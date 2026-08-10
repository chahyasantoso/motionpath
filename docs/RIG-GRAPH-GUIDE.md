# Rig graph normalization in MotionPath v4.2

> Graph normalization landed in v4.2. Publishing semantics were corrected in v4.3: see `docs/V4.3-GRAPH-CORRECTNESS-PLAN.md`. The authoring rules below are unchanged.

## The short version

A rig graph is a map of which animation tracks depend on which other tracks. In a walking character, the knee depends on the thigh, the shin depends on the knee, and the foot depends on the shin.

MotionPath now reads that map once when a project loads. It validates the map, calculates a safe parent-before-child order, and reuses that result while the animation runs. The animation data stays declarative JSON, and React does not need to manage the frame loop.

## The three things to remember

1. A **node** is a track, identified by `id`.
2. An **edge** is a dependency declared with `observes`.
3. The **order** is the safe sequence for composing parents before children.

```js
{
  id: "shin",
  observes: [
    { source: "thigh", role: "input", target: "parentWorld" }
  ],
  keyframes: {
    boneLength: { stops: [{ p: 0, v: 56 }, { p: 1, v: 56 }] },
    boneRotation: { stops: [{ p: 0, v: 20 }, { p: 1, v: 35 }] }
  }
}
```

Read that as: “compose `thigh` first, pass its world transform into `shin.parentWorld`, then compose `shin`.”

## Why this helps

Before normalization, the runtime had to rediscover dependencies while composing. Now it has a compiled, immutable graph description. That makes the behavior easier to validate, faster to inspect, and safer for tools or AI agents to explain.

The graph catches mistakes before GSAP mounts anything:

- a source track that does not exist
- duplicate track IDs
- duplicate edges
- a track observing itself
- a cycle such as `a -> b -> a`
- an invalid observation role
- an input edge without a target
- an output edge that incorrectly defines a target

## Input and output edges

Most rig relationships use an input edge:

```js
observes: [{ source: "parent", role: "input", target: "parentWorld" }];
```

The parent patch is wrapped as `{ parentWorld: parentPatch }` before the child composes.

An output edge has no `target` and merges the source patch over the target patch:

```js
observes: [{ source: "overlay", role: "output" }];
```

Use input edges for data that a plugin consumes. Use output edges for a composed patch that should be merged into another result. Role and target are part of an edge's identity, so one source can legally provide both an input and an output edge to the same observer.

## What happens at runtime

1. `normalizeObservationGraph(motion)` returns frozen JSON-safe nodes, edges, order, and errors.
2. Validation exposes graph errors with stable rule IDs and paths.
3. The Engine mounts tracks and wires authored observations.
4. Motion carries the compiled `graphOrder`.
5. `composeGraph()` composes in that order with a per-call context, so a shared ancestor is composed once per call.
6. `GraphPublisher` schedules the actual publishing: a dirty track and everything downstream of it are recomposed and published once per flush, idle tracks keep their cached patch, and a failing track does not abort the rest of the frame.
7. `GraphBinding` handles any graph change after mount, moving live Track wiring and publisher order together or rejecting the change outright.

You mark one track dirty. You do not enumerate its dependents; the publisher does that. The existing React hooks still work, and this feature does not add a second clock, a requestAnimationFrame loop, or React state updates for every frame.

## AI-friendly checklist

When creating or editing a rig:

- Keep every track ID unique within its Motion.
- Point `observes.source` at a track in the same Motion.
- Use `role: "input"` with a non-empty `target` for plugin inputs.
- Use `role: "output"` only when you intentionally merge a source patch.
- Prefer local bone angles such as `boneRotation` over colliding with output keys such as `rotation`.
- Keep the graph acyclic.
- Change a mounted rig through `GraphBinding`, never by editing Track edges and publisher state separately.
- Run `npm test`, `npm run build`, and `npm run benchmark:rig`.

## Reference implementation

The Walker demo is the canonical example: `apps/demo/src/components/Walker/walkerMotions.js`. It has one pelvis position track and dependent bone tracks connected through `parentWorld`.

See also:

- [Visual architecture report](./RIG-GRAPH-ARCHITECTURE.md)
- [Forward kinematics](./FORWARD-KINEMATICS.md)
- [Phase plan](./V4.2-RIG-GRAPH-PLAN.md)
- [Graph correctness plan](./V4.3-GRAPH-CORRECTNESS-PLAN.md)
