import { resolvePluginForKey, ensureLoaded } from "../../domain/plugins.js";
import { triggerDelegateRegistry } from "../TriggerDelegate.js";
import { normalizeProject } from "./normalizeProject.js";

/** Namespace that bare top-level tracks are registered under: `~/trackId`. */
export const FREE_TRACK_NAMESPACE = "~";

function qualify(namespace, trackId) {
  return `${namespace}/${trackId}`;
}

// Namespace guards only. These fire for ids that would corrupt the qualified-id
// space itself, and deliberately say nothing about ids that are merely malformed:
// missing, empty, or non-string ids are the validator's job (motion-structure R-01/R-02),
// and under { validate: false } they must keep their documented legacy behavior of
// registering under a junk key rather than throwing here.
function assertNamespaceSafeMotionId(id) {
  if (typeof id === "string" && id.includes("/"))
    throw new Error(
      `Motion id "${id}" must not contain "/": that separator is reserved for qualified ids.`,
    );
  if (id === FREE_TRACK_NAMESPACE)
    throw new Error(
      `Motion id "${FREE_TRACK_NAMESPACE}" is reserved for the free-track namespace.`,
    );
}
function assertNamespaceSafeTrackId(id) {
  if (typeof id === "string" && id.includes("/"))
    throw new Error(
      `Track id "${id}" must not contain "/": that separator is reserved for qualified ids.`,
    );
}

export async function parseV4Project(schema = {}, deps = {}) {
  const runtime = deps.plugins ? deps : deps.dependencies || {};
  const resolvePlugin =
    runtime.plugins?.resolve?.bind(runtime.plugins) ||
    deps.resolvePluginForKey ||
    resolvePluginForKey;
  const loadPlugin =
    runtime.plugins?.ensureLoaded?.bind(runtime.plugins) ||
    deps.ensureLoaded ||
    ensureLoaded;
  const delegates =
    runtime.triggerDelegates ||
    deps.triggerDelegateRegistry ||
    triggerDelegateRegistry;
  const project = normalizeProject(schema);
  const templates = project.templates;
  const motionConfigsMap = new Map();
  const trackConfigsMap = new Map();
  const qualifiedTrackConfigsMap = new Map();
  const bareTrackOwners = new Map();
  const pluginsToLoad = new Set();
  const preparations = [];
  const collect = (resolved) => {
    for (const key of Object.keys(resolved.keyframes || {})) {
      const plugin = resolvePlugin(key);
      if (!plugin)
        throw new Error(
          `No plugin found for key "${key}" on track "${resolved.id}".`,
        );
      pluginsToLoad.add(plugin);
      if (plugin.prepare)
        preparations.push(Promise.resolve(plugin.prepare(resolved)));
    }
  };
  // Register a track under its qualified id. Bare ids stay motion-local (PR-17), so the
  // flat bare index is first-wins and every claimant is recorded: an ambiguous bare
  // lookup throws later instead of silently resolving to whichever motion parsed first.
  const register = (namespace, track) => {
    const trackId = track?.id;
    assertNamespaceSafeTrackId(trackId);
    const qualifiedId = qualify(namespace, trackId);
    if (qualifiedTrackConfigsMap.has(qualifiedId))
      throw new Error(`Duplicate qualified track id "${qualifiedId}".`);
    qualifiedTrackConfigsMap.set(qualifiedId, track);
    const owners = bareTrackOwners.get(trackId);
    if (owners) owners.push(qualifiedId);
    else bareTrackOwners.set(trackId, [qualifiedId]);
    if (!trackConfigsMap.has(trackId)) trackConfigsMap.set(trackId, track);
  };
  for (const motion of project.motions) {
    const type = motion.trigger?.type;
    if (!type)
      throw new Error(`Motion "${motion.id}" is missing trigger.type.`);
    if (!delegates.get(type))
      throw new Error(
        `Unknown trigger type "${type}" on motion "${motion.id}".`,
      );
    assertNamespaceSafeMotionId(motion.id);
    motionConfigsMap.set(motion.id, motion);
    for (const track of motion.tracks || []) {
      collect(track);
      register(motion.id, track);
    }
  }
  for (const track of project.tracks) {
    collect(track);
    register(FREE_TRACK_NAMESPACE, track);
  }
  for (const plugin of pluginsToLoad) await loadPlugin(plugin);
  await Promise.all(preparations);
  const getTrackConfig = (id) => {
    const owners = bareTrackOwners.get(id);
    if (owners && owners.length > 1)
      throw new Error(
        `Ambiguous track id "${id}": it is declared as ${owners.join(", ")}. Address it with a qualified id.`,
      );
    return trackConfigsMap.get(id);
  };
  return {
    ...project,
    templates,
    motionConfigs: motionConfigsMap,
    trackConfigs: trackConfigsMap,
    qualifiedTrackConfigs: qualifiedTrackConfigsMap,
    bareTrackOwners,
    getMotionConfig: (id) => motionConfigsMap.get(id),
    getTrackConfig,
    getQualifiedTrackConfig: (id) => qualifiedTrackConfigsMap.get(id),
    getMotion: (id) => motionConfigsMap.get(id),
    getTrack: getTrackConfig,
  };
}
