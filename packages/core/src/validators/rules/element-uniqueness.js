/**
 * Rule: element-uniqueness
 *
 * Track ID uniqueness, scoped MOTION-LOCAL for motion tracks and project-wide
 * across the bare top-level `tracks[]` array.
 *
 * v5 PR-17 scope change. This rule used to be project-wide across every motion
 * (Brief 12). That scope existed for exactly one reason: the v3 EditorEngine
 * built a flat `#trackIndex` keyed only by bare track id, so two motions
 * declaring the same track id silently collided and one became unreachable.
 * That engine and that index are gone in v5. Tracks are now addressed by
 * qualified id -- `motionId/trackId` for motion tracks, `~/trackId` for bare
 * top-level tracks -- so the same track id in two different motions is an
 * unambiguous, supported authoring pattern (a rig named `bone` in both a
 * `left` and a `right` motion).
 *
 * Still an error, because the qualified id itself would collide:
 * - the same track id twice inside one motion
 * - the same track id twice in the top-level `tracks[]` array
 *
 * A warning, not an error:
 * - a bare top-level track id that is also used as a motion-local track id.
 *   Both stay addressable (`~/id` and `motionId/id`), but an unqualified `id`
 *   lookup is ambiguous. parseV4Project throws rather than picking a winner,
 *   so this stays a warning here and never silently resolves.
 *
 * @param {unknown[]} motions
 * @param {object} [context]
 * @returns {ValidationError[]}
 */
export function elementUniquenessRule(motions, context) {
  const errors = [];
  const motionLocalIds = new Map(); // trackId -> first path that used it

  if (Array.isArray(motions)) {
    motions.forEach((motion, motionIndex) => {
      if (!motion || typeof motion !== "object") return;
      const tracks = motion.tracks;
      if (!Array.isArray(tracks)) return;

      const seenInMotion = new Map();

      tracks.forEach((track, trackIndex) => {
        if (!track || typeof track !== "object") return;
        const { id } = track;
        if (id === undefined || id === null || id === "") return;

        const tid = String(id);
        const currentPath = `motions[${motionIndex}].tracks[${trackIndex}]`;
        const firstPath = seenInMotion.get(tid);

        if (firstPath) {
          errors.push({
            ruleId: "element-uniqueness",
            severity: "error",
            message:
              `Duplicate track ID '${tid}' found in ${currentPath} ` +
              `(already used in ${firstPath}). ` +
              `Track IDs must be unique within a motion: both would resolve to the same qualified ID.`,
            path: `${currentPath}.id`,
          });
          return;
        }

        seenInMotion.set(tid, currentPath);
        if (!motionLocalIds.has(tid)) motionLocalIds.set(tid, currentPath);
      });
    });
  }

  const topLevelTracks = context?.schema?.tracks;
  if (Array.isArray(topLevelTracks)) {
    const seenTopLevel = new Map();

    topLevelTracks.forEach((track, trackIndex) => {
      if (!track || typeof track !== "object") return;
      const { id } = track;
      if (id === undefined || id === null || id === "") return;

      const tid = String(id);
      const currentPath = `tracks[${trackIndex}]`;
      const firstPath = seenTopLevel.get(tid);

      if (firstPath) {
        errors.push({
          ruleId: "element-uniqueness",
          severity: "error",
          message:
            `Duplicate track ID '${tid}' found in ${currentPath} ` +
            `(already used in ${firstPath}). ` +
            `Bare top-level track IDs share the '~' namespace and must be unique.`,
          path: `${currentPath}.id`,
        });
        return;
      }

      seenTopLevel.set(tid, currentPath);

      const shadowed = motionLocalIds.get(tid);
      if (shadowed) {
        errors.push({
          ruleId: "element-uniqueness",
          severity: "warning",
          message:
            `Bare track ID '${tid}' in ${currentPath} is also used as a motion-local track ID in ${shadowed}. ` +
            `Both stay addressable as '~/${tid}' and '<motionId>/${tid}', but an unqualified '${tid}' lookup is ambiguous and will be rejected at load.`,
          path: `${currentPath}.id`,
        });
      }
    });
  }

  return errors;
}
