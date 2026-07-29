import { gsap } from "gsap";
import { parseV4Project } from "../lib/schema/parseV4Project.js";
import {
  triggerDelegateRegistry,
  createTriggerDelegateRegistry,
} from "../lib/TriggerDelegate.js";
import { TrackGroup } from "../lib/Motion.js";
import { createPluginRegistry } from "../domain/plugins.js";
import { createTrack } from "../lib/createTrack.js";
import { Motion } from "../lib/Motion.js";
import { EventBus } from "../lib/eventBus.js";
import { validateProject, hasFatalErrors } from "../validators/index.js";
import { MotionPathValidationError } from "../errors/MotionPathValidationError.js";
export class Engine {
  #v4Project = null;
  #instances = new Map();
  #handles = new WeakMap();
  #instanceCounter = 0;
  #lastValidation = [];
  #eventBus;
  #plugins;
  #triggers;
  constructor({
    eventBus = new EventBus(),
    plugins = createPluginRegistry(),
    triggerDelegates = createTriggerDelegateRegistry(),
  } = {}) {
    this.#eventBus = eventBus;
    this.#plugins = plugins;
    this.#triggers = triggerDelegates;
  }
  async loadProject(schema, options = {}) {
    const errors = options.validate === false ? [] : validateProject(schema);
    this.#lastValidation = errors;
    if (hasFatalErrors(errors))
      throw new MotionPathValidationError(errors, {
        projectId: schema?.projectId,
      });
    this.destroy();
    this.#v4Project = await parseV4Project(schema, {
      resolvePluginForKey: (key) => this.#plugins.resolve(key),
      ensureLoaded: (plugin) => this.#plugins.ensureLoaded(plugin),
      triggerDelegateRegistry: this.#triggers,
    });
  }
  get validationReport() {
    return this.#lastValidation;
  }
  get instanceCount() {
    return this.#instances.size;
  }
  #register(object, kind) {
    const handle = `${kind}#${++this.#instanceCounter}`;
    this.#instances.set(handle, object);
    this.#handles.set(object, handle);
    return handle;
  }
  #trackOptions() {
    return {
      eventBus: this.#eventBus,
      resolvePluginForKey: (key) => this.#plugins.resolve(key),
    };
  }
  #mountMotion(config, delegate) {
    const motion = new Motion({
      id: `motion-${this.#instanceCounter + 1}`,
      triggerDelegate: delegate,
      staggerTransition: config.staggerTransition,
    });
    motion.motionId = config.id;
    const stagger = typeof config.stagger === "number" ? config.stagger : 0;
    (config.tracks || []).forEach((track, index) =>
      motion.mount(
        createTrack(track, this.#v4Project.templates, this.#trackOptions()),
        index * stagger,
      ),
    );
    motion.init();
    this.#register(motion, "motion");
    return motion;
  }
  mountInstance(id) {
    if (!this.#v4Project) throw new Error("mountInstance: project not loaded.");
    const config = this.#v4Project.getMotionConfig(id);
    if (config) {
      const factory = this.#triggers.get(config.trigger?.type);
      if (!factory)
        throw new Error(
          `Unknown trigger type "${config.trigger?.type}" on motion "${id}".`,
        );
      return this.#mountMotion(config, factory(config.trigger));
    }
    const track = this.#v4Project.getTrackConfig(id);
    if (track) {
      const runtime = createTrack(track, this.#v4Project.templates, this.#trackOptions());
      this.#register(runtime, "track");
      return runtime;
    }
    throw new Error(
      `mountInstance: motion or track "${id}" not found in project.`,
    );
  }
  mountWithDelegate(id, delegate) {
    if (!this.#v4Project)
      throw new Error("mountWithDelegate: project not loaded.");
    const config = this.#v4Project.getMotionConfig(id);
    if (!config)
      throw new Error(
        `mountWithDelegate: motion "${id}" not found in project.",
      );
    return this.#mountMotion(config, delegate);
  }
  createTrackInstance(id, overrides = {}) {
    if (!this.#v4Project)
      throw new Error("createTrackInstance: project not loaded.");
    const config = this.#v4Project.getTrackConfig(id);
    if (!config)
      throw new Error(
        `createTrackInstance: track "${id}" not found in project.",
      );
    return this.adopt(
      createTrack({ ...config, ...overrides }, this.#v4Project.templates, this.#trackOptions()),
    );
  }
  createGroupHost({ id, staggerTransition = {}, autoplay = true } = {}) {
    if (!this.#v4Project)
      throw new Error("createGroupHost: project not loaded.");
    if (typeof id !== "string" || id.length === 0)
      throw new TypeError("createGroupHost: id must be a non-empty string.");
    const timeline = gsap.timeline({ paused: !autoplay });
    const group = new TrackGroup(timeline, staggerTransition);
    const hostTrack = createTrack(
      { id, duration: 1, keyframes: {} },
      this.#v4Project.templates,
      this.#trackOptions(),
    );
    group.mount(hostTrack, 0);
    hostTrack._attachGroupHost({ group, timeline });
    this.#register(hostTrack, "group-host");
    return hostTrack;
  }
  adopt(object) {
    if (!object || this.#handles.has(object)) return object;
    this.#register(object, "adopted");
    return object;
  }
  unmount(object) {
    if (!object) return false;
    const handle = this.#handles.get(object);
    if (handle !== undefined) {
      this.#handles.delete(object);
      this.#instances.delete(handle);
    }
    object.destroy?.();
    return handle !== undefined;
  }
  isOwned(object) {
    return Boolean(object) && this.#handles.has(object);
  }
  getTrack(id) {
    if (!this.#v4Project) return null;
    for (const object of this.#instances.values())
      if (object && typeof object.progress === "function" && object.id === id)
        return object;
    return null;
  }
  getTrackConfig(id) {
    return this.#v4Project?.getTrackConfig(id) ?? null;
  }
  get templates() {
    return this.#v4Project?.templates ?? [];
  }
  get eventBus() {
    return this.#eventBus;
  }
  destroy() {
    for (const object of this.#instances.values()) object?.destroy?.();
    this.#instances.clear();
    this.#handles = new WeakMap();
    this.#v4Project = null;
    this.#eventBus.clear();
  }
}
export const engine = new Engine({ triggerDelegates: triggerDelegateRegistry });
