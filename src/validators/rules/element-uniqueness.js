/**
 * Rule: element-uniqueness
 *
 * Track ID uniqueness check, scoped PROJECT-WIDE across all motions.
 *
 * This must stay project-wide, not per-motion: EditorEngine.loadProject()
 * builds one flat Map keyed only by track id (`#trackIndex`) across every
 * motion in the project, for its subscribe()/compose()/setProgress() API.
 * A per-motion-only check would let two motions declare the same track id,
 * which would then silently collide in that flat map (last motion mounted
 * wins, the other's track becomes unreachable) with no error surfaced
 * anywhere. This rule exists specifically to make that conflict a build-time
 * error instead of a silent runtime bug.
 *
 * Requirements:
 * - Every track.id must be unique across the entire project (all motions).
 * - A duplicate id anywhere in the project -> error, reported at the second
 *   (later) occurrence, with a pointer back to the first occurrence.
 *
 * @param {unknown[]} motions
 * @returns {ValidationError[]}
 */
export function elementUniquenessRule(motions, context) {
  const errors = [];

  if (!Array.isArray(motions)) {
    return errors;
  }

  const seenIds = new Map(); // trackId -> { motionIndex, trackIndex }

  motions.forEach((motion, motionIndex) => {
    if (!motion || typeof motion !== 'object') return;
    const tracks = motion.tracks;
    if (!Array.isArray(tracks)) return;

    tracks.forEach((track, trackIndex) => {
      if (!track || typeof track !== 'object') return;
      const { id } = track;
      if (id !== undefined && id !== null && id !== '') {
        const tid = String(id);
        const first = seenIds.get(tid);
        if (first) {
          errors.push({
            ruleId: "element-uniqueness",
            severity: "error",
            message: `Duplicate track ID '${tid}' found in motions[${motionIndex}].tracks[${trackIndex}] ` +
              `(already used in motions[${first.motionIndex}].tracks[${first.trackIndex}]). ` +
              `Track IDs must be unique project-wide, not just within a motion.`,
            path: `motions[${motionIndex}].tracks[${trackIndex}].id`
          });
        } else {
          seenIds.set(tid, { motionIndex, trackIndex });
        }
      }
    });
  });

  return errors;
}
