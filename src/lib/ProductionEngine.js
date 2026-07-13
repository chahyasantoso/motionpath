import { validateProject } from '../validators/index.js';
import { createDeferredCall } from './deferredCall.js';
import { createMotionResolver } from './resolveMotion.js';
import { createEngineCore } from './engineCore.js';
import {
  TimelineMotionInstance,
  ScrollMotionInstance,
  ManualMotionInstance
} from './MotionInstance.js';
import { resolveTrack } from './templateResolver.js';
import { ensureLoaded } from './builder.js';
import { resolvePluginForKey } from './plugins.js';

/**
 * Factory function for ProductionEngine using Lazy/Instance architecture.
 * @param {{ resolveElement: (id: string) => Element }} deps
 * @returns {ProductionEngine}
 */
export function createProductionEngine(deps) {
  let _core = null;
  let _schema = null;
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
      _core = createEngineCore();
      _deferredCall.setCore(_core);
    },

    mountInstance(motionId, config = {}) {
      if (!_schema || !_core) {
        throw new Error('mountInstance: project not loaded.');
      }
      
      const schemaMotion = _schema.motions?.find(
        m => m && (m.motionId === motionId || (m.motionId === undefined && String(_schema.motions.indexOf(m)) === motionId))
      );
      if (!schemaMotion) {
        throw new Error(`mountInstance: motion with id "${motionId}" not found.`);
      }

      let driverType = schemaMotion.driver?.type || 'manual';
      if (driverType === 'timeline') {
        if (schemaMotion.driver?.trigger?.type === 'scroll') {
          driverType = 'gsap-scroll';
        } else {
          driverType = 'gsap-timeline';
        }
      }
      let instance;

      const onSubscriberChange = (inst, hasSubscribers) => {
        if (!_core) return;
        if (hasSubscribers) {
          _core.registerActiveInstance(inst);
        } else {
          _core.unregisterActiveInstance(inst);
        }
      };

      const instanceDeps = {
        ...deps,
        mountInstance: (childMotionId, childConfig) => {
          return this.mountInstance(childMotionId, childConfig);
        }
      };

      const templates = _schema.templates || [];

      switch (driverType) {
        case 'gsap-timeline':
          instance = new TimelineMotionInstance(motionId, config, schemaMotion, templates, instanceDeps, onSubscriberChange);
          break;
        case 'gsap-scroll':
          instance = new ScrollMotionInstance(motionId, config, schemaMotion, templates, instanceDeps, onSubscriberChange);
          break;
        case 'manual':
        case 'delegate':
          instance = new ManualMotionInstance(motionId, config, schemaMotion, templates, instanceDeps, onSubscriberChange);
          break;
        default:
          throw new Error(`Unknown driver type: ${driverType}`);
      }

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
      if (!_schema) {
        throw new Error('resolveMotion: project not loaded.');
      }
      return _motionResolver.resolve(_schema, motionId, progress, overrides);
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
      if (originalMotion.driver?.type === 'delegate' || originalMotion.driver?.type === 'manual') {
        throw new Error(`mountTimeline: cannot mount delegate motion "${motionId}".`);
      }
    },

    registerTriggerRef(id, ref) {
      _triggerRefs.set(id, ref);
    },

    unregisterTriggerRef(id) {
      _triggerRefs.delete(id);
    }
  };
}

const _triggerRefs = new Map(); // id -> React.RefObject

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
