/**
 * @typedef {Object} MotionProject
 * @property {number} schemaVersion
 * @property {number|null} perspective
 * @property {Map<string, MotionTemplate>} templates
 * @property {Map<string, MotionDefinition>} motions
 */

/**
 * @typedef {Object} MotionTemplate
 * @property {string} templateId
 * @property {number|null} duration
 * @property {string|null} transformOrigin
 * @property {Object} keyframes
 */

/**
 * @typedef {Object} MotionDefinition
 * @property {string} motionId
 * @property {TimelineDriver|DelegateDriver|ManualDriver} driver
 * @property {number|null} stagger
 * @property {Object|null} staggerTransition
 * @property {MotionTrack[]} tracks
 */

/**
 * @typedef {Object} MotionTrack
 * @property {string} id
 * @property {string|null} use
 * @property {number|null} duration
 * @property {string|null} transformOrigin
 * @property {Object} keyframes
 */

/**
 * @typedef {Object} TimelineDriver
 * @property {'timeline'} type
 * @property {string|null} sectionId
 * @property {string|null} timelineId
 * @property {boolean} primary
 * @property {ScrollTriggerConfig|TimeTriggerConfig|null} trigger
 */

/**
 * @typedef {Object} DelegateDriver
 * @property {'delegate'} type
 */

/**
 * @typedef {Object} ManualDriver
 * @property {'manual'} type
 */

/**
 * @typedef {Object} ScrollTriggerConfig
 * @property {'scroll'} type
 * @property {string|Element|boolean} [trigger]
 * @property {string|Element} [startTrigger]
 * @property {string|Element} [endTrigger]
 * @property {string|Element|boolean} [pin]
 * @property {boolean} [pinSpacing]
 * @property {boolean|number} [scrub]
 * @property {string} [start]
 * @property {string} [end]
 * @property {string} [toggleActions]
 * @property {boolean|Object} [snap]
 * @property {number} [delay]
 */

/**
 * @typedef {Object} TimeTriggerConfig
 * @property {'time'} type
 * @property {number} [duration]
 * @property {number} [repeat]
 * @property {boolean} [yoyo]
 * @property {number} [repeatDelay]
 * @property {number} [delay]
 * @property {boolean} [autoplay]
 */

/**
 * @typedef {Object} Plugin
 * @property {string[]} keys
 * @property {boolean} [lazy]
 * @property {function(string): boolean} claimsKey
 * @property {function(): Promise<void>} [load]
 * @property {function(Object, string, string): void} [contribute]
 * @property {function(Object, Object, Object, string): Object} [compose]
 */

// This file only contains JSDoc types for editor autocompletion and static analysis.
export {};
