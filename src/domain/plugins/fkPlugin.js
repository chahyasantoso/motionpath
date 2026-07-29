import { createAnimationPlugin } from "../createAnimationPlugin.js";
import { composeWorld } from "../../lib/fkMath.js";
import { toPercentKey } from "../../usecases/toPercentKey.js";

export const fkPlugin = createAnimationPlugin({
  keys: ["boneLength"],
  inputs: ["parentWorld"],
  stage: "transform",
  priority: 50,
  outputs: {
    x: { merge: "replace" },
    y: { merge: "replace" },
    rotation: { merge: "replace" },
  },
  // claimsKey describes authored properties only. `parentWorld` is a declared
  // runtime input, not a second authored key pretending to be keyframe data.
  claimsKey: (key) => key === "boneLength",
  contribute(propKey, stops) {
    if (propKey !== "boneLength") return { percentPatch: {}, tweenVars: {} };
    const percentPatch = {};
    stops.forEach((stop) => {
      const pctKey = toPercentKey(stop.p);
      percentPatch[pctKey] = { boneLength: stop.v };
      if (stop.ease) percentPatch[pctKey].ease = stop.ease;
    });
    return { percentPatch, tweenVars: {} };
  },
  compose(rawData) {
    const parentWorld = rawData.parentWorld ?? { x: 0, y: 0, rotation: 0 };
    return composeWorld(parentWorld, {
      x: rawData.boneLength ?? 0,
      y: 0,
      rotation: rawData.rotation ?? 0,
    });
  },
});
