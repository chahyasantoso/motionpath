export type TriggerType = "scroll" | "time" | "manual";
export type ObservationRole = "input" | "output";

export interface RuntimeEventBus {
  clear(): void;
  emit?(event: string, payload?: unknown): void;
}

export interface RuntimePluginRegistry {
  readonly plugins: readonly RuntimePlugin[];
  readonly internalKeys: ReadonlySet<string>;
  readonly inputs: ReadonlyMap<string, RuntimePlugin>;
  resolve(key: string): RuntimePlugin | undefined;
  resolveInput(key: string): RuntimePlugin | undefined;
  ensureLoaded(plugin: RuntimePlugin): Promise<void>;
}

export interface RuntimePlugin {
  readonly keys: readonly string[];
  readonly inputs?: readonly string[];
  readonly lazy?: boolean;
  readonly claimsWildcard?: boolean;
  readonly stage?: string;
  readonly priority?: number;
  claimsKey(key: string): boolean;
  contribute(
    propKey: string,
    stops: readonly unknown[],
    track: unknown,
  ): {
    percentPatch?: Record<string, Record<string, unknown>>;
    tweenVars?: Record<string, unknown>;
  };
  compose(
    rawData: Record<string, unknown>,
    track: unknown,
  ): Record<string, unknown>;
  load?(): Promise<void>;
  prepare?(track: unknown): void | Promise<void>;
}

export interface RuntimeTriggerDelegate {
  build(): unknown;
  play(): void;
  pause(): void;
  seek(progress: number): void;
  reverse(): void;
  onComplete(callback: () => void): void;
  destroy(): void;
}

export interface RuntimeTriggerRegistry {
  get(
    type: TriggerType | string,
  ): ((config: unknown) => RuntimeTriggerDelegate) | undefined;
}

export interface RuntimeDependencies {
  readonly eventBus: RuntimeEventBus;
  readonly plugins: RuntimePluginRegistry;
  readonly triggerDelegates: RuntimeTriggerRegistry;
}
