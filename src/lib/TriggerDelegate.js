import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

function clamp01(val) {
  return Math.max(0, Math.min(1, Number(val) || 0));
}

const isDev = () => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
};

export class AutonomousTimelineControls {
  #timeline;

  constructor(timeline) {
    this.#timeline = timeline;
  }

  play() {
    this.#timeline.play();
  }

  pause() {
    this.#timeline.pause();
  }

  seek(p) {
    this.#timeline.progress(clamp01(p));
  }

  reverse() {
    this.#timeline.reverse();
  }

  onComplete(cb) {
    this.#timeline.eventCallback('onComplete', cb);
  }
}

export class ScrollTriggerDelegate {
  #config;
  #controls;
  #timeline;

  constructor(config = {}) {
    this.#config = config;
  }

  build() {
    const triggerEl = this.#config.trigger;
    const pinEl = this.#config.pin === true ? triggerEl : this.#config.pin;
    const endTriggerEl = this.#config.endTrigger;

    const scrollTriggerObj = {
      start: this.#config.start,
      end: this.#config.end,
      scrub: this.#config.scrub,
      pin: pinEl,
      pinSpacing: this.#config.pinSpacing,
      toggleActions: this.#config.toggleActions,
    };
    if (triggerEl) {
      scrollTriggerObj.trigger = triggerEl;
    }
    if (endTriggerEl) {
      scrollTriggerObj.endTrigger = endTriggerEl;
    }

    this.#timeline = gsap.timeline({
      scrollTrigger: scrollTriggerObj,
    });
    this.#controls = new AutonomousTimelineControls(this.#timeline);
    return this.#timeline;
  }

  play() { this.#controls?.play(); }
  pause() { this.#controls?.pause(); }
  seek(p) { this.#controls?.seek(p); }
  reverse() { this.#controls?.reverse(); }
  onComplete(cb) { this.#controls?.onComplete(cb); }

  destroy() {
    if (this.#timeline) {
      if (this.#timeline.scrollTrigger) {
        this.#timeline.scrollTrigger.kill(true); // true reverts styling and layout
      }
      this.#timeline.kill();
    }
  }
}

export class TimeTriggerDelegate {
  #config;
  #controls;
  #timeline;

  constructor(config = {}) {
    this.#config = config;
  }

  build() {
    const cfg = this.#config;

    // R-03: autoplay and delay were declared in types.js and shipped in demo
    // schemas, but build() read neither -- EVERY time motion autoplayed and
    // `autoplay: false` was a silent no-op. Both are honored now.
    // Default stays `true` so existing schemas that omit it are unchanged.
    const autoplay = cfg.autoplay ?? true;
    const delay = typeof cfg.delay === 'number' ? cfg.delay : 0;

    // `trigger.duration` has no coherent meaning on a master timeline whose
    // length is derived from its children. Rather than silently swallowing it
    // (the old behavior), say so out loud in dev. Promoting this to a hard
    // validator error is a Phase 2 decision, once demo schemas are migrated.
    if (isDev() && cfg.duration !== undefined) {
      console.warn(
        '[MotionPath] time trigger: `duration` is ignored. A time motion gets its length from the ' +
        '`duration` on each of its tracks. Remove trigger.duration.'
      );
    }

    this.#timeline = gsap.timeline({
      repeat: cfg.repeat ?? 0,
      yoyo: !!cfg.yoyo,
      repeatDelay: cfg.repeatDelay ?? 0,
      delay,
      paused: !autoplay,
    });
    this.#controls = new AutonomousTimelineControls(this.#timeline);
    return this.#timeline;
  }

  play() { this.#controls?.play(); }
  pause() { this.#controls?.pause(); }
  seek(p) { this.#controls?.seek(p); }
  reverse() { this.#controls?.reverse(); }
  onComplete(cb) { this.#controls?.onComplete(cb); }

  destroy() {
    this.#timeline?.kill();
  }
}

export class ManualTriggerDelegate {
  #timeline;

  build() {
    this.#timeline = gsap.timeline({ paused: true });
    return this.#timeline;
  }

  progress(p) {
    if (!this.#timeline) return 0;
    if (p === undefined) return this.#timeline.progress();
    this.#timeline.progress(clamp01(p));
  }

  // R-10 (partial): `seek` is the single playhead verb every other delegate
  // exposes. Manual now answers to it too, so app code can stop branching on
  // the concrete delegate class. `progress()` stays as the existing alias and
  // will be deprecated in Phase 2 when the delegate contract is unified.
  seek(p) {
    return this.progress(p);
  }

  destroy() {
    this.#timeline?.kill();
  }
}

export const triggerDelegateRegistry = new Map([
  ['scroll', (config) => new ScrollTriggerDelegate(config)],
  ['time', (config) => new TimeTriggerDelegate(config)],
  ['manual', (config) => new ManualTriggerDelegate(config)],
]);

export function registerTriggerDelegate(type, factory) {
  triggerDelegateRegistry.set(type, factory);
}
