import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

function clamp01(val) { return Math.max(0, Math.min(1, Number(val) || 0)); }

export class AutonomousTimelineControls {
  #timeline;
  constructor(timeline) { this.#timeline = timeline; }
  play() { this.#timeline.play(); }
  pause() { this.#timeline.pause(); }
  seek(p) { this.#timeline.progress(clamp01(p)); }
  reverse() { this.#timeline.reverse(); }
  onComplete(cb) { this.#timeline.eventCallback('onComplete', cb); }
}

export class ScrollTriggerDelegate {
  #config; #controls; #timeline;
  constructor(config = {}) { this.#config = config; }
  build() {
    const triggerEl = this.#config.trigger;
    const pinEl = this.#config.pin === true ? triggerEl : this.#config.pin;
    const scrollTriggerObj = {
      start: this.#config.start, end: this.#config.end, scrub: this.#config.scrub,
      pin: pinEl, pinSpacing: this.#config.pinSpacing, toggleActions: this.#config.toggleActions,
    };
    if (triggerEl) scrollTriggerObj.trigger = triggerEl;
    if (this.#config.endTrigger) scrollTriggerObj.endTrigger = this.#config.endTrigger;
    this.#timeline = gsap.timeline({ scrollTrigger: scrollTriggerObj });
    this.#controls = new AutonomousTimelineControls(this.#timeline);
    return this.#timeline;
  }
  play() { this.#controls?.play(); }
  pause() { this.#controls?.pause(); }
  seek(p) { this.#controls?.seek(p); }
  reverse() { this.#controls?.reverse(); }
  onComplete(cb) { this.#controls?.onComplete(cb); }
  destroy() {
    if (!this.#timeline) return;
    if (this.#timeline.scrollTrigger) this.#timeline.scrollTrigger.kill(true);
    this.#timeline.kill();
  }
}

export class TimeTriggerDelegate {
  #config; #controls; #timeline;
  constructor(config = {}) { this.#config = config; }
  build() {
    const cfg = this.#config;
    this.#timeline = gsap.timeline({
      repeat: cfg.repeat ?? 0, yoyo: !!cfg.yoyo, repeatDelay: cfg.repeatDelay ?? 0,
      delay: typeof cfg.delay === 'number' ? cfg.delay : 0,
      paused: !(cfg.autoplay ?? true),
    });
    this.#controls = new AutonomousTimelineControls(this.#timeline);
    return this.#timeline;
  }
  play() { this.#controls?.play(); }
  pause() { this.#controls?.pause(); }
  seek(p) { this.#controls?.seek(p); }
  reverse() { this.#controls?.reverse(); }
  onComplete(cb) { this.#controls?.onComplete(cb); }
  destroy() { this.#timeline?.kill(); }
}

export class ManualTriggerDelegate {
  #timeline; #controls;
  build() {
    this.#timeline = gsap.timeline({ paused: true });
    this.#controls = new AutonomousTimelineControls(this.#timeline);
    return this.#timeline;
  }
  seek(p) {
    if (!this.#timeline) return 0;
    if (p === undefined) return this.#timeline.progress();
    this.#controls.seek(p);
  }
  progress(p) { return this.seek(p); }
  play() { this.#controls?.play(); }
  pause() { this.#controls?.pause(); }
  reverse() { this.#controls?.reverse(); }
  onComplete(cb) { this.#controls?.onComplete(cb); }
  destroy() { this.#timeline?.kill(); }
}

export const triggerDelegateRegistry = new Map([
  ['scroll', (config) => new ScrollTriggerDelegate(config)],
  ['time', (config) => new TimeTriggerDelegate(config)],
  ['manual', (config) => new ManualTriggerDelegate(config)],
]);
export function registerTriggerDelegate(type, factory) { triggerDelegateRegistry.set(type, factory); }
