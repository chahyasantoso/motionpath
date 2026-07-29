/**
 * FK walk cycle: one track per bone, one observation edge per joint.
 *
 * Nothing here stores a limb's absolute position. Every bone authors only its
 * offset from its parent joint (`boneLength`) and its local joint angle
 * (`boneRotation`), then declares the dependency:
 *
 *   observes: [{ source: "<parent>", role: "input", target: "parentWorld" }]
 *
 * The FK plugin folds parentWorld + the local bone into a world transform, so
 * the pelvis track is the ONLY track that authors a position -- move it and the
 * whole body follows, while the renderer still receives a flat
 * { x, y, rotation } patch per bone.
 *
 * Angles are DOM-space degrees: +x is right and +y is DOWN, so 90 points a bone
 * at the floor and -90 points it at the sky.
 */

const TAU = Math.PI * 2;
const DOWN = 90;
const UP = -90;
// One ease for every stop on every property: linear sampling, no per-segment
// easing wobble, and no ease collisions between boneLength and boneRotation.
const EASE = "none";

/**
 * Bone lengths in px. The page draws these and the child bone observes the
 * same number as its offset -- one constant, two consumers. A bone that
 * renders 62px long while its child offsets by 70px is how rigs go subtly wrong.
 */
export const RIG = {
  torso: 78,
  neck: 26,
  upperArm: 44,
  forearm: 40,
  thigh: 62,
  shin: 56,
  foot: 26,
};

export const WALK = {
  cycles: 4, // gait cycles across the scrubbed section
  samples: 48, // stops per sampled property (12 per cycle)
  startX: 70,
  endX: 690,
  hipY: 148,
};
export const GROUND_Y = WALK.hipY + RIG.thigh + RIG.shin;
export const RAIL_WIDTH = 260;

const round = (value) => Math.round(value * 1000) / 1000;

/** Samples a phase function into JSON stops at module load, never per frame. */
function sample(fn) {
  const stops = [];
  for (let i = 0; i <= WALK.samples; i += 1) {
    const p = round(i / WALK.samples);
    stops.push({ p, v: round(fn(p * WALK.cycles * TAU, p)), ease: EASE });
  }
  return { stops };
}
const hold = (value) => ({
  stops: [
    { p: 0, v: value, ease: EASE },
    { p: 1, v: value, ease: EASE },
  ],
});
const keyframe = (value) =>
  typeof value === "function" ? sample(value) : hold(value);

// ─── Gait, authored as world angles ─────────────────────────────
const pelvisTilt = (ph) => 1.6 * Math.sin(2 * ph);
const thighWorld = (ph) => DOWN + 26 * Math.sin(ph);
const kneeFlex = (ph) => 25 + 21 * Math.sin(ph + 2.1);
const shinWorld = (ph) => thighWorld(ph) + kneeFlex(ph);
const footWorld = (ph) => -8 + 12 * Math.sin(ph + 0.9);
const spineWorld = (ph) => UP + 2.2 * Math.sin(2 * ph);
const chestWorld = (ph) => spineWorld(ph) - 2 * Math.sin(ph);
const headWorld = (ph) => UP + 3 * Math.sin(ph + 1.2);
const upperArmWorld = (ph) => DOWN + 21 * Math.sin(ph);
const elbowFlex = (ph) => 26 + 15 * Math.sin(ph + 0.7);

const NEAR = 0; // phase of the near-side leg
const FAR = Math.PI; // the far leg runs half a cycle behind

// World rotation accumulates down the chain, so a joint's LOCAL angle is
// `desired world angle - parent world angle`. Converting here keeps the
// authored data plain numbers instead of pushing math into a plugin.
const hip = (shift) => (ph) => thighWorld(ph + shift) - pelvisTilt(ph);
const knee = (shift) => (ph) => kneeFlex(ph + shift);
const ankle = (shift) => (ph) => footWorld(ph + shift) - shinWorld(ph + shift);
const shoulder = (shift) => (ph) => upperArmWorld(ph + shift) - chestWorld(ph);
const elbow = (shift) => (ph) => elbowFlex(ph + shift);

/**
 * The skeleton, drawn and authored from one table. `draw` is the visual length
 * of the segment leaving this joint; 0 means the joint carries no bone of its
 * own (chest and head are pure joints).
 */
export const BONES = [
  // Torso: the spine points UP out of the pelvis, so everything above the hip
  // inherits hip sway for free.
  {
    id: "spine",
    parent: "pelvis",
    offset: 0,
    rotation: (ph) => spineWorld(ph) - pelvisTilt(ph),
    draw: RIG.torso,
    tone: "core",
  },
  {
    id: "chest",
    parent: "spine",
    offset: RIG.torso,
    rotation: (ph) => chestWorld(ph) - spineWorld(ph),
    draw: 0,
    tone: "core",
  },
  {
    id: "head",
    parent: "chest",
    // An animated boneLength: the neck lengthens and shortens twice per cycle,
    // which is the head bob. No position is authored to make it happen.
    offset: (ph) => RIG.neck + 2.5 * Math.sin(2 * ph),
    rotation: (ph) => headWorld(ph) - chestWorld(ph),
    draw: 0,
    tone: "core",
  },

  // Far side: same chains, half a cycle offset, painted behind the body.
  {
    id: "arm-far-upper",
    parent: "chest",
    offset: 0,
    rotation: shoulder(NEAR),
    draw: RIG.upperArm,
    tone: "far",
  },
  {
    id: "arm-far-fore",
    parent: "arm-far-upper",
    offset: RIG.upperArm,
    rotation: elbow(NEAR),
    draw: RIG.forearm,
    tone: "far",
  },
  {
    id: "leg-far-thigh",
    parent: "pelvis",
    offset: 0,
    rotation: hip(FAR),
    draw: RIG.thigh,
    tone: "far",
  },
  {
    id: "leg-far-shin",
    parent: "leg-far-thigh",
    offset: RIG.thigh,
    rotation: knee(FAR),
    draw: RIG.shin,
    tone: "far",
  },
  {
    id: "leg-far-foot",
    parent: "leg-far-shin",
    offset: RIG.shin,
    rotation: ankle(FAR),
    draw: RIG.foot,
    tone: "far",
  },

  // Near side: arms swing opposite the same-side leg.
  {
    id: "arm-near-upper",
    parent: "chest",
    offset: 0,
    rotation: shoulder(FAR),
    draw: RIG.upperArm,
    tone: "near",
  },
  {
    id: "arm-near-fore",
    parent: "arm-near-upper",
    offset: RIG.upperArm,
    rotation: elbow(FAR),
    draw: RIG.forearm,
    tone: "near",
  },
  {
    id: "leg-near-thigh",
    parent: "pelvis",
    offset: 0,
    rotation: hip(NEAR),
    draw: RIG.thigh,
    tone: "near",
  },
  {
    id: "leg-near-shin",
    parent: "leg-near-thigh",
    offset: RIG.thigh,
    rotation: knee(NEAR),
    draw: RIG.shin,
    tone: "near",
  },
  {
    id: "leg-near-foot",
    parent: "leg-near-shin",
    offset: RIG.shin,
    rotation: ankle(NEAR),
    draw: RIG.foot,
    tone: "near",
  },
];

/** Joints worth drawing a dot on, so the chain is visible, not just implied. */
export const JOINTS = [
  { id: "pelvis", size: 16 },
  { id: "chest", size: 14 },
  { id: "leg-near-shin", size: 12 },
  { id: "leg-near-foot", size: 10 },
  { id: "arm-near-fore", size: 10 },
];

// The one track that authors a position. Everything else derives from it.
const pelvisTrack = {
  id: "pelvis",
  keyframes: {
    x: {
      stops: [
        { p: 0, v: WALK.startX, ease: EASE },
        { p: 1, v: WALK.endX, ease: EASE },
      ],
    },
    y: sample((ph) => WALK.hipY - 5 * Math.abs(Math.sin(ph))),
    rotation: sample(pelvisTilt),
  },
};

const toTrack = ({ id, parent, offset, rotation }) => ({
  id,
  observes: [{ source: parent, role: "input", target: "parentWorld" }],
  keyframes: {
    boneLength: keyframe(offset),
    boneRotation: keyframe(rotation),
  },
});

export const walkerScene = {
  id: "fk-walk-cycle",
  // scrub keeps track `duration` illegal, which is correct here: the scroll
  // position IS the clock for all 14 tracks.
  trigger: {
    type: "scroll",
    scrub: 0.55,
    pin: "pin",
    start: "top top",
    end: "bottom bottom",
  },
  tracks: [pelvisTrack, ...BONES.map(toTrack)],
};

export const walkerProject = {
  schemaVersion: 4,
  projectId: "fk-walker",
  motions: [walkerScene],
};
