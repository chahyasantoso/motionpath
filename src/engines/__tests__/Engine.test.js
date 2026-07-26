import { describe, it, expect } from 'vitest';
import { Engine } from '../Engine.js';
import { createTrack } from '../../lib/createTrack.js';

const project = {
  schemaVersion: 2,
  projectId: 'engine-test',
  motions: [
    {
      id: 'swarm-motion',
      trigger: { type: 'time', duration: 1 },
      tracks: [
        { id: 'swarm-track', keyframes: { scale: { stops: [{ p: 0, v: 1 }, { p: 1, v: 2 }] } } },
      ],
    },
  ],
  tracks: [
    { id: 'standalone-track', keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] } } },
  ],
};

describe('Engine.getTrack', () => {
  it('returns null (not a fresh detached Track) when nothing is mounted, even if the schema declares the id', async () => {
    const engine = new Engine();
    await engine.loadProject(project);

    // 'standalone-track' exists in the SCHEMA but was never mountInstance()'d.
    // The old behavior silently fabricated a new detached Track here; the
    // fixed behavior must return null instead.
    expect(engine.getTrack('standalone-track')).toBeNull();
  });

  it('returns null for an id that does not exist in the schema at all', async () => {
    const engine = new Engine();
    await engine.loadProject(project);

    expect(engine.getTrack('nonexistent-id')).toBeNull();
  });

  it('two calls for the same never-mounted id must not return two different objects (there is nothing to return at all)', async () => {
    const engine = new Engine();
    await engine.loadProject(project);

    const first = engine.getTrack('standalone-track');
    const second = engine.getTrack('standalone-track');
    expect(first).toBeNull();
    expect(second).toBeNull();
  });

  it('once mounted via mountInstance, getTrack returns the SAME cached object on every call', async () => {
    const engine = new Engine();
    await engine.loadProject(project);

    const mounted = engine.mountInstance('standalone-track');
    expect(engine.getTrack('standalone-track')).toBe(mounted);
    expect(engine.getTrack('standalone-track')).toBe(engine.getTrack('standalone-track'));
  });
});

describe('Engine.getTrackConfig (Track-direct swarm — feature-swarm-design §Part A′)', () => {
  it('returns the parsed config for a track declared inside a motion, without mounting', async () => {
    const engine = new Engine();
    await engine.loadProject(project);

    // 'swarm-track' lives inside 'swarm-motion'.tracks — parseV4Project flattens
    // it into trackConfigsMap. getTrackConfig exposes that definition so callers
    // can stamp N independent child tracks from it.
    const cfg = engine.getTrackConfig('swarm-track');
    expect(cfg).not.toBeNull();
    expect(cfg.id).toBe('swarm-track');
    expect(cfg.keyframes.scale.stops).toHaveLength(2);
  });

  it('returns null for an unknown id, and null when no project is loaded', async () => {
    const engine = new Engine();
    expect(engine.getTrackConfig('swarm-track')).toBeNull(); // nothing loaded yet

    await engine.loadProject(project);
    expect(engine.getTrackConfig('nope')).toBeNull();
  });

  it('stamping from getTrackConfig with a unique id yields independent tracks (no dedupe-destroy)', async () => {
    const engine = new Engine();
    await engine.loadProject(project);
    const cfg = engine.getTrackConfig('swarm-track');

    const a = createTrack({ ...cfg, id: 'swarm-track-1', duration: 0.5 }, engine.templates);
    const b = createTrack({ ...cfg, id: 'swarm-track-2', duration: 0.5 }, engine.templates);

    // Two live, independent instances from one schema definition.
    expect(a).not.toBe(b);
    expect(a.id).toBe('swarm-track-1');
    expect(b.id).toBe('swarm-track-2');
  });

  it('exposes the loaded project templates (empty array when none / nothing loaded)', async () => {
    const engine = new Engine();
    expect(engine.templates).toEqual([]);

    await engine.loadProject(project);
    expect(Array.isArray(engine.templates)).toBe(true);
  });
});

describe('Engine.mountInstance / mountWithDelegate — concurrent instance identity (Part A)', () => {
  it('mountInstance called twice for the SAME motionId does not destroy the first instance', async () => {
    const engine = new Engine();
    await engine.loadProject(project);

    const first = engine.mountInstance('swarm-motion');
    const second = engine.mountInstance('swarm-motion');

    // Two genuinely distinct, independently-alive objects — not one
    // singleton being torn down and rebuilt under the caller's feet.
    expect(first).not.toBe(second);
    expect(first.id).not.toBe(second.id);

    // Both must still be independently usable — this is the actual
    // regression: previously, mounting the second would call
    // `first.destroy()` internally, killing its tracks/timeline.
    expect(() => first.trigger.seek(0.5)).not.toThrow();
    expect(() => second.trigger.seek(0.5)).not.toThrow();
    expect(first.getTrack('swarm-track')).not.toBeNull();
    expect(second.getTrack('swarm-track')).not.toBeNull();
  });

  it('mountWithDelegate called twice for the SAME motionId with different pre-built delegates keeps both alive', async () => {
    const { TimeTriggerDelegate } = await import('../../lib/TriggerDelegate.js');
    const engine = new Engine();
    await engine.loadProject(project);

    const delegateA = new TimeTriggerDelegate({ duration: 1 });
    const delegateB = new TimeTriggerDelegate({ duration: 1 });

    const motionA = engine.mountWithDelegate('swarm-motion', delegateA);
    const motionB = engine.mountWithDelegate('swarm-motion', delegateB);

    expect(motionA).not.toBe(motionB);
    expect(motionA.id).not.toBe(motionB.id);

    motionA.trigger.seek(0.25);
    motionB.trigger.seek(0.75);

    // Each instance's own track must reflect ITS OWN seek, not the other's —
    // proof they're genuinely independent, not aliases of one shared Motion.
    expect(motionA.getTrack('swarm-track').progress()).toBeCloseTo(0.25, 5);
    expect(motionB.getTrack('swarm-track').progress()).toBeCloseTo(0.75, 5);
  });

  it('motion.motionId records the schema id for reference, while .id stays a unique instance id', async () => {
    const engine = new Engine();
    await engine.loadProject(project);

    const a = engine.mountInstance('swarm-motion');
    const b = engine.mountInstance('swarm-motion');

    expect(a.motionId).toBe('swarm-motion');
    expect(b.motionId).toBe('swarm-motion');
    expect(a.id).not.toBe(b.id);
  });
});
