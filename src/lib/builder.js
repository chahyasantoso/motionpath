import { gsap } from 'gsap';
import { resolvePluginForKey } from './plugins.js';

export function resolveDirection(stops, direction, naturalValue) {
  if (!stops || stops.length >= 2) {
    return stops || [];
  }
  if (stops.length === 1) {
    const stop = stops[0];
    if (Math.abs(stop.p - 0) < 0.001) {
      return [
        { ...stop },
        { p: 1, v: naturalValue }
      ];
    }
    if (Math.abs(stop.p - 1) < 0.001) {
      return [
        { p: 0, v: naturalValue },
        { ...stop }
      ];
    }
  }
  return stops;
}

// Module-level Map persists across buildProject calls — concurrent calls for
// the same plugin share the same in-flight Promise, preventing double-load.
const loadPromises = new Map();
export function ensureLoaded(plugin) {
  if (!plugin.lazy) return Promise.resolve();
  if (!loadPromises.has(plugin)) {
    loadPromises.set(plugin, typeof plugin.load === 'function' ? plugin.load() : Promise.resolve());
  }
  return loadPromises.get(plugin);
}

export async function buildProject(schema, deps) {
  const elementPlugins = new Map();
  const elementsMap = new Map();
  const scenarios = [];
  const timelineGroups = new Map();

  const scenariosArray = schema.scenarios || [];

  for (let i = 0; i < scenariosArray.length; i++) {
    const scenario = scenariosArray[i];
    const sceneId = scenario.sceneId;

    let triggerType = 'time';
    const trigger = scenario.trigger || {};
    if (trigger.type === 'scroll') {
      triggerType = trigger.scrub ? 'scroll-scrub' : 'scroll-observer';
    }

    const elements = scenario.elements || [];
    const elementTweens = [];

    for (const element of elements) {
      // Resolve DOM node once per element — used only for getNaturalValue().
      // The tween targets a proxy object, not the DOM node directly, so the
      // engine's onUpdate → compose() layer can apply filter/path properties
      // correctly via plugin.compose(proxy) → real CSS.
      const domNode = deps.resolveElement(element.id);
      if (!domNode) {
        throw new Error(`Failed to resolve DOM element for id "${element.id}"`);
      }

      const keyframes = element.keyframes || {};
      const propKeys = Object.keys(keyframes);

      const sharedKeyframes = {};
      const sharedTweenVars = {};
      const resolvedPlugins = [];

      // Plain proxy object: GSAP animates this, not the DOM node.
      // The engine's onUpdate → plugin.compose(proxy) translates proxy state
      // into real CSS. This is required so filterPlugin (__blur) and
      // pathPlugin (__pathProgress) work correctly — those keys are not
      // valid CSS properties and cannot be set directly on a DOM node.
      const proxy = {};

      for (const propKey of propKeys) {
        const plugin = resolvePluginForKey(propKey);
        if (!plugin) {
          throw new Error(`No plugin found for key "${propKey}" on element "${element.id}".`);
        }
        if (!resolvedPlugins.includes(plugin)) {
          resolvedPlugins.push(plugin);
        }

        await ensureLoaded(plugin);

        const propConfig = keyframes[propKey];
        const rawStops = propConfig?.stops || [];
        const naturalValue = plugin.getNaturalValue(propKey, domNode);
        const effectiveStops = resolveDirection(rawStops, element.direction, naturalValue);

        const hasZeroStop = effectiveStops.some(s => Math.abs(s.p - 0) < 0.001);
        const stopsForContribute = hasZeroStop
          ? effectiveStops
          : [{ p: 0, v: naturalValue }, ...effectiveStops];

        const contribution = plugin.contribute(propKey, stopsForContribute, element);
        const percentPatch = contribution?.percentPatch || {};
        const tweenVars = contribution?.tweenVars || {};

        // Seed the proxy from whatever contribute() produced at "0%" — same source
        // of truth as sharedKeyframes, no second contribute() call needed.
        const zeroFrame = percentPatch['0%'] ?? {};
        for (const [pKey, pVal] of Object.entries(zeroFrame)) {
          if (pKey !== 'ease' && !(pKey in proxy)) proxy[pKey] = pVal;
        }

        // Deep-merge percentPatch per spec §5.5 — real per-key merge, not a
        // shallow overwrite, so two properties contributing to the same percent
        // don't erase each other's keys.
        for (const percentKey of Object.keys(percentPatch)) {
          const existing = sharedKeyframes[percentKey];
          const incoming = percentPatch[percentKey];

          // Ease-collision check — defense-in-depth (§5.7): Brief 1 rejects
          // conflicting eases at the schema level, but we throw here too so a
          // bug in validation cannot silently corrupt animation data.
          if (
            existing?.ease !== undefined &&
            incoming?.ease !== undefined &&
            existing.ease !== incoming.ease
          ) {
            throw new Error(
              `Ease collision on element "${element.id}" at percent "${percentKey}" ` +
              `(contributed by property "${propKey}"): ` +
              `different eases found ("${existing.ease}" vs "${incoming.ease}").`
            );
          }

          sharedKeyframes[percentKey] = {
            ...(existing ?? {}),
            ...incoming,
          };
        }

        // tweenVars merge with collision detection (§5.6): same key, different
        // value = plugin authoring bug (not a schema error).
        for (const key of Object.keys(tweenVars)) {
          if (key in sharedTweenVars && sharedTweenVars[key] !== tweenVars[key]) {
            throw new Error(
              `tweenVars collision on element "${element.id}": key "${key}" ` +
              `contributed twice with different values (plugin authoring bug, not a schema error).`
            );
          }
          sharedTweenVars[key] = tweenVars[key];
        }
      }

      elementPlugins.set(element.id, resolvedPlugins);
      elementsMap.set(element.id, { proxy, domNode });

      // Duration fallback chain — authorized addendum to §5.8:
      // Without an explicit duration, GSAP defaults to 0.5s which silently
      // breaks all percent-keyframe animations. Chain:
      //   element.duration  → per-element override (highest priority)
      //   trigger.duration  → scenario-level (e.g. TriggerTime.duration)
      //   1                 → final fallback (safe default)
      const tweenDuration = element.duration ?? scenario.trigger?.duration ?? 1;

      const tween = gsap.to(proxy, {
        keyframes: sharedKeyframes,
        ...sharedTweenVars,
        duration: tweenDuration,
        paused: true
      });
      elementTweens.push(tween);
    }

    const scenarioTimeline = gsap.timeline({ paused: true });

    // A1: stagger is always a plain number post-validation (Brief 1 §Task 1
    // rejects object-form stagger). No object.each branch needed.
    const getStaggerOffset = (stagger, idx) =>
      typeof stagger === 'number' ? stagger * idx : 0;

    elements.forEach((element, idx) => {
      const tween = elementTweens[idx];
      const offset = getStaggerOffset(scenario.stagger, idx);
      scenarioTimeline.add(tween, offset);
    });

    const isPrimary = scenario.timelineId ? !!scenario.primary : false;

    const scenarioBuild = {
      scenarioIndex: i,
      sceneId: sceneId,
      triggerType: triggerType,
      triggerConfig: trigger,
      timeline: scenarioTimeline,
      isPrimary: isPrimary
    };

    if (scenario.timelineId) {
      scenarioBuild.timelineId = scenario.timelineId;
    }

    scenarios.push(scenarioBuild);
  }

  const groupsMap = new Map();
  scenarios.forEach(sb => {
    if (sb.timelineId) {
      if (!groupsMap.has(sb.timelineId)) {
        groupsMap.set(sb.timelineId, []);
      }
      groupsMap.get(sb.timelineId).push({
        timeline: sb.timeline,
        index: sb.scenarioIndex,
        isPrimary: sb.isPrimary
      });
    }
  });

  for (const [timelineId, groupItems] of groupsMap.entries()) {
    const masterTimeline = gsap.timeline({ paused: true });
    let primaryScenarioIndex = -1;
    let triggerType = 'time';

    groupItems.forEach(item => {
      masterTimeline.add(item.timeline);
      if (item.isPrimary) {
        primaryScenarioIndex = item.index;
        const originalScenario = scenariosArray[item.index];
        const t = originalScenario.trigger || {};
        triggerType = t.type === 'scroll' && t.scrub ? 'scroll-scrub' : 'time';
      }
    });

    timelineGroups.set(timelineId, {
      timelineId,
      triggerType,
      masterTimeline,
      primaryScenarioIndex
    });
  }

  return {
    elementPlugins,
    elements: elementsMap,
    scenarios,
    timelineGroups
  };
}
