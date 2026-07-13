export class MotionProject {
  constructor({ schemaVersion, perspective = null, templates = [], motions = [] }) {
    this.schemaVersion = schemaVersion;
    this.perspective = perspective;
    this.templates = new Map(templates.map(t => [t.templateId, t]));
    this.motions = new Map(motions.map((m, i) => [m.motionId ?? String(i), m]));
  }

  getMotion(motionId) {
    return this.motions.get(motionId);
  }

  getTemplate(templateId) {
    return this.templates.get(templateId);
  }

  getMotionsList() {
    return Array.from(this.motions.values());
  }
}

export class MotionTemplate {
  constructor({ templateId, duration = null, transformOrigin = null, keyframes = {} }) {
    this.templateId = templateId;
    this.duration = duration;
    this.transformOrigin = transformOrigin;
    this.keyframes = keyframes;
  }
}

export class MotionDefinition {
  constructor({ motionId, driver, stagger = null, tracks = [] }) {
    this.motionId = motionId;
    this.driver = driver; // MotionDriver
    this.stagger = stagger;
    this.tracks = tracks; // MotionTrack[]
  }

  getTrack(trackId) {
    return this.tracks.find(t => t.id === trackId);
  }

  isTimeline() {
    return this.driver.type === 'timeline';
  }

  isScroll() {
    return this.driver.type === 'timeline' && this.driver.trigger?.type === 'scroll';
  }

  isDelegate() {
    return this.driver.type === 'delegate';
  }

  isManual() {
    return this.driver.type === 'manual';
  }
}

export class MotionDriver {
  constructor(type) {
    this.type = type;
  }
}

export class TimelineDriver extends MotionDriver {
  constructor(raw = {}) {
    super('timeline');
    this.sectionId = raw.sectionId || null;
    this.timelineId = raw.timelineId || null;
    this.primary = !!raw.primary;
    this.trigger = raw.trigger || null;
    Object.assign(this, raw);
  }
}

export class DelegateDriver extends MotionDriver {
  constructor(raw = {}) {
    super('delegate');
    Object.assign(this, raw);
  }
}

export class ManualDriver extends MotionDriver {
  constructor(raw = {}) {
    super('manual');
    Object.assign(this, raw);
  }
}

export class TriggerConfig {
  constructor(type) {
    this.type = type;
  }
}

export class ScrollTriggerConfig extends TriggerConfig {
  constructor(raw = {}) {
    super('scroll');
    Object.assign(this, raw);
  }
}

export class TimeTriggerConfig extends TriggerConfig {
  constructor(raw = {}) {
    super('time');
    Object.assign(this, raw);
  }
}

export class MotionTrack {
  constructor({ id, use = null, duration = null, transformOrigin = null, keyframes = {} }) {
    this.id = id;
    this.use = use;
    this.duration = duration;
    this.transformOrigin = transformOrigin;
    this.keyframes = keyframes;
  }

  resolve(templates) {
    let template = null;
    if (this.use) {
      if (templates && typeof templates.get === 'function') {
        template = templates.get(this.use);
      } else if (Array.isArray(templates)) {
        template = templates.find(t => t && t.templateId === this.use);
      }
    }

    const duration = this.duration !== undefined
      ? this.duration
      : (template && template.duration !== undefined ? template.duration : undefined);

    const transformOrigin = this.transformOrigin !== undefined
      ? this.transformOrigin
      : (template && template.transformOrigin !== undefined ? template.transformOrigin : undefined);

    const templateKeyframes = template && template.keyframes ? template.keyframes : {};
    const mergedKeyframes = { ...templateKeyframes };
    
    if (this.keyframes) {
      for (const key of Object.keys(this.keyframes)) {
        mergedKeyframes[key] = this.keyframes[key];
      }
    }

    return {
      id: this.id,
      use: this.use,
      duration,
      transformOrigin,
      keyframes: mergedKeyframes
    };
  }
}
