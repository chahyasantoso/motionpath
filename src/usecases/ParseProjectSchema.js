import {
  MotionProject,
  MotionTemplate,
  MotionDefinition,
  TimelineDriver,
  DelegateDriver,
  ManualDriver,
  ScrollTriggerConfig,
  TimeTriggerConfig,
  MotionTrack
} from '../domain/models.js';

export function parseProjectSchema(schema) {
  if (!schema) return null;

  const templates = (schema.templates || []).map(t => {
    return new MotionTemplate({
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
          trigger = new ScrollTriggerConfig({ type: 'scroll', ...rawTrigger });
        } else if (isTime) {
          trigger = new TimeTriggerConfig({ type: 'time', ...rawTrigger });
        }
      }
      driver = new TimelineDriver({
        ...rawDriver,
        trigger
      });
    } else if (driverType === 'delegate') {
      driver = new DelegateDriver(rawDriver);
    } else {
      driver = new ManualDriver(rawDriver);
    }

    const tracks = (m.tracks || []).map(t => {
      return new MotionTrack({
        id: t.id,
        use: t.use,
        duration: t.duration,
        transformOrigin: t.transformOrigin,
        keyframes: t.keyframes
      });
    });

    return new MotionDefinition({
      motionId: m.motionId,
      driver,
      stagger: m.stagger,
      tracks
    });
  });

  return new MotionProject({
    schemaVersion: schema.schemaVersion,
    perspective: schema.perspective,
    templates,
    motions
  });
}
