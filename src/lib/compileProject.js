import { validateProject } from '../validators/index.js';
import { buildProject } from './builder.js';
import { createEngineCore } from './engineCore.js';

/**
 * Shared compile preamble used by both ProductionEngine and EditorEngine:
 * validate -> build -> wrap in EngineCore. Pure aside from allocating GSAP
 * timeline/proxy objects — never touches ScrollTrigger, never calls
 * .play(), never touches the DOM. Throws on hard validation errors, same
 * as the previous inline sequence in each engine.
 *
 * @param {object} schema
 * @param {object} deps - forwarded to buildProject
 * @param {string} [engineName='MotionPath'] - engine prefix for warnings/errors
 * @returns {Promise<{ core: object, buildResult: object }>}
 */
export async function compileProject(schema, deps, engineName = 'MotionPath') {
  const errors = validateProject(schema) || [];
  const hardErrors = errors.filter((e) => e.severity === 'error');
  const warnings = errors.filter((e) => e.severity !== 'error');
  
  warnings.forEach((w) => console.warn(`[${engineName}]`, w.message));
  
  if (hardErrors.length > 0) {
    const err = new Error(
      `[${engineName}] Schema validation failed:\n` +
      hardErrors.map((e) => `  - ${e.message}`).join('\n')
    );
    err.validationErrors = errors;
    throw err;
  }

  const buildResult = await buildProject(schema, deps);
  const core = createEngineCore(buildResult);

  return { core, buildResult };
}
