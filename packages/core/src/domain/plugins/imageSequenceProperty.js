import { createAnimationPlugin } from "../createAnimationPlugin.js";
import { toPercentKey } from "../../usecases/toPercentKey.js";
const imageSequenceWarmCache = new Map();
function canPreloadImages() {
  if (typeof Image === "undefined" || typeof window === "undefined")
    return false;
  if (
    typeof navigator !== "undefined" &&
    /jsdom/i.test(navigator.userAgent || "")
  )
    return false;
  return true;
}
export function warmFrames(frames) {
  if (!canPreloadImages()) return Promise.resolve();
  const key = frames.join("\n");
  if (imageSequenceWarmCache.has(key)) return imageSequenceWarmCache.get(key);
  const promise = Promise.all(
    frames.map(
      (src) =>
        new Promise((resolve) => {
          const image = new Image();
          image.onload = resolve;
          image.onerror = resolve;
          image.src = src;
        }),
    ),
  ).then(() => undefined);
  imageSequenceWarmCache.set(key, promise);
  return promise;
}
export function _resetPreloadCache() {
  imageSequenceWarmCache.clear();
}
export function createImageSequencePlugin() {
  return createAnimationPlugin({
    keys: ["imageSequence", "imageSequenceIndex"],
    lazy: false,
    stage: "media",
    priority: 30,
    outputs: { backgroundImage: { merge: "replace" } },
    prepare(trackConfig) {
      const frames = trackConfig?.keyframes?.imageSequence?.frames;
      return Array.isArray(frames) ? warmFrames(frames) : undefined;
    },
    contribute(propKey, stops, elementCfg) {
      const config = elementCfg?.keyframes?.imageSequence;
      if (!config) return { percentPatch: {}, tweenVars: {} };
      const percentPatch = {};
      stops.forEach((stop) => {
        const key = toPercentKey(stop.p);
        percentPatch[key] = { imageSequenceIndex: Number(stop.v) };
        if (stop.ease) percentPatch[key].ease = stop.ease;
      });
      return { percentPatch, tweenVars: {} };
    },
    compose(rawData, elementCfg) {
      const frames = elementCfg?.keyframes?.imageSequence?.frames;
      const index = rawData.imageSequenceIndex;
      if (!Array.isArray(frames) || !frames.length || index == null) return {};
      const frame = Math.max(0, Math.min(frames.length - 1, Math.round(index)));
      return { backgroundImage: `url(${frames[frame]})` };
    },
  });
}
export const imageSequencePlugin = createImageSequencePlugin();
