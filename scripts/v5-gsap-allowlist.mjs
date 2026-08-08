/**
 * The GSAP import boundary allowlist.
 *
 * Shared by the blocking test (`packages/core/src/gsap-boundary.test.js`) and
 * the pass-2 audit script (`scripts/v5-pass2-boundaries.mjs`) so the two can
 * never disagree about what is currently permitted.
 *
 * Paths are repository-relative and use forward slashes.
 */

/** Directories where importing the `gsap` package directly is the point. */
export const APPROVED_GSAP_PREFIXES = ["packages/core/src/adapters/"];

/**
 * Known remaining direct vendor imports outside the adapter surface.
 *
 * This list may only ever shrink. It exists so the boundary can be BLOCKING
 * today instead of aspirational: a new direct import fails CI immediately,
 * while the existing ones stay visible and owned instead of being hidden
 * behind a non-blocking audit that everyone stops reading.
 *
 * Every entry is a test or fixture that constructs real GSAP tweens on
 * purpose. They are retired by P2-02's follow-on work, when core tests run
 * against fake `Interpolator`/`Scheduler` ports instead of the real engine.
 */
export const QUARANTINED_GSAP_FILES = [
  "packages/core/src/__fixtures__/graphTracks.js",
  "packages/core/src/lib/__tests__/Motion.test.js",
  "packages/core/src/lib/__tests__/MotionPhase2.test.js",
  "packages/core/src/lib/__tests__/Track.test.js",
  "packages/core/src/lib/schema/__tests__/parseV4Project.test.js",
];

/** Matches a real ES import of the vendor package, not a mention in prose. */
export const GSAP_IMPORT_PATTERN = /(?:^|\n)\s*import\s(?:[^\n;]*?\sfrom\s)?["']gsap(?:\/[^"']*)?["']/;

export function isApprovedGsapPath(relativePath) {
  return APPROVED_GSAP_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

export function isQuarantinedGsapPath(relativePath) {
  return QUARANTINED_GSAP_FILES.includes(relativePath);
}
