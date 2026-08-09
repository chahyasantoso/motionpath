/**
 * The readability guard list.
 *
 * Finding F-11: CI's format job runs `format:check:ci`, which checks exactly two
 * files (`package.json` and `.github/workflows/ci.yml`), and there is no linter.
 * That is how PR #139 landed `Track.js` and `GraphPublisher.js` rewritten into
 * single-line dense code with their reasoning comments deleted, on a fully green
 * board.
 *
 * Pointing CI at the full `format:check` is the right end state but it is a
 * repo-wide reformat, and this codebase is dense almost everywhere. So this list
 * works the opposite way to the GSAP quarantine: it names the files that are
 * already clean and holds them to a floor. It may only ever GROW.
 *
 * Add a file here as soon as you make it readable. Never remove one.
 */
export const READABILITY_GUARDED_FILES = [
  "packages/core/src/lib/Track.js",
  "packages/core/src/usecases/GraphPublisher.js",
  "packages/core/src/usecases/ScopedObservationAdapter.js",
];

/** Long enough for real code, short enough that a whole class cannot hide on it. */
export const MAX_LINE_LENGTH = 130;

/**
 * Two allows `for (let i = 0; i < n; i += 1)`. It does not allow a method body
 * folded onto its signature.
 */
export const MAX_SEMICOLONS_PER_LINE = 2;

/**
 * Not a style rule. These two files exist to enforce ordering and atomicity
 * invariants whose reasons are not derivable from the code, and both have
 * already lost those reasons once.
 */
export const MIN_COMMENT_RATIO = 0.05;

export function isCommentLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*")
  );
}

export function countSemicolons(line) {
  let count = 0;
  for (const character of line) if (character === ";") count += 1;
  return count;
}

/** Returns a list of violation strings. Empty means the file meets the floor. */
export function checkReadability(relativePath, source) {
  const violations = [];
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.length > MAX_LINE_LENGTH) {
      violations.push(
        `${relativePath}:${lineNumber} line is ${line.length} chars, limit is ${MAX_LINE_LENGTH}`,
      );
    }
    const semicolons = countSemicolons(line);
    if (semicolons > MAX_SEMICOLONS_PER_LINE) {
      violations.push(
        `${relativePath}:${lineNumber} has ${semicolons} statements on one line`,
      );
    }
  });
  const meaningful = lines.filter((line) => line.trim().length > 0);
  const comments = meaningful.filter((line) => isCommentLine(line));
  const ratio =
    meaningful.length === 0 ? 1 : comments.length / meaningful.length;
  if (ratio < MIN_COMMENT_RATIO) {
    const percent = (ratio * 100).toFixed(1);
    violations.push(
      `${relativePath} comment ratio is ${percent}%, floor is ${MIN_COMMENT_RATIO * 100}%`,
    );
  }
  return violations;
}
