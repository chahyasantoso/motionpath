/**
 * Dev-gated logger.
 *
 * Teardown paths used to swallow errors with `catch {}`, which hid real
 * failures. Production builds stay silent; dev and test builds get a
 * context-tagged warning instead of nothing at all.
 */
function detectDev() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) return Boolean(import.meta.env.DEV);
  } catch {
    /* import.meta is unavailable in this environment */
  }
  try {
    if (typeof process !== 'undefined' && process.env) return process.env.NODE_ENV !== 'production';
  } catch {
    /* process is unavailable in this environment */
  }
  return true;
}

let enabled = detectDev();

export function setLoggingEnabled(value) { enabled = Boolean(value); }
export function isLoggingEnabled() { return enabled; }

function format(context, message) { return `[MotionPath]${context ? ` ${context}:` : ''} ${message}`; }

export const logger = {
  warn(context, message, error) { if (!enabled) return; console.warn(format(context, message), error ?? ''); },
  error(context, message, error) { if (!enabled) return; console.error(format(context, message), error ?? ''); },
};
