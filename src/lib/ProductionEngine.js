import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { compileProject } from './compileProject.js';
import { createDeferredCall } from './deferredCall.js';
import { createMotionResolver } from './resolveMotion.js';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Resolves a trigger-related field that may reference an element.
 * - undefined/null -> falls back to resolving `fallbackId` (typically sectionId).
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
  let _schema = null;
  let _loadGeneration = 0;
  // Track only the ScrollTrigger instances THIS engine created.
  const _createdScrollTriggers = [];
  const _deferredCall = createDeferredCall();
  const _motionResolver = createMotionResolver();

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
    _schema = null;
    _motionResolver.clearCache();
  }

  return {
    async loadProject(schema, options = {}) {
      const loadId = ++_loadGeneration;

      const { core, buildResult } = await compileProject(schema, deps, 'ProductionEngine');

      // Stale-load guard: a newer loadProject() call (or destroy()) started
      // while buildProject was awaited — discard this result entirely.
      if (loadId !== _loadGeneration) {
        for (const motion of buildResult.motions) motion.timeline?.kill();
        for (const group of buildResult.timelineGroups.values()) group.masterTimeline?.kill();
        return;
      }

      // Step 4: Wire triggers — with rollback on failure
      const createdSTs = [];
      try {
        const { motions, timelineGroups } = buildResult;
        const processedGroups = new Set();

        for (const motion of motions) {
          const { timelineId, sectionId, triggerType, triggerConfig } = motion;

          if (timelineId) {
            if (processedGroups.has(timelineId)) continue;
            processedGroups.add(timelineId);

            const group = timelineGroups.get(timelineId);
            if (!group) continue;
            const primaryMotion = motions[group.primaryMotionIndex];
            const config = primaryMotion?.triggerConfig || {};

            if (group.triggerType === 'scroll-scrub') {
              const resolvedConfig = {
                ...config,
                trigger: resolveTriggerRef(config.trigger ?? config.startTrigger, deps, primaryMotion.sectionId),
              };
              if (config.pin !== undefined) {
                resolvedConfig.pin = resolveTriggerRef(config.pin, deps, primaryMotion.sectionId);
              }
              if (config.endTrigger !== undefined) {
                resolvedConfig.endTrigger = resolveTriggerRef(config.endTrigger, deps, primaryMotion.sectionId);
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
                trigger: resolveTriggerRef(config.trigger ?? config.startTrigger, deps, sectionId),
              };
              if (config.pin !== undefined) {
                resolvedConfig.pin = resolveTriggerRef(config.pin, deps, sectionId);
              }
              if (config.endTrigger !== undefined) {
                resolvedConfig.endTrigger = resolveTriggerRef(config.endTrigger, deps, sectionId);
              }
              const st = ScrollTrigger.create({ ...resolvedConfig, animation: motion.timeline });
              createdSTs.push(st);
            } else if (triggerType === 'scroll-observer') {
              motion.timeline
                .repeat(config.repeat ?? 0)
                .yoyo(!!config.yoyo)
                .repeatDelay(config.repeatDelay ?? 0);

              const st = ScrollTrigger.create({
                trigger: resolveTriggerRef(config.trigger ?? config.startTrigger, deps, sectionId),
                start: config.start,
                toggleActions: config.toggleActions,
                animation: motion.timeline,
              });
              createdSTs.push(st);
            } else if (triggerType === 'time') {
              motion.timeline
                .repeat(config.repeat ?? 0)
                .yoyo(!!config.yoyo)
                .repeatDelay(config.repeatDelay ?? 0);
              // playStates keyed by timelineId or motionIndex (string)
              const stateKey = timelineId ?? String(motion.motionIndex);
              const shouldPlay = options.playStates?.[stateKey] ?? true;
              if (shouldPlay) motion.timeline.play();
            }
          }
        }
      } catch (err) {
        // Rollback: kill any ScrollTriggers created so far, then re-throw
        for (const st of createdSTs) {
          try { st.kill(); } catch (e) { /* ignore */ }
        }
        // Kill all timelines built so far
        for (const motion of buildResult.motions) {
          if (motion.timeline) motion.timeline.kill();
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
      _schema = schema;
      _createdScrollTriggers.push(...createdSTs);
      _deferredCall.setCore(core);

      // Recalculate all scroll trigger positions after the full layout is committed.
      if (createdSTs.length > 0) {
        ScrollTrigger.refresh();
      }
    },

    subscribe(trackId, callback) {
      return _deferredCall.call((core) => core.subscribe(trackId, callback));
    },

    compose(trackId, rawData) {
      if (!_core) return {};
      return _core.compose(trackId, rawData);
    },

    destroySection(sectionId) {
      if (!_core) return;
      return _core.destroySection(sectionId);
    },

    registerTriggerRef(id, ref) {
      _triggerRefs.set(id, ref);
    },

    unregisterTriggerRef(id) {
      _triggerRefs.delete(id);
    },

    destroy() {
      // Clear pending subscriptions before tearing down so they are not
      // flushed into a new core after intentional teardown.
      _deferredCall.clearCore();
      _cleanup();
    },

    pauseTimer(id) {
      return _deferredCall.call(() => {
        const group = _buildResult?.timelineGroups.get(id);
        if (group) { group.masterTimeline.pause(); return; }
        const motion = _buildResult?.motions.find(m => String(m.motionIndex) === id || m.motionId === id);
        if (motion) { motion.timeline.pause(); return; }
        throw new Error(`pauseTimer: no group or motion found for id "${id}".`);
      });
    },

    playTimer(id) {
      return _deferredCall.call(() => {
        const group = _buildResult?.timelineGroups.get(id);
        if (group) { group.masterTimeline.play(); return; }
        const motion = _buildResult?.motions.find(m => String(m.motionIndex) === id || m.motionId === id);
        if (motion) { motion.timeline.play(); return; }
        throw new Error(`playTimer: no group or motion found for id "${id}".`);
      });
    },

    enableScroll() {
      ScrollTrigger.getAll().forEach(st => st.enable());
    },

    disableScroll() {
      ScrollTrigger.getAll().forEach(st => st.disable());
    },

    mountTimeline(motionId) {
      if (!_schema) {
        throw new Error('mountTimeline: project not loaded.');
      }
      const originalMotion = _schema.motions?.find(
        m => m && (m.motionId === motionId || (m.motionId === undefined && String(_schema.motions.indexOf(m)) === motionId))
      );
      if (!originalMotion) {
        throw new Error(`mountTimeline: motion with id "${motionId}" not found.`);
      }
      if (originalMotion.driver?.type === 'delegate') {
        throw new Error(`mountTimeline: cannot mount delegate motion "${motionId}".`);
      }
    },

    resolveMotion(motionId, progress, overrides = {}) {
      if (!_schema || !_buildResult) {
        throw new Error('resolveMotion: project not loaded.');
      }
      return _motionResolver.resolve(_schema, motionId, progress, overrides);
    }
  };
}

const _triggerRefs = new Map(); // id -> React.RefObject

// Singleton — drop-in replacement for motionEngine default export.
export const productionEngine = createProductionEngine({
  resolveElement: (id) => {
    const ref = _triggerRefs.get(id);
    if (!ref || !ref.current) {
      throw new Error(
        `MotionPath: trigger ref '${id}' is not registered. ` +
        `Ensure useMotionTrigger('${id}', ref) is mounted (and its ref attached) ` +
        `before this project's scenarios are wired.`
      );
    }
    return ref.current;
  },
});

export default productionEngine;
