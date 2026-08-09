export function composeTrackPatch(plugins, rawData, trackConfig, context = "") {
  const patch = {};
  const internalKeys = new Set(
    plugins.flatMap((plugin) => plugin.internalKeys || []),
  );
  for (const plugin of plugins) {
    if (typeof plugin.compose !== "function") continue;
    let contribution;
    try {
      contribution = plugin.compose(rawData, trackConfig);
    } catch (e) {
      throw new Error(
        `composePatch: plugin compose failed${context ? ` for ${context}` : ""}, property key(s) [${plugin.keys?.join(", ") ?? "?"}]: ${e.message}`,
      );
    }
    if (!contribution) continue;
    for (const [key, value] of Object.entries(contribution)) {
      if (internalKeys.has(key) || (plugin.internalKeys || []).includes(key))
        continue;
      const merge = plugin.outputs?.[key]?.merge ?? "replace";
      if (
        merge === "shallow" &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      )
        patch[key] = { ...(patch[key] || {}), ...value };
      else if (merge === "append" && Array.isArray(value))
        patch[key] = [
          ...(Array.isArray(patch[key]) ? patch[key] : []),
          ...value,
        ];
      else patch[key] = value;
    }
  }
  return patch;
}
export { composeTrackPatch as composePatch };
