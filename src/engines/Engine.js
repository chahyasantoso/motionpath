import { parseV4Project } from '../lib/schema/parseV4Project.js';
import { triggerDelegateRegistry } from '../lib/TriggerDelegate.js';
import { createTrack } from '../lib/createTrack.js';
import { Motion } from '../lib/Motion.js';

export class Engine {
  #v4Project = null;
  #instances = new Map();
  #instanceCounter = 0;

  async loadProject(schema) {
    this.destroy();
    this.#v4Project = await parseV4Project(schema);
  }

  #mountMotionWithDelegate(motionConfig, delegate) {
    const instanceId = `motion-${++this.#instanceCounter}`;
    const motion = new Motion({
      id: instanceId,
      triggerDelegate: delegate,
      staggerTransition: motionConfig.staggerTransition,
    });
    motion.motionId = motionConfig.id;

    const stagger = typeof motionConfig.stagger === 'number' ? motionConfig.stagger : 0;
    const motionTracks = motionConfig.tracks || [];
    for (let i = 0; i < motionTracks.length; i++) {
      const trackConfig = motionTracks[i];
      const track = createTrack(trackConfig, this.#v4Project.templates);
      motion.mount(track, i * stagger);
    }

    motion.init();

    this.#instances.set(motion.id, motion);
    return motion;
  }

  mountInstance(motionId, config = {}) {
    if (!this.#v4Project) {
      throw new Error('mountInstance: project not loaded.');
    }

    const motionConfig = this.#v4Project.getMotionConfig(motionId);
    if (motionConfig) {
      const triggerType = motionConfig.trigger?.type;
      const factory = triggerDelegateRegistry.get(triggerType);
      if (!factory) {
        throw new Error(
          `Unknown trigger type "${triggerType}" on motion "${motionId}".`
        );
      }
      const delegate = factory(motionConfig.trigger);
      return this.#mountMotionWithDelegate(motionConfig, delegate);
    }

    const trackConfig = this.#v4Project.getTrackConfig(motionId);
    if (trackConfig) {
      const track = createTrack(trackConfig, this.#v4Project.templates);
      this.#instances.set(track.id, track);
      return track;
    }

    throw new Error(`mountInstance: motion or track "${motionId}" not found in project.`);
  }

  mountWithDelegate(motionId, delegate) {
    if (!this.#v4Project) throw new Error('mountWithDelegate: project not loaded.');
    const motionConfig = this.#v4Project.getMotionConfig(motionId);
    if (!motionConfig) throw new Error(`mountWithDelegate: motion "${motionId}" not found in project.`);
    return this.#mountMotionWithDelegate(motionConfig, delegate);
  }

  getTrack(trackId) {
    if (!this.#v4Project) return null;
    const mountedTrack = this.#instances.get(trackId);
    return mountedTrack ?? null;
  }

  getTrackConfig(trackId) {
    return this.#v4Project?.getTrackConfig(trackId) ?? null;
  }

  get templates() {
    return this.#v4Project?.templates ?? [];
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
