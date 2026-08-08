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
import { StandaloneObservationAdapter } from '../usecases/StandaloneObservationAdapter.js';
import { GraphBinding } from '../usecases/GraphBinding.js';
import { GraphPublisher } from '../usecases/GraphPublisher.js';
import { GraphRuntime } from '../runtime/GraphRuntime.js';
import { ProjectRuntime } from '../runtime/ProjectRuntime.js';

export class Engine {
  #v4Project = null; #projectRuntime; #instances = new Map(); #handles = new WeakMap(); #instanceCounter = 0; #lastValidation = []; #dependencies; #publisherRendering = false; #clock = null; #ownsClock = false;
  constructor(options = {}) { this.#dependencies = options.dependencies || createRuntimeDependencies(options); this.#projectRuntime = options.projectRuntime || new ProjectRuntime(); this.#publisherRendering = options.publisherRendering === true; if (options.clock) { this.#clock = options.clock; this.#ownsClock = false; } }
  /**
   * Publisher-backed rendering gate.
   *
   * Strict `=== true`, the same shape as the cross-motion capability gates:
   * undefined, absent, the string "true" and 1 all resolve to disabled. Off by
   * default, and it must stay that way until the PR-16 evidence is accepted,
   * because with it off the mount path is byte-for-byte the pre-PR-19b one.
   *
   * Reassignment only affects motions mounted afterwards. Flipping it does not
   * reach into a live Motion and swap its composition path underneath a
   * renderer that is mid-frame.
   */
  get publisherRendering() { return this.#publisherRendering; }
  set publisherRendering(value) { this.#publisherRendering = value === true; }
  get clock() { return this.#clock; }
  async loadProject(schema, options = {}) { const errors = options.validate === false ? [] : validateProject(schema); this.#lastValidation = errors; if (hasFatalErrors(errors)) throw new MotionPathValidationError(errors, { projectId: schema?.projectId }); const candidate = await parseV4Project(schema, this.#dependencies); const staged = this.#projectRuntime.beginCandidate(candidate); try { for (const [id, config] of candidate.qualifiedTrackConfigs ?? []) this.#projectRuntime.registerCandidate(staged, id, config, { kind: 'track-config' }); this.#projectRuntime.commitCandidate(staged); } catch (error) { this.#projectRuntime.abortCandidate(staged); throw error; } const previousInstances = this.#instances; this.#instances = new Map(); this.#handles = new WeakMap(); this.#v4Project = candidate; for (const object of previousInstances.values()) object?.destroy?.(); this.#dependencies.eventBus.clear(); }
  get validationReport() { return this.#lastValidation; } get instanceCount() { return this.#instances.size; } get projectRuntime() { return this.#projectRuntime; }
  #register(object, kind) { const handle = `${kind}#${++this.#instanceCounter}`; this.#instances.set(handle, object); this.#handles.set(object, handle); this.#projectRuntime.registerInstance(handle, object, { kind }); return handle; }
  #trackOptions(extra = {}) { return { dependencies: this.#dependencies, ...extra }; }
  // Lazy, and shared by every runtime this Engine mounts. createTickClock
  // multiplexes, so twenty motions still add exactly one GSAP ticker callback.
  #resolveClock() { if (!this.#clock || this.#clock.isDisposed) { this.#clock = createTickClock(gsapTickerClock); this.#ownsClock = true; } return this.#clock; }
  #wireObservations(entries) { const tracks = new Map(entries.map(({ track }) => [track.id, track])); for (const { track, config } of entries) for (const edge of config.observes || []) { const source = tracks.get(edge.source); if (!source) throw new Error(`Track '${track.id}' observes missing track '${edge.source}'.`); const role = edge.role ?? 'output'; const mapFn = role === 'input' ? (patch) => ({ [edge.target]: patch || {} }) : (patch) => patch; track.setObserved(source, mapFn, { role, target: role === 'input' ? edge.target : undefined }); } }
  /**
   * The publisher is constructed without a clock and started only after init()
   * and registration have both succeeded. That ordering is the "no partial
   * graph is flushable" rule expressed in code: a mount that dies at
   * delegate.build() is torn down before the runtime has ever been subscribed
   * to a tick, so there is no window in which a half-built motion can publish.
   */
  #mountMotion(config, delegate) { const graph = normalizeObservationGraph(config); const motion = new Motion({ id: `motion-${this.#instanceCounter + 1}`, triggerDelegate: delegate, staggerTransition: config.staggerTransition, graphOrder: graph.order }); motion.motionId = config.id; const tracks = []; const observationAdapter = new StandaloneObservationAdapter(); let binding; let publisher; let runtime; try { const stagger = typeof config.stagger === 'number' ? config.stagger : 0; const entries = (config.tracks || []).map((trackConfig, index) => { const track = createTrack(trackConfig, this.#v4Project.templates, this.#trackOptions({ observationAdapter })); tracks.push(track); motion.mount(track, index * stagger); return { track, config: trackConfig }; }); this.#wireObservations(entries); const trackMap = new Map(entries.map(({ track }) => [track.id, track])); if (this.#publisherRendering) { runtime = new GraphRuntime({ graph, tracks: trackMap }); motion.setGraphRuntime(runtime); } else { publisher = new GraphPublisher({ graph, tracks: trackMap, publish: () => {} }); binding = new GraphBinding({ graph, tracks: trackMap, publisher }); motion.setGraphBinding(binding); } motion.init(); this.#register(motion, 'motion'); runtime?.start(this.#resolveClock()); return motion; } catch (error) { runtime?.dispose(); binding?.destroy(); publisher?.destroy?.(); motion.destroy(); observationAdapter.destroy(); for (const track of tracks) track.destroy?.(); throw error; } }
  mountInstance(id) { if (!this.#v4Project) throw new Error('mountInstance: project not loaded.'); const config = this.#v4Project.getMotionConfig(id); if (config) { const factory = this.#dependencies.triggerDelegates.get(config.trigger?.type); if (!factory) throw new Error(`Unknown trigger type '${config.trigger?.type}' on motion '${id}'.`); return this.#mountMotion(config, factory(config.trigger)); } const qualified = this.#projectRuntime.getProjectLookup(id) ?? this.#v4Project.getQualifiedTrackConfig?.(id); if (qualified) { const runtime = createTrack(qualified, this.#v4Project.templates, this.#trackOptions()); const namespace = id.split('/')[0]; const isFree = namespace === FREE_TRACK_NAMESPACE; if (!isFree) runtime.motionId = namespace; runtime.trackId = qualified.id; runtime.qualifiedId = id; this.#register(runtime, isFree ? 'free-track' : 'qualified-track'); return runtime; } const track = this.#v4Project.getTrackConfig(id); if (track) { const runtime = createTrack(track, this.#v4Project.templates, this.#trackOptions()); this.#register(runtime, 'track'); return runtime; } throw new Error(`mountInstance: motion or track '${id}' not found in project.`); }
  mountWithDelegate(id, delegate) { if (!this.#v4Project) throw new Error('mountWithDelegate: project not loaded.'); const config = this.#v4Project.getMotionConfig(id); if (!config) throw new Error(`mountWithDelegate: motion '${id}' not found in project.`); return this.#mountMotion(config, delegate); }
  createTrackInstance(id, overrides = {}) { if (!this.#v4Project) throw new Error('createTrackInstance: project not loaded.'); const config = this.#v4Project.getTrackConfig(id); if (!config) throw new Error(`createTrackInstance: track '${id}' not found in project.'); return this.adopt(createTrack({ ...config, ...overrides }, this.#v4Project.templates, this.#trackOptions())); }
  createMotionHost({ id, staggerTransition = {}, autoplay = true } = {}) { if (!this.#v4Project) throw new Error('createMotionHost: project not loaded.'); if (typeof id !== 'string' || id.length === 0) throw new TypeError('createMotionHost: id must be a non-empty string.'); const motion = new Motion({ id: `host-${id}`, triggerDelegate: new TimeTriggerDelegate({ autoplay }), staggerTransition }); const track = createTrack({ id, duration: 1, keyframes: {} }, this.#v4Project.templates, this.#trackOptions()); motion.mount(track, 0); motion.init(); this.#register(motion, 'motion-host'); return { motion, track }; }
  adopt(object) { if (!object || this.#handles.has(object)) return object; this.#register(object, 'adopted'); return object; }
  unmount(object) { if (!object) return false; const handle = this.#handles.get(object); if (handle === undefined) return false; this.#handles.delete(object); this.#instances.delete(handle); this.#projectRuntime.unregisterInstance(handle, { destroy: true }); return true; }
  isOwned(object) { return Boolean(object) && this.#handles.has(object); }
  getTrack(id) { if (!this.#v4Project) return null; for (const object of this.#instances.values()) if (object && typeof object.progress === 'function' && object.id === id) return object; return null; }
  getTrackConfig(id) { try { return this.#projectRuntime.getProjectLookup(id) ?? this.#v4Project?.getTrackConfig(id) ?? null; } catch (error) { if (/^Ambiguous track id/.test(error?.message ?? '')) return null; throw error; } }
  get templates() { return this.#v4Project?.templates ?? []; } get eventBus() { return this.#dependencies.eventBus; }
  // Only dispose a clock this Engine created. An injected one belongs to the
  // caller and may be driving something else.
  destroy() { if (this.#projectRuntime && !this.#projectRuntime.isDisposed) this.#projectRuntime.dispose(); this.#projectRuntime = new ProjectRuntime(); this.#instances.clear(); this.#handles = new WeakMap(); this.#v4Project = null; this.#dependencies.eventBus.clear(); if (this.#ownsClock) { this.#clock?.dispose?.(); this.#clock = null; this.#ownsClock = false; } }
}
export const engine = new Engine({ triggerDelegates: triggerDelegateRegistry });
