/**
 * Rule: perspective-usage
 * Per-motion warning check for perspective.
 *
 * Requirements:
 * - If any track in the motion uses z, rotationX, or rotationY,
 *   and top-level schema.perspective is absent -> warning.
 *
 * @param {unknown} motion
 * @param {{ schema: unknown }} context - Rule validation context
 * @param {string} path - JSON path to motion
 * @returns {ValidationError[]}
 */
export function perspectiveUsageRule(motion, context, path) {
  const errors = [];

  if (!motion || typeof motion !== "object") {
    return errors;
  }

  const schemaPerspective = context?.schema?.perspective;
  // Perspective is present if it's not null/undefined
  const isPerspectivePresent =
    schemaPerspective !== undefined && schemaPerspective !== null;
  if (isPerspectivePresent) {
    return errors; // perspective is set, no warnings needed
  }

  const tracks = motion.tracks;
  if (!Array.isArray(tracks)) {
    return errors;
  }

  let uses3D = false;

  for (const track of tracks) {
    if (!track || typeof track !== "object") continue;
    const keyframes = track.keyframes;
    if (!keyframes || typeof keyframes !== "object") continue;

    const hasZ = keyframes.z !== undefined && keyframes.z !== null;
    const hasRotX =
      keyframes.rotationX !== undefined && keyframes.rotationX !== null;
    const hasRotY =
      keyframes.rotationY !== undefined && keyframes.rotationY !== null;

    let hasPathZ = false;
    if (
      keyframes.path &&
      typeof keyframes.path === "object" &&
      Array.isArray(keyframes.path.points)
    ) {
      hasPathZ = keyframes.path.points.some(
        (pt) => pt && pt.z !== undefined && pt.z !== null && pt.z !== 0,
      );
    }

    if (hasZ || hasRotX || hasRotY || hasPathZ) {
      uses3D = true;
      break;
    }
  }

  if (uses3D) {
    errors.push({
      ruleId: "perspective-usage",
      severity: "warning",
      message: `Motion contains 3D keyframe properties (z, rotationX, or rotationY), but top-level 'perspective' is missing.`,
      path,
    });
  }

  return errors;
}
