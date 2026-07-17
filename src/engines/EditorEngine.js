import { getMotionsList } from '../domain/models.js';
import { createDeferredCall } from '../utils/deferredCall.js';
import { BaseEngine } from './BaseEngine.js';

export class EditorEngine extends BaseEngine {
  #trackIndex = new Map();
  // A second, independent deferred-call queue keyed on #trackIndex instead of
  // EngineCore. BaseEngine's deferredCall buffers subscriber calls until the
  // GSAP tick core is ready; this one buffers track-level subscribe() calls
  // until loadProject has finished building the #trackIndex. They manage
  // different lifecycles and must remain separate — flushing one does not
  // imply the other is ready.
  #deferredCall = createDeferredCall();

  _configForMount(motionId, config, groupSpec) {
    return { ...config, _suppressDriver: true };
  }

  async loadProject(schema, options = {}) {
    await super.loadProject(schema, options);

    if (!this._project) return;

    for (const motion of getMotionsList(this._project)) {
      if (motion.driver?.type === 'delegate') continue;
      const inst = this.mountInstance(motion.motionId);
      for (const trackId of inst.tracksMap.keys()) {
        this.#trackIndex.set(trackId, inst);
      }
    }

    this.#deferredCall.setCore(this.#trackIndex);
  }

  subscribe(trackId, callback) {
    return this.#deferredCall.call((trackIndex) => {
      const inst = trackIndex.get(trackId);
      if (inst) return inst.subscribe(trackId, callback);
    });
  }

  compose(trackId, rawData) {
    const inst = this.#trackIndex.get(trackId);
    if (!inst) return {};
    return inst.compose(trackId, rawData);
  }

  destroySection(sectionId) {
    for (const inst of [...this._instances.values()]) {
      if (inst.schemaMotion.driver?.sectionId === sectionId) {
        inst.destroy();
      }
    }
  }

  setProgress(target, progress) {
    if (!this._project) throw new Error('setProgress: no project loaded.');
    const clamped = Math.max(0, Math.min(1, progress));
    const controller = this._groups.get(target);
    if (controller) { controller.seek(clamped); return; }
    for (const inst of this._instances.values()) {
      if (inst.motionId === target) { inst.seek(clamped); return; }
    }
    throw new Error(`setProgress: no group or motion found for target "${target}".`);
  }

  destroy() {
    this.#deferredCall.clearCore();
    this.#trackIndex.clear();
    super.destroy();
  }
}

export function createEditorEngine(deps) {
  return new EditorEngine(deps);
}
