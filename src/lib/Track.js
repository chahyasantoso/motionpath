import { composePatch } from '../usecases/ComposeTrackPatch.js';
import { eventBus } from './helpers.js';

function clamp01(val) {
  return Math.max(0, Math.min(1, Number(val) || 0));
}

export function mergePatches(patchA, patchB) {
  if (!patchA) return patchB || {};
  if (!patchB) return patchA || {};
  const merged = { ...patchA };
  for (const [k, v] of Object.entries(patchB)) {
    if (k === 'filter' && typeof v === 'object' && v !== null) {
      merged.filter = { ...(merged.filter || {}), ...v };
    } else {
      merged[k] = v;
    }
  }
  return merged;
}

export class Track {
  #id;
  #interpolationTimeline;
  #proxyState;
  #plugins;
  #resolvedTrack;

  #host = null;
  #attachedTo = null;
  #attachedChildren = new Set();
  #parent = null;
  #children = new Map();
  #subscribers = new Set();

  /**
   * @param {object} params
   * @param {string} params.id
   * @param {gsap.core.Timeline|gsap.core.Tween} params.interpolationTimeline
   * @param {object} params.proxyState
   * @param {Array} params.plugins
   * @param {object} params.resolvedTrack
   */
  constructor({ id, interpolationTimeline, proxyState, plugins, resolvedTrack }) {
    this.#id = id;
    this.#interpolationTimeline = interpolationTimeline;
    this.#proxyState = proxyState;
    this.#plugins = plugins;
    this.#resolvedTrack = resolvedTrack;
  }

  get id() {
    return this.#id;
  }

  get parent() {
    return this.#parent;
  }

  /**
   * Primary playhead accessor.
   * - No args: returns current progress (0..1).
   * - With arg: sets progress (clamped 0..1), recomposes internally, and notifies subscribers.
   * @param {number} [p]
   * @returns {number|void}
   */
  progress(p) {
    if (p === undefined) {
      return this.#interpolationTimeline.progress();
    }
    this.#interpolationTimeline.progress(clamp01(p));
    this.#notify();
  }

  getSnapshot() {
    const { _gsap, ...rest } = this.#proxyState;
    return {
      ...rest,
      progress: this.#interpolationTimeline.progress(),
    };
  }

  compose(rawData) {
    const source = rawData ?? this.getSnapshot();
    let patch = composePatch(this.#plugins, source, this.#resolvedTrack, `track "${this.#id}"`);
    for (const child of this.#attachedChildren) {
      patch = mergePatches(patch, child.compose());
    }
    return patch;
  }

  subscribe(cb) {
    if (this.#attachedTo) {
      throw new Error(
        `Track "${this.#id}" is attached to "${this.#attachedTo.id}" — subscribe to the host instead.`
      );
    }
    this.#subscribers.add(cb);
    cb(this.getSnapshot());
    return () => {
      this.#subscribers.delete(cb);
    };
  }

  #notify() {
    const snapshot = this.getSnapshot();
    for (const cb of this.#subscribers) {
      cb(snapshot);
    }
  }

  // --- Mount lifecycle (Motion only) ---
  _mount(host) {
    if (this.#host) {
      throw new Error(`Track "${this.#id}" already mounted to "${this.#host.id ?? 'another motion'}"`);
    }
    this.#host = host;
  }

  _unmount() {
    this.#host = null;
  }

  get isMounted() {
    return this.#host !== null;
  }

  // --- Cross-track merge: "living together" ---
  attach(host) {
    if (this.#attachedTo) {
      throw new Error(`Track "${this.#id}" already attached to "${this.#attachedTo.id}"`);
    }
    this.#attachedTo = host;
    host.#attachedChildren.add(this);
  }

  detach(host) {
    if (this.#attachedTo === host) {
      this.#attachedTo = null;
      host.#attachedChildren.delete(this);
    }
  }

  get isAttached() {
    return this.#attachedTo !== null;
  }

  // --- Composition: "moving together" ---
  #computeSpawnOffset(stagger = 0) {
    if (this.#children.size === 0) return 0;
    let maxOffset = 0;
    for (const child of this.#children.values()) {
      const childOffset = child._currentOffset ?? 0;
      if (childOffset > maxOffset) {
        maxOffset = childOffset;
      }
    }
    return maxOffset + stagger;
  }

  #rankOf(child) {
    const childrenArr = Array.from(this.#children.values());
    return childrenArr.indexOf(child);
  }

  #reflow() {
    let offset = 0;
    for (const child of this.#children.values()) {
      child._currentOffset = offset;
      offset += child._staggerOffset ?? 0;
    }
  }

  addChild(child, opts = {}) {
    if (child.#parent) {
      throw new Error(`Track "${child.id}" is already a child of "${child.#parent.id}"`);
    }
    child.#parent = this;
    const stagger = opts.stagger ?? 0;
    child._staggerOffset = stagger;

    const spawnOffset = this.#computeSpawnOffset(stagger);
    child._currentOffset = spawnOffset;

    this.#children.set(child.id, child);
    if (this.#host) {
      this.#host._mountChild(child, spawnOffset);
    }
    eventBus.emit('child:spawned', { id: child.id, parentId: this.#id });
  }

  removeChild(id) {
    const child = this.#children.get(id);
    if (!child) return;
    const rank = this.#rankOf(child);
    this.#children.delete(id);
    child.#parent = null;

    if (rank > 0) {
      this.#reflow();
    }
    eventBus.emit('child:removing', { id: child.id, parentId: this.#id });
  }

  destroy() {
    this.#subscribers.clear();
    try {
      this.#interpolationTimeline?.kill();
    } catch (e) {
      /* ignore */
    }
  }
}
