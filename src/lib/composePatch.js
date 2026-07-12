/**
 * Runs plugin.compose() for every plugin in `plugins`, merges the results into
 * one patch object. Shared by engineCore.compose() (DOM path) and
 * resolveMotion.js (delegate/game-loop path) so merge behavior can't drift
 * between the two again.
 *
 * Throws (does not swallow) if a plugin's compose() throws — a broken plugin
 * must never produce a patch with silently-missing properties.
 *
 * `filter` contributions are merged key-by-key (not overwritten) since more
 * than one plugin owning a filter sub-key is a real possibility going forward.
 *
 * @param {Array} plugins - already-resolved plugins for this track
 * @param {object} rawData
 * @param {object} trackConfig
 * @param {string} [context] - human-readable identifier for error messages,
 *   e.g. `track "heroCard"` or `motion "enemyMovement", track "lane1"`
 */
export function composePatch(plugins, rawData, trackConfig, context = '') {
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
