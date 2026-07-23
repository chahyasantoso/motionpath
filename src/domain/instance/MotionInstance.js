import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { buildTrackTweenSync } from '../../usecases/BuildTrackTween.js';
import { composePatch } from '../../usecases/ComposeTrackPatch.js';
import { resolveTrack } from '../../usecases/ResolveTrack.js';
import { defaultGaplessLayoutDelegate } from './GaplessLayoutDelegate.js';

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
  #parent = null; // public-read via getter, set only internally by addChild

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
    this.delayTween = null;
    this.paddingCallback = null;
    this.layoutDelegate = context.layoutDelegate ?? config.layoutDelegate ?? defaultGaplessLayoutDelegate;

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
    const owns = this.#ownsTrigger(config);

    if (driverType === 'timeline' || driverType === 'gsap-timeline') {
      // Only configure repeat/yoyo/repeatDelay when this instance owns its
      // driver. Grouped members have _suppressDriver set by the engine so
      // their own timelines stay as plain holders; TimelineGroupController
      // configures the master timeline instead.
      if (owns) {
        this.timeline
          .repeat(trigger.repeat ?? 0)
          .yoyo(!!trigger.yoyo)
          .repeatDelay(trigger.repeatDelay ?? 0);

        if (trigger.autoplay ?? config.autoplay ?? true) {
          this.timeline.play();
        }
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

      if (owns) {
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
    if (this.#destroyed) return;
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

    // Placement math is delegated to this.layoutDelegate (default:
    // GaplessLayoutDelegate) rather than hardcoded here. See
    // LayoutDelegate.js for the contract and why the "frontmost + stagger"
    // reasoning below now lives in GaplessLayoutDelegate.computeSpawnDelay
    // instead of inline.
    const stagger = this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
    const calculatedDelay = targetConfig.delay ??
      this.layoutDelegate.computeSpawnDelay(this.children, { stagger, schemaMotion: this.schemaMotion });

    const child = this.#deps.mountInstance(targetMotionId, {
      ...targetConfig,
      delay: calculatedDelay,
      parentId: this.id
    });

    child.#parent = this;
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

    // Delegate computes the reflow plan while `child` is still present in
    // this.children (matches the contract: computeReflow receives the full
    // live set INCLUDING the removed child, so it can determine rank). See
    // LayoutDelegate.js for the contract and GaplessLayoutDelegate.js for
    // the rank/ordering reasoning that used to live inline here.
    const stagger = this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
    const targets = this.layoutDelegate.computeReflow(
      this.children, child, { stagger, schemaMotion: this.schemaMotion }
    );

    this.children.splice(idx, 1);
    this.#pendingRemovals.add(child);

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

    return Promise.all(targets.map(({ child, delay }) => {
      if (child.currentDelay === undefined) {
        child.currentDelay = child.config.delay || 0;
      }
      if (child.delayTween) child.delayTween.kill();
      child.currentDelay = delay;

      // Short-circuit: no tween needed when transition duration is zero.
      if (duration === 0) {
        child.timeline.startTime(delay);
        this.timeline.time(this.timeline.time());
        return Promise.resolve();
      }

      return new Promise(resolve => {
        child.delayTween = gsap.to(child.timeline, {
          startTime: delay,
          duration,
          ease,
          onUpdate: () => {
            this.timeline.time(this.timeline.time());
          },
          onComplete: () => {
            resolve();
          }
        });
      });
    }));
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;

    // Notify the engine BEFORE tearing down state so it can unregister this
    // instance while the object is still structurally intact.
    const hadActiveSubscribers = Array.from(this.#subscribers.values())
      .reduce((sum, set) => sum + set.size, 0) > 0;
    if (this.#onSubscriberChange && hadActiveSubscribers) {
      this.#onSubscriberChange(this, false);
    }

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

    this.#parent = null;
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

  get parent() {
    return this.#parent;
  }
}
