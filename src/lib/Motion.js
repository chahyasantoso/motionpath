import { gsap } from 'gsap';

export class TrackGroup {
  #masterTimeline; #proxies = new Map(); #tracks = new Map(); #staggerTransition;
  constructor(masterTimeline, staggerTransition = {}) { this.#masterTimeline = masterTimeline; this.#staggerTransition = staggerTransition; }
  mount(track, position) {
    track._mount(this);
    const tween = gsap.to(track, { progress: 1, ease: 'none', duration: track.duration || 0, paused: false });
    this.#proxies.set(track.id, tween); this.#tracks.set(track.id, track);
    this.#masterTimeline.add(tween, position); this.#masterTimeline.render(this.#masterTimeline.time(), true, true);
  }
  unmount(track) {
    const tween = this.#proxies.get(track.id);
    if (tween) { this.#masterTimeline.remove(tween); tween.kill(); this.#proxies.delete(track.id); }
    this.#tracks.delete(track.id); track._unmount(); this.#masterTimeline.render(this.#masterTimeline.time(), true, true);
  }
  getTrack(trackId) { return this.#tracks.get(trackId); }
  _reflowChild(track, newPosition) {
    const tween = this.#proxies.get(track.id); if (!tween) return;
    const duration = this.#staggerTransition.duration ?? 0;
    if (duration <= 0) { this.#masterTimeline.add(tween, newPosition); this.#masterTimeline.render(this.#masterTimeline.time(), true, true); return; }
    gsap.to(tween, { startTime: newPosition, duration, ease: this.#staggerTransition.ease ?? 'power2.out', onUpdate: () => this.#masterTimeline.render(this.#masterTimeline.time(), true, true) });
  }
  _mountChild(child, spawnOffset) { this.mount(child, spawnOffset); }
  _unmountChild(child) { this.unmount(child); }
  destroy() { for (const tween of this.#proxies.values()) tween.kill(); this.#proxies.clear(); for (const track of this.#tracks.values()) track._unmount(); this.#tracks.clear(); }
}

export class Motion {
  id; #trigger;
  #group; #active = false; #initialTracks = []; #masterTimeline; #staggerTransition;
  constructor({ id, triggerDelegate, staggerTransition }) { this.id = id; this.#trigger = triggerDelegate; this.#staggerTransition = staggerTransition ?? {}; }
  init() {
    if (this.#active) this.destroy();
    this.#active = true;
    this.#masterTimeline = this.#trigger.build();
    this.#group = new TrackGroup(this.#masterTimeline, this.#staggerTransition);
    for (const { track, position } of this.#initialTracks) this.#group.mount(track, position);
  }
  mount(track, position) { if (!this.#initialTracks.some((t) => t.track.id === track.id)) this.#initialTracks.push({ track, position }); if (this.#active) this.#group.mount(track, position); }
  unmount(track) { this.#initialTracks = this.#initialTracks.filter((t) => t.track.id !== track.id); if (this.#active) this.#group.unmount(track); }
  getTrack(trackId) { if (this.#active) return this.#group.getTrack(trackId); const found = this.#initialTracks.find((t) => t.track.id === trackId); return found ? found.track : null; }
  play() { this.#trigger.play(); }
  pause() { this.#trigger.pause(); }
  seek(p) { this.#trigger.seek(p); }
  reverse() { this.#trigger.reverse(); }
  onComplete(cb) { this.#trigger.onComplete(cb); }
  destroy() {
    if (!this.#active) return;
    if (this.#group) { this.#group.destroy(); this.#group = null; }
    this.#trigger.destroy(); this.#masterTimeline = null; this.#active = false;
  }
}
