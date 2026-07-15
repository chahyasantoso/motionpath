import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { buildTrackTweenSync } from '../../usecases/BuildTrackTween.js';
import { composePatch } from '../../usecases/ComposeTrackPatch.js';
import { resolveTrack } from '../../usecases/ResolveTrack.js';

export class MotionInstance {
  static #idCounter = 0;
  static #generateUniqueId() {
    return `inst-${++MotionInstance.#idCounter}`;
  }

  static #resolveTriggerRef(value, deps, fallbackId) {
    if (value === undefined || value === null) return deps.resolveElement(fallbackId);
    if (typeof value === 'boolean') return value;
    return deps.resolveElement(value);
  }
  #subscribers = new Map(); // trackId -> Set<wrapper>
  #childListeners = new Set();
  #onSubscriberChange;
  #deps;
  #scrollTrigger = null;
  #pendingRemovals = new Set(); // children mid-reflow, not yet detached from timeline
  #destroyed = false;

  constructor(motionId, config, schemaMotion, context) {
    this.id = MotionInstance.#generateUniqueId();
    this.motionId = motionId;
    this.config = config || {};
    this.schemaMotion = schemaMotion;
    this.deps = {
      resolveElement: context.resolveElement,
      mountInstance: context.mountInstance
    };
    this.templates = context.project?.templates || {};
    this.children = [];
    this.tracksMap = new Map();
    this.currentDelay = config.delay ?? undefined;
    this.isAutoStagger = config.isAutoStagger ?? true;
    this.delayTween = null;
    this.paddingCallback = null;

    this.#deps = this.deps;
    this.#onSubscriberChange = context.onSubscriberChange;

    // 1. Build timeline & tracks
    this.#buildTimeline(this.templates);

    // 2. Set up driver specific behavior
    this.#setupDriver(this.config);
  }

  #buildTimeline(templates) {
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
      onUpdate: () => this.broadcast()
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

    this.tracks = resolvedTracks;
  }

  #ownsTrigger(config) {
    return !config.parentId && !config._suppressDriver;
  }

  #setupDriver(config) {
    const driverType = this.schemaMotion.driver?.type;
    const trigger = this.schemaMotion.driver?.trigger || {};

    if (driverType === 'timeline' || driverType === 'gsap-timeline') {
      this.timeline
        .repeat(trigger.repeat ?? 0)
        .yoyo(!!trigger.yoyo)
        .repeatDelay(trigger.repeatDelay ?? 0);

      // Auto-play if not a child instance and autoplay is enabled
      const shouldPlay = this.#ownsTrigger(config) && (config.autoplay ?? true);
      if (shouldPlay) {
        this.timeline.play();
      }
    } else if (driverType === 'scroll' || driverType === 'gsap-scroll') {
      const resolvedConfig = {
        ...trigger,
        trigger: MotionInstance.#resolveTriggerRef(
          config.trigger ?? trigger.trigger ?? trigger.startTrigger,
          this.#deps,
          this.schemaMotion.driver?.sectionId
        ),
      };

      if (trigger.pin !== undefined) {
        resolvedConfig.pin = MotionInstance.#resolveTriggerRef(
          config.pin ?? trigger.pin,
          this.#deps,
          this.schemaMotion.driver?.sectionId
        );
      }

      if (trigger.endTrigger !== undefined) {
        resolvedConfig.endTrigger = MotionInstance.#resolveTriggerRef(
          config.endTrigger ?? trigger.endTrigger,
          this.#deps,
          this.schemaMotion.driver?.sectionId
        );
      }

      if (this.#ownsTrigger(config)) {
        if (trigger.scrub) {
          this.#scrollTrigger = ScrollTrigger.create({
            ...resolvedConfig,
            animation: this.timeline
          });
        } else {
          this.timeline
            .repeat(trigger.repeat ?? 0)
            .yoyo(!!trigger.yoyo)
            .repeatDelay(trigger.repeatDelay ?? 0);

          this.#scrollTrigger = ScrollTrigger.create({
            trigger: resolvedConfig.trigger,
            start: trigger.start,
            toggleActions: trigger.toggleActions,
            animation: this.timeline
          });
        }
      }
    }
  }

  // Playback control
  play() {
    const driverType = this.schemaMotion.driver?.type;
    if (driverType === 'timeline' || driverType === 'gsap-timeline') {
      this.timeline.play();
    }
  }

  pause() {
    const driverType = this.schemaMotion.driver?.type;
    if (driverType === 'timeline' || driverType === 'gsap-timeline') {
      this.timeline.pause();
    }
  }

  seek(progress) {
    this.timeline.progress(progress);
  }

  onComplete(callback) {
    const driverType = this.schemaMotion.driver?.type;
    if (driverType === 'timeline' || driverType === 'gsap-timeline') {
      this.timeline.eventCallback('onComplete', callback);
    }
  }

  // Scroll Trigger specific
  disableTrigger() {
    if (this.#scrollTrigger) {
      this.#scrollTrigger.disable(false);
    }
  }

  enableTrigger() {
    if (this.#scrollTrigger) {
      this.#scrollTrigger.enable();
    }
  }

  // Subscribers
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

    if (!this.#subscribers.has(trackId)) {
      this.#subscribers.set(trackId, new Set());
    }
    this.#subscribers.get(trackId).add(wrapper);

    if (this.#onSubscriberChange) {
      const total = Array.from(this.#subscribers.values()).reduce((sum, set) => sum + set.size, 0);
      this.#onSubscriberChange(this, total > 0);
    }

    const currentSnapshot = this.getCurrentSnapshot(trackId);
    callback(currentSnapshot);

    return () => {
      const trackSubscribers = this.#subscribers.get(trackId);
      if (trackSubscribers) {
        trackSubscribers.delete(wrapper);
        if (trackSubscribers.size === 0) {
          this.#subscribers.delete(trackId);
        }
      }
      if (this.#onSubscriberChange) {
        const total = Array.from(this.#subscribers.values()).reduce((sum, set) => sum + set.size, 0);
        this.#onSubscriberChange(this, total > 0);
      }
    };
  }

  getCurrentSnapshot(trackId) {
    const trackBuild = this.tracksMap.get(trackId);
    if (!trackBuild) return null;

    const { _gsap, ...rest } = trackBuild.proxy;
    return {
      ...rest,
      progress: this.timeline.progress()
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
      const trackSubscribers = this.#subscribers.get(trackId);
      if (trackSubscribers) {
        trackSubscribers.forEach(callback => callback({ trackId, data: snapshot }));
      }
    }
  }

  // Children/composition
  onChildChange(callback) {
    this.#childListeners.add(callback);
    return () => this.#childListeners.delete(callback);
  }

  #staggerDelay(index) {
    const stagger = this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
    return index * stagger;
  }

  addChild(motionIdOrConfig, config) {
    if (this.#destroyed) {
      throw new Error(`addChild: instance "${this.id}" is destroyed.`);
    }

    let targetMotionId = this.motionId;
    let targetConfig = {};

    if (typeof motionIdOrConfig === 'string') {
      targetMotionId = motionIdOrConfig;
      targetConfig = config || {};
    } else if (typeof motionIdOrConfig === 'object') {
      targetConfig = motionIdOrConfig;
    }

    const isAutoStagger = targetConfig.delay === undefined;
    const autoIndex = this.children.filter(c => c.isAutoStagger).length;
    const calculatedDelay = targetConfig.delay ?? this.#staggerDelay(autoIndex);

    const child = this.#deps.mountInstance(targetMotionId, {
      ...targetConfig,
      delay: calculatedDelay,
      isAutoStagger,
      parentId: this.id
    });

    this.children.push(child);

    // Native GSAP Nesting
    child.timeline.paused(false);
    child.timeline.delay(0);
    this.timeline.add(child.timeline, calculatedDelay);

    this.#childListeners.forEach(cb => cb());

    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx === -1 || this.#pendingRemovals.has(child)) return;

    this.children.splice(idx, 1);
    this.#pendingRemovals.add(child);

    const targets = this.children
      .filter(c => c.isAutoStagger)
      .map((c, autoIdx) => ({ child: c, delay: this.#staggerDelay(autoIdx) }));

    this.#finishRemoval(child, targets);
  }

  async #finishRemoval(child, targets) {
    try {
      await this.#reflowSiblings(targets);
    } catch (err) {
      console.error(`MotionInstance "${this.id}": reflow failed for removed child`, err);
      // Structural removal must not depend on animation succeeding.
    } finally {
      if (this.#destroyed) return; // instance torn down mid-reflow, nothing left to touch

      this.timeline.remove(child.timeline);
      child.destroy();
      this.#pendingRemovals.delete(child);
      this.#childListeners.forEach(cb => cb());
    }
  }

  #reflowSiblings(targets) {
    const transition = this.schemaMotion.staggerTransition ?? {};
    const duration = transition.duration ?? 0;
    const ease = transition.ease ?? 'power2.out';

    // kalau duration 0 masih kurang efisien karena 
    // masih bikin object tween meskipun langsung resolve
    return Promise.all(targets.map(({ child, delay }) => {
      if (child.currentDelay === undefined) {
        child.currentDelay = child.config.delay || 0;
      }
      if (child.delayTween) child.delayTween.kill();

      return new Promise(resolve => {
        child.delayTween = gsap.to(child.timeline, {
          startTime: delay,
          duration,
          ease,
          onUpdate: () => {
            this.timeline.time(this.timeline.time());
          },
          onComplete: () => {
            child.currentDelay = delay;
            resolve();
          }
        });
      });
    }));
  }

  destroy() {
    this.#destroyed = true;

    const hadActiveSubscribers = Array.from(this.#subscribers.values())
      .reduce((sum, set) => sum + set.size, 0) > 0;

    if (this.#scrollTrigger) {
      this.#scrollTrigger.kill();
      this.#scrollTrigger = null;
    }

    this.timeline.kill();
    for (const track of this.tracksMap.values()) {
      track.tween.kill();
    }
    this.tracksMap.clear();

    this.children.forEach(child => {
      if (child.delayTween) child.delayTween.kill();
      child.destroy();
    });
    this.children.length = 0;

    this.#pendingRemovals.forEach(child => {
      if (child.delayTween) child.delayTween.kill();
      child.destroy();
    });
    this.#pendingRemovals.clear();

    if (this.#onSubscriberChange && hadActiveSubscribers) {
      this.#onSubscriberChange(this, false);
    }
  }

  get requiredTriggerIds() {
    const trigger = this.schemaMotion.driver?.trigger || {};
    const ids = [];
    ['trigger', 'startTrigger', 'endTrigger', 'pin'].forEach(key => {
      const val = trigger[key];
      if (typeof val === 'string' && val !== '') {
        ids.push(val);
      }
    });
    return ids;
  }

  get isDestroyed() {
    return this.#destroyed;
  }
}
