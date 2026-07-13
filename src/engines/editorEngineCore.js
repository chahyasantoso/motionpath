import { gsap } from 'gsap';
import { composePatch } from '../usecases/ComposeTrackPatch.js';

/**
 * Stateful EngineCore used exclusively by EditorEngine.
 *
 * @param {BuildResult} buildResult
 * @returns {EditorEngineCore}
 */
export function createEditorEngineCore(buildResult) {
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
    subscribe(trackId, callback) {
      if (!buildResult.tracks.has(trackId)) {
        throw new Error(`subscribe: track "${trackId}" not found in buildResult.`);
      }
      if (!subscribers.has(trackId)) {
        subscribers.set(trackId, new Set());
      }
      subscribers.get(trackId).add(callback);
      if (totalSubscriberCount() === 1) startTicker();

      callback({ ...buildResult.tracks.get(trackId).proxy });

      return () => {
        const cbs = subscribers.get(trackId);
        if (cbs) {
          cbs.delete(callback);
          if (totalSubscriberCount() === 0) stopTicker();
        }
      };
    },

    compose(trackId, rawData) {
      const trackBuild = buildResult.tracks.get(trackId);
      if (!trackBuild) return {};
      const source = rawData ?? { ...trackBuild.proxy };
      const plugins = buildResult.trackPlugins.get(trackId) ?? [];

      return composePatch(plugins, source, trackBuild.trackConfig ?? trackBuild, `track "${trackId}"`);
    },

    destroySection(sectionId) {
      const matchingMotions = buildResult.motions.filter(m => m.sectionId === sectionId);
      const tracksToClear = new Set();
      const groupsToKill = new Set();

      for (const motion of matchingMotions) {
        if (motion.timeline) {
          const tweens = motion.timeline.getChildren(true, true, false);
          for (const tween of tweens) {
            const targets = tween.targets();
            const targetProxy = Array.isArray(targets) ? targets[0] : targets;
            if (targetProxy) {
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
        const allMatch = buildResult.motions
          .filter(m => m.timelineId === id)
          .every(m => matchingMotions.includes(m));
        if (allMatch) {
          buildResult.timelineGroups.get(id)?.masterTimeline?.kill();
        }
      }

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
