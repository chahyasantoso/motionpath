import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { validateProject } from '../validators/index.js';
import { buildProject } from './builder.js';
import { createEngineCore } from './engineCore.js';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Factory function per Brief 4.
 * @param {{ resolveElement: (id: string) => Element }} deps
 * @returns {ProductionEngine}
 */
export function createProductionEngine(deps) {
  let _core = null;
  let _buildResult = null;
  // Track only the ScrollTrigger instances THIS engine created.
  const _createdScrollTriggers = [];

  function _cleanup() {
    for (const st of _createdScrollTriggers) {
      try { st.kill(); } catch (e) { /* ignore */ }
    }
    _createdScrollTriggers.length = 0;
    if (_core) {
      _core.destroy();
      _core = null;
    }
    _buildResult = null;
  }

  return {
    async loadProject(schema) {
      // Step 1: Validate
      const errors = validateProject(schema) || [];
      const hardErrors = errors.filter(e => e.severity === 'error');
      const warnings = errors.filter(e => e.severity !== 'error');
      warnings.forEach(w => console.warn('[ProductionEngine]', w.message));
      if (hardErrors.length > 0) {
        throw new Error(
          '[ProductionEngine] Schema validation failed:\n' +
          hardErrors.map(e => `  - ${e.message}`).join('\n')
        );
      }

      // Step 2: Build
      const buildResult = await buildProject(schema, deps);

      // Step 3: EngineCore
      const core = createEngineCore(buildResult);

      // Step 4: Wire triggers — with rollback on failure
      const createdSTs = [];
      try {
        const { scenarios, timelineGroups } = buildResult;
        const processedGroups = new Set();

        for (const scenario of scenarios) {
          const { timelineId, sceneId, triggerType, triggerConfig } = scenario;

          if (timelineId) {
            if (processedGroups.has(timelineId)) continue;
            processedGroups.add(timelineId);

            const group = timelineGroups.get(timelineId);
            if (!group) continue;
            const primaryScenario = scenarios[group.primaryScenarioIndex];
            const config = primaryScenario?.triggerConfig || {};

            if (group.triggerType === 'scroll-scrub') {
              const st = ScrollTrigger.create({ ...config, animation: group.masterTimeline });
              createdSTs.push(st);
            } else if (group.triggerType === 'time') {
              group.masterTimeline
                .repeat(config.repeat ?? 0)
                .yoyo(!!config.yoyo)
                .repeatDelay(config.repeatDelay ?? 0);
              group.masterTimeline.play();
            }
          } else {
            const config = triggerConfig || {};

            if (triggerType === 'scroll-scrub') {
              const st = ScrollTrigger.create({ ...config, animation: scenario.timeline });
              createdSTs.push(st);
            } else if (triggerType === 'scroll-observer') {
              const triggerEl = deps.resolveElement(config.startTrigger ?? sceneId);
              const st = ScrollTrigger.create({
                trigger: triggerEl,
                start: config.start,
                toggleActions: config.toggleActions,
                animation: scenario.timeline,
              });
              createdSTs.push(st);
            } else if (triggerType === 'time') {
              scenario.timeline
                .repeat(config.repeat ?? 0)
                .yoyo(!!config.yoyo)
                .repeatDelay(config.repeatDelay ?? 0);
              scenario.timeline.play();
            }
          }
        }
      } catch (err) {
        // Rollback: kill any ScrollTriggers created so far, then re-throw
        for (const st of createdSTs) {
          try { st.kill(); } catch (e) { /* ignore */ }
        }
        // Kill all timelines built so far
        for (const scenario of buildResult.scenarios) {
          if (scenario.timeline) scenario.timeline.kill();
        }
        for (const group of buildResult.timelineGroups.values()) {
          if (group.masterTimeline) group.masterTimeline.kill();
        }
        throw err;
      }

      // Commit — replace any previous state
      _cleanup();
      _core = core;
      _buildResult = buildResult;
      _createdScrollTriggers.push(...createdSTs);
    },

    subscribe(elementId, callback) {
      if (!_core) throw new Error('ProductionEngine: loadProject() must be called before subscribe().');
      return _core.subscribe(elementId, callback);
    },

    compose(elementId, rawData) {
      if (!_core) return {};
      return _core.compose(elementId, rawData);
    },

    destroyScene(sceneId) {
      if (!_core) return;
      return _core.destroyScene(sceneId);
    },

    destroy() {
      _cleanup();
    },

    pauseTimer(id) {
      if (!_buildResult) throw new Error(`pauseTimer: no project loaded.`);
      const group = _buildResult.timelineGroups.get(id);
      if (group) { group.masterTimeline.pause(); return; }
      const scenario = _buildResult.scenarios.find(s => String(s.scenarioIndex) === id);
      if (scenario) { scenario.timeline.pause(); return; }
      throw new Error(`pauseTimer: no group or scenario found for id "${id}".`);
    },

    playTimer(id) {
      if (!_buildResult) throw new Error(`playTimer: no project loaded.`);
      const group = _buildResult.timelineGroups.get(id);
      if (group) { group.masterTimeline.play(); return; }
      const scenario = _buildResult.scenarios.find(s => String(s.scenarioIndex) === id);
      if (scenario) { scenario.timeline.play(); return; }
      throw new Error(`playTimer: no group or scenario found for id "${id}".`);
    },

    enableScroll() {
      ScrollTrigger.getAll().forEach(st => st.enable());
    },

    disableScroll() {
      ScrollTrigger.getAll().forEach(st => st.disable());
    },
  };
}

// Singleton — drop-in replacement for motionEngine default export.
// The import path in useMotionSubscriber.js changes from '../lib/motionEngine'
// to '../lib/ProductionEngine'; nothing else changes at the call sites.
export const productionEngine = createProductionEngine({
  resolveElement: (id) => document.querySelector(`[data-motion-id="${id}"]`),
});

export default productionEngine;
