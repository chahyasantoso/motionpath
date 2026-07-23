import { parseV4Project } from '../lib/schema/parseV4Project.js';
import { TriggerRefRegistry } from '../lib/TriggerRefRegistry.js';

export class Engine {
  #triggerRefs = new TriggerRefRegistry();
  #v4Project = null;
  #instances = new Map();

  async loadProject(schema) {
    this.destroy();
    this.#v4Project = await parseV4Project(schema, {
      resolveElement: (id) => this.resolveElement(id)
    });
  }

  mountInstance(motionId, config = {}) {
    if (!this.#v4Project) {
      throw new Error('mountInstance: project not loaded.');
    }
    const motion = this.#v4Project.getMotion(motionId);
    if (motion) {
      motion.init((id) => this.resolveElement(id));
      this.#instances.set(motion.id, motion);
      return motion;
    }
    const track = this.#v4Project.getTrack(motionId);
    if (track) {
      this.#instances.set(track.id, track);
      return track;
    }
    throw new Error(`mountInstance: motion or track "${motionId}" not found in project.`);
  }

  unmountInstance(motionId) {
    const inst = this.#instances.get(motionId);
    if (inst) {
      inst.destroy?.();
      this.#instances.delete(motionId);
    }
  }

  getTrack(trackId) {
    if (!this.#v4Project) return null;
    return this.#v4Project.getTrack(trackId);
  }

  registerTriggerRef(id, ref) {
    this.#triggerRefs.register(id, ref);
  }

  unregisterTriggerRef(id, ref) {
    this.#triggerRefs.unregister(id, ref);
  }

  resolveElement(id) {
    return this.#triggerRefs.resolveElement(id);
  }

  destroy() {
    for (const inst of this.#instances.values()) {
      inst.destroy?.();
    }
    this.#instances.clear();
    this.#v4Project = null;
  }
}

export const engine = new Engine();
