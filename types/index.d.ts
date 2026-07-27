export type StopValue = number | string;

export interface Stop {
  p: number;
  v: StopValue;
  ease?: string;
}

export interface AnimatedProperty {
  stops: Stop[];
}

export interface PathNode {
  x: number;
  y: number;
  z?: number;
  ctrlX?: number;
  ctrlY?: number;
  ctrlZ?: number;
}

export type PathAnchor = 'center' | 'none' | { xPercent: number; yPercent: number };

export interface PathProperty {
  points: PathNode[];
  stops: Stop[];
  autoRotate?: boolean;
  anchor?: PathAnchor;
}

export type Keyframes = Record<string, AnimatedProperty | PathProperty>;

export interface ScrollTrigger {
  type: 'scroll';
  scrub: boolean | number;
  trigger?: string | Element;
  start?: string;
  end?: string;
  endTrigger?: string | Element;
  pin?: boolean | string | Element;
  pinSpacing?: boolean;
  toggleActions?: string;
}

export interface TimeTrigger {
  type: 'time';
  repeat?: number;
  yoyo?: boolean;
  repeatDelay?: number;
  delay?: number;
  autoplay?: boolean;
}

export interface ManualTrigger {
  type: 'manual';
}

export type Trigger = ScrollTrigger | TimeTrigger | ManualTrigger;

export interface MotionTemplate {
  templateId: string;
  duration?: number;
  transformOrigin?: string;
  keyframes?: Keyframes;
}

export interface MotionTrack {
  id: string;
  use?: string;
  duration?: number;
  transformOrigin?: string;
  keyframes?: Keyframes;
}

export interface StaggerTransition {
  duration?: number;
  ease?: string;
}

export interface MotionDefinition {
  id: string;
  trigger: Trigger;
  stagger?: number;
  staggerTransition?: StaggerTransition;
  tracks: MotionTrack[];
}

export interface MotionProject {
  schemaVersion: 4;
  projectId?: string;
  perspective?: number;
  templates?: MotionTemplate[];
  motions: MotionDefinition[];
  tracks?: MotionTrack[];
}

export interface PluginOutput {
  merge?: 'replace' | 'shallow' | 'append';
  serialize?: (value: unknown) => unknown;
}

export interface AnimationPlugin {
  keys: string[];
  lazy?: boolean;
  claimsWildcard?: boolean;
  claimsKey: (key: string) => boolean;
  load?: () => Promise<void>;
  prepare?: (track: MotionTrack) => void | Promise<void>;
  contribute: (propKey: string, stops: Stop[], track: MotionTrack) => {
    percentPatch?: Record<string, Record<string, unknown>>;
    tweenVars?: Record<string, unknown>;
  };
  compose: (rawData: Record<string, unknown>, track: MotionTrack) => Record<string, unknown>;
  stage?: string;
  priority?: number;
  outputs?: Record<string, PluginOutput>;
  internalKeys?: string[];
}

export interface PluginRegistry {
  readonly plugins: readonly AnimationPlugin[];
  readonly internalKeys: ReadonlySet<string>;
  register(plugin: AnimationPlugin): AnimationPlugin;
  unregister(pluginOrKey: AnimationPlugin | string): boolean;
  resolve(key: string): AnimationPlugin | undefined;
  ensureLoaded(plugin: AnimationPlugin): Promise<void>;
}
