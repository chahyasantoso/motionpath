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
  G --> H[Motion\ncompiled graphOrder]
  H --> I[Track.compose\nshared composition context]
  I --> J[GraphPublisher\noptional dirty flush]
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

## Ownership map

```mermaid
flowchart TB
  subgraph Core["@motionpath/core"]
    IR[Graph IR]
    VALIDATE[Validators]
    ENGINE[Engine / Motion / Track]
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
  IR --> VALIDATE --> ENGINE --> PUBLISH --> ADAPTER
  HOOKS --> ENGINE
  HOOKS --> ADAPTER
  SCENES --> HOOKS
  CSS --> ADAPTER
```

Core owns graph meaning and composition. React owns lifecycle bindings. The demo owns authored scenes and presentation. No graph logic belongs in CSS or React state.

## Per-frame mental model

```mermaid
sequenceDiagram
  participant Clock as GSAP clock
  participant Track as Parent track
  participant Graph as GraphPublisher
  participant Child as Child track
  participant View as Renderer/subscriber

  Clock->>Track: progress changes
  Track->>Graph: mark dirty
  Graph->>Track: compose parent patch
  Graph->>Child: compose with shared context
  Child-->>Graph: child patch
  Graph->>View: publish dirty patches once
```

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
