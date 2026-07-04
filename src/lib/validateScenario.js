import { validateProject } from '../validators/index.js';

class ScenarioValidationError extends Error {
  constructor(message) {
    super(`[validateScenario] ${message}`);
    this.name = 'ScenarioValidationError';
  }
}

function getTriggerPattern(trigger) {
  if (!trigger) return null;
  if (trigger.type === 'time') return 'time';
  if (trigger.type === 'scroll') return trigger.scrub ? 'scroll-scrub' : 'scroll-observer';
  throw new ScenarioValidationError(
    `trigger.type must be 'scroll' or 'time', got '${trigger.type}'`
  );
}

/**
 * Validates a scenario before any plugin contribute() calls or GSAP construction.
 * Throws ScenarioValidationError on first violation. Returns the resolved trigger
 * pattern so callers don't have to re-derive it.
 *
 * This function delegates to the new modular project-level validator.
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

  // Ensure elements are valid and have IDs (basic schema invariant)
  const elements = scenario.elements || [];
  for (const element of elements) {
    if (!element || typeof element !== 'object') {
      throw new ScenarioValidationError('scenario.elements must contain valid element objects.');
    }
    if (element.id == null) {
      throw new ScenarioValidationError("Element is missing required 'id' field.");
    }
  }

  // Wrap scenario in a project container to validate via main project validator
  const mockProject = {
    schemaVersion: 1,
    scenarios: [scenario]
  };

  const errors = validateProject(mockProject);
  const criticalErrors = errors.filter(e => e.severity === 'error');

  if (criticalErrors.length > 0) {
    throw new ScenarioValidationError(criticalErrors[0].message);
  }

  return getTriggerPattern(scenario.trigger);
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
