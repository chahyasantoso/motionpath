# Zuma Spiral Flow

This folder contains two intentionally separate demos:

- `/spiral`: the original Zuma reference implementation.
- `/spiral-graph`: the graph-backed implementation under PR #74.

The original route remains the behavioral oracle. The graph route is where GraphBinding and GraphPublisher are exercised with real per-ball dependency graphs; do not “simplify” it by routing back through the old controller.

## Graph Spiral status

The graph variant currently creates one graph per spawned ball with unique IDs:

```text
ball-N-path -> ball-N-entrance
ball-N-path -> ball-N-exit
```

The path track authors `path`; the path plugin produces runtime `pathProgress` plus renderer-ready position data. Transition tracks own scale and opacity. GraphBinding wires the live Track edges, and GraphPublisher composes/publishes the dependency closure. Spawner, group-host stagger/reflow, click-to-pop, auto-removal, and wave reset are reused from the original behavior without a second clock.

Contract tests cover normalized order and edge ownership. Remaining sign-off work is focused parity testing and browser verification of spawn cadence, exit timing, cleanup, and wave restart.

## Original demo architecture

The Zuma Spiral uses a ViewModel-driven architecture (MVVM/Controller pattern) to decouple the motion engine lifecycle, game logic, and React rendering.

| Layer                   | Responsibility                                            | File                         |
| ----------------------- | --------------------------------------------------------- | ---------------------------- |
| Config & constants      | Static dimensions, colors, speeds                         | `spiralConfig.js`            |
| Path geometry           | Archimedean spiral generation and uniform segment spacing | `spiralPath.js`              |
| Original motion schemas | Parent timelines, path followers, transitions             | `spiralMotions.js`           |
| Original controller     | Queue management, wave loop, transition lifecycle         | `useSpiralWaveController.js` |
| Original view page      | Reference scene and SVG details                           | `SpiralPage.jsx`             |
| Original ball view      | DOM subscriber bound to the active track                  | `SpiralBall.jsx`             |

Do not edit the original controller to implement graph behavior. Add or change graph-specific files instead.

## Shared behavior contract

Both routes must preserve 30-ball waves, automatic spawning, uniform spiral motion, staggered placement, sibling reflow, entrance/exit transitions, click-to-pop, auto-removal at the hole, and wave reset when the host empties.

## Verification

Run the standard CI suite before merging:

```text
npm test
npm run build
npm run benchmark:rig
npm run pack:check
```

Then manually compare `/spiral` and `/spiral-graph` in the browser. The old route is the reference, not the implementation to copy blindly.
