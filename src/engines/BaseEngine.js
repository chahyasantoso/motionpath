import { resolvePluginForKey, ensureLoaded } from '../domain/plugins.js';
import { getMotionsList } from '../domain/models.js';
import { createMotionInstance } from '../usecases/CreateMotionInstance.js';
import { parseProjectSchema } from '../usecases/ParseProjectSchema.js';
import { resolveTrack } from '../usecases/ResolveTrack.js';
import { createDeferredCall } from '../utils/deferredCall.js';
import { validateProject } from '../validators/index.js';
import { createEngineCore } from './engineCore.js';
import { createMotionResolver } from './resolveMotion.js';
import { createTimelineGroupController } from './TimelineGroupController.js';

export class BaseEngine {
  _instances = new Map();
  _groups = new Map();
  _groupIndex = new Map();
  _project = null;
  _core = null;
  _schema = null;
  _triggerRefs = new Map();
  #loadGeneration = 0;
  #motionResolver = createMotionResolver();
  #deferredCall = createDeferredCall();
  #resolveElement;

  constructor(deps = {}) {
    this.#resolveElement = deps.resolveElement ?? ((id) => {
      const ref = this._triggerRefs.get(id);
      if (!ref || !ref.current) {
        throw new Error(
          `MotionPath: trigger ref '${id}' is not registered. ` +
          `Ensure useMotionTrigger('${id}', ref) is mounted (and its ref attached) ` +
          `before this project's scenarios are wired.`
        );
      }
      return ref.current;
    });
  }

  async loadProject(schema, options = {}) {
    const loadId = ++this.#loadGeneration;

    const errors = validateProject(schema) || [];
    const hardErrors = errors.filter((e) => e.severity === 'error');
    const warnings = errors.filter((e) => e.severity !== 'error');

    warnings.forEach((w) => console.warn(`[${this.constructor.name}]`, w.message));

    if (hardErrors.length > 0) {
      const err = new Error(
        `[${this.constructor.name}] Schema validation failed:\n` +
        hardErrors.map((e) => `  - ${e.message}`).join('\n')
      );
      err.validationErrors = errors;
      throw err;
    }

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

    if (loadId !== this.#loadGeneration) {
      return;
    }

    this._cleanup();
    this._schema = schema;
    this._project = parseProjectSchema(schema);
    this._core = createEngineCore();
    this.#deferredCall.setCore(this._core);

    for (const motion of getMotionsList(this._project)) {
      const tid = motion.driver?.timelineId;
      if (!tid) continue;
      if (!this._groupIndex.has(tid)) {
        this._groupIndex.set(tid, { memberIds: new Set(), primaryId: null });
      }
      const entry = this._groupIndex.get(tid);
      entry.memberIds.add(motion.motionId);
      if (motion.driver.primary) {
        entry.primaryId = motion.motionId;
      }
    }

    this._onProjectLoaded();
  }

  mountInstance(motionId, config = {}) {
    if (!this._project || !this._core) {
      throw new Error('mountInstance: project not loaded.');
    }

    const groupSpec = this._groupSpecForMotion(motionId);
    const effectiveConfig = this._configForMount(motionId, config, groupSpec);

    const onSubscriberChange = (inst, hasSubscribers) => {
      if (!this._core) return;
      if (hasSubscribers) {
        this._core.registerActiveInstance(inst);
      } else {
        this._core.unregisterActiveInstance(inst);
      }
    };

    const instance = createMotionInstance(motionId, effectiveConfig, {
      project: this._project,
      resolveElement: this.#resolveElement,
      mountInstance: (childMotionId, childConfig) => {
        return this.mountInstance(childMotionId, childConfig);
      },
      onSubscriberChange,
      onDestroy: (destroyedInstance) => {
        this._instances.delete(destroyedInstance.id);

        if (destroyedInstance._timelineGroupId) {
          const controller = this._groups.get(destroyedInstance._timelineGroupId);
          if (controller) {
            const isEmpty = controller.removeMember(
              destroyedInstance.id,
              destroyedInstance.motionId
            );
            if (isEmpty) {
              controller.destroy();
              this._groups.delete(destroyedInstance._timelineGroupId);
            }
          }
        }
      }
    });

    this._instances.set(instance.id, instance);

    if (groupSpec) {
      const { timelineId, primaryId } = groupSpec;

      if (!this._groups.has(timelineId)) {
        this._groups.set(timelineId, createTimelineGroupController(timelineId, primaryId));
      }
      const controller = this._groups.get(timelineId);
      controller.addMember(instance);
      instance._timelineGroupId = timelineId;
    }

    this._onInstanceMounted(instance, groupSpec);

    return instance;
  }

  resolveMotion(motionId, progress, overrides = {}) {
    if (!this._project) {
      throw new Error('resolveMotion: project not loaded.');
    }
    return this.#motionResolver.resolve(this._project, motionId, progress, overrides);
  }

  destroy() {
    this.#deferredCall.clearCore();
    this._cleanup();
  }

  registerTriggerRef(id, ref) {
    if (this._triggerRefs.has(id)) {
      console.warn(
        `[MotionPath] Double-registration detected: Trigger ref with ID '${id}' is being overwritten. ` +
        `Make sure you do not have multiple elements using the same trigger ID at the same time.`
      );
    }
    this._triggerRefs.set(id, ref);
  }

  unregisterTriggerRef(id, ref) {
    if (ref === undefined || this._triggerRefs.get(id) === ref) {
      this._triggerRefs.delete(id);
    }
  }

  _cleanup() {
    this.#loadGeneration++;
    for (const instance of this._instances.values()) {
      try { instance.destroy(); } catch (e) { /* ignore */ }
    }
    this._instances.clear();

    for (const controller of this._groups.values()) {
      try { controller.destroy(); } catch (e) { /* ignore */ }
    }
    this._groups.clear();
    this._groupIndex.clear();

    if (this._core) {
      this._core.destroy();
      this._core = null;
    }
    this._schema = null;
    this._project = null;
    this.#motionResolver.clearCache();
  }

  _groupSpecForMotion(motionId) {
    for (const [timelineId, spec] of this._groupIndex.entries()) {
      if (spec.memberIds.has(motionId)) {
        return { timelineId, primaryId: spec.primaryId };
      }
    }
    return null;
  }

  _configForMount(motionId, config, groupSpec) { return config; }
  _onProjectLoaded() {}
  _onInstanceMounted(instance, groupSpec) {}
}
