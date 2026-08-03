import { gsap } from "gsap";

export class TrackGroup {
  #masterTimeline; #proxies = new Map(); #tracks = new Map(); #staggerTransition; #graphOrder;
  constructor(masterTimeline, staggerTransition = {}, graphOrder = []) { this.#masterTimeline = masterTimeline; this.#staggerTransition = staggerTransition; this.#graphOrder = [...graphOrder]; }
  mount(track, position) { if (this.#tracks.has(track.id)) throw new Error(`TrackGroup already contains track "${track.id}".`); track._mount(this); const tween = gsap.to(track, { progress: 1, ease: "none", duration: track.duration || 0, paused: false }); this.#proxies.set(track.id, tween); this.#tracks.set(track.id, track); this.#masterTimeline.add(tween, position); this.#masterTimeline.render(this.#masterTimeline.time(), true, true); }
  unmount(track) { const tween = this.#proxies.get(track.id); if (tween) { this.#masterTimeline.remove(tween); tween.kill(); this.#proxies.delete(track.id); } this.#tracks.delete(track.id); track._unmount(); this.#masterTimeline.render(this.#masterTimeline.time(), true, true); }
  getTrack(trackId) { return this.#tracks.get(trackId); }
  get graphOrder() { return [...this.#graphOrder]; }
  applyGraphOrder(order) { this.#graphOrder = [...order]; }
  composeGraph() { const patches = new Map(); for (const id of this.#graphOrder) { const track = this.#tracks.get(id); if (track) track.compose(undefined, patches); } return patches; }
  _reflowChild(track, newPosition) { const tween = this.#proxies.get(track.id); if (!tween) return; const duration = this.#staggerTransition.duration ?? 0; if (duration <= 0) { this.#masterTimeline.add(tween, newPosition); this.#masterTimeline.render(this.#masterTimeline.time(), true, true); return; } gsap.to(tween, { startTime: newPosition, duration, ease: this.#staggerTransition.ease ?? "power2.out", onUpdate: () => this.#masterTimeline.render(this.#masterTimeline.time(), true, true) }); }
  _mountChild(child, spawnOffset) { this.mount(child, spawnOffset); }
  _unmountChild(child) { this.unmount(child); }
  destroy() { for (const tween of this.#proxies.values()) tween.kill(); this.#proxies.clear(); for (const track of this.#tracks.values()) track._unmount(); this.#tracks.clear(); }
}

export class Motion {
  id; #triggerDelegate; #group; #binding = null; #active = false; #initialTracks = []; #masterTimeline; #staggerTransition; #graphOrder; #destroyed = false;
  constructor({ id, triggerDelegate, staggerTransition, graphOrder = [] }) { this.id = id; this.#triggerDelegate = triggerDelegate; this.#staggerTransition = staggerTransition ?? {}; this.#graphOrder = [...graphOrder]; }
  init() { if (this.#active) this.destroy(); this.#destroyed = false; this.#active = true; this.#masterTimeline = this.#triggerDelegate.build(); this.#group = new TrackGroup(this.#masterTimeline, this.#staggerTransition, this.#graphOrder); for (const { track, position } of this.#initialTracks) this.#group.mount(track, position); }
  setGraphBinding(binding) { if (this.#binding && this.#binding !== binding) this.#binding.destroy(); this.#binding = binding ?? null; }
  get graphBinding() { return this.#binding; }
  applyGraphOrder(order) { this.#graphOrder = [...order]; this.#group?.applyGraphOrder(order); }
  mount(track, position) { if (this.#destroyed) throw new Error(`Motion "${this.id}" is destroyed.`); if (this.#initialTracks.some((entry) => entry.track.id === track.id)) throw new Error(`Motion "${this.id}" already contains track "${track.id}".`); this.#initialTracks.push({ track, position }); if (this.#active) this.#group.mount(track, position); }
  unmount(track) { this.#initialTracks = this.#initialTracks.filter((t) => t.track.id !== track.id); if (this.#active) this.#group.unmount(track); track.destroy?.(); }
  getTrack(trackId) { if (this.#active) return this.#group.getTrack(trackId); const found = this.#initialTracks.find((t) => t.track.id === trackId); return found ? found.track : null; }
  get graphOrder() { return [...this.#graphOrder]; }
  composeGraph() { return this.#group?.composeGraph() ?? new Map(); }
  play() { this.#triggerDelegate.play(); }
  pause() { this.#triggerDelegate.pause(); }
  seek(p) { this.#triggerDelegate.seek(p); }
  reverse() { this.#triggerDelegate.reverse(); }
  onComplete(cb) { this.#triggerDelegate.onComplete(cb); }
  destroy() { if (this.#destroyed) return; this.#destroyed = true; this.#binding?.destroy(); this.#binding = null; if (this.#group) { this.#group.destroy(); this.#group = null; } for (const { track } of this.#initialTracks) track.destroy?.(); this.#initialTracks = []; this.#triggerDelegate.destroy(); this.#masterTimeline = null; this.#active = false; }
}
