import { createAnimationPlugin } from "../createAnimationPlugin.js";
import { composeWorld } from "../../math/fkMath.js";
import { toPercentKey } from "../../usecases/toPercentKey.js";
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
      rotation: rawData.boneRotation ?? rawData.rotation ?? 0,
    });
  },
});
