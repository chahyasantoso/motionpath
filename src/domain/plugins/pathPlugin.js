import {
  convertToCubicPath,
  getPointOnCubicPath,
} from "../../utils/pathUtils.js";
import { createAnimationPlugin } from "../createAnimationPlugin.js";
import { toPercentKey } from "../../usecases/toPercentKey.js";

export function createPathPlugin() {
  return createAnimationPlugin({
    keys: ["path"],
    lazy: false,
    stage: "transform",
    priority: 50,
    outputs: {
      x: { merge: "replace" },
      y: { merge: "replace" },
      z: { merge: "replace" },
      xPercent: { merge: "replace" },
      yPercent: { merge: "replace" },
      rotation: { merge: "replace" },
    },
    internalKeys: ["pathProgress", "cubicPath", "autoRotate"],
    claimsKey: (key) =>
      key === "path" ||
      key === "pathProgress" ||
      key === "cubicPath" ||
      key === "autoRotate",
    contribute(propKey, stops, trackConfig) {
      const percentPatch = {};
      stops.forEach((stop) => {
        const key = toPercentKey(stop.p);
        percentPatch[key] = {
          pathProgress: Math.max(0, Math.min(1, Number(stop.v))),
        };
        if (stop.ease) percentPatch[key].ease = stop.ease;
      });
      const config = trackConfig?.keyframes?.path;
      if (config) {
        percentPatch["0%"] = percentPatch["0%"] || {};
        percentPatch["0%"].cubicPath = convertToCubicPath(config.points || []);
        percentPatch["0%"].autoRotate = config.autoRotate === true;
      }
      return { percentPatch, tweenVars: {} };
    },
    compose(rawData, trackConfig) {
      if (rawData.pathProgress === undefined || !rawData.cubicPath) return {};
      const point = getPointOnCubicPath(
        rawData.cubicPath,
        rawData.pathProgress,
      );
      const anchor = trackConfig?.keyframes?.path?.anchor ?? "center";
      const patch = { x: point.x, y: point.y, z: point.z };
      if (anchor === "center") {
        patch.xPercent = -50;
        patch.yPercent = -50;
      } else if (anchor === "none") {
        /* intentionally no centering */
      } else if (anchor && typeof anchor === "object") {
        patch.xPercent = anchor.xPercent;
        patch.yPercent = anchor.yPercent;
      }
      if (rawData.autoRotate) patch.rotation = point.rotation;
      return patch;
    },
  });
}
export const pathPlugin = createPathPlugin();
