import { resolvePluginForKey } from "../../domain/plugins.js";

/**
 * Project motion tracks are authored graph nodes by default. Standalone is an
 * explicit opt-out for direct/local tracks only; missing mode must never turn
 * a malformed authored rig into a plugin-default composition.
 */
export function graphInputsRule(schema) {
  const errors = [];
  const motions = Array.isArray(schema?.motions) ? schema.motions : [];
  motions.forEach((motion, motionIndex) => {
    if (!motion || typeof motion !== "object" || !Array.isArray(motion.tracks))
      return;
    motion.tracks.forEach((track, trackIndex) => {
      if (!track || typeof track !== "object") return;
      const mode = track.mode ?? "authored-graph";
      const path = `motions[${motionIndex}].tracks[${trackIndex}]`;
      if (mode !== "authored-graph" && mode !== "standalone") {
        errors.push({
          ruleId: "GRAPH_INPUT_MODE_INVALID",
          severity: "error",
          message: "Track mode must be 'authored-graph' or 'standalone'.",
          path: `${path}.mode`,
        });
        return;
      }
      if (mode === "standalone") return;
      const requiredInputs = new Set();
      for (const key of Object.keys(track.keyframes || {})) {
        const plugin = resolvePluginForKey(key);
        for (const input of plugin?.inputs || []) requiredInputs.add(input);
      }
      for (const input of requiredInputs) {
        const matches = (track.observes || []).filter(
          (edge) => edge?.role === "input" && edge.target === input,
        );
        if (matches.length === 0)
          errors.push({
            ruleId: "GRAPH_INPUT_MISSING",
            severity: "error",
            message: `Authored-graph track requires exactly one '${input}' input observation.`,
            path: `${path}.observes`,
          });
        else if (matches.length > 1)
          errors.push({
            ruleId: "GRAPH_INPUT_DUPLICATE",
            severity: "error",
            message: `Authored-graph track declares '${input}' more than once.`,
            path: `${path}.observes`,
          });
      }
      // Generic observation metadata is valid for plugins with no declared
      // inputs. Only reject an unknown input target when this track is actually
      // using an input-aware plugin, otherwise legacy v4 observations such as
      // `x -> parentWorld` remain valid metadata and composition behavior is
      // unchanged. FK tracks still get strict unknown-target diagnostics.
      if (requiredInputs.size > 0) {
        for (const edge of track.observes || []) {
          if (
            edge?.role === "input" &&
            typeof edge.target === "string" &&
            !requiredInputs.has(edge.target)
          )
            errors.push({
              ruleId: "GRAPH_INPUT_UNKNOWN",
              severity: "error",
              message: `Input observation target '${edge.target}' is not declared by this track's plugins.`,
              path: `${path}.observes`,
            });
        }
      }
    });
  });
  return errors;
}
