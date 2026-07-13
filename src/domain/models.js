/**
 * Domain Models - Functional Implementation
 * 
 * All models are created via factory functions returning plain objects.
 * Behavior is implemented as pure functions operating on these objects.
 * No classes, no methods, no mutation.
 */

// ============================================================================
// MotionProject
// ============================================================================

/**
 * Creates a MotionProject from parsed schema data.
 * 
 * @param {Object} params
 * @param {number} params.schemaVersion
 * @param {number|null} params.perspective
 * @param {Array} params.templates - Array of template objects
 * @param {Array} params.motions - Array of motion objects
 * @returns {Object} MotionProject data object
 */
export function createMotionProject({ schemaVersion, perspective = null, templates = [], motions = [] }) {
  return {
    schemaVersion,
    perspective,
    templates: new Map(templates.map(t => [t.templateId, t])),
    motions: new Map(motions.map(m => [m.motionId, m]))
  };
}

/**
 * Gets a motion by ID from the project.
 * 
 * @param {Object} project - MotionProject object
 * @param {string} motionId
 * @returns {Object|undefined} Motion object or undefined
 */
export function getMotion(project, motionId) {
  return project?.motions?.get(motionId);
}

/**
 * Gets a template by ID from the project.
 * 
 * @param {Object} project - MotionProject object
 * @param {string} templateId
 * @returns {Object|undefined} Template object or undefined
 */
export function getTemplate(project, templateId) {
  return project?.templates?.get(templateId);
}

/**
 * Gets all motions as an array preserving insertion order.
 * 
 * @param {Object} project - MotionProject object
 * @returns {Array} Array of motion objects
 */
export function getMotionsList(project) {
  return project?.motions ? Array.from(project.motions.values()) : [];
}

// ============================================================================
// MotionTemplate
// ============================================================================

/**
 * Creates a MotionTemplate object.
 * 
 * @param {Object} params
 * @param {string} params.templateId
 * @param {number|null} params.duration
 * @param {string|null} params.transformOrigin
 * @param {Object} params.keyframes
 * @returns {Object} MotionTemplate data object
 */
export function createMotionTemplate({ templateId, duration = null, transformOrigin = null, keyframes = {} }) {
  return {
    templateId,
    duration,
    transformOrigin,
    keyframes
  };
}

// ============================================================================
// MotionDefinition
// ============================================================================

/**
 * Creates a MotionDefinition object.
 * 
 * @param {Object} params
 * @param {string} params.motionId
 * @param {Object} params.driver - Driver object (timeline/delegate/manual)
 * @param {number|null} params.stagger
 * @param {Array} params.tracks - Array of track objects
 * @returns {Object} MotionDefinition data object
 */
export function createMotionDefinition({ motionId, driver, stagger = null, tracks = [] }) {
  return {
    motionId,
    driver,
    stagger,
    tracks
  };
}

/**
 * Gets a track by ID from a motion.
 * 
 * @param {Object} motion - MotionDefinition object
 * @param {string} trackId
 * @returns {Object|undefined} Track object or undefined
 */
export function getTrack(motion, trackId) {
  return motion?.tracks?.find(t => t.id === trackId);
}

/**
 * Checks if a motion uses a timeline driver.
 * 
 * @param {Object} motion - MotionDefinition object
 * @returns {boolean}
 */
export function isTimeline(motion) {
  return motion?.driver?.type === 'timeline';
}

/**
 * Checks if a motion uses a scroll trigger on timeline driver.
 * 
 * @param {Object} motion - MotionDefinition object
 * @returns {boolean}
 */
export function isScroll(motion) {
  return isTimeline(motion) && motion.driver.trigger?.type === 'scroll';
}

/**
 * Checks if a motion uses a delegate driver.
 * 
 * @param {Object} motion - MotionDefinition object
 * @returns {boolean}
 */
export function isDelegate(motion) {
  return motion?.driver?.type === 'delegate';
}

/**
 * Checks if a motion uses a manual driver.
 * 
 * @param {Object} motion - MotionDefinition object
 * @returns {boolean}
 */
export function isManual(motion) {
  return motion?.driver?.type === 'manual';
}

// ============================================================================
// Drivers
// ============================================================================

/**
 * Creates a base driver object.
 * 
 * @param {string} type
 * @returns {Object} Driver data object
 */
export function createDriver(type) {
  return { type };
}

/**
 * Creates a timeline driver object.
 * 
 * @param {Object} raw - Raw driver config
 * @returns {Object} TimelineDriver data object
 */
export function createTimelineDriver(raw = {}) {
  return {
    type: 'timeline',
    sectionId: raw.sectionId || null,
    timelineId: raw.timelineId || null,
    primary: !!raw.primary,
    trigger: raw.trigger || null,
    ...raw
  };
}

/**
 * Creates a delegate driver object.
 * 
 * @param {Object} raw - Raw driver config
 * @returns {Object} DelegateDriver data object
 */
export function createDelegateDriver(raw = {}) {
  return {
    type: 'delegate',
    ...raw
  };
}

/**
 * Creates a manual driver object.
 * 
 * @param {Object} raw - Raw driver config
 * @returns {Object} ManualDriver data object
 */
export function createManualDriver(raw = {}) {
  return {
    type: 'manual',
    ...raw
  };
}

// ============================================================================
// Trigger Configs
// ============================================================================

/**
 * Creates a scroll trigger config.
 * 
 * @param {Object} raw - Raw trigger config
 * @returns {Object} ScrollTriggerConfig data object
 */
export function createScrollTriggerConfig(raw = {}) {
  return {
    type: 'scroll',
    ...raw
  };
}

/**
 * Creates a time trigger config.
 * 
 * @param {Object} raw - Raw trigger config
 * @returns {Object} TimeTriggerConfig data object
 */
export function createTimeTriggerConfig(raw = {}) {
  return {
    type: 'time',
    ...raw
  };
}

// ============================================================================
// MotionTrack
// ============================================================================

/**
 * Creates a MotionTrack object.
 * 
 * @param {Object} params
 * @param {string} params.id
 * @param {string|null} params.use - Template ID to use
 * @param {number|null} params.duration
 * @param {string|null} params.transformOrigin
 * @param {Object} params.keyframes
 * @returns {Object} MotionTrack data object
 */
export function createMotionTrack({ id, use = null, duration = null, transformOrigin = null, keyframes = {} }) {
  return {
    id,
    use,
    duration,
    transformOrigin,
    keyframes
  };
}
