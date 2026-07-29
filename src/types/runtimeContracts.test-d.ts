import type {
  RuntimeDependencies,
  RuntimePlugin,
  RuntimeTriggerDelegate,
  ObservationRole,
  TriggerType,
} from "./runtimeContracts.js";

const trigger: TriggerType = "manual";
const role: ObservationRole = "input";
void trigger;
void role;

declare const plugin: RuntimePlugin;
plugin.claimsKey("opacity");
plugin.contribute("opacity", [], {});
plugin.compose({}, {});

const delegate: RuntimeTriggerDelegate = {
  build: () => ({}),
  play: () => undefined,
  pause: () => undefined,
  seek: () => undefined,
  reverse: () => undefined,
  onComplete: () => undefined,
  destroy: () => undefined,
};

declare const dependencies: RuntimeDependencies;
dependencies.plugins.resolve("opacity");
dependencies.triggerDelegates.get("manual")?.({});
void plugin;
void delegate;
