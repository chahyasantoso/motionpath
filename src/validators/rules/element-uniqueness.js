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

  // Track locations of each track ID globally across all motions
  // trackId -> Array of { motionIndex, trackIndex }
  const idLocations = new Map();

  motions.forEach((motion, motionIndex) => {
    if (!motion || typeof motion !== 'object') return;
    const tracks = motion.tracks;
    if (!Array.isArray(tracks)) return;

    tracks.forEach((track, trackIndex) => {
      if (!track || typeof track !== 'object') return;
      const { id } = track;
      if (id !== undefined && id !== null && id !== '') {
        const tid = String(id);
        if (!idLocations.has(tid)) {
          idLocations.set(tid, []);
        }
        idLocations.get(tid).push({ motionIndex, trackIndex });
      }
    });
  });

  // Check for duplicates across the entire project
  idLocations.forEach((locations, tid) => {
    if (locations.length > 1) {
      locations.forEach(({ motionIndex, trackIndex }) => {
        errors.push({
          ruleId: "element-uniqueness",
          severity: "error",
          message: `Duplicate track ID '${tid}' found across multiple motions (motion indices: ${locations.map(l => l.motionIndex).join(', ')}).`,
          path: `motions[${motionIndex}].tracks[${trackIndex}].id`
        });
      });
    }
  });

  return errors;
}
