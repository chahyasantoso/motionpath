import { gsap } from "../adapters/gsapPlatform.js";

export class Motion {
  id; #triggerDelegate; #binding = null; #runtime = null; #active = false; #initialTracks = []; #masterTimeline; #staggerTransition; #graphOrder; #proxies = new Map(); #tracks = new Map(); #destroyed = false; #host = null;
  constructor({ id, triggerDelegate, staggerTransition, graphOrder = [] }) { this.id = id; this.#triggerDelegate = triggerDelegate; this.#staggerTransition = staggerTransition ?? {}; this.#graphOrder = [...graphOrder]; }
  init() { if (this.#destroyed) throw new Error(`Motion "${this.id}" is destroyed and cannot be re-initialized.`); const scheduled = this.#active ? this.#captureSchedule() : null; if (this.#active) this.#teardownSchedule(); this.#active = true; this.#masterTimeline = this.#triggerDelegate.build(); for (const { track, position } of scheduled ?? this.#initialTracks) this.#schedule(track, position); }
  setGraphBinding(binding) { if (this.#binding === binding) return; if (this.#binding) this.#binding.destroy(); if (this.#destroyed) { binding?.destroy?.(); this.#binding = null; return; } this.#binding = binding ?? null; }
  setGraphRuntime(runtime) { if (this.#runtime === runtime) return; this.#runtime?.dispose(); if (this.#destroyed) { runtime?.dispose?.(); this.#runtime = null; return; } this.#runtime = runtime ?? null; }
  get graphRuntime() { return this.#runtime; }
  get graphBinding() { return this.#binding ?? this.#runtime?.binding ?? null; }
  get usePublisherRendering() { return Boolean(this.#runtime) && !this.#runtime.isDisposed && this.#runtime.usePublisher === true; }
  subscribe(trackId, callback) { if (this.usePublisherRendering) { const unsubscribe = this.#runtime.subscribe(trackId, callback); const current = this.#runtime.getPatch(trackId); if (current) callback(current); return unsubscribe; } const track = this.getTrack(trackId); return track && !track.isDestroyed ? track.subscribe(callback) : () => {}; }
  compose(trackId, rawData) { if (this.usePublisherRendering) return this.#runtime.compose(trackId, rawData); const track = this.getTrack(trackId); if (!track) throw new Error(`Motion "${this.id}" has no track "${trackId}".`); return track.compose(rawData); }
  getPatch(trackId) { return this.#runtime?.getPatch(trackId) ?? null; }
  get isDestroyed() { return this.#destroyed; } get isActive() { return this.#active; } get isMounted() { return this.#host !== null; } get duration() { return this.#masterTimeline?.duration?.() ?? 0; }
  progress(value) { if (value === undefined) return this.#masterTimeline?.progress?.() ?? 0; this.#masterTimeline?.progress(Math.max(0, Math.min(1, Number(value) || 0))); }
  applyGraphOrder(order) { this.#graphOrder = [...order]; }
  mount(track, position = 0) { if (this.#destroyed) throw new Error(`Motion "${this.id}" is destroyed.`); if (this.#initialTracks.some((entry) => entry.track.id === track.id)) throw new Error(`Motion "${this.id}" already contains track "${track.id}".`); this.#initialTracks.push({ track, position }); if (this.#active) this.#schedule(track, position); }
  unmount(track) { this.#initialTracks = this.#initialTracks.filter((t) => t.track.id !== track.id); this.#unschedule(track); track.destroy?.(); }
  getTrack(trackId) { return this.#tracks.get(trackId) ?? this.#initialTracks.find(({ track }) => track.id === trackId)?.track ?? null; }
  get graphOrder() { return [...this.#graphOrder]; } composeGraph() { const patches = new Map(); for (const id of this.#graphOrder) { const track = this.#tracks.get(id); if (track) track.compose(undefined, patches); } return patches; }
  _mount(host) { if (this.#destroyed) throw new Error(`Motion "${this.id}" is destroyed.`); if (this.#host) throw new Error(`Motion "${this.id}" is already mounted.`); this.#host = host; }
  _unmount() { this.#host = null; }
  /** Explicit composite ownership API. Track and adapters should call these rather than underscored aliases. */
  mountChild(child, position = 0) { this.#schedule(child, position); }
  unmountChild(child) { this.#unschedule(child); }
  reflowChild(child, newPosition) { this.#reflowChildInternal(child, newPosition); }
  /** Compatibility aliases retained until the Track topology extraction lands. */
  _mountChild(child, position) { this.mountChild(child, position); }
  _unmountChild(child) { this.unmountChild(child); }
  _reflowChild(child, newPosition) { this.reflowChild(child, newPosition); }
  #reflowChildInternal(child, newPosition) { const tween = this.#proxies.get(child.id); if (!tween) return; const duration = this.#staggerTransition.duration ?? 0; if (duration <= 0) { this.#masterTimeline?.add(tween, newPosition); this.#masterTimeline?.render(this.#masterTimeline.time(), true, true); return; } const timeline = this.#masterTimeline; if (!timeline) return; gsap.to(tween, { startTime: newPosition, duration, ease: this.#staggerTransition.ease ?? "power2.out", onUpdate: () => timeline?.render(timeline.time(), true, true) }); }
  #captureSchedule() { const declared = new Map(this.#initialTracks.map(({ track, position }) => [track.id, position])); const entries = []; for (const [id, track] of this.#tracks) { if (track.isDestroyed) continue; entries.push({ track, position: declared.get(id) ?? track.currentOffset ?? 0 }); } for (const { track, position } of this.#initialTracks) if (!this.#tracks.has(track.id) && !track.isDestroyed) entries.push({ track, position }); return entries; }
  #teardownSchedule() { for (const tween of this.#proxies.values()) tween.kill(); this.#proxies.clear(); for (const track of this.#tracks.values()) if (track.isMounted) track._unmount(); this.#tracks.clear(); this.#triggerDelegate.destroy(); this.#masterTimeline = null; }
  #schedule(track, position) { if (!this.#active || this.#tracks.has(track.id)) return; track._mount(this); const tween = gsap.to(track, { progress: 1, ease: "none", duration: track.duration || 0, paused: false }); this.#proxies.set(track.id, tween); this.#tracks.set(track.id, track); this.#masterTimeline?.add(tween, position); this.#masterTimeline?.render(this.#masterTimeline.time(), true, true); }
  #unschedule(track) { const tween = this.#proxies.get(track.id); if (tween) { this.#masterTimeline?.remove(tween); tween.kill(); this.#proxies.delete(track.id); } this.#tracks.delete(track.id); if (track.isMounted) track._unmount(); this.#masterTimeline?.render(this.#masterTimeline.time(), true, true); }
  play() { this.#triggerDelegate.play(); } pause() { this.#triggerDelegate.pause(); } seek(p) { this.#triggerDelegate.seek(p); } reverse() { this.#triggerDelegate.reverse(); } onComplete(cb) { this.#triggerDelegate.onComplete(cb); }
  destroy() { if (this.#destroyed) return; this.#destroyed = true; this.#runtime?.dispose(); this.#runtime = null; this.#binding?.destroy(); this.#binding = null; this.#teardownSchedule(); for (const { track } of this.#initialTracks) track.destroy?.(); this.#initialTracks = []; this.#active = false; this.#host = null; }
}
