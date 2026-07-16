/**
 * ComposeTrackPatch use case.
 * Runs plugin.compose() for every plugin in `plugins`, merges the results into
 * one patch object.
 *
 * Note: `plugins` must already be the fully-resolved plugin list for this
 * track (same list used to build the track's tween/proxy). There is
 * deliberately no secondary "resolve extra properties from rawData" fallback
 * here — every key in `rawData` is written by contribute() from a plugin
 * already in `plugins`, so a second resolution pass would either be dead
 * code or, if it ever did fire, an untracked compose() call that bypasses
 * the error-context wrapping below. One loop, one error-handling path.
 *
 * @param {Array} plugins - already-resolved plugins for this track
 * @param {object} rawData
 * @param {object} trackConfig
 * @param {string} [context] - human-readable identifier for error messages
 * @returns {object} The composed patch object
 */
export function composeTrackPatch(plugins, rawData, trackConfig, context = '') {
  const patch = {};

  for (const plugin of plugins) {
    if (typeof plugin.compose !== 'function') continue;

    let contribution;
    try {
      contribution = plugin.compose(rawData, trackConfig);
    } catch (e) {
      throw new Error(
        `composePatch: plugin compose failed${context ? ` for ${context}` : ''}, ` +
        `property key(s) [${plugin.keys?.join(', ') ?? '?'}]: ${e.message}`
      );
    }

    if (!contribution) continue;

    for (const [k, v] of Object.entries(contribution)) {
      if (k === 'filter' && typeof v === 'object' && v !== null) {
        patch.filter = { ...(patch.filter || {}), ...v };
      } else {
        patch[k] = v;
      }
    }
  }

  return patch;
}
export { composeTrackPatch as composePatch }; // Export alias for ease of migration
