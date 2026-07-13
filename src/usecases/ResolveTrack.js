/**
 * Resolves track overrides with the referenced template.
 * Overrides at the property-key level for keyframes (whole-array replacement).
 * Local duration and transformOrigin win outright if present, otherwise inherit from template.
 */
export function resolveTrackKeyframes(template, track) {
  const templateKeyframes = template && template.keyframes ? template.keyframes : {};
  const merged = { ...templateKeyframes };
  
  if (track && track.keyframes) {
    for (const key of Object.keys(track.keyframes)) {
      merged[key] = track.keyframes[key];
    }
  }
  return merged;
}

/**
 * Resolves a track completely using the templates array or Map.
 * If the track references a template via `use`, looks it up and merges it.
 * 
 * @param {object} track 
 * @param {object[]|Map} templates 
 * @returns {object} The resolved track containing merged keyframes, duration, and transformOrigin.
 */
export function resolveTrack(track, templates = []) {
  if (!track) return null;
  if (typeof track.resolve === 'function') {
    return track.resolve(templates);
  }
  
  let template = null;
  if (track.use) {
    if (templates && typeof templates.get === 'function') {
      template = templates.get(track.use);
    } else if (Array.isArray(templates)) {
      template = templates.find(t => t && t.templateId === track.use);
    }
  }

  const duration = track.duration !== undefined
    ? track.duration
    : (template && template.duration !== undefined ? template.duration : undefined);

  const transformOrigin = track.transformOrigin !== undefined
    ? track.transformOrigin
    : (template && template.transformOrigin !== undefined ? template.transformOrigin : undefined);

  const keyframes = resolveTrackKeyframes(template, track);

  // Return a plain object structure so downstream GSAP builder integrates seamlessly
  const baseProperties = typeof track.toJSON === 'function' ? track.toJSON() : track;
  return {
    ...baseProperties,
    duration,
    transformOrigin,
    keyframes
  };
}

