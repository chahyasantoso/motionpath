import { createAnimationPlugin } from "../createAnimationPlugin.js";
import { toPercentKey } from "../../usecases/toPercentKey.js";
export function createSimplePropertyPlugin(propKey) {
  return createAnimationPlugin({ keys: [propKey], stage: "base", priority: 10, outputs: { [propKey]: { merge: "replace" } }, contribute(key, stops) { const percentPatch = {}; stops.forEach((stop) => { const pctKey = toPercentKey(stop.p); percentPatch[pctKey] = { [key]: stop.v }; if (stop.ease) percentPatch[pctKey].ease = stop.ease; }); return { percentPatch, tweenVars: {} }; }, compose(rawData) { const patch = {}; if (rawData[propKey] !== undefined) patch[propKey] = rawData[propKey]; return patch; } });
}
