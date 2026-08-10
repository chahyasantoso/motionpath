export function resolveTrackKeyframes(template, track) {
  const templateKeyframes =
    template && template.keyframes ? template.keyframes : {};
  const merged = { ...templateKeyframes };
  if (track && track.keyframes)
    for (const key of Object.keys(track.keyframes))
      merged[key] = track.keyframes[key];
  return merged;
}
export function resolveTrack(track, templates = []) {
  if (!track) return null;
  if (typeof track.resolve === "function") return track.resolve(templates);
  let template = null;
  if (track.use) {
    if (templates && typeof templates.get === "function")
      template = templates.get(track.use);
    else if (Array.isArray(templates))
      template = templates.find((t) => t && t.templateId === track.use);
  }
  const duration =
    track.duration !== undefined
      ? track.duration
      : template && template.duration !== undefined
        ? template.duration
        : undefined;
  const transformOrigin =
    track.transformOrigin !== undefined
      ? track.transformOrigin
      : template && template.transformOrigin !== undefined
        ? template.transformOrigin
        : undefined;
  const keyframes = resolveTrackKeyframes(template, track);
  const baseProperties =
    typeof track.toJSON === "function" ? track.toJSON() : track;
  return { ...baseProperties, duration, transformOrigin, keyframes };
}
