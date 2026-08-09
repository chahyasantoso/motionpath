import { parseV4Project, FREE_TRACK_NAMESPACE } from '../lib/schema/parseV4Project.js';
import { triggerDelegateRegistry, TimeTriggerDelegate } from '../lib/TriggerDelegate.js';
import { Motion } from '../lib/Motion.js';
import { createTrack } from '../lib/createTrack.js';
import { createRuntimeDependencies } from '../lib/runtimeDependencies.js';
import { gsapTickerClock } from '../adapters/gsap/gsapTickerClock.js';
import { createTickClock } from '../ports/Clock.js';
import { validateProject, hasFatalErrors } from '../validators/index.js';
import { MotionPathValidationError } from '../errors/MotionPathValidationError.js';
import { normalizeObservationGraph } from '../usecases/normalizeObservationGraph.js';
import { GraphBinding } from '../usecases/GraphBinding.js';
import { GraphPublisher } from '../usecases/GraphPublisher.js';
import { GraphRuntime } from '../runtime/GraphRuntime.js';
import { ProjectRuntime } from '../runtime/ProjectRuntime.js';

const OBSERVATION_OWNERSHIP_MODES = ['compatibility', 'scoped'];

/**
 * Resolves the standalone observation ownership mode for one Engine.
 *
 * Ownership is resolved ONCE, at construction, and then remembered. `destroy()`
 * rebuilds the ProjectRuntime, and rebuilding it with constructor defaults moved
 * a scoped engine silently back to compatibility ownership, which made the owner
 * depend on whether anyone had called destroy() yet.
 *
 * An injected ProjectRuntime is authoritative: it already owns its adapter, so
 * its mode wins and a contradicting option is an error rather than a value that
 * gets dropped on the floor. A foreign or fake runtime without the getter is
 * tolerated, so test doubles do not have to grow one.
 */
function resolveObservationOwnership({ projectRuntime, observationOwnership }) {
  const injected = projectRuntime?.observationOwnership;
  if (injected !== undefined) {
    if (observationOwnership !== undefined && observationOwnership !== injected) {
      throw new TypeError(`Engine observationOwnership '${observationOwnership}' conflicts with the injected ProjectRuntime ownership '${injected}'.`);
    }
    return injected;
  }
  const requested = observationOwnership ?? 'compatibility';
  if (!OBSERVATION_OWNERSHIP_MODES.includes(requested)) {
    throw new TypeError("Engine observationOwnership must be 'compatibility' or 'scoped'.");
  }
  return requested;
}

export class Engine {
  #v4Project = null; #projectRuntime; #instances = new Map(); #handles = new WeakMap(); #instanceCounter = 0; #lastValidation = []; #dependencies; #publisherRendering = false; #clock = null; #ownsClock = false; #observationOwnership;
  constructor(options = {}) {
    this.#dependencies = options.dependencies || createRuntimeDependencies(options);
    this.#observationOwnership = resolveObservationOwnership(options);
    this.#projectRuntime = options.projectRuntime
      || new ProjectRuntime({ observationOwnership: this.#observationOwnership });
    this.#publisherRendering = options.publisherRendering === true;
    if (options.clock) { this.#clock = options.clock; this.#ownsClock = false; }
  }
  /**
   * The standalone observation owner every standalone Track from this Engine
   * shares. Opt-in for migration verification; `compatibility` is the default
   * and no caller changes behaviour without passing the option.
   */
  get observationOwnership() { return this.#observationOwnership; }
  get publisherRendering() { return this.#publisherRendering; }
  set publisherRendering(value) { this.#publisherRendering = value === true; }
  get clock() { return this.#clock; }
  async loadProject(schema, options = {}) { const errors = options.validate === false ? [] : validateProject(schema); this.#lastValidation = errors; if (hasFatalErrors(errors)) throw new MotionPathValidationError(errors, { projectId: schema?.projectId }); const candidate = await parseV4Project(schema, this.#dependencies); const staged = this.#projectRuntime.beginCandidate(candidate); try { for (const [id, config] of candidate.qualifiedTrackConfigs ?? []) this.#projectRuntime.registerCandidate(staged, id, config, { kind: 'track-config' }); this.#projectRuntime.commitCandidate(staged); } catch (error) { this.#projectRuntime.abortCandidate(staged); throw error; } const previousInstances = this.#instances; this.#instances = new Map(); this.#handles = new WeakMap(); this.#v4Project = candidate; for (const object of previousInstances.values()) object?.destroy?.(); this.#dependencies.eventBus.clear(); }
  get validationReport() { return this.#lastValidation; } get instanceCount() { return this.#instances.size; } get projectRuntime() { return this.#projectRuntime; }
  #register(object, kind) { const handle = `${kind}#${++this.#instanceCounter}`; this.#instances.set(handle, object); this.#handles.set(object, handle); this.#projectRuntime.registerInstance(handle, object, { kind }); return handle; }
  // Every standalone Track built here shares the ProjectRuntime's adapter. That
  // is finding F-02: a per-Track adapter made the reported observer set depend
  // on destroy-subscriber iteration order. Authored-graph tracks pass an
  // explicit null, because GraphBinding owns their edges instead.
  #trackOptions(extra = {}) { return { dependencies: this.#dependencies, observationAdapter: this.#projectRuntime.standaloneObservationAdapter, ...extra }; }
  #resolveClock() { if (!this.#clock || this.#clock.isDisposed) { this.#clock = createTickClock(gsapTickerClock); this.#ownsClock = true; } return this.#clock; }
  #mountMotion(config, delegate) { const graph = normalizeObservationGraph(config); const motion = new Motion({ id: `motion-${this.#instanceCounter + 1}`, triggerDelegate: delegate, staggerTransition: config.staggerTransition, graphOrder: graph.order }); motion.motionId = config.id; const tracks = []; let binding; let publisher; let runtime; try { const stagger = typeof config.stagger === 'number' ? config.stagger : 0; const entries = (config.tracks || []).map((trackConfig, index) => { const track = createTrack(trackConfig, this.#v4Project.templates, this.#trackOptions({ mode: 'authored-graph', observationAdapter: null })); tracks.push(track); motion.mount(track, index * stagger); return { track, config: trackConfig }; }); const trackMap = new Map(entries.map(({ track }) => [track.id, track])); const initialEdges = entries.flatMap(({ track, config: trackConfig }) => (trackConfig.observes || []).map((edge) => ({ source: edge.source, target: track.id, role: edge.role ?? 'output', input: edge.role === 'input' ? edge.target : undefined, mapFn: edge.role === 'input' ? (patch) => ({ [edge.target]: patch || {} }) : (patch) => patch }))); if (this.#publisherRendering) { runtime = new GraphRuntime({ graph, tracks: trackMap, initialEdges }); motion.setGraphRuntime(runtime); } else { publisher = new GraphPublisher({ graph, tracks: trackMap, publish: () => {} }); binding = new GraphBinding({ graph, tracks: trackMap, publisher, initialEdges }); motion.setGraphBinding(binding); } motion.init(); this.#register(motion, 'motion'); runtime?.start(this.#resolveClock()); return motion; } catch (error) { runtime?.dispose(); binding?.destroy(); publisher?.destroy?.(); motion.destroy(); for (const track of tracks) track.destroy?.(); throw error; } }
  mountInstance(id) { if (!this.#v4Project) throw new Error('mountInstance: project not loaded.'); const config = this.#v4Project.getMotionConfig(id); if (config) { const factory = this.#dependencies.triggerDelegates.get(config.trigger?.type); if (!factory) throw new Error(`Unknown trigger type '${config.trigger?.type}' on motion '${id}'.`); return this.#mountMotion(config, factory(config.trigger)); } const qualified = this.#projectRuntime.getProjectLookup(id) ?? this.#v4Project.getQualifiedTrackConfig?.(id); if (qualified) { const runtime = createTrack(qualified, this.#v4Project.templates, this.#trackOptions()); const namespace = id.split('/')[0]; if (namespace !== FREE_TRACK_NAMESPACE) runtime.motionId = namespace; runtime.trackId = qualified.id; runtime.qualifiedId = id; this.#register(runtime, namespace === FREE_TRACK_NAMESPACE ? 'free-track' : 'qualified-track'); return runtime; } const track = this.#v4Project.getTrackConfig(id); if (track) { const runtime = createTrack(track, this.#v4Project.templates, this.#trackOptions()); this.#register(runtime, 'track'); return runtime; } throw new Error(`mountInstance: motion or track '${id}' not found in project.`); }
  mountWithDelegate(id, delegate) { if (!this.#v4Project) throw new Error('mountWithDelegate: project not loaded.'); const config = this.#v4Project.getMotionConfig(id); if (!config) throw new Error(`mountWithDelegate: motion '${id}' not found in project.`); return this.#mountMotion(config, delegate); }
  createTrackInstance(id, overrides = {}) { if (!this.#v4Project) throw new Error('createTrackInstance: project not loaded.'); const config = this.#v4Project.getTrackConfig(id); if (!config) throw new Error(`createTrackInstance: track '${id}' not found in project.`); return this.adopt(createTrack({ ...config, ...overrides }, this.#v4Project.templates, this.#trackOptions())); }
  createMotionHost({ id, staggerTransition = {}, autoplay = true } = {}) { if (!this.#v4Project) throw new Error('createMotionHost: project not loaded.'); if (typeof id !== 'string' || id.length === 0) throw new TypeError('createMotionHost: id must be a non-empty string.'); const motion = new Motion({ id: `host-${id}`, triggerDelegate: new TimeTriggerDelegate({ autoplay }), staggerTransition }); const track = createTrack({ id, duration: 1, keyframes: {} }, this.#v4Project.templates, this.#trackOptions()); motion.mount(track, 0); motion.init(); this.#register(motion, 'motion-host'); return { motion, track }; }
  adopt(object) { if (!object || this.#handles.has(object)) return object; this.#register(object, 'adopted'); return object; }
  unmount(object) { if (!object) return false; const handle = this.#handles.get(object); if (handle === undefined) return false; this.#handles.delete(object); this.#instances.delete(handle); this.#projectRuntime.unregisterInstance(handle, { destroy: true }); return true; }
  isOwned(object) { return Boolean(object) && this.#handles.has(object); }
  getTrack(id) { if (!this.#v4Project) return null; for (const object of this.#instances.values()) if (object && typeof object.progress === 'function' && object.id === id) return object; return null; }
  getTrackConfig(id) { try { return this.#projectRuntime.getProjectLookup(id) ?? this.#v4Project?.getTrackConfig(id) ?? null; } catch (error) { if (/^Ambiguous track id/.test(error?.message ?? '')) return null; throw error; } }
  get templates() { return this.#v4Project?.templates ?? []; } get eventBus() { return this.#dependencies.eventBus; }
  // The replacement runtime keeps this Engine's ownership mode. Rebuilding it
  // with constructor defaults made a scoped engine quietly compatibility again.
  destroy() { if (this.#projectRuntime && !this.#projectRuntime.isDisposed) this.#projectRuntime.dispose(); this.#projectRuntime = new ProjectRuntime({ observationOwnership: this.#observationOwnership }); this.#instances.clear(); this.#handles = new WeakMap(); this.#v4Project = null; this.#dependencies.eventBus.clear(); if (this.#ownsClock) { this.#clock?.dispose?.(); this.#clock = null; this.#ownsClock = false; } }
}
export const engine = new Engine({ triggerDelegates: triggerDelegateRegistry });
