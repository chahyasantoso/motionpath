import { resolvePluginForKey, ensureLoaded } from "../../domain/plugins.js";
import { triggerDelegateRegistry } from "../TriggerDelegate.js";
import { normalizeProject } from "./normalizeProject.js";
export async function parseV4Project(schema = {}, deps = {}) {
  const runtime = deps.plugins ? deps : deps.dependencies || {};
  const resolvePlugin = runtime.plugins?.resolve?.bind(runtime.plugins) || deps.resolvePluginForKey || resolvePluginForKey;
  const loadPlugin = runtime.plugins?.ensureLoaded?.bind(runtime.plugins) || deps.ensureLoaded || ensureLoaded;
  const delegates = runtime.triggerDelegates || deps.triggerDelegateRegistry || triggerDelegateRegistry;
  const project = normalizeProject(schema); const templates = project.templates; const motionConfigsMap = new Map(); const trackConfigsMap = new Map(); const pluginsToLoad = new Set(); const preparations = [];
  const collect = (resolved) => { for (const key of Object.keys(resolved.keyframes || {})) { const plugin = resolvePlugin(key); if (!plugin) throw new Error(`No plugin found for key "${key}" on track "${resolved.id}".`); pluginsToLoad.add(plugin); if (plugin.prepare) preparations.push(Promise.resolve(plugin.prepare(resolved))); } };
  for (const motion of project.motions) { const type = motion.trigger?.type; if (!type) throw new Error(`Motion "${motion.id}" is missing trigger.type.`); if (!delegates.get(type)) throw new Error(`Unknown trigger type "${type}" on motion "${motion.id}".`); motionConfigsMap.set(motion.id, motion); for (const track of motion.tracks || []) { collect(track); trackConfigsMap.set(track.id, track); } }
  for (const track of project.tracks) { collect(track); trackConfigsMap.set(track.id, track); }
  for (const plugin of pluginsToLoad) await loadPlugin(plugin); await Promise.all(preparations);
  return { ...project, templates, motionConfigs: motionConfigsMap, trackConfigs: trackConfigsMap, getMotionConfig: (id) => motionConfigsMap.get(id), getTrackConfig: (id) => trackConfigsMap.get(id), getMotion: (id) => motionConfigsMap.get(id), getTrack: (id) => trackConfigsMap.get(id) };
}
