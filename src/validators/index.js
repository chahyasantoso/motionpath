import { schemaVersionRule } from './rules/schema-version.js';
import { triggerShapeRule } from './rules/trigger-shape.js';
import { easeCollisionRule } from './rules/ease-collision.js';
import { staggerShapeRule } from './rules/stagger-shape.js';
import { perspectiveUsageRule } from './rules/perspective-usage.js';
import { directionAmbiguityRule } from './rules/direction-ambiguity.js';
import { pathXYExclusivityRule } from './rules/path-xy-exclusivity.js';
import { pathShapeRule } from './rules/path-shape.js';
import { timelineGroupRule } from './rules/timeline-group.js';
import { elementUniquenessRule } from './rules/element-uniqueness.js';

const scenarioRules = [
  triggerShapeRule,
  easeCollisionRule,
  staggerShapeRule,
  perspectiveUsageRule,
];

const elementRules = [
  directionAmbiguityRule,
  pathXYExclusivityRule,
  pathShapeRule,
];

const crossScenarioRules = [
  timelineGroupRule,
  elementUniquenessRule,
];

/**
 * Validates whether the project schema is structurally valid enough to iterate scenarios.
 *
 * @param {unknown} schema
 * @returns {boolean}
 */
function isValidShape(schema) {
  return (
    schema !== null &&
    typeof schema === 'object' &&
    Array.isArray(schema.scenarios)
  );
}

/**
 * Main project validation entry point. Runs synchronously on plain JSON,
 * catching all violations (collect-all) and never throwing runtime exceptions.
 *
 * @param {unknown} schema - Plain JSON object representation of a MotionPath project.
 * @returns {ValidationError[]}
 */
export function validateProject(schema) {
  const errors = [];

  // Run top-level schema-version check first
  errors.push(...runSafely(schemaVersionRule, schema, "$"));
  if (!isValidShape(schema)) {
    if (schema && typeof schema === 'object') {
      errors.push({
        ruleId: "invalid-shape",
        severity: "error",
        message: "schema.scenarios must be an array.",
        path: "$.scenarios"
      });
    }
    return errors; // cannot iterate scenarios safely; return early
  }

  const context = { schema };

  // Iterate scenarios
  for (const [i, scenario] of schema.scenarios.entries()) {
    const scenarioPath = `scenarios[${i}]`;

    // Run scenario rules (ScenarioRule signature: (scenario, context, path) => errors)
    for (const rule of scenarioRules) {
      errors.push(...runSafely(rule, scenario, context, scenarioPath));
    }

    // Run element rules, checking defensively if scenario is an object and has elements array
    if (scenario && typeof scenario === 'object' && Array.isArray(scenario.elements)) {
      for (const [j, element] of scenario.elements.entries()) {
        const elementPath = `${scenarioPath}.elements[${j}]`;
        for (const rule of elementRules) {
          errors.push(...runSafely(rule, element, scenario, context, elementPath));
        }
      }
    }
  }

  // Run cross-scenario rules (CrossScenarioRule signature: (scenarios, context) => errors)
  for (const rule of crossScenarioRules) {
    errors.push(...runSafely(rule, schema.scenarios, context));
  }

  return errors;
}

/**
 * Runs a rule function safely. If it throws, translates the exception into
 * an internal-error ValidationError to prevent the validation pass from crashing.
 */
function runSafely(rule, ...args) {
  try {
    return rule(...args);
  } catch (e) {
    return [{
      ruleId: "internal-error",
      severity: "error",
      message: `Validator rule threw unexpectedly: ${e.message}`,
      path: String(args.at(-1))
    }];
  }
}
