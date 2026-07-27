import { parseV4Project } from '../lib/schema/parseV4Project.js';
import { triggerDelegateRegistry } from '../lib/TriggerDelegate.js';
import { createTrack } from '../lib/createTrack.js';
import { Motion } from '../lib/Motion.js';
import { EventBus } from '../lib/eventBus.js';
import { validateProject, hasFatalErrors } from '../validators/index.js';
import { MotionPathValidationError } from '../errors/MotionPathValidationError.js';

export class Engine {
  #v4Project = null; #instances = new Map(); #handles = new WeakMap(); #instanceCounter = 0; #lastValidation = []; #eventBus;
  constructor({ eventBus = new EventBus() } = {}) { this.#eventBus = eventBus; }
  async loadProject(schema, options = {}) { const { validate = true } = options; if (validate) { const errors = validateProject(schema); this.#lastValidation = errors; if (hasFatalErrors(errors)) throw new MotionPathValidationError(errors, { projectId: schema?.projectId }); } else this.#lastValidation = []; this.destroy(); this.#v4Project = await parseV4Project(schema); }
  get validationReport() { return this.#lastValidation; }
  get instanceCount() { return this.#instances.size; }
  #register(object, kind) { const handle = `${kind}#${++this.#instanceCounter}`; this.#instances.set(handle, object); this.#handles.set(object, handle); return handle; }
  #mountMotionWithDelegate(config, delegate) { const motion = new Motion({ id: `motion-${this.#instanceCounter + 1}`, triggerDelegate: delegate, staggerTransition: config.staggerTransition }); motion.motionId = config.id; const stagger = typeof config.stagger === 'number' ? config.stagger : 0; for (let i = 0; i < (config.tracks || []).length; i++) motion.mount(createTrack(config.tracks[i], this.#v4Project.templates, { eventBus: this.#eventBus }), i * stagger); motion.init(); this.#register(motion, 'motion'); return motion; }
  mountInstance(id) { if (!this.#v4Project) throw new Error('mountInstance: project not loaded.'); const motionConfig = this.#v4Project.getMotionConfig(id); if (motionConfig) { const factory = triggerDelegateRegistry.get(motionConfig.trigger?.type); if (!factory) throw new Error(`Unknown trigger type "${motionConfig.trigger?.type}" on motion "${id}".`); return this.#mountMotionWithDelegate(motionConfig, factory(motionConfig.trigger)); } const trackConfig = this.#v4Project.getTrackConfig(id); if (trackConfig) { const track = createTrack(trackConfig, this.#v4Project.templates, { eventBus: this.#eventBus }); this.#register(track, 'track'); return track; } throw new Error(`mountInstance: motion or track "${id}" not found in project.`); }
  mountWithDelegate(id, delegate) { if (!this.#v4Project) throw new Error('mountWithDelegate: project not loaded.'); const config = this.#v4Project.getMotionConfig(id); if (!config) throw new Error(`mountWithDelegate: motion "${id}" not found in project.`); return this.#mountMotionWithDelegate(config, delegate); }
  createTrackInstance(id, overrides = {}) { if (!this.#v4Project) throw new Error('createTrackInstance: project not loaded.'); const config = this.#v4Project.getTrackConfig(id); if (!config) throw new Error(`createTrackInstance: track "${id}" not found in project.`); return this.adopt(createTrack({ ...config, ...overrides }, this.#v4Project.templates, { eventBus: this.#eventBus })); }
  adopt(object) { if (!object || this.#handles.has(object)) return object; this.#register(object, 'adopted'); return object; }
  unmount(object) { if (!object) return false; const handle = this.#handles.get(object); if (handle !== undefined) { this.#handles.delete(object); this.#instances.delete(handle); } object.destroy?.(); return handle !== undefined; }
  isOwned(object) { return Boolean(object) && this.#handles.has(object); }
  getTrack(id) { if (!this.#v4Project) return null; for (const object of this.#instances.values()) if (object && typeof object.progress === 'function' && object.id === id) return object; return null; }
  getTrackConfig(id) { return this.#v4Project?.getTrackConfig(id) ?? null; }
  get templates() { return this.#v4Project?.templates ?? []; }
  get eventBus() { return this.#eventBus; }
  destroy() { for (const object of this.#instances.values()) object?.destroy?.(); this.#instances.clear(); this.#handles = new WeakMap(); this.#v4Project = null; this.#eventBus.clear(); }
}
export const engine = new Engine();
