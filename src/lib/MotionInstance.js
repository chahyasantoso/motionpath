import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { buildTrackTweenSync } from './builder.js';
import { composePatch } from './composePatch.js';
import { resolveTrack } from './templateResolver.js';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

function resolveTriggerRef(value, deps, fallbackId) {
  if (value === undefined || value === null) return deps.resolveElement(fallbackId);
  if (typeof value === 'boolean') return value;
  return deps.resolveElement(value);
}

let _idCounter = 0;
function generateUniqueId() {
  return `inst-${++_idCounter}`;
}

export class MotionInstance {
  constructor(motionId, config, schemaMotion, templates, deps, onSubscriberChange) {
    if (new.target === MotionInstance) {
      throw new TypeError("Cannot construct MotionInstance instances directly (Abstract Class).");
    }
    this.id = generateUniqueId();
    this.motionId = motionId;
    this.config = config || {};
    this.schemaMotion = schemaMotion;
    this.deps = deps;
    this.onSubscriberChange = onSubscriberChange;
    this.children = [];
    this.subscribers = new Set(); // Set<callback>
    this.tracksMap = new Map(); // trackId -> { proxy, tween, resolvedPlugins, resolvedTrack }
    this.childListeners = new Set();

    this._build(templates);
  }

  _build(templates) {
    const rawTracks = this.schemaMotion.tracks || [];
    const resolvedTracks = rawTracks.map(t => resolveTrack(t, templates));
    
    const trackTweens = [];
    for (const track of resolvedTracks) {
      const keyframes = track.keyframes || {};
      const tweenDuration = track.duration ?? this.schemaMotion.driver?.trigger?.duration ?? 1;

      const { proxy, tween, resolvedPlugins } = buildTrackTweenSync(
        track.id,
        keyframes,
        tweenDuration,
        track
      );

      this.tracksMap.set(track.id, { proxy, tween, resolvedPlugins, resolvedTrack: track });
      trackTweens.push(tween);
    }

    this.timeline = gsap.timeline({
      paused: true,
      onUpdate: () => {
        const parentTime = this.timeline.time();
        this.broadcast();
        this.children.forEach(child => {
          const childDelay = child.currentDelay ?? child.config.delay ?? 0;
          const childDuration = child.timeline.duration() || 1.0;
          const childTime = parentTime - childDelay;
          const childProgress = Math.max(0, Math.min(1, childTime / childDuration));
          child.seek(childProgress);
        });
      }
    });

    const trigger = this.schemaMotion.driver?.trigger || {};
    const finalDelay = this.config.delay ?? trigger.delay ?? 0;
    if (finalDelay > 0) {
      this.timeline.delay(finalDelay);
    }

    resolvedTracks.forEach((track, idx) => {
      const tween = trackTweens[idx];
      const offset = typeof this.schemaMotion.stagger === 'number' ? this.schemaMotion.stagger * idx : 0;
      this.timeline.add(tween, offset);
    });
  }

  onChildChange(callback) {
    this.childListeners.add(callback);
    return () => this.childListeners.delete(callback);
  }

  subscribe(trackId, callback) {
    const trackBuild = this.tracksMap.get(trackId);
    if (!trackBuild) {
      throw new Error(`subscribe: track "${trackId}" not found in instance.`);
    }

    const wrapper = (snapshot) => {
      if (snapshot.trackId === trackId) {
        callback(snapshot.data);
      }
    };
    
    callback._wrapper = wrapper;
    this.subscribers.add(wrapper);

    if (this.subscribers.size === 1 && this.onSubscriberChange) {
      this.onSubscriberChange(this, true);
    }

    // Replay current state immediately
    callback(this.getCurrentSnapshot(trackId));

    return () => {
      this.subscribers.delete(callback._wrapper);
      if (this.subscribers.size === 0 && this.onSubscriberChange) {
        this.onSubscriberChange(this, false);
      }
    };
  }

  getCurrentSnapshot(trackId) {
    const trackBuild = this.tracksMap.get(trackId);
    if (!trackBuild) return null;
    
    const progress = this.timeline.progress();
    return {
      ...trackBuild.proxy,
      progress
    };
  }

  compose(trackId, rawData) {
    const trackBuild = this.tracksMap.get(trackId);
    if (!trackBuild) return {};
    const source = rawData ?? { ...trackBuild.proxy, progress: this.timeline.progress() };
    
    return composePatch(
      trackBuild.resolvedPlugins,
      source,
      trackBuild.resolvedTrack,
      `instance "${this.id}", track "${trackId}"`
    );
  }

  broadcast() {
    for (const trackId of this.tracksMap.keys()) {
      const snapshot = this.getCurrentSnapshot(trackId);
      for (const callback of this.subscribers) {
        callback({ trackId, data: snapshot });
      }
    }
  }

  addChild(motionIdOrConfig, config) {
    let targetMotionId = this.motionId;
    let targetConfig = {};

    if (typeof motionIdOrConfig === 'string') {
      targetMotionId = motionIdOrConfig;
      targetConfig = config || {};
    } else if (typeof motionIdOrConfig === 'object') {
      targetConfig = motionIdOrConfig;
    }

    const stagger = this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
    const childIndex = this.children.length;
    const calculatedDelay = targetConfig.delay ?? (childIndex * stagger);

    const child = this.deps.mountInstance(targetMotionId, {
      ...targetConfig,
      delay: calculatedDelay,
      parentId: this.id
    });

    child.currentDelay = calculatedDelay;
    this.children.push(child);

    // Pad parent timeline duration to encompass child animations
    const childDuration = child.timeline.duration() || 1.0;
    const childEndTime = calculatedDelay + childDuration;
    const paddingCb = () => {};
    child.paddingCallback = paddingCb;
    this.timeline.add(paddingCb, childEndTime);

    // Notify child change listeners before refreshing ScrollTriggers
    this.childListeners.forEach(cb => cb());

    // Refresh ScrollTriggers to update the scroll heights and pinning markers
    if (typeof window !== 'undefined' && ScrollTrigger) {
      ScrollTrigger.refresh();
    }

    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      if (child.paddingCallback) {
        this.timeline.remove(child.paddingCallback);
      }
      child.destroy();

      // Smoothly animate currentDelay for sisa (remaining) children using GSAP
      const stagger = this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
      this.children.forEach((c, newIdx) => {
        const newDelay = newIdx * stagger;
        if (c.currentDelay === undefined) {
          c.currentDelay = c.config.delay || 0;
        }
        if (c.delayTween) c.delayTween.kill();
        c.delayTween = gsap.to(c, {
          currentDelay: newDelay,
          duration: 0.6,
          ease: 'power2.out',
          onUpdate: () => {
            const parentTime = this.timeline.time();
            const childDuration = c.timeline.duration() || 1.0;
            const childTime = parentTime - c.currentDelay;
            const childProgress = Math.max(0, Math.min(1, childTime / childDuration));
            c.seek(childProgress);
          }
        });
      });

      // Notify child change listeners before refreshing ScrollTriggers
      this.childListeners.forEach(cb => cb());

      // Refresh ScrollTriggers to update the scroll heights and pinning markers
      if (typeof window !== 'undefined' && ScrollTrigger) {
        ScrollTrigger.refresh();
      }
    }
  }

  seek(progress) {
    this.timeline.progress(progress);
  }

  destroy() {
    this.children.forEach(child => {
      if (child.delayTween) child.delayTween.kill();
      child.destroy();
    });
    this.children.length = 0;
    
    if (this.onSubscriberChange && this.subscribers.size > 0) {
      this.onSubscriberChange(this, false);
    }
    this.subscribers.clear();
    this.timeline.kill();
    for (const track of this.tracksMap.values()) {
      track.tween.kill();
    }
    this.tracksMap.clear();
  }
}

export class TimelineMotionInstance extends MotionInstance {
  constructor(motionId, config, schemaMotion, templates, deps, onSubscriberChange) {
    super(motionId, config, schemaMotion, templates, deps, onSubscriberChange);
    
    const trigger = schemaMotion.driver?.trigger || {};
    this.timeline
      .repeat(trigger.repeat ?? 0)
      .yoyo(!!trigger.yoyo)
      .repeatDelay(trigger.repeatDelay ?? 0);

    const shouldPlay = !config.parentId && (config.autoplay ?? true);
    if (shouldPlay) {
      this.timeline.play();
    }
  }

  play() {
    this.timeline.play();
  }

  pause() {
    this.timeline.pause();
  }

  onComplete(callback) {
    this.timeline.eventCallback('onComplete', callback);
  }
}

export class ScrollMotionInstance extends MotionInstance {
  constructor(motionId, config, schemaMotion, templates, deps, onSubscriberChange) {
    super(motionId, config, schemaMotion, templates, deps, onSubscriberChange);

    const trigger = schemaMotion.driver?.trigger || {};
    
    const resolvedConfig = {
      ...trigger,
      trigger: resolveTriggerRef(config.trigger ?? trigger.startTrigger, deps, schemaMotion.driver?.sectionId),
    };
    if (trigger.pin !== undefined) {
      resolvedConfig.pin = resolveTriggerRef(config.pin ?? trigger.pin, deps, schemaMotion.driver?.sectionId);
    }
    if (trigger.endTrigger !== undefined) {
      resolvedConfig.endTrigger = resolveTriggerRef(config.endTrigger ?? trigger.endTrigger, deps, schemaMotion.driver?.sectionId);
    }

    if (!config.parentId) {
      if (trigger.scrub) {
        this.scrollTrigger = ScrollTrigger.create({
          ...resolvedConfig,
          animation: this.timeline
        });
      } else {
        // scroll-observer / non-scrub
        this.timeline
          .repeat(trigger.repeat ?? 0)
          .yoyo(!!trigger.yoyo)
          .repeatDelay(trigger.repeatDelay ?? 0);

        this.scrollTrigger = ScrollTrigger.create({
          trigger: resolvedConfig.trigger,
          start: trigger.start,
          toggleActions: trigger.toggleActions,
          animation: this.timeline
        });
      }
    }
  }

  disableTrigger() {
    if (this.scrollTrigger) {
      this.scrollTrigger.disable(false);
    }
  }

  enableTrigger() {
    if (this.scrollTrigger) {
      this.scrollTrigger.enable();
    }
  }

  destroy() {
    if (this.scrollTrigger) {
      this.scrollTrigger.kill();
    }
    super.destroy();
  }
}

export class ManualMotionInstance extends MotionInstance {
  // Manual doesn't play automatically, only seeked
}
