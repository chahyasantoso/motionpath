import { gsap } from 'gsap';

export class TrackGroup {
  #masterTimeline;
  #proxies = new Map();
  #tracks = new Map();
  #staggerTransition;

  constructor(masterTimeline, staggerTransition = {}) {
    this.#masterTimeline = masterTimeline;
    this.#staggerTransition = staggerTransition;
  }

  mount(track, position) {
    track._mount(this);
    const tween = gsap.to(track, {
      progress: 1,
      ease: 'none',
      duration: track.duration || 0,
      paused: false,
    });
    this.#proxies.set(track.id, tween);
    this.#tracks.set(track.id, track);
    this.#masterTimeline.add(tween, position);
    this.#masterTimeline.render(this.#masterTimeline.time(), true, true);
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
    this.#masterTimeline.render(this.#masterTimeline.time(), true, true);
  }

  getTrack(trackId) {
    return this.#tracks.get(trackId);
  }

  // Repositions an ALREADY-mounted child's tween on the master timeline
  // (e.g. after a sibling removal triggers a reflow). Does not create a new
  // tween or re-run track._mount().
  //
  // transition = { duration, ease } from the motion's schema-level
  // staggerTransition config. Zero/omitted duration: instant reposition
  // (gsap.timeline.add() on an already-mounted tween just moves it) plus a
  // forced re-render. Nonzero duration: animate the tween's own startTime
  // property toward newPosition — mirrors v3's
  // `gsap.to(child.timeline, { startTime: delay, duration, ease })` pattern,
  // adapted to v4's plain-Tween shape (startTime() is a getter/setter on
  // GSAP's Animation base class, so it works the same on a Tween as it did
  // on v3's nested child Timeline). Each tick force-renders the master so
  // the sibling visibly slides rather than snapping.
  // transition is TrackGroup's own staggerTransition (from the motion's
  // schema config, passed in at construction). Zero/omitted duration:
  // instant reposition (gsap.timeline.add() on an already-mounted tween just
  // moves it) plus a forced re-render. Nonzero duration: animate the tween's
  // own startTime property toward newPosition — mirrors v3's
  // `gsap.to(child.timeline, { startTime: delay, duration, ease })` pattern,
  // adapted to v4's plain-Tween shape (startTime() is a getter/setter on
  // GSAP's Animation base class, so it works the same on a Tween as it did
  // on v3's nested child Timeline). Each tick force-renders the master so
  // the sibling visibly slides rather than snapping.
  _reflowChild(track, newPosition) {
    const tween = this.#proxies.get(track.id);
    if (!tween) return;

    const duration = this.#staggerTransition.duration ?? 0;
    if (duration <= 0) {
      this.#masterTimeline.add(tween, newPosition);
      this.#masterTimeline.render(this.#masterTimeline.time(), true, true);
      return;
    }

    const ease = this.#staggerTransition.ease ?? 'power2.out';
    gsap.to(tween, {
      startTime: newPosition,
      duration,
      ease,
      onUpdate: () => {
        this.#masterTimeline.render(this.#masterTimeline.time(), true, true);
      },
    });
  }

  _mountChild(child, spawnOffset) {
    this.mount(child, spawnOffset);
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
  #staggerTransition;

  constructor({ id, triggerDelegate, staggerTransition }) {
    this.id = id;
    this.trigger = triggerDelegate;
    this.#staggerTransition = staggerTransition ?? {};
  }

  init(resolveElement) {
    if (this.#active) {
      this.destroy();
    }
    this.#active = true;
    this.#masterTimeline = this.trigger.build(resolveElement);
    this.#group = new TrackGroup(this.#masterTimeline, this.#staggerTransition);
    for (const { track, position } of this.#initialTracks) {
      this.#group.mount(track, position);
    }
    // Force master timeline to span exactly [0, 1] so that progress-fraction
    // positions (stagger offsets from GaplessLayoutDelegate) map correctly to
    // timeline percentages — mirrors v3's tl.addLabel('end', 1) pattern.
    this.#masterTimeline.addLabel('end', 1);
  }

  mount(track, position) {
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

  _reflowChild(child, newPosition) {
    if (this.#active) {
      this.#group._reflowChild(child, newPosition);
    }
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
