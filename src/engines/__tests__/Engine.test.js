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
