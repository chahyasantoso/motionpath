import { gsap } from 'gsap';

export class TrackGroup {
  #masterTimeline;
  #proxies = new Map();
  #tracks = new Map();

  constructor(masterTimeline) {
    this.#masterTimeline = masterTimeline;
  }

  mount(track, position) {
    track._mount(this);
    const tween = gsap.to(track, { progress: 1, ease: 'none' });
    this.#proxies.set(track.id, tween);
    this.#tracks.set(track.id, track);
    this.#masterTimeline.add(tween, position);
  }

  unmount(track) {
    const tween = this.#proxies.get(track.id);
    if (tween) {
      this.#masterTimeline.remove(tween);
      tween.kill();
      this.#proxies.delete(track.id);
    }
    this.#tracks.delete(track.id);
    track._unmount();
  }

  getTrack(trackId) {
    return this.#tracks.get(trackId);
  }

  _mountChild(child, spawnOffset) {
    this.mount(child, `>${spawnOffset}`);
  }

  _unmountChild(child) {
    this.unmount(child);
  }

  destroy() {
    for (const tween of this.#proxies.values()) {
      tween.kill();
    }
    this.#proxies.clear();
    for (const track of this.#tracks.values()) {
      track._unmount();
    }
    this.#tracks.clear();
  }
}

export class Motion {
  id;
  trigger;
  #group;
  #active = false;
  #initialTracks = [];
  #masterTimeline;

  constructor({ id, triggerDelegate, lazy = false }, deps = {}) {
    this.id = id;
    this.trigger = triggerDelegate;
    if (!lazy) {
      this.init(deps.resolveElement ?? (() => null));
    }
  }

  init(resolveElement) {
    if (this.#active) {
      this.destroy();
    }
    this.#active = true;
    this.#masterTimeline = this.trigger.build(resolveElement);
    this.#group = new TrackGroup(this.#masterTimeline);
    for (const { track, position } of this.#initialTracks) {
      this.#group.mount(track, position);
    }
    if (this.#masterTimeline.scrollTrigger) {
      this.#masterTimeline.scrollTrigger.refresh();
      this.#masterTimeline.scrollTrigger.update();
    }
  }

  mount(track, position) {
    // Keep track in initial tracks configuration if not already present
    if (!this.#initialTracks.some((t) => t.track.id === track.id)) {
      this.#initialTracks.push({ track, position });
    }
    if (this.#active) {
      this.#group.mount(track, position);
    }
  }

  unmount(track) {
    this.#initialTracks = this.#initialTracks.filter((t) => t.track.id !== track.id);
    if (this.#active) {
      this.#group.unmount(track);
    }
  }

  getTrack(trackId) {
    if (this.#active) {
      return this.#group.getTrack(trackId);
    }
    const found = this.#initialTracks.find((t) => t.track.id === trackId);
    return found ? found.track : null;
  }

  _mountChild(child, spawnOffset) {
    if (this.#active) {
      this.#group._mountChild(child, spawnOffset);
    }
  }

  _unmountChild(child) {
    if (this.#active) {
      this.#group._unmountChild(child);
    }
  }

  play() {
    this.trigger?.play?.();
  }

  pause() {
    this.trigger?.pause?.();
  }

  destroy() {
    if (!this.#active) return;
    if (this.#group) {
      this.#group.destroy();
      this.#group = null;
    }
    try {
      if (typeof this.trigger.destroy === 'function') {
        this.trigger.destroy();
      } else {
        this.trigger?.pause?.();
      }
    } catch (e) {
      /* ignore */
    }
    this.#masterTimeline = null;
    this.#active = false;
  }
}
