/**
 * Rule: element-uniqueness
 * * Project-wide track ID uniqueness check across ALL motions.
 * 
 * * Requirements:
 * - Collect every track ID across the entire project's motions.
 * - Any ID appearing in more than one motion -> error.
 * 
 * @param {unknown[]} motions
 * @returns {ValidationError[]}
 */
export function elementUniquenessRule(motions, context) {
  const errors = [];

  if (!Array.isArray(motions)) {
    return errors;
  }

  motions.forEach((motion, motionIndex) => {
    if (!motion || typeof motion !== 'object') return;
    const tracks = motion.tracks;
    if (!Array.isArray(tracks)) return;

    const seenIds = new Set();

    tracks.forEach((track, trackIndex) => {
      if (!track || typeof track !== 'object') return;
      const { id } = track;
      if (id !== undefined && id !== null && id !== '') {
        const tid = String(id);
        if (seenIds.has(tid)) {
          errors.push({
            ruleId: "element-uniqueness",
            severity: "error",
            message: `Duplicate track ID '${tid}' found within the same motion (motion index: ${motionIndex}).`,
            path: `motions[${motionIndex}].tracks[${trackIndex}].id`
          });
        } else {
          seenIds.add(tid);
        }
      }
    });
  });

  return errors;
}
