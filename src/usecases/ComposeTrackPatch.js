import { resolvePluginForKey } from '../domain/plugins.js';

/**
 * ComposeTrackPatch use case.
 * Runs plugin.compose() for every plugin in `plugins`, merges the results into
 * one patch object.
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

  // Dynamically resolve and compose any extra properties present in rawData
  for (const key of Object.keys(rawData || {})) {
    if (patch[key] !== undefined) continue;

    const plugin = resolvePluginForKey(key);
    if (plugin && typeof plugin.compose === 'function') {
      const contribution = plugin.compose(rawData, trackConfig);
      if (contribution && contribution[key] !== undefined) {
        if (key === 'filter' && typeof contribution.filter === 'object' && contribution.filter !== null) {
          patch.filter = { ...(patch.filter || {}), ...contribution.filter };
        } else {
          patch[key] = contribution[key];
        }
      }
    }
  }

  return patch;
}
export { composeTrackPatch as composePatch }; // Export alias for ease of migration
