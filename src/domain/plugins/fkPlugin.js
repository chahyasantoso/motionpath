import { createAnimationPlugin } from "../createAnimationPlugin.js";
import { composeWorld } from "../../lib/fkMath.js";
import { toPercentKey } from "../../usecases/toPercentKey.js";

// Authored FK properties.
//
// `boneRotation` is the joint's LOCAL angle and is deliberately not called
// `rotation`. The simple `rotation` plugin already declares `rotation` as its
// output, and buildTrackTween's assertOutputCompatibility rejects two plugins
// owning the same output key on one track. So authoring `boneLength` and
// `rotation` on the same bone threw `Output collision`, which meant an FK bone
// could stretch but never bend -- the whole point of a joint.
const FK_KEYS = ["boneLength", "boneRotation"];

export const fkPlugin = createAnimationPlugin({
  keys: FK_KEYS,
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
  claimsKey: (key) => FK_KEYS.includes(key),
  contribute(propKey, stops) {
    if (!FK_KEYS.includes(propKey)) return { percentPatch: {}, tweenVars: {} };
    const percentPatch = {};
    stops.forEach((stop) => {
      const pctKey = toPercentKey(stop.p);
      percentPatch[pctKey] = {
        ...(percentPatch[pctKey] || {}),
        [propKey]: stop.v,
      };
      if (stop.ease) percentPatch[pctKey].ease = stop.ease;
    });
    return { percentPatch, tweenVars: {} };
  },
  compose(rawData) {
    const parentWorld = rawData.parentWorld ?? { x: 0, y: 0, rotation: 0 };
    return composeWorld(parentWorld, {
      x: rawData.boneLength ?? 0,
      y: 0,
      // `rotation` remains supported for tracks authored against the original
      // single-key contract, where no boneRotation exists to collide with.
      rotation: rawData.boneRotation ?? rawData.rotation ?? 0,
    });
  },
});
