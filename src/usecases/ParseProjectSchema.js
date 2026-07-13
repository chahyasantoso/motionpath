import {
  createMotionProject,
  createMotionTemplate,
  createMotionDefinition,
  createTimelineDriver,
  createDelegateDriver,
  createManualDriver,
  createScrollTriggerConfig,
  createTimeTriggerConfig,
  createMotionTrack
} from '../domain/models.js';

export function parseProjectSchema(schema) {
  if (!schema) return null;

  const templates = (schema.templates || []).map(t => {
    return createMotionTemplate({
      templateId: t.templateId,
      duration: t.duration,
      transformOrigin: t.transformOrigin,
      keyframes: t.keyframes
    });
  });

  const motions = (schema.motions || []).map(m => {
    let driver;
    const rawDriver = m.driver || {};
    const driverType = rawDriver.type;

    if (driverType === 'timeline' || driverType === 'gsap-timeline' || driverType === 'gsap-scroll') {
      let trigger = null;
      const rawTrigger = rawDriver.trigger;
      if (rawTrigger) {
        const isScroll = rawTrigger.type === 'scroll' || driverType === 'gsap-scroll';
        const isTime = rawTrigger.type === 'time' || driverType === 'gsap-timeline';
        
        if (isScroll) {
          trigger = createScrollTriggerConfig({ type: 'scroll', ...rawTrigger });
        } else if (isTime) {
          trigger = createTimeTriggerConfig({ type: 'time', ...rawTrigger });
        }
      }
      driver = createTimelineDriver({
        ...rawDriver,
        trigger
      });
    } else if (driverType === 'delegate') {
      driver = createDelegateDriver(rawDriver);
    } else {
      driver = createManualDriver(rawDriver);
    }

    const tracks = (m.tracks || []).map(t => {
      return createMotionTrack({
        id: t.id,
        use: t.use,
        duration: t.duration,
        transformOrigin: t.transformOrigin,
        keyframes: t.keyframes
      });
    });

    return createMotionDefinition({
      motionId: m.motionId,
      driver,
      stagger: m.stagger,
      staggerTransition: m.staggerTransition,
      tracks
    });
  });

  return createMotionProject({
    schemaVersion: schema.schemaVersion,
    perspective: schema.perspective,
    templates,
    motions
  });
}