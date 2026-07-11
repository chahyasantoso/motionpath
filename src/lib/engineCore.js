import { gsap } from 'gsap';
import { ALL_PLUGINS } from './plugins.js';

/**
 * Creates a shared EngineCore that both ProductionEngine and EditorEngine compose.
 * Never writes to the DOM. Never calls ScrollTrigger. Never calls .play().
 *
 * @param {BuildResult} buildResult
 * @returns {EngineCore}
 */
export function createEngineCore(buildResult) {
  // subscribers: Map<trackId, Set<callback>>
  const subscribers = new Map();
  let tickerCallback = null;

  function startTicker() {
    if (tickerCallback) return;
    tickerCallback = () => {
      for (const [trackId, cbs] of subscribers.entries()) {
        if (cbs.size === 0) continue;
        const trackBuild = buildResult.tracks.get(trackId);
        if (!trackBuild) continue;
        const progress = trackBuild.tween ? trackBuild.tween.progress() : 0;
        const snapshot = {
          ...trackBuild.proxy,
          progress
        };
        for (const cb of cbs) {
          cb(snapshot);
        }
      }
    };
    gsap.ticker.add(tickerCallback);
  }

  function stopTicker() {
    if (!tickerCallback) return;
    gsap.ticker.remove(tickerCallback);
    tickerCallback = null;
  }

  function totalSubscriberCount() {
    let count = 0;
    for (const cbs of subscribers.values()) {
      count += cbs.size;
    }
    return count;
  }

  return {
    /**
     * Subscribes to raw proxy value broadcasts for a track.
     * Throws if trackId is not in buildResult.
     * @returns {Function} unsubscribe
     */
    subscribe(trackId, callback) {
      if (!buildResult.tracks.has(trackId)) {
        throw new Error(`subscribe: track "${trackId}" not found in buildResult.`);
      }
      if (!subscribers.has(trackId)) {
        subscribers.set(trackId, new Set());
      }
      subscribers.get(trackId).add(callback);
      if (totalSubscriberCount() === 1) startTicker();

      // Replay current state immediately so a new subscriber never waits on the
      // next tick, which may be arbitrarily delayed (paused editor timeline,
      // backgrounded tab, fake timers in tests). `proxy` is already always current.
      callback({ ...buildResult.tracks.get(trackId).proxy });

      return () => {
        const cbs = subscribers.get(trackId);
        if (cbs) {
          cbs.delete(callback);
          if (totalSubscriberCount() === 0) stopTicker();
        }
      };
    },

    /**
     * Calls plugin.compose() for every resolved plugin on the track,
     * merges the results into a patch object, and returns it.
     * Does NOT write to the DOM or perform any platform-specific serialization
     * (e.g. CSS filter string assembly) — that's owned by the renderer layer.
     */
    compose(trackId, rawData) {
      const trackBuild = buildResult.tracks.get(trackId);
      if (!trackBuild) return {};
      const source = rawData ?? { ...trackBuild.proxy };
      const resolved = buildResult.trackPlugins.get(trackId) ?? [];
      
      const resolvedKeys = new Set();
      for (const p of resolved) {
        if (p.keys) {
          for (const k of p.keys) {
            resolvedKeys.add(k);
          }
        }
      }

      const plugins = [...resolved];
      for (const p of ALL_PLUGINS) {
        if (resolved.includes(p)) continue;
        if (p.keys && p.keys.some(k => resolvedKeys.has(k))) continue;

        const hasMatchingKey = Object.keys(source).some(key => p.claimsKey(key));

        if (hasMatchingKey) {
          plugins.push(p);
        }
      }

      const patch = {};

      for (const plugin of plugins) {
        if (typeof plugin.compose !== 'function') continue;
        let contribution;
        try {
          contribution = plugin.compose(source, trackBuild.trackConfig ?? trackBuild);
        } catch {
          // Defensive: one broken plugin must not blank the whole patch
          continue;
        }
        if (!contribution) continue;
        for (const [k, v] of Object.entries(contribution)) {
          patch[k] = v;
        }
      }

      return patch;
    },

    /**
     * Kills all timelines whose sectionId matches, and removes their track subscribers.
     */
    destroySection(sectionId) {
      const matchingMotions = buildResult.motions.filter(m => m.sectionId === sectionId);
      const tracksToClear = new Set();

      const groupsToKill = new Set();

      for (const motion of matchingMotions) {
        if (motion.timeline) {
          // Find all proxies targeted by tweens in this timeline
          const tweens = motion.timeline.getChildren(true, true, false);
          for (const tween of tweens) {
            const targets = tween.targets();
            const targetProxy = Array.isArray(targets) ? targets[0] : targets;
            if (targetProxy) {
              // Find trackId for this proxy
              for (const [trackId, elBuild] of buildResult.tracks.entries()) {
                if (elBuild.proxy === targetProxy) {
                  tracksToClear.add(trackId);
                  break;
                }
              }
            }
          }
          motion.timeline.kill();
          if (motion.timelineId) {
            groupsToKill.add(motion.timelineId);
            const group = buildResult.timelineGroups.get(motion.timelineId);
            if (group?.masterTimeline) {
              group.masterTimeline.remove(motion.timeline);
            }
          }
        }
      }

      for (const id of groupsToKill) {
        // Only kill master if ALL child motions in the group are being destroyed
        const allMatch = buildResult.motions
          .filter(m => m.timelineId === id)
          .every(m => matchingMotions.includes(m));
        if (allMatch) {
          buildResult.timelineGroups.get(id)?.masterTimeline?.kill();
        }
      }

      // Clear subscribers for tracks belonging to the destroyed section
      for (const trackId of tracksToClear) {
        const cbs = subscribers.get(trackId);
        if (cbs) {
          cbs.clear();
          subscribers.delete(trackId);
        }
      }

      if (totalSubscriberCount() === 0) {
        stopTicker();
      }
    },

    /**
     * Kills everything: all timelines, all subscribers, removes ticker.
     */
    destroy() {
      for (const motion of buildResult.motions) {
        if (motion.timeline) motion.timeline.kill();
      }
      for (const group of buildResult.timelineGroups.values()) {
        if (group.masterTimeline) group.masterTimeline.kill();
      }
      for (const cbs of subscribers.values()) {
        cbs.clear();
      }
      stopTicker();
    },
  };
}
