import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

function clamp01(val) {
  return Math.max(0, Math.min(1, Number(val) || 0));
}

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
    this.#timeline = gsap.timeline({
      repeat: this.#config.repeat ?? 0,
      yoyo: !!this.#config.yoyo,
      repeatDelay: this.#config.repeatDelay ?? 0,
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
