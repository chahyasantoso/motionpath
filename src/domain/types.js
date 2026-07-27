/**
 * Public v4 schema and plugin contracts. Runtime validation lives in
 * validators/index.js; these JSDoc types mirror the executable contract.
 *
 * @typedef {{ p: number, v: number|string, ease?: string }} Stop
 * @typedef {{ stops: Stop[] }} AnimatedProperty
 * @typedef {{ x: number, y: number, z?: number, ctrlX?: number, ctrlY?: number, ctrlZ?: number }} PathNode
 * @typedef {{ points: PathNode[], stops: Stop[], autoRotate?: boolean, anchor?: 'center'|'none'|{xPercent: number, yPercent: number} }} PathProperty
 * @typedef {Object<string, AnimatedProperty|PathProperty>} Keyframes
 *
 * @typedef {{ type: 'scroll', scrub: boolean|number, trigger?: string|Element, start?: string, end?: string, endTrigger?: string|Element, pin?: boolean|string|Element, pinSpacing?: boolean, toggleActions?: string }} ScrollTrigger
 * @typedef {{ type: 'time', repeat?: number, yoyo?: boolean, repeatDelay?: number, delay?: number, autoplay?: boolean }} TimeTrigger
 * @typedef {{ type: 'manual' }} ManualTrigger
 * @typedef {ScrollTrigger|TimeTrigger|ManualTrigger} Trigger
 *
 * @typedef {{ templateId: string, duration?: number, transformOrigin?: string, keyframes?: Keyframes }} MotionTemplate
 * @typedef {{ id: string, use?: string, duration?: number, transformOrigin?: string, keyframes?: Keyframes }} MotionTrack
 * @typedef {{ id: string, trigger: Trigger, stagger?: number, staggerTransition?: {duration?: number, ease?: string}, tracks: MotionTrack[] }} MotionDefinition
 * @typedef {{ schemaVersion: 4, projectId?: string, perspective?: number, templates?: MotionTemplate[], motions: MotionDefinition[], tracks?: MotionTrack[] }} MotionProject
 *
 * @typedef {{ keys: string[], lazy?: boolean, claimsKey: (key: string) => boolean, load?: () => Promise<void>, prepare?: (track: MotionTrack) => void|Promise<void>, contribute: (propKey: string, stops: Stop[], track: MotionTrack) => {percentPatch?: Object, tweenVars?: Object}, compose: (rawData: Object, track: MotionTrack) => Object, stage?: string, priority?: number, outputs?: Object, internalKeys?: string[] }} AnimationPlugin
 */
export {};
