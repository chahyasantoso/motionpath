import { resolveTrack } from '../usecases/ResolveTrack.js';
import { buildTrackTweenSync } from '../usecases/BuildProject.js';
import { composePatch } from '../usecases/ComposeTrackPatch.js';
import { getMotion } from '../domain/models.js';

/**
 * Shared resolver for driver:"delegate" motions. Used by both ProductionEngine
 * and EditorEngine so the logic (and its fixes) live in exactly one place —
 * these two engines were previously carrying byte-for-byte duplicate copies
 * of this function.
 *
 * Two behaviors fixed vs. the original inline implementation:
 *
 * 1. Plugin compose errors now THROW instead of being silently swallowed.
 *    Silent failure here contradicts the project's own established pattern
 *    (ease-collision throws, tweenVars collisions throw) — a broken plugin
 *    should never produce a track with quietly-missing properties.
 *
 * 2. Tween caching for the no-override path. The original implementation
 *    called buildTrackTweenSync() (constructs a fresh GSAP tween) and then
 *    tween.kill() on every single resolve() call. For the intended use case
 *    (a game loop calling resolveMotion once per entity per frame) that's a
 *    full tween build+teardown per call — expensive at any real entity count.
 *    Each (motionId, trackId) pair with no override now builds its tween
 *    once, paused, and reuses it via tween.progress() on every subsequent
 *    call. Tracks resolved WITH an override are never cached — an override
 *    can differ per call/per-instance (e.g. a boss's scale override), so
 *    caching it would risk serving a stale tween built for a different
 *    override. Those are still built fresh and killed immediately after use,
 *    same as before.
 */
export function createMotionResolver() {
  const _cache = new Map(); // `${motionId}::${trackId}` -> { tween, proxy, resolvedPlugins, resolvedTrack }

  function _buildResolved(track, templates, trackOverride) {
    const resolvedTrack = resolveTrack(track, templates);

    let finalKeyframes = resolvedTrack.keyframes;
    let finalDuration = resolvedTrack.duration;
    let finalTransformOrigin = resolvedTrack.transformOrigin;

    if (trackOverride) {
      if (trackOverride.duration !== undefined) finalDuration = trackOverride.duration;
      if (trackOverride.transformOrigin !== undefined) finalTransformOrigin = trackOverride.transformOrigin;
      if (trackOverride.keyframes) {
        finalKeyframes = { ...finalKeyframes };
        for (const key of Object.keys(trackOverride.keyframes)) {
          finalKeyframes[key] = trackOverride.keyframes[key];
        }
      }
    }

    const finalTrackConfig = {
      ...resolvedTrack,
      duration: finalDuration,
      transformOrigin: finalTransformOrigin,
      keyframes: finalKeyframes,
    };

    const { proxy, tween, resolvedPlugins } = buildTrackTweenSync(
      track.id,
      finalKeyframes,
      finalDuration ?? 1,
      finalTrackConfig
    );

    // Cached tweens are never driven by GSAP's own ticker — progress is
    // always set explicitly by the caller on every resolve() call.
    tween.pause(0);

    return { tween, proxy, resolvedPlugins, resolvedTrack: finalTrackConfig };
  }

  /**
   * @param {object} schema - the loaded project schema or MotionProject domain model
   * @param {string} motionId
   * @param {number} progress - 0..1
   * @param {object} [overrides] - keyed by track id, same shape as track-level overrides
   * @returns {Record<string, object>} keyed by track id, always — regardless of track count
   */
  function resolve(schema, motionId, progress, overrides = {}) {
    const isDomain = schema && typeof schema.motions === 'object' && schema.motions instanceof Map;
    const originalMotion = isDomain
      ? getMotion(schema, motionId)
      : schema.motions?.find(m => m && m.motionId === motionId);

    if (!originalMotion) {
      throw new Error(`resolveMotion: motion with id "${motionId}" not found.`);
    }

    const driverType = isDomain ? originalMotion.driver.type : originalMotion.driver?.type;
    if (driverType !== 'delegate' && driverType !== 'manual') {
      throw new Error(`resolveMotion: motion with id "${motionId}" is not a delegate motion.`);
    }

    const templates = isDomain ? schema.templates : (schema.templates || []);
    const result = {};
    const tracks = originalMotion.tracks || [];

    for (const track of tracks) {
      const trackOverride = overrides?.[track.id];
      const cacheKey = `${motionId}::${track.id}`;
      let cached = trackOverride ? null : _cache.get(cacheKey);

      if (!cached) {
        cached = _buildResolved(track, templates, trackOverride);
        if (!trackOverride) {
          _cache.set(cacheKey, cached);
        }
      }

      cached.tween.progress(progress);
      const patch = composePatch(
        cached.resolvedPlugins,
        cached.proxy,
        cached.resolvedTrack,
        `motion "${motionId}", track "${track.id}"`
      );

      if (trackOverride) {
        // One-off resolve (has an override) — never cached, clean up immediately.
        cached.tween.kill();
      }

      result[track.id] = patch;
    }

    return result;
  }

  /**
   * Kills every cached tween and clears the cache. Must be called whenever
   * the owning engine tears down or loads a new project — cached tweens
   * reference plugin/track state from the schema that produced them and
   * must not survive a reload.
   */
  function clearCache() {
    for (const cached of _cache.values()) {
      try {
        cached.tween.kill();
      } catch (e) {
        /* ignore */
      }
    }
    _cache.clear();
  }

  return { resolve, clearCache };
}
