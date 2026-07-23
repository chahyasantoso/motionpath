/**
 * Rule: motion-structure
 * Performs structural validation for templates, motions, drivers/triggers, and track template references.
 * Supports both v3 and v4 schema shapes.
 *
 * @param {unknown} schema - Full project schema
 * @returns {ValidationError[]}
 */
export function motionStructureRule(schema) {
  const errors = [];

  if (!schema || typeof schema !== 'object') {
    return errors;
  }

  // 1. Validate templates structure and forbidden fields
  const seenTemplateIds = new Set();
  const templates = Array.isArray(schema.templates) ? schema.templates : [];

  for (const [i, template] of templates.entries()) {
    const templatePath = `templates[${i}]`;
    if (!template || typeof template !== 'object') {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: `Template at index ${i} must be an object.`,
        path: templatePath
      });
      continue;
    }

    const { templateId, driver, timelineId, primary, trigger } = template;

    if (!templateId || typeof templateId !== 'string') {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'templateId is required and must be a string.',
        path: `${templatePath}.templateId`
      });
    } else {
      if (seenTemplateIds.has(templateId)) {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: `Duplicate templateId '${templateId}' found.`,
          path: `${templatePath}.templateId`
        });
      }
      seenTemplateIds.add(templateId);
    }

    if (driver !== undefined) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'Template forbids driver property.',
        path: `${templatePath}.driver`
      });
    }
    if (timelineId !== undefined) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'Template forbids timelineId property.',
        path: `${templatePath}.timelineId`
      });
    }
    if (primary !== undefined) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'Template forbids primary property.',
        path: `${templatePath}.primary`
      });
    }
    if (trigger !== undefined) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'Template forbids trigger property.',
        path: `${templatePath}.trigger`
      });
    }
  }

  // Helper to validate track references
  const validateTracksArray = (tracks, pathPrefix, motionIdOrIdx) => {
    if (tracks === undefined || tracks === null) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: `Motion "${motionIdOrIdx}": tracks must have at least 1 entry`,
        path: pathPrefix
      });
    } else if (!Array.isArray(tracks)) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'tracks must be an array.',
        path: pathPrefix
      });
    } else if (tracks.length < 1) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: `Motion "${motionIdOrIdx}": tracks must have at least 1 entry`,
        path: pathPrefix
      });
    } else {
      for (const [j, track] of tracks.entries()) {
        if (!track || typeof track !== 'object') continue;

        if (typeof track.id !== 'string' || track.id === '') {
          errors.push({
            ruleId: 'motion-structure',
            severity: 'error',
            message: `Motion "${motionIdOrIdx}": track.id is required and must be a non-empty string.`,
            path: `${pathPrefix}[${j}].id`
          });
        }

        if (track.use !== undefined) {
          if (!seenTemplateIds.has(track.use)) {
            errors.push({
              ruleId: 'motion-structure',
              severity: 'error',
              message: `Track references non-existent templateId '${track.use}'.`,
              path: `${pathPrefix}[${j}].use`
            });
          }
        }
      }
    }
  };

  // 2. Validate motions structure
  const seenMotionIds = new Set();
  const motions = Array.isArray(schema.motions) ? schema.motions : [];
  const isV4 = schema.schemaVersion === 4 || motions.some(m => m && typeof m === 'object' && m.trigger);

  for (const [i, motion] of motions.entries()) {
    const motionPath = `motions[${i}]`;
    if (!motion || typeof motion !== 'object') {
      continue;
    }

    const { id, motionId, driver, trigger, stagger, tracks, timelineId, primary, lifecycle, playback } = motion;
    const effectiveId = id ?? motionId;

    if (typeof effectiveId !== 'string' || effectiveId === '') {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'motionId is required and must be a non-empty string.',
        path: `${motionPath}.${id !== undefined ? 'id' : 'motionId'}`
      });
    } else {
      if (seenMotionIds.has(effectiveId)) {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: `Duplicate motionId '${effectiveId}' found.`,
          path: `${motionPath}.${id !== undefined ? 'id' : 'motionId'}`
        });
      }
      seenMotionIds.add(effectiveId);
    }

    if (isV4 || (driver === undefined && trigger !== undefined)) {
      // Forbidden v2/v3 fields in v4
      if (driver !== undefined) {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: '"driver" is a v2/v3 field, not valid in v4 — motions always have a trigger, no driver wrapper needed.',
          path: `${motionPath}.driver`
        });
      }
      if (timelineId !== undefined) {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: '"timelineId" is a v2/v3 field, not valid in v4 — tracks under the same motion share a trigger automatically.',
          path: `${motionPath}.timelineId`
        });
      }
      if (primary !== undefined) {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: '"primary" is a v2/v3 field, not valid in v4.',
          path: `${motionPath}.primary`
        });
      }
      if (lifecycle !== undefined) {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: '"lifecycle" is a v2/v3 field, not valid in v4.',
          path: `${motionPath}.lifecycle`
        });
      }
      if (playback !== undefined) {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: '"playback" is a v2/v3 field, not valid in v4.',
          path: `${motionPath}.playback`
        });
      }

      if (trigger === undefined || trigger === null) {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: 'trigger is required on every motion in v4.',
          path: `${motionPath}.trigger`
        });
      } else if (typeof trigger !== 'object') {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: 'trigger must be an object.',
          path: `${motionPath}.trigger`
        });
      } else if (!trigger.type || typeof trigger.type !== 'string') {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: 'trigger.type is required and must be a string.',
          path: `${motionPath}.trigger.type`
        });
      }
    } else {
      // Legacy v3 driver validation
      if (driver === undefined || driver === null) {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: 'driver is required on every motion.',
          path: `${motionPath}.driver`
        });
      } else if (typeof driver !== 'object') {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: 'driver must be an object.',
          path: `${motionPath}.driver`
        });
      } else {
        const { type, trigger: driverTrigger, sectionId, timelineId: dTimelineId, primary: driverPrimary } = driver;
        if (type !== 'timeline' && type !== 'delegate') {
          errors.push({
            ruleId: 'motion-structure',
            severity: 'error',
            message: `driver.type must be 'timeline' or 'delegate'. Got: ${JSON.stringify(type)}`,
            path: `${motionPath}.driver.type`
          });
        } else if (type === 'delegate') {
          if (driverTrigger !== undefined) {
            errors.push({
              ruleId: 'motion-structure',
              severity: 'error',
              message: `Motion "${effectiveId || i}": trigger is not valid on driver.type "delegate"`,
              path: `${motionPath}.driver.trigger`
            });
          }
          if (sectionId !== undefined) {
            errors.push({
              ruleId: 'motion-structure',
              severity: 'error',
              message: `Motion "${effectiveId || i}": sectionId is not valid on driver.type "delegate"`,
              path: `${motionPath}.driver.sectionId`
            });
          }
          if (dTimelineId !== undefined) {
            errors.push({
              ruleId: 'motion-structure',
              severity: 'error',
              message: `Motion "${effectiveId || i}": timelineId is not valid on driver.type "delegate"`,
              path: `${motionPath}.driver.timelineId`
            });
          }
          if (driverPrimary !== undefined) {
            errors.push({
              ruleId: 'motion-structure',
              severity: 'error',
              message: `Motion "${effectiveId || i}": primary is not valid on driver.type "delegate"`,
              path: `${motionPath}.driver.primary`
            });
          }
          if (stagger !== undefined) {
            errors.push({
              ruleId: 'motion-structure',
              severity: 'error',
              message: `Motion "${effectiveId || i}": stagger is not valid on driver.type "delegate"`,
              path: `${motionPath}.stagger`
            });
          }
        }
      }
    }

    validateTracksArray(tracks, `${motionPath}.tracks`, effectiveId || i);
  }

  // Validate top-level bare tracks if present
  if (Array.isArray(schema.tracks)) {
    validateTracksArray(schema.tracks, 'tracks', 'top-level');
  }

  return errors;
}
