# Rig graph architecture report

This report shows the data flow from authored schema to a rendered DOM patch. It is intentionally visual so a new developer or AI agent can understand ownership without reading the whole engine.

## End-to-end flow

```mermaid
flowchart LR
  A[Project JSON\ntracks + observes] --> B[normalizeObservationGraph]
  B --> C{Graph errors?}
  C -- yes --> D[Validation error\nstop before mount]
  C -- no --> E[Immutable Graph IR\nnodes + edges + order]
  E --> F[Engine.loadProject]
  F --> G[Engine mounts Tracks]
  G --> H[GraphBinding\natomic mutation boundary]
  H --> I[Track.compose\nper-call context]
  I --> J[GraphPublisher\nscheduling + patch cache]
  J --> K[Renderer-neutral patch]
  K --> L[React subscriber / DOM adapter]
```

## Walker example

```mermaid
flowchart TD
  pelvis[ pelvis\nposition owner ] --> spine[ spine\nparentWorld input ]
  spine --> chest[ chest\nparentWorld input ]
  chest --> head[ head\nparentWorld input ]
  chest --> armFar[ arm-far-upper ]
  armFar --> foreFar[ arm-far-fore ]
  chest --> armNear[ arm-near-upper ]
  armNear --> foreNear[ arm-near-fore ]
  pelvis --> thighFar[ leg-far-thigh ]
  thighFar --> shinFar[ leg-far-shin ]
  shinFar --> footFar[ leg-far-foot ]
  pelvis --> thighNear[ leg-near-thigh ]
  thighNear --> shinNear[ leg-near-shin ]
  shinNear --> footNear[ leg-near-foot ]
```

The arrows mean “must be composed before.” They do not mean “copy coordinates.” A child receives its parent’s composed world patch and then applies its own authored local data.

They also mean “must be republished together.” Marking `pelvis` dirty publishes every bone downstream of it, not just `pelvis`.

## Ownership map

```mermaid
flowchart TB
  subgraph Core["@motionpath/core"]
    IR[Graph IR]
    VALIDATE[Validators]
    ENGINE[Engine / Motion / Track]
    BIND[GraphBinding]
    PUBLISH[GraphPublisher]
    ADAPTER[Renderer adapters]
  end
  subgraph React["@motionpath/react"]
    HOOKS[useMotionProject\nuseMotionSubscriber]
  end
  subgraph Demo["apps/demo"]
    SCENES[Walker and other scenes]
    CSS[DOM/CSS presentation]
  end
  SCENES --> IR
  IR --> VALIDATE --> ENGINE --> BIND --> PUBLISH --> ADAPTER
  HOOKS --> ENGINE
  HOOKS --> ADAPTER
  SCENES --> HOOKS
  CSS --> ADAPTER
```

Core owns graph meaning and composition. React owns lifecycle bindings. The demo owns authored scenes and presentation. No graph logic belongs in CSS or React state.

Within core the split is deliberate: **Track** owns live edges and per-call composition, **GraphBinding** owns the transaction that moves Track wiring and publisher metadata together or not at all, and **GraphPublisher** owns topological scheduling, invalidation, and the cross-flush patch cache.

## Per-frame mental model

```mermaid
sequenceDiagram
  participant Clock as GSAP clock
  participant Parent as Parent track
  participant Graph as GraphPublisher
  participant Child as Child track
  participant Idle as Unrelated track
  participant View as Renderer/subscriber

  Clock->>Parent: progress changes
  Parent->>Graph: invalidated (lifecycle hook)
  Graph->>Parent: compose, cache, publish
  Graph->>Child: source changed, so recompose
  Child-->>Graph: child patch
  Graph->>View: publish parent + downstream closure
  Graph->>Idle: untouched, serve cached patch
```

Three things this diagram is making explicit, because earlier docs implied the publisher only ordered work:

1. Marking is O(1) and invalidation propagates forward to dependents during `flush()`. Callers never enumerate the closure themselves.
2. Idle nodes are not recomposed. The cache is the publisher's, held across flushes.
3. One node failing does not abort the frame. Failures are collected and thrown as a single `AggregateError` after the pass, and a publish failure retries only that node.

`GraphPublisher` is framework-agnostic. It does not know about React, DOM, or GSAP rendering details. That separation is deliberate: the same graph can feed DOM, canvas, testing, or AI inspection tools.

## Diagnostics model

```mermaid
flowchart LR
  BAD[Malformed observes edge] --> IR[normalizeObservationGraph]
  IR --> ERR[stable ruleId + path + message]
  ERR --> TOOL[human / AI diagnostic]
  ERR --> STOP[prevent unsafe runtime mount]
```

Useful rule IDs include `track-observations`, `track-observations-cycle`, `track-observations-duplicate-node`, and `track-observations-duplicate-edge`.

Runtime mutations are diagnosed the same way. `GraphBinding` normalizes a candidate graph before committing, so a rejected `addEdge` reports the same rule IDs and leaves the previous graph, the live Track wiring, and the publisher order untouched.
