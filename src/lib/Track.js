import { composePatch } from '../usecases/ComposeTrackPatch.js';
import { eventBus } from './helpers.js';
import { defaultGaplessLayoutDelegate } from './GaplessLayoutDelegate.js';

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
  #parent = null;
  #children = new Map();
  #subscribers = new Set();
  #currentOffset = 0;
  #staggerOffset = 0;
  #layoutDelegate;
  #observed = new Map();
  #composing = false;

  /**
   * @param {object} params
   * @param {string} params.id
   * @param {gsap.core.Timeline|gsap.core.Tween} params.interpolationTimeline
   * @param {object} params.proxyState
   * @param {Array} params.plugins
   * @param {object} params.resolvedTrack
   * @param {import('./LayoutDelegate.js').LayoutDelegate} [params.layoutDelegate] - child-placement policy for addChild/removeChild. Defaults to gapless (frontmost + stagger, reflow-on-removal).
   */
  constructor({ id, interpolationTimeline, proxyState, plugins, resolvedTrack, layoutDelegate }) {
    this.#id = id;
    this.#interpolationTimeline = interpolationTimeline;
    this.#proxyState = proxyState;
    this.#plugins = plugins;
    this.#resolvedTrack = resolvedTrack;
    this.#layoutDelegate = layoutDelegate ?? defaultGaplessLayoutDelegate;
  }

  get id() {
    return this.#id;
  }

  get currentOffset() {
    return this.#currentOffset;
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

    // Cycle back-edge: we are being composed while already mid-compose higher
    // in the stack. Do NOT recurse into observed sources — return only this
    // track's own local (plugin-only) patch. See observe-fk-design.md §2.
    if (this.#composing) {
      return composePatch(this.#plugins, source, this.#resolvedTrack, `track "${this.#id}"`);
    }

    this.#composing = true;
    try {
      let patch = composePatch(this.#plugins, source, this.#resolvedTrack, `track "${this.#id}"`);
      // Fold each observed source in insertion order; each mapped patch applies
      // LAST (last-wins), so it can override this track's own fields.
      // NOTE: mapFn receives the source's COMPOSED patch, not its snapshot.
      for (const [observedSource, mapFn] of this.#observed) {
        if (!mapFn) continue;
        const observedPatch = mapFn(observedSource.compose());
        if (observedPatch) {
          patch = mergePatches(patch, observedPatch);
        }
      }
      return patch;
    } finally {
      this.#composing = false;
    }
  }

  /**
   * Multi-source FK / read-only cross-track observation. On every compose(),
   * for each observed source, pulls source.compose() (its fully-resolved patch)
   * and folds mapFn(composedPatch) into this track's own composed patch, applied
   * LAST in insertion order (so it can override this track's own fields).
   *
   * Reads source.compose() — the RESOLVED world state, so FK chains accumulate.
   * Cycles are made safe by the #composing re-entrancy guard in compose(), not
   * by reading a raw snapshot. See observe-fk-design.md §2, §3.
   *
   * - setObserved(track, mapFn): add or REPLACE the observation of `track`.
   * - setObserved(null): clear ALL observations.
   * - removeObserved(track): drop one source.
   *
   * No lifecycle coupling, no ownership. If an observed source is destroyed, the
   * CALLER — not Track — must removeObserved(source) (or setObserved(null))
   * BEFORE destroying it. Track holds no reverse registry.
   *
   * @param {Track|null} track - source to observe, or null to clear all
   * @param {(composedPatch: object) => (object|null|undefined)} [mapFn]
   */
  setObserved(track, mapFn) {
    if (!track) {
      this.#observed.clear();
      return;
    }
    this.#observed.set(track, mapFn ?? null);
  }

  removeObserved(track) {
    this.#observed.delete(track);
  }

  get observedSources() {
    return Array.from(this.#observed.keys());
  }

  subscribe(cb) {
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


  // --- Composition: "moving together" ---
  addChild(child, opts = {}) {
    if (child.#parent) {
      throw new Error(`Track "${child.id}" is already a child of "${child.#parent.id}"`);
    }
    child.#parent = this;
    const stagger = opts.stagger ?? 0;
    child.#staggerOffset = stagger;

    const siblingsBeforeAdd = Array.from(this.#children.values());
    const spawnOffset = this.#layoutDelegate.computeSpawnOffset(siblingsBeforeAdd, { stagger });
    child.#currentOffset = spawnOffset;

    this.#children.set(child.id, child);
    if (this.#host) {
      this.#host._mountChild(child, spawnOffset);
    }
    eventBus.emit('child:spawned', { id: child.id, parentId: this.#id });
  }

  removeChild(id) {
    const child = this.#children.get(id);
    if (!child) return;

    // Pass siblings INCLUDING the removed child (pre-splice) — the delegate
    // needs the removed child's own rank among its siblings to decide
    // whether/how to reflow.
    const siblingsBeforeRemove = Array.from(this.#children.values());
    this.#children.delete(id);
    child.#parent = null;

    const targets = this.#layoutDelegate.computeReflow(siblingsBeforeRemove, child, {});
    for (const target of targets) {
      target.child.#currentOffset = target.offset;
    }

    eventBus.emit('child:removing', { id: child.id, parentId: this.#id });
  }

  destroy() {
    this.#subscribers.clear();
    this.#observed.clear();
    try {
      this.#interpolationTimeline?.kill();
    } catch (e) {
      /* ignore */
    }
  }
}
