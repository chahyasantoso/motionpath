/**
 * Rule: element-uniqueness
 *
 * Track ID uniqueness check, scoped PROJECT-WIDE across all motions and top-level tracks.
 *
 * @param {unknown[]} motions
 * @param {object} [context]
 * @returns {ValidationError[]}
 */
export function elementUniquenessRule(motions, context) {
  const errors = [];
  const seenIds = new Map(); // trackId -> path string

  if (Array.isArray(motions)) {
    motions.forEach((motion, motionIndex) => {
      if (!motion || typeof motion !== 'object') return;
      const tracks = motion.tracks;
      if (!Array.isArray(tracks)) return;

      tracks.forEach((track, trackIndex) => {
        if (!track || typeof track !== 'object') return;
        const { id } = track;
        if (id !== undefined && id !== null && id !== '') {
          const tid = String(id);
          const currentPath = `motions[${motionIndex}].tracks[${trackIndex}]`;
          const firstPath = seenIds.get(tid);
          if (firstPath) {
            errors.push({
              ruleId: "element-uniqueness",
              severity: "error",
              message: `Duplicate track ID '${tid}' found in ${currentPath} ` +
                `(already used in ${firstPath}). ` +
                `Track IDs must be unique project-wide.`,
              path: `${currentPath}.id`
            });
          } else {
            seenIds.set(tid, currentPath);
          }
        }
      });
    });
  }

  const topLevelTracks = context?.schema?.tracks;
  if (Array.isArray(topLevelTracks)) {
    topLevelTracks.forEach((track, trackIndex) => {
      if (!track || typeof track !== 'object') return;
      const { id } = track;
      if (id !== undefined && id !== null && id !== '') {
        const tid = String(id);
        const currentPath = `tracks[${trackIndex}]`;
        const firstPath = seenIds.get(tid);
        if (firstPath) {
          errors.push({
            ruleId: "element-uniqueness",
            severity: "error",
            message: `Duplicate track ID '${tid}' found in ${currentPath} ` +
              `(already used in ${firstPath}). ` +
              `Track IDs must be unique project-wide.`,
            path: `${currentPath}.id`
          });
        } else {
          seenIds.set(tid, currentPath);
        }
      }
    });
  }

  return errors;
}
