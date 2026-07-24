import { parseV4Project } from '../lib/schema/parseV4Project.js';
import { TriggerRefRegistry } from '../lib/TriggerRefRegistry.js';
import { triggerDelegateRegistry } from '../lib/TriggerDelegate.js';
import { createTrack } from '../lib/createTrack.js';
import { Motion } from '../lib/Motion.js';

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

    const existing = this.#instances.get(motionId);
    if (existing) {
      existing.destroy?.();
      this.#instances.delete(motionId);
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
      const motion = new Motion({
        id: motionConfig.id,
        triggerDelegate: delegate,
        staggerTransition: motionConfig.staggerTransition,
      });

      const stagger = typeof motionConfig.stagger === 'number' ? motionConfig.stagger : 0;
      const motionTracks = motionConfig.tracks || [];
      for (let i = 0; i < motionTracks.length; i++) {
        const trackConfig = motionTracks[i];
        const track = createTrack(trackConfig, this.#v4Project.templates);
        motion.mount(track, i * stagger);
      }

      // Lazy instancing step 2: init() builds the GSAP timeline + ScrollTrigger
      // and flushes all queued #initialTracks into the live group.
      // Must be called AFTER mount() so tracks are in #initialTracks,
      // and AFTER useMotionTrigger() has registered DOM refs so resolveElement works.
      motion.init((id) => this.resolveElement(id));

      this.#instances.set(motion.id, motion);
      return motion;
    }

    const trackConfig = this.#v4Project.getTrackConfig(motionId);
    if (trackConfig) {
      const track = createTrack(trackConfig, this.#v4Project.templates);
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
    const mountedTrack = this.#instances.get(trackId);
    if (mountedTrack) return mountedTrack;

    const trackConfig = this.#v4Project.getTrackConfig(trackId);
    if (!trackConfig) return null;
    return createTrack(trackConfig, this.#v4Project.templates);
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
