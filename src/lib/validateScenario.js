// validateScenario.js
//
// Consolidated validation pass, run once per scenario before any plugin
// contribute() calls or GSAP construction begins. Throws on first violation.
//
// Locked scenario shape:
//
// scenario = {
//   sceneId: string,          // default trigger element
//   trigger: {
//     type: 'scroll' | 'time',
//     scrub: boolean,          // scroll only — true = scrub, false = observer
//     toggleActions: string,   // scroll + !scrub only, e.g. "play pause resume reverse"
//     start: string, end: string,
//     startTrigger: string, endTrigger: string,  // override sceneId for cross-section scroll
//     pin: boolean, pinSpacing: boolean, snap: any,   // scrub only
//     repeat: number, yoyo: boolean, repeatDelay: number,  // time + scroll-observer
//   },
//   stagger: number | object,  // scenario level, any trigger type
//   elements: [
//     {
//       id: string,
//       duration: number,            // optional, overrides scenario duration (observer/time)
//       transformOrigin: string,     // optional, e.g. "50% 50%"
//       direction: 'to' | 'from' | 'fromTo',  // optional, element-level (shared across its keyframes)
//       keyframes: {
//         [propKey]: { stops: [{ p: number, v: any, ease?: string }] },
//         // path is shaped { points: [...], stops: [...] } but still carries `stops`
//       },
//     },
//   ],
// }

const DIRECTION_EPSILON = 1e-6;

class ScenarioValidationError extends Error {
  constructor(message) {
    super(`[validateScenario] ${message}`);
    this.name = 'ScenarioValidationError';
  }
}

function getTriggerPattern(trigger) {
  if (trigger.type === 'time') return 'time';
  if (trigger.type === 'scroll') return trigger.scrub ? 'scroll-scrub' : 'scroll-observer';
  throw new ScenarioValidationError(
    `trigger.type must be 'scroll' or 'time', got '${trigger.type}'`
  );
}

function validateTriggerFields(trigger, pattern) {
  // endTrigger forbidden everywhere except scroll-scrub
  if (trigger.endTrigger != null && pattern !== 'scroll-scrub') {
    throw new ScenarioValidationError(
      `endTrigger is only valid on a scroll trigger with scrub:true. Found it on a '${pattern}' trigger.`
    );
  }

  // pin / pinSpacing / snap are scrub-exclusive
  for (const field of ['pin', 'pinSpacing', 'snap']) {
    if (trigger[field] != null && pattern !== 'scroll-scrub') {
      throw new ScenarioValidationError(
        `'${field}' is only valid on a scroll trigger with scrub:true. Found it on a '${pattern}' trigger.`
      );
    }
  }

  // repeat / yoyo / repeatDelay only make sense on an autonomous timeline (time, scroll-observer)
  for (const field of ['repeat', 'yoyo', 'repeatDelay']) {
    if (trigger[field] != null && pattern === 'scroll-scrub') {
      throw new ScenarioValidationError(
        `'${field}' has no effect under scroll-scrub (progress is scroll-bound, not time-driven). Remove it or switch trigger type.`
      );
    }
  }

  // scroll-observer with no explicit `end` + >1 active toggleAction relies on
  // ScrollTrigger's default sizing heuristic — lint this, require explicit end.
  if (pattern === 'scroll-observer' && trigger.end == null) {
    const actions = (trigger.toggleActions || '').trim().split(/\s+/);
    const activeCount = actions.filter((a) => a && a !== 'none').length;
    if (activeCount > 1) {
      throw new ScenarioValidationError(
        `scroll-observer trigger has no explicit 'end' but ${activeCount} toggleActions are active ` +
        `("${trigger.toggleActions}"). Set 'end' explicitly instead of relying on ScrollTrigger's default sizing.`
      );
    }
  }

  // toggleActions format validation: scroll-observer only, must be exactly 4 space-separated
  // words, each must be one of the valid GSAP toggleAction verbs.
  // GSAP docs: https://gsap.com/docs/v3/Plugins/ScrollTrigger/#toggleActions
  // Valid verbs: play, pause, resume, reverse, restart, reset, complete, none
  if (pattern === 'scroll-observer' && trigger.toggleActions != null) {
    const VALID_TOGGLE_VERBS = new Set([
      'play', 'pause', 'resume', 'reverse', 'restart', 'reset', 'complete', 'none',
    ]);
    const parts = String(trigger.toggleActions).trim().split(/\s+/);
    if (parts.length !== 4) {
      throw new ScenarioValidationError(
        `trigger.toggleActions must be exactly 4 space-separated verbs ` +
        `(onEnter onLeave onEnterBack onLeaveBack), got ${parts.length}: "${trigger.toggleActions}".`
      );
    }
    const labels = ['onEnter', 'onLeave', 'onEnterBack', 'onLeaveBack'];
    parts.forEach((verb, i) => {
      if (!VALID_TOGGLE_VERBS.has(verb)) {
        throw new ScenarioValidationError(
          `trigger.toggleActions[${i}] (${labels[i]}) is "${verb}", which is not a valid GSAP toggleAction verb. ` +
          `Valid verbs: ${[...VALID_TOGGLE_VERBS].join(', ')}.`
        );
      }
    });
  }
}

function validateElement(element) {
  const elementId = element.id;
  if (elementId == null) {
    throw new ScenarioValidationError(`Element is missing required 'id' field.`);
  }

  const keyframes = element.keyframes || {};
  const propKeys = Object.keys(keyframes);

  // path drives __pathProgress and derives {x, y} itself via getPointOnCubicPath(),
  // so explicit x/y keyframes on the same element would fight the path-derived values.
  const hasPath = propKeys.includes('path');
  const hasXOrY = propKeys.includes('x') || propKeys.includes('y');
  if (hasPath && hasXOrY) {
    throw new ScenarioValidationError(
      `Element '${elementId}' has both a 'path' property and explicit 'x'/'y' keyframes. ` +
      `Remove the explicit x/y keyframes or drop the path.`
    );
  }

  for (const propKey of propKeys) {
    const stops = (keyframes[propKey] && keyframes[propKey].stops) || [];

    if (stops.length === 0) {
      throw new ScenarioValidationError(`Element '${elementId}', property '${propKey}' has no stops.`);
    }

    // direction is element-level (shared across all of this element's keyframe
    // properties) — only matters when some property has a single, positionally
    // ambiguous stop.
    if (stops.length === 1) {
      const p = stops[0].p;
      const nearStart = Math.abs(p - 0) < DIRECTION_EPSILON;
      const nearEnd = Math.abs(p - 1) < DIRECTION_EPSILON;
      if (!nearStart && !nearEnd && element.direction == null) {
        throw new ScenarioValidationError(
          `Element '${elementId}', property '${propKey}' has a single stop at p=${p} (not near 0 or 1), ` +
          `so direction can't be inferred. Set element.direction: 'to' | 'from' | 'fromTo' explicitly.`
        );
      }
    }
  }
}

/**
 * Validates a scenario before any plugin contribute() calls or GSAP construction.
 * Throws ScenarioValidationError on first violation. Returns the resolved trigger
 * pattern so callers don't have to re-derive it.
 *
 * Does NOT check ease collisions — that depends on each plugin's contribute()
 * output (percentPatch), which doesn't exist at this stage. See
 * validateEaseCollisions() below, called per-element after contribute().
 */
function validateScenario(scenario) {
  if (!scenario || typeof scenario !== 'object') {
    throw new ScenarioValidationError('scenario must be an object.');
  }
  if (scenario.sceneId == null) {
    throw new ScenarioValidationError('scenario.sceneId is required (default trigger element).');
  }
  if (!scenario.trigger) {
    throw new ScenarioValidationError('scenario.trigger is required.');
  }

  const pattern = getTriggerPattern(scenario.trigger);
  validateTriggerFields(scenario.trigger, pattern);

  const elements = scenario.elements || [];
  for (const element of elements) {
    validateElement(element);
  }

  return pattern;
}

/**
 * Run once per element, after contribute() has been called for every property
 * on that element. percentPatchesByProperty is { [propKey]: percentPatch },
 * where percentPatch is { [percentKey]: { ease, ... } } as returned by contribute().
 * Throws on first collision.
 */
function validateEaseCollisions(elementId, percentPatchesByProperty) {
  const easeAtPercent = new Map(); // percentKey -> { propKey, ease }

  for (const [propKey, percentPatch] of Object.entries(percentPatchesByProperty)) {
    for (const [percentKey, entry] of Object.entries(percentPatch)) {
      if (entry.ease == null) continue;
      const existing = easeAtPercent.get(percentKey);
      if (existing && existing.ease !== entry.ease) {
        throw new ScenarioValidationError(
          `Element '${elementId}' has conflicting eases at ${percentKey}: ` +
          `'${existing.propKey}' wants '${existing.ease}', '${propKey}' wants '${entry.ease}'.`
        );
      }
      easeAtPercent.set(percentKey, { propKey, ease: entry.ease });
    }
  }
}

export {
  validateScenario,
  validateEaseCollisions,
  ScenarioValidationError,
  getTriggerPattern,
};
