/**
 * Aggregate error thrown by Engine.loadProject() when a project fails
 * validation. Carries EVERY violation, not just the first one, so a caller can
 * fix the whole schema in one pass.
 *
 * Review findings: R-01 (validator never wired into the runtime).
 */
export class MotionPathValidationError extends Error {
  constructor(errors = [], { projectId } = {}) {
    const fatal = errors.filter((e) => e && e.severity === 'error');
    const label = projectId ? ` "${projectId}"` : '';
    const body = fatal
      .map((e) => `  [${e.ruleId}] ${e.path ?? '$'}: ${e.message}`)
      .join('\n');

    super(
      `MotionPath: project${label} failed validation with ${fatal.length} error(s):\n${body}`
    );

    this.name = 'MotionPathValidationError';
    /** every ValidationError, including warnings */
    this.errors = errors;
    /** only severity === 'error' */
    this.fatalErrors = fatal;
    /** only severity !== 'error' */
    this.warnings = errors.filter((e) => e && e.severity !== 'error');
  }
}
