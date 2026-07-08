import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { validateProject } from '../validators/index.js';
import { buildProject } from './builder.js';
import { createEngineCore } from './engineCore.js';
import { createDeferredSubscribe } from './deferredSubscribe.js';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Resolves a trigger-related field that may reference an element.
 * - undefined/null -> falls back to resolving `fallbackId` (typically sceneId).
 * - boolean -> passed through unchanged (GSAP's `pin: true` means "pin the
 *   trigger element itself"; there's nothing to resolve).
 * - string -> resolved via deps.resolveElement (the data-motion-id lookup) —
 *   never treated as a raw CSS selector, for the same reason element.id isn't.
 */
function resolveTriggerRef(value, deps, fallbackId) {
  if (value === undefined || value === null) return deps.resolveElement(fallbackId);
  if (typeof value === 'boolean') return value;
  return deps.resolveElement(value);
}

/**
 * Factory function per Brief 4.
 * @param {{ resolveElement: (id: string) => Element }} deps
 * @returns {ProductionEngine}
 */
export function createProductionEngine(deps) {
  let _core = null;
  let _buildResult = null;
  let _loadGeneration = 0;
  // Track only the ScrollTrigger instances THIS engine created.
  const _createdScrollTriggers = [];
  const _subRegistry = createDeferredSubscribe();

  function _cleanup() {
    // Invalidate any in-flight loadProject() — if its buildProject resolves
    // after this point it will see a mismatched generation and self-discard.
    _loadGeneration++;
    for (const st of _createdScrollTriggers) {
      try { st.kill(); } catch (e) { /* ignore */ }
    }
    _createdScrollTriggers.length = 0;
    // NOTE: do NOT call _subRegistry.clearCore() here.
    // _cleanup() is also called from the commit step inside loadProject(),
    // where pending subscriptions must survive so setCore() can flush them.
    // Only destroy() should clear the sub registry.
    if (_core) {
      _core.destroy();
      _core = null;
    }
    _buildResult = null;
  }

  return {
    async loadProject(schema, options = {}) {
      const loadId = ++_loadGeneration;

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

      // Stale-load guard: a newer loadProject() call (or destroy()) started
      // while buildProject was awaited — discard this result entirely.
      if (loadId !== _loadGeneration) {
        for (const scenario of buildResult.scenarios) scenario.timeline?.kill();
        for (const group of buildResult.timelineGroups.values()) group.masterTimeline?.kill();
        return;
      }

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
              const resolvedConfig = {
                ...config,
                trigger: resolveTriggerRef(config.trigger ?? config.startTrigger, deps, primaryScenario.sceneId),
              };
              if (config.pin !== undefined) {
                resolvedConfig.pin = resolveTriggerRef(config.pin, deps, primaryScenario.sceneId);
              }
              if (config.endTrigger !== undefined) {
                resolvedConfig.endTrigger = resolveTriggerRef(config.endTrigger, deps, primaryScenario.sceneId);
              }
              const st = ScrollTrigger.create({ ...resolvedConfig, animation: group.masterTimeline });
              createdSTs.push(st);
            } else if (group.triggerType === 'time') {
              // Unpause all nested child timelines so they inherit parent playhead motion
              group.masterTimeline.getChildren().forEach(child => child.paused(false));

              group.masterTimeline
                .repeat(config.repeat ?? 0)
                .yoyo(!!config.yoyo)
                .repeatDelay(config.repeatDelay ?? 0);
              const shouldPlay = options.playStates?.[timelineId] ?? true;
              if (shouldPlay) group.masterTimeline.play();
            }
          } else {
            const config = triggerConfig || {};

            if (triggerType === 'scroll-scrub') {
              const resolvedConfig = {
                ...config,
                trigger: resolveTriggerRef(config.trigger ?? config.startTrigger, deps, sceneId),
              };
              if (config.pin !== undefined) {
                resolvedConfig.pin = resolveTriggerRef(config.pin, deps, sceneId);
              }
              if (config.endTrigger !== undefined) {
                resolvedConfig.endTrigger = resolveTriggerRef(config.endTrigger, deps, sceneId);
              }
              const st = ScrollTrigger.create({ ...resolvedConfig, animation: scenario.timeline });
              createdSTs.push(st);
            } else if (triggerType === 'scroll-observer') {
              scenario.timeline
                .repeat(config.repeat ?? 0)
                .yoyo(!!config.yoyo)
                .repeatDelay(config.repeatDelay ?? 0);

              const st = ScrollTrigger.create({
                trigger: resolveTriggerRef(config.trigger ?? config.startTrigger, deps, sceneId),
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
              // playStates keyed by timelineId or scenarioIndex (string)
              const stateKey = timelineId ?? String(scenario.scenarioIndex);
              const shouldPlay = options.playStates?.[stateKey] ?? true;
              if (shouldPlay) scenario.timeline.play();
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
      _subRegistry.setCore(core);

      // Recalculate all scroll trigger positions after the full layout is committed.
      // When multiple pinned sections exist, each pin inserts a spacer element that
      // shifts the page layout for all subsequent sections. Without this refresh,
      // GSAP uses stale pre-pin offsets which causes earlier sections to appear
      // stuck (animation runs but the scrub range is miscalculated).
      if (createdSTs.length > 0) {
        ScrollTrigger.refresh();
      }
    },

    subscribe(elementId, callback) {
      return _subRegistry.subscribe(elementId, callback);
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
      // Clear pending subscriptions before tearing down so they are not
      // flushed into a new core after intentional teardown.
      _subRegistry.clearCore();
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
