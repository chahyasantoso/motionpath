/**
 * Rule: element-uniqueness
 *
 * Track ID uniqueness check, scoped per motion (not project-wide — nothing
 * in the engine currently looks up a track by id without a motionId
 * alongside it, so cross-motion duplicates are intentionally allowed).
 *
 * Requirements:
 * - Within a single motion, every track.id must be unique.
 * - A duplicate id within the same motion -> error.
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
