import { resolvePluginForKey } from '../domain/plugins.js';
import { ensureLoaded } from '../usecases/BuildProject.js';
import { createMotionInstance } from '../usecases/CreateMotionInstance.js';
import { parseProjectSchema } from '../usecases/ParseProjectSchema.js';
import { resolveTrack } from '../usecases/ResolveTrack.js';
import { createDeferredCall } from '../utils/deferredCall.js';
import { validateProject } from '../validators/index.js';
import { createEngineCore } from './engineCore.js';
import { createMotionResolver } from './resolveMotion.js';

/**
 * Factory function for ProductionEngine using Lazy/Instance architecture.
 * @param {{ resolveElement: (id: string) => Element }} [deps]
 * @returns {ProductionEngine}
 */
export function createProductionEngine(deps = {}) {
  const _triggerRefs = new Map(); // id -> React.RefObject, scoped to this engine instance

  const resolveElement = deps.resolveElement ?? ((id) => {
    const ref = _triggerRefs.get(id);
    if (!ref || !ref.current) {
      throw new Error(
        `MotionPath: trigger ref '${id}' is not registered. ` +
        `Ensure useMotionTrigger('${id}', ref) is mounted (and its ref attached) ` +
        `before this project's scenarios are wired.`
      );
    }
    return ref.current;
  });

  const _deps = { ...deps, resolveElement };

  let _core = null;
  let _schema = null;
  let _project = null;
  let _loadGeneration = 0;
  const _instances = new Map(); // instanceId -> instance
  const _deferredCall = createDeferredCall();
  const _motionResolver = createMotionResolver();

  function _cleanup() {
    _loadGeneration++;
    for (const instance of _instances.values()) {
      try {
        instance.destroy();
      } catch (e) {
        /* ignore */
      }
    }
    _instances.clear();
    
    if (_core) {
      _core.destroy();
      _core = null;
    }
    _schema = null;
    _project = null;
    _motionResolver.clearCache();
  }

  return {
    async loadProject(schema, options = {}) {
      const loadId = ++_loadGeneration;

      // 1. Validate schema
      const errors = validateProject(schema) || [];
      const hardErrors = errors.filter((e) => e.severity === 'error');
      const warnings = errors.filter((e) => e.severity !== 'error');
      
      warnings.forEach((w) => console.warn(`[ProductionEngine]`, w.message));
      
      if (hardErrors.length > 0) {
        const err = new Error(
          `[ProductionEngine] Schema validation failed:\n` +
          hardErrors.map((e) => `  - ${e.message}`).join('\n')
        );
        err.validationErrors = errors;
        throw err;
      }

      // 2. Pre-load all plugins referenced in the schema keyframes
      const templates = schema.templates || [];
      const motions = schema.motions || [];
      const pluginsToLoad = new Set();
      
      for (const motion of motions) {
        const rawTracks = motion.tracks || [];
        for (const track of rawTracks) {
          const resolvedTrack = resolveTrack(track, templates);
          const keyframes = resolvedTrack?.keyframes || {};
          for (const propKey of Object.keys(keyframes)) {
            const plugin = resolvePluginForKey(propKey);
            if (plugin) {
              pluginsToLoad.add(plugin);
            }
          }
        }
      }

      for (const plugin of pluginsToLoad) {
        await ensureLoaded(plugin);
      }

      // Stale-load guard
      if (loadId !== _loadGeneration) {
        return;
      }

      // Commit
      _cleanup();
      _schema = schema;
      _project = parseProjectSchema(schema);
      _core = createEngineCore();
      _deferredCall.setCore(_core);
    },

    mountInstance(motionId, config = {}) {
      if (!_project || !_core) {
        throw new Error('mountInstance: project not loaded.');
      }

      const onSubscriberChange = (inst, hasSubscribers) => {
        if (!_core) return;
        if (hasSubscribers) {
          _core.registerActiveInstance(inst);
        } else {
          _core.unregisterActiveInstance(inst);
        }
      };

      const instance = createMotionInstance(motionId, config, {
        project: _project,
        resolveElement: _deps.resolveElement,
        mountInstance: (childMotionId, childConfig) => {
          return this.mountInstance(childMotionId, childConfig);
        },
        onSubscriberChange
      });

      _instances.set(instance.id, instance);

      const originalDestroy = instance.destroy.bind(instance);
      instance.destroy = () => {
        _instances.delete(instance.id);
        originalDestroy();
      };

      return instance;
    },

    destroy() {
      _deferredCall.clearCore();
      _cleanup();
    },

    resolveMotion(motionId, progress, overrides = {}) {
      if (!_project) {
        throw new Error('resolveMotion: project not loaded.');
      }
      return _motionResolver.resolve(_project, motionId, progress, overrides);
    },



    registerTriggerRef(id, ref) {
      if (_triggerRefs.has(id)) {
        console.warn(
          `[MotionPath] Double-registration detected: Trigger ref with ID '${id}' is being overwritten. ` +
          `Make sure you do not have multiple elements using the same trigger ID at the same time.`
        );
      }
      _triggerRefs.set(id, ref);
    },

    unregisterTriggerRef(id, ref) {
      if (ref === undefined || _triggerRefs.get(id) === ref) {
        _triggerRefs.delete(id);
      }
    }
  };
}

export const productionEngine = createProductionEngine();
export default productionEngine;
