import { parseV4Project } from '../lib/schema/parseV4Project.js';
import { triggerDelegateRegistry } from '../lib/TriggerDelegate.js';
import { createTrack } from '../lib/createTrack.js';
import { Motion } from '../lib/Motion.js';
import { validateProject, hasFatalErrors } from '../validators/index.js';
import { MotionPathValidationError } from '../errors/MotionPathValidationError.js';

const isDev = () => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
};

export class Engine {
  #v4Project = null;

  // Engine-owned identity. Keyed by an opaque handle, NOT by schema id, so a
  // Motion and a Track can never collide in the same key space (R-04).
  #instances = new Map();   // handle -> runtime object
  #handles = new WeakMap(); // runtime object -> handle
  #instanceCounter = 0;
  #lastValidation = [];

  /**
   * @param {object} schema - plain v4 project JSON
   * @param {{ validate?: boolean }} [options]
   *   validate: run validateProject() first and throw on any fatal error.
   *   Defaults to true. Pass false ONLY for trusted internal callers and tests
   *   that deliberately load a known-broken schema.
   * @throws {MotionPathValidationError}
   */
  async loadProject(schema, options = {}) {
    const { validate = true } = options;

    // Validate BEFORE tearing down the current project or building anything.
    // A rejected load must leave the engine exactly as it was. Fixes R-01.
    if (validate) {
      const errors = validateProject(schema);
      this.#lastValidation = errors;

      if (hasFatalErrors(errors)) {
        throw new MotionPathValidationError(errors, { projectId: schema?.projectId });
      }

      const warnings = errors.filter((e) => e && e.severity !== 'error');
      if (isDev() && warnings.length > 0) {
        console.warn(
          `[MotionPath] project loaded with ${warnings.length} validation warning(s):\n` +
            warnings.map((w) => `  [${w.ruleId}] ${w.path ?? '$'}: ${w.message}`).join('\n')
        );
      }
    } else {
      this.#lastValidation = [];
    }

    this.destroy();
    this.#v4Project = await parseV4Project(schema);
  }

  /** Every ValidationError from the most recent validated load (warnings included). */
  get validationReport() {
    return this.#lastValidation;
  }

  /** How many runtime objects the engine currently owns. Must not grow across mount/unmount cycles. */
  get instanceCount() {
    return this.#instances.size;
  }

  #register(runtimeObject, kind) {
    const handle = `${kind}#${++this.#instanceCounter}`;
    this.#instances.set(handle, runtimeObject);
    this.#handles.set(runtimeObject, handle);
    return handle;
  }

  #mountMotionWithDelegate(motionConfig, delegate) {
    const instanceId = `motion-${this.#instanceCounter + 1}`;
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

    this.#register(motion, 'motion');
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
      this.#register(track, 'track');
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

  /**
   * Stamp a NEW runtime Track from a schema track definition and take ownership
   * of it. This is the supported replacement for calling createTrack() directly
   * with engine.getTrackConfig() -- tracks made that way were invisible to the
   * engine and survived engine.destroy(). Fixes R-04 (second half).
   *
   * @param {string} trackId - id of a track declared under a motion or schema.tracks[]
   * @param {object} [overrides] - e.g. { id: `ball-${n}`, duration: 4 }
   * @returns {import('../lib/Track.js').Track}
   */
  createTrackInstance(trackId, overrides = {}) {
    if (!this.#v4Project) throw new Error('createTrackInstance: project not loaded.');
    const cfg = this.#v4Project.getTrackConfig(trackId);
    if (!cfg) throw new Error(`createTrackInstance: track "${trackId}" not found in project.`);
    const track = createTrack({ ...cfg, ...overrides }, this.#v4Project.templates);
    return this.adopt(track);
  }

  /**
   * Take ownership of a runtime object created elsewhere so engine.destroy()
   * can clean it up. Idempotent.
   */
  adopt(runtimeObject) {
    if (!runtimeObject) return runtimeObject;
    if (this.#handles.has(runtimeObject)) return runtimeObject;
    this.#register(runtimeObject, 'adopted');
    return runtimeObject;
  }

  /**
   * Destroy a runtime object AND drop it from the registry. This is the one
   * teardown call every hook and consumer should make -- calling
   * instance.destroy() directly leaves a corpse in #instances, which is what
   * made the map grow monotonically across route changes and made
   * engine.destroy() double-destroy afterwards. Fixes R-04.
   *
   * @returns {boolean} true when the engine actually owned the object
   */
  unmount(runtimeObject) {
    if (!runtimeObject) return false;

    const handle = this.#handles.get(runtimeObject);
    const owned = handle !== undefined;

    if (owned) {
      this.#handles.delete(runtimeObject);
      this.#instances.delete(handle);
    }

    try {
      runtimeObject.destroy?.();
    } catch (e) {
      if (isDev()) {
        console.warn('[MotionPath] error while destroying instance:', e);
      }
    }

    return owned;
  }

  isOwned(runtimeObject) {
    return Boolean(runtimeObject) && this.#handles.has(runtimeObject);
  }

  getTrack(trackId) {
    if (!this.#v4Project) return null;
    for (const inst of this.#instances.values()) {
      // Track exposes progress(); Motion does not. Cheap structural check that
      // keeps motions and tracks from colliding now that the key space is
      // engine-owned handles rather than schema ids.
      if (inst && typeof inst.progress === 'function' && inst.id === trackId) {
        return inst;
      }
    }
    return null;
  }

  getTrackConfig(trackId) {
    return this.#v4Project?.getTrackConfig(trackId) ?? null;
  }

  get templates() {
    return this.#v4Project?.templates ?? [];
  }

  destroy() {
    for (const inst of Array.from(this.#instances.values())) {
      try {
        inst?.destroy?.();
      } catch (e) {
        if (isDev()) {
          console.warn('[MotionPath] error during engine teardown:', e);
        }
      }
    }
    this.#instances.clear();
    this.#handles = new WeakMap();
    this.#v4Project = null;
  }
}

export const engine = new Engine();
