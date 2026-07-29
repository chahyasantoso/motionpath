/**
 * Validates declarative cross-track observation edges, including graph-level
 * cycles so invalid dependency graphs fail before runtime mounting.
 */
export function trackObservationsRule(schema) {
  const errors = [];
  const motions = Array.isArray(schema?.motions) ? schema.motions : [];
  motions.forEach((motion, motionIndex) => {
    if (!motion || typeof motion !== "object" || !Array.isArray(motion.tracks)) return;
    const trackIds = new Set(motion.tracks.filter(Boolean).map((track) => track?.id).filter(Boolean));
    const graph = new Map([...trackIds].map((id) => [id, []]));
    motion.tracks.forEach((track, trackIndex) => {
      const observations = track?.observes;
      if (observations === undefined) return;
      const path = `motions[${motionIndex}].tracks[${trackIndex}].observes`;
      if (!Array.isArray(observations)) {
        errors.push({ ruleId: "track-observations", severity: "error", message: "track.observes must be an array.", path });
        return;
      }
      const seenSources = new Set();
      observations.forEach((edge, edgeIndex) => {
        const edgePath = `${path}[${edgeIndex}]`;
        if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
          errors.push({ ruleId: "track-observations", severity: "error", message: "Each observation must be an object.", path: edgePath });
          return;
        }
        if (typeof edge.source !== "string" || edge.source.length === 0) {
          errors.push({ ruleId: "track-observations", severity: "error", message: "Observation source must be a non-empty track id.", path: `${edgePath}.source` });
        } else {
          if (edge.source === track.id) errors.push({ ruleId: "track-observations", severity: "error", message: "A track cannot observe itself.", path: `${edgePath}.source` });
          if (!trackIds.has(edge.source)) errors.push({ ruleId: "track-observations", severity: "error", message: `Observed source '${edge.source}' is not a track in this motion.`, path: `${edgePath}.source` });
          if (seenSources.has(edge.source)) errors.push({ ruleId: "track-observations", severity: "error", message: `Track observes '${edge.source}' more than once.`, path: `${edgePath}.source` });
          seenSources.add(edge.source);
          if (trackIds.has(edge.source) && edge.source !== track.id) graph.get(track.id).push({ source: edge.source, path: `${edgePath}.source` });
        }
        const role = edge.role ?? "output";
        if (role !== "input" && role !== "output") errors.push({ ruleId: "track-observations", severity: "error", message: "Observation role must be 'input' or 'output'.", path: `${edgePath}.role` });
        if (role === "input") {
          if (typeof edge.target !== "string" || edge.target.length === 0) errors.push({ ruleId: "track-observations", severity: "error", message: "Input observations require a non-empty target key.", path: `${edgePath}.target` });
        } else if (edge.target !== undefined) {
          errors.push({ ruleId: "track-observations", severity: "error", message: "Output observations cannot define target; their patch is merged directly.", path: `${edgePath}.target` });
        }
      });
    });

    const visiting = new Set();
    const visited = new Set();
    const visit = (id, stack = []) => {
      if (visiting.has(id)) {
        const cycle = [...stack, id].join(" -> ");
        errors.push({ ruleId: "track-observations-cycle", severity: "error", message: `Observation cycle detected: ${cycle}.`, path: `motions[${motionIndex}].tracks` });
        return;
      }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const edge of graph.get(id) || []) visit(edge.source, [...stack, id]);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of trackIds) visit(id);
  });
  return errors;
}
