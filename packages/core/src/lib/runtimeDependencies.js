import { createPluginRegistry } from "../domain/plugins.js";
import { EventBus } from "./eventBus.js";
import { createTriggerDelegateRegistry } from "./TriggerDelegate.js";

/**
 * Creates the dependency graph shared by project parsing and runtime mounting.
 * Defaults live here so internal code never silently switches registries.
 */
export function createRuntimeDependencies({
  eventBus = new EventBus(),
  plugins = createPluginRegistry(),
  triggerDelegates = createTriggerDelegateRegistry(),
  ...rest
} = {}) {
  if (!plugins || typeof plugins.resolve !== "function")
    throw new TypeError("Runtime dependencies require a plugin registry.");
  if (!triggerDelegates || typeof triggerDelegates.get !== "function")
    throw new TypeError("Runtime dependencies require a trigger registry.");
  if (!eventBus || typeof eventBus.clear !== "function")
    throw new TypeError("Runtime dependencies require an event bus.");

  return Object.freeze({
    eventBus,
    plugins,
    triggerDelegates,
    ...rest,
  });
}
