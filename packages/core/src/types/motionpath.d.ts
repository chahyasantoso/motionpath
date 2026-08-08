export type Scalar = number | string;
export interface Stop { p: number; v: Scalar; ease?: string; }
export interface AnimatedProperty { stops: Stop[]; }
export interface PathNode { x: number; y: number; z?: number; ctrlX?: number; ctrlY?: number; ctrlZ?: number; }
export type PathAnchor = "center" | "none" | { xPercent: number; yPercent: number };
export interface PathProperty { points: PathNode[]; stops: Stop[]; autoRotate?: boolean; anchor?: PathAnchor; }
export type Keyframes = Record<string, AnimatedProperty | PathProperty>;
export type TrackMode = "standalone" | "authored-graph";
export interface ScrollTrigger { type: "scroll"; scrub: boolean | number; trigger?: string | Element; start?: string; end?: string; endTrigger?: string | Element; pin?: boolean | string | Element; pinSpacing?: boolean; toggleActions?: string; }
export interface TimeTrigger { type: "time"; repeat?: number; yoyo?: boolean; repeatDelay?: number; delay?: number; autoplay?: boolean; }
export interface ManualTrigger { type: "manual"; autoplay?: boolean; }
export type Trigger = ScrollTrigger | TimeTrigger | ManualTrigger;
export interface MotionTemplate { templateId: string; duration?: number; transformOrigin?: string; keyframes?: Keyframes; }
export interface TrackObservation { source: string; role?: "input" | "output"; target?: string; }
export interface MotionTrack { id: string; mode?: TrackMode; use?: string; duration?: number; transformOrigin?: string; observes?: TrackObservation[]; keyframes?: Keyframes; }
export interface StaggerTransition { duration?: number; ease?: string; }
export interface MotionDefinition { id: string; trigger: Trigger; stagger?: number; staggerTransition?: StaggerTransition; tracks: MotionTrack[]; }
export interface PluginOutput { merge?: "replace" | "shallow" | "append"; serialize?: (value: unknown) => unknown; }
export interface AnimationPlugin { keys: string[]; inputs?: string[]; lazy?: boolean; claimsWildcard?: boolean; stage?: string; priority?: number; outputs?: Record<string, PluginOutput>; claimsKey(key: string): boolean; load?(): Promise<void>; prepare?(track: MotionTrack): void | Promise<void>; contribute(propKey: string, stops: Stop[], track: MotionTrack): { percentPatch?: Record<string, Record<string, unknown>>; tweenVars?: Record<string, unknown>; }; compose(rawData: Record<string, unknown>, track: MotionTrack): Record<string, unknown>; }
export interface PluginRegistry { readonly plugins: AnimationPlugin[]; readonly internalKeys: ReadonlySet<string>; readonly inputs: ReadonlyMap<string, AnimationPlugin>; register(plugin: AnimationPlugin): AnimationPlugin; unregister(pluginOrKey: AnimationPlugin | string): boolean; resolve(key: string): AnimationPlugin | undefined; resolveInput(key: string): AnimationPlugin | undefined; ensureLoaded(plugin: AnimationPlugin): Promise<void>; }
export interface TriggerDelegateFactory { (config: Trigger): unknown; }
export interface TriggerDelegateRegistry { get(type: Trigger["type"] | string): TriggerDelegateFactory | undefined; has(type: string): boolean; set(type: string, factory: TriggerDelegateFactory): unknown; delete(type: string): boolean; entries(): IterableIterator<[string, TriggerDelegateFactory]>; }
export interface EventBus { clear(): void; }
export interface RuntimeDependencies { eventBus: EventBus; plugins: PluginRegistry; triggerDelegates: TriggerDelegateRegistry; }
export interface EngineOptions extends Partial<RuntimeDependencies> { dependencies?: RuntimeDependencies; publisherRendering?: boolean; clock?: { subscribe(listener: (event: { tick?: number; delta?: number }) => void): () => void; dispose?(): void; }; }
export declare class Engine { constructor(options?: EngineOptions); readonly validationReport: readonly { ruleId: string; severity: string; message: string; path?: string; }[]; readonly instanceCount: number; readonly templates: readonly MotionTemplate[]; publisherRendering: boolean; loadProject(project: MotionProject, options?: { validate?: boolean }): Promise<void>; mountInstance(id: string): Motion | Track; mountWithDelegate(id: string, delegate: unknown): Motion; createTrackInstance(id: string, overrides?: Partial<MotionTrack>): Track; createMotionHost(options: { id: string; staggerTransition?: StaggerTransition; autoplay?: boolean }): { motion: Motion; track: Track }; adopt<T extends Motion | Track>(object: T): T; unmount(object: Motion | Track): boolean; isOwned(object: Motion | Track): boolean; getTrack(id: string): Track | null; getTrackConfig(id: string): MotionTrack | null; destroy(): void; }
export declare function registerPlugin(plugin: AnimationPlugin): AnimationPlugin;
export declare function unregisterPlugin(pluginOrKey: AnimationPlugin | string): boolean;
export declare function resolvePluginForKey(key: string): AnimationPlugin | undefined;
export declare function resolvePluginInput(key: string): AnimationPlugin | undefined;
