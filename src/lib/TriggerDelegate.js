import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
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
    this.#timeline.eventCallback("onComplete", cb);
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
    const trigger = this.#config.trigger;
    const scrollTrigger = {
      start: this.#config.start,
      end: this.#config.end,
      scrub: this.#config.scrub,
      pin: this.#config.pin === true ? trigger : this.#config.pin,
      pinSpacing: this.#config.pinSpacing,
      toggleActions: this.#config.toggleActions,
    };
    if (trigger) scrollTrigger.trigger = trigger;
    if (this.#config.endTrigger)
      scrollTrigger.endTrigger = this.#config.endTrigger;
    this.#timeline = gsap.timeline({ scrollTrigger });
    this.#controls = new AutonomousTimelineControls(this.#timeline);
    return this.#timeline;
  }
  play() {
    this.#controls?.play();
  }
  pause() {
    this.#controls?.pause();
  }
  seek(p) {
    this.#controls?.seek(p);
  }
  reverse() {
    this.#controls?.reverse();
  }
  onComplete(cb) {
    this.#controls?.onComplete(cb);
  }
  destroy() {
    this.#timeline?.scrollTrigger?.kill(true);
    this.#timeline?.kill();
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
    const c = this.#config;
    this.#timeline = gsap.timeline({
      repeat: c.repeat ?? 0,
      yoyo: !!c.yoyo,
      repeatDelay: c.repeatDelay ?? 0,
      delay: typeof c.delay === "number" ? c.delay : 0,
      paused: !(c.autoplay ?? true),
    });
    this.#controls = new AutonomousTimelineControls(this.#timeline);
    return this.#timeline;
  }
  play() {
    this.#controls?.play();
  }
  pause() {
    this.#controls?.pause();
  }
  seek(p) {
    this.#controls?.seek(p);
  }
  reverse() {
    this.#controls?.reverse();
  }
  onComplete(cb) {
    this.#controls?.onComplete(cb);
  }
  destroy() {
    this.#timeline?.kill();
  }
}
export class ManualTriggerDelegate {
  #timeline;
  #controls;
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
  progress(p) {
    return this.seek(p);
  }
  play() {
    this.#controls?.play();
  }
  pause() {
    this.#controls?.pause();
  }
  reverse() {
    this.#controls?.reverse();
  }
  onComplete(cb) {
    this.#controls?.onComplete(cb);
  }
  destroy() {
    this.#timeline?.kill();
  }
}
export function createTriggerDelegateRegistry(
  initial = [
    ["scroll", (c) => new ScrollTriggerDelegate(c)],
    ["time", (c) => new TimeTriggerDelegate(c)],
    ["manual", (c) => new ManualTriggerDelegate(c)],
  ],
) {
  const registry = new Map(initial);
  return {
    get: (type) => registry.get(type),
    has: (type) => registry.has(type),
    set: (type, factory) => registry.set(type, factory),
    delete: (type) => registry.delete(type),
    entries: () => registry.entries(),
  };
}
export const triggerDelegateRegistry = createTriggerDelegateRegistry();
export function registerTriggerDelegate(type, factory) {
  triggerDelegateRegistry.set(type, factory);
}
