import { resolvePluginInput } from "../../domain/plugins.js";

/**
 * Authored graph tracks must declare every required plugin input as an input
 * observation. Standalone tracks keep the documented plugin default.
 */
export function graphInputsRule(schema) {
  const errors = [];
  const motions = Array.isArray(schema?.motions) ? schema.motions : [];
  motions.forEach((motion, motionIndex) => {
    if (!motion || typeof motion !== "object" || !Array.isArray(motion.tracks)) return;
    motion.tracks.forEach((track, trackIndex) => {
      if (!track || typeof track !== "object") return;
      const mode = track.mode ?? "authored-graph";
      const path = `motions[${motionIndex}].tracks[${trackIndex}]`;
      if (mode !== "authored-graph" && mode !== "standalone") {
        errors.push({ ruleId: "GRAPH_INPUT_MODE_INVALID", severity: "error", message: "Track mode must be 'authored-graph' or 'standalone'.", path: `${path}.mode` });
        return;
      }
      if (mode === "standalone") return;
      const requiredInputs = new Set();
      for (const key of Object.keys(track.keyframes || {})) {
        const plugin = resolvePluginInput(key);
        for (const input of plugin?.inputs || []) requiredInputs.add(input);
      }
      for (const input of requiredInputs) {
        const matches = (track.observes || []).filter((edge) => edge?.role === "input" && edge.target === input);
        if (matches.length === 0) errors.push({ ruleId: "GRAPH_INPUT_MISSING", severity: "error", message: `Authored-graph track requires exactly one '${input}' input observation.`, path: `${path}.observes` });
        else if (matches.length > 1) errors.push({ ruleId: "GRAPH_INPUT_DUPLICATE", severity: "error", message: `Authored-graph track declares '${input}' more than once.`, path: `${path}.observes` });
      }
      for (const edge of track.observes || []) {
        if (edge?.role === "input" && typeof edge.target === "string" && !requiredInputs.has(edge.target)) errors.push({ ruleId: "GRAPH_INPUT_ROLE_MISMATCH", severity: "error", message: `Input observation target '${edge.target}' is not required by this track's plugins.`, path: `${path}.observes` });
      }
    });
  });
  return errors;
}
