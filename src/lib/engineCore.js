import { gsap } from 'gsap';

/**
 * Creates a shared EngineCore that both ProductionEngine and EditorEngine compose.
 * Never writes to the DOM. Never calls ScrollTrigger. Never calls .play().
 *
 * @param {BuildResult} buildResult
 * @returns {EngineCore}
 */
export function createEngineCore(buildResult) {
  // subscribers: Map<elementId, Set<callback>>
  const subscribers = new Map();
  let tickerCallback = null;

  function startTicker() {
    if (tickerCallback) return;
    tickerCallback = () => {
      for (const [elementId, cbs] of subscribers.entries()) {
        if (cbs.size === 0) continue;
        const elementBuild = buildResult.elements.get(elementId);
        if (!elementBuild) continue;
        const snapshot = { ...elementBuild.proxy };
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
     * Subscribes to raw proxy value broadcasts for an element.
     * Throws if elementId is not in buildResult.
     * @returns {Function} unsubscribe
     */
    subscribe(elementId, callback) {
      if (!buildResult.elements.has(elementId)) {
        throw new Error(`subscribe: element "${elementId}" not found in buildResult.`);
      }
      if (!subscribers.has(elementId)) {
        subscribers.set(elementId, new Set());
      }
      subscribers.get(elementId).add(callback);
      if (totalSubscriberCount() === 1) startTicker();

      return () => {
        const cbs = subscribers.get(elementId);
        if (cbs) {
          cbs.delete(callback);
          if (totalSubscriberCount() === 0) stopTicker();
        }
      };
    },

    /**
     * Calls plugin.compose() for every resolved plugin on the element,
     * merges the results, assembles the CSS filter string from *_filter keys,
     * and returns the final patch object. Does NOT write to the DOM.
     */
    compose(elementId, rawData) {
      const elementBuild = buildResult.elements.get(elementId);
      if (!elementBuild) return {};
      const source = rawData ?? { ...elementBuild.proxy };
      const plugins = buildResult.elementPlugins.get(elementId) ?? [];
      const patch = {};
      const filterParts = [];

      for (const plugin of plugins) {
        if (typeof plugin.compose !== 'function') continue;
        let contribution;
        try {
          contribution = plugin.compose(source, elementBuild);
        } catch {
          // Defensive: one broken plugin must not blank the whole patch
          continue;
        }
        if (!contribution) continue;
        for (const [k, v] of Object.entries(contribution)) {
          if (k.endsWith('_filter')) {
            // Collect filter contributions in plugin-resolution order
            filterParts.push(v);
          } else {
            patch[k] = v;
          }
        }
      }

      if (filterParts.length > 0) {
        patch.filter = filterParts.join(' ');
      }

      return patch;
    },

    /**
     * Kills all timelines whose sceneId matches, and removes their element subscribers.
     */
    destroyScene(sceneId) {
      const matchingScenarios = buildResult.scenarios.filter(s => s.sceneId === sceneId);
      const elementsToClear = new Set();

      for (const scenario of matchingScenarios) {
        if (scenario.timeline) {
          // Find all proxies targeted by tweens in this timeline
          const tweens = scenario.timeline.getChildren(true, true, false);
          for (const tween of tweens) {
            const targets = tween.targets();
            const targetProxy = Array.isArray(targets) ? targets[0] : targets;
            if (targetProxy) {
              // Find elementId for this proxy
              for (const [elementId, elBuild] of buildResult.elements.entries()) {
                if (elBuild.proxy === targetProxy) {
                  elementsToClear.add(elementId);
                  break;
                }
              }
            }
          }
          scenario.timeline.kill();
        }
        if (scenario.timelineId) {
          const group = buildResult.timelineGroups.get(scenario.timelineId);
          if (group?.masterTimeline) {
            group.masterTimeline.kill();
          }
        }
      }

      // Clear subscribers for elements belonging to the destroyed scene
      for (const elementId of elementsToClear) {
        const cbs = subscribers.get(elementId);
        if (cbs) {
          cbs.clear();
          subscribers.delete(elementId);
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
      for (const scenario of buildResult.scenarios) {
        if (scenario.timeline) scenario.timeline.kill();
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
