/**
 * Rule: motion-structure
 * Performs structural validation for templates, motions, drivers, and track template references.
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

  // 2. Validate motions structure
  const seenMotionIds = new Set();
  const motions = Array.isArray(schema.motions) ? schema.motions : [];

  for (const [i, motion] of motions.entries()) {
    const motionPath = `motions[${i}]`;
    if (!motion || typeof motion !== 'object') {
      continue;
    }

    const { motionId, driver, stagger, tracks } = motion;

    // Validate motionId — required, unlike templateId no longer optional-with-fallback
    if (typeof motionId !== 'string' || motionId === '') {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'motionId is required and must be a non-empty string.',
        path: `${motionPath}.motionId`
      });
    } else {
      if (seenMotionIds.has(motionId)) {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: `Duplicate motionId '${motionId}' found.`,
          path: `${motionPath}.motionId`
        });
      }
      seenMotionIds.add(motionId);
    }

    // Validate driver
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
      const { type, trigger: driverTrigger, sectionId, timelineId, primary: driverPrimary } = driver;
      if (type !== 'timeline' && type !== 'delegate') {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: `driver.type must be 'timeline' or 'delegate'. Got: ${JSON.stringify(type)}`,
          path: `${motionPath}.driver.type`
        });
      } else if (type === 'delegate') {
        // Delegate constraints
        if (driverTrigger !== undefined) {
          errors.push({
            ruleId: 'motion-structure',
            severity: 'error',
            message: `Motion "${motionId || i}": trigger is not valid on driver.type "delegate"`,
            path: `${motionPath}.driver.trigger`
          });
        }
        if (sectionId !== undefined) {
          errors.push({
            ruleId: 'motion-structure',
            severity: 'error',
            message: `Motion "${motionId || i}": sectionId is not valid on driver.type "delegate"`,
            path: `${motionPath}.driver.sectionId`
          });
        }
        if (timelineId !== undefined) {
          errors.push({
            ruleId: 'motion-structure',
            severity: 'error',
            message: `Motion "${motionId || i}": timelineId is not valid on driver.type "delegate"`,
            path: `${motionPath}.driver.timelineId`
          });
        }
        if (driverPrimary !== undefined) {
          errors.push({
            ruleId: 'motion-structure',
            severity: 'error',
            message: `Motion "${motionId || i}": primary is not valid on driver.type "delegate"`,
            path: `${motionPath}.driver.primary`
          });
        }
        if (stagger !== undefined) {
          errors.push({
            ruleId: 'motion-structure',
            severity: 'error',
            message: `Motion "${motionId || i}": stagger is not valid on driver.type "delegate"`,
            path: `${motionPath}.stagger`
          });
        }
      }
    }

    // Validate tracks array
    if (tracks === undefined || tracks === null) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: `Motion "${motionId || i}": tracks must have at least 1 entry`,
        path: `${motionPath}.tracks`
      });
    } else if (!Array.isArray(tracks)) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'tracks must be an array.',
        path: `${motionPath}.tracks`
      });
    } else if (tracks.length < 1) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: `Motion "${motionId || i}": tracks must have at least 1 entry`,
        path: `${motionPath}.tracks`
      });
    } else {
      // Validate tracks template references
      for (const [j, track] of tracks.entries()) {
        if (!track || typeof track !== 'object') continue;

        if (typeof track.id !== 'string' || track.id === '') {
          errors.push({
            ruleId: 'motion-structure',
            severity: 'error',
            message: `Motion "${motionId || i}": track.id is required and must be a non-empty string.`,
            path: `${motionPath}.tracks[${j}].id`
          });
        }

        if (track.use !== undefined) {
          if (!seenTemplateIds.has(track.use)) {
            errors.push({
              ruleId: 'motion-structure',
              severity: 'error',
              message: `Track references non-existent templateId '${track.use}'.`,
              path: `${motionPath}.tracks[${j}].use`
            });
          }
        }
      }
    }
  }

  return errors;
}
