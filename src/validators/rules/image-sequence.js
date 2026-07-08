/**
 * Rule: image-sequence
 * Validates the schema config for keyframes.imageSequence.
 *
 * @param {unknown} element
 * @param {unknown} scenario
 * @param {unknown} context
 * @param {string} path - JSON path to element
 * @returns {ValidationError[]}
 */
export function imageSequenceRule(element, scenario, context, path) {
  const errors = [];
  if (!element || typeof element !== 'object') {
    return errors;
  }

  const keyframes = element.keyframes;
  if (!keyframes || typeof keyframes !== 'object') {
    return errors;
  }

  const imageSequence = keyframes.imageSequence;
  if (imageSequence === undefined) {
    return errors;
  }

  const propPath = `${path}.keyframes.imageSequence`;

  if (imageSequence === null || typeof imageSequence !== 'object') {
    errors.push({
      ruleId: 'image-sequence',
      severity: 'error',
      message: 'keyframes.imageSequence must be an object.',
      path: propPath
    });
    return errors;
  }

  const { frames, stops } = imageSequence;

  // 1. Validate frames
  if (frames === undefined || frames === null) {
    errors.push({
      ruleId: 'image-sequence',
      severity: 'error',
      message: 'imageSequence.frames is required.',
      path: `${propPath}.frames`
    });
  } else if (!Array.isArray(frames)) {
    errors.push({
      ruleId: 'image-sequence',
      severity: 'error',
      message: 'imageSequence.frames must be an array.',
      path: `${propPath}.frames`
    });
  } else if (frames.length === 0) {
    errors.push({
      ruleId: 'image-sequence',
      severity: 'error',
      message: 'imageSequence.frames must contain at least 1 image URL.',
      path: `${propPath}.frames`
    });
  } else {
    frames.forEach((frame, idx) => {
      if (typeof frame !== 'string') {
        errors.push({
          ruleId: 'image-sequence',
          severity: 'error',
          message: `imageSequence.frames[${idx}] must be a string.`,
          path: `${propPath}.frames[${idx}]`
        });
      }
    });
  }

  // 2. Validate stops
  if (stops === undefined || stops === null) {
    errors.push({
      ruleId: 'image-sequence',
      severity: 'error',
      message: 'imageSequence.stops is required.',
      path: `${propPath}.stops`
    });
  } else if (!Array.isArray(stops)) {
    errors.push({
      ruleId: 'image-sequence',
      severity: 'error',
      message: 'imageSequence.stops must be an array.',
      path: `${propPath}.stops`
    });
  } else if (stops.length < 2) {
    errors.push({
      ruleId: 'image-sequence',
      severity: 'error',
      message: 'imageSequence.stops must have at least 2 stops.',
      path: `${propPath}.stops`
    });
  } else {
    stops.forEach((stop, idx) => {
      if (!stop || typeof stop !== 'object') {
        return;
      }
      if (typeof stop.p !== 'number') {
        errors.push({
          ruleId: 'image-sequence',
          severity: 'error',
          message: `imageSequence.stops[${idx}].p must be a number.`,
          path: `${propPath}.stops[${idx}].p`
        });
      }
      if (typeof stop.v !== 'number') {
        errors.push({
          ruleId: 'image-sequence',
          severity: 'error',
          message: `imageSequence.stops[${idx}].v must be a number (frame index).`,
          path: `${propPath}.stops[${idx}].v`
        });
      }
    });
  }

  return errors;
}
