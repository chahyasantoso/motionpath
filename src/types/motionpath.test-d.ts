import type {
  AnimationPlugin,
  Engine,
  MotionProject,
  PathProperty,
  Stop,
} from "./motionpath.js";

const stop: Stop = { p: 0, v: 0 };
const path: PathProperty = {
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 50 },
  ],
  stops: [stop, { p: 1, v: 1 }],
  anchor: "none",
};

const project: MotionProject = {
  schemaVersion: 4,
  motions: [
    {
      id: "typed-motion",
      trigger: { type: "manual" },
      tracks: [
        {
          id: "typed-track",
          keyframes: { path },
        },
      ],
    },
  ],
};

const plugin: AnimationPlugin = {
  keys: ["example"],
  claimsKey: (key) => key === "example",
  contribute: () => ({ percentPatch: {}, tweenVars: {} }),
  compose: () => ({}),
};

const engine: Engine = new (null as unknown as typeof Engine)();
void project;
void plugin;
void engine;
