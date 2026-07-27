import { describe, it, expect } from 'vitest';
import { Engine } from '../Engine.js';
import { createTrack } from '../../lib/createTrack.js';

const project = {
  schemaVersion: 4,
  projectId: 'engine-test',
  motions: [{ id: 'swarm-motion', trigger: { type: 'time', duration: 1 }, tracks: [{ id: 'swarm-track', keyframes: { scale: { stops: [{ p: 0, v: 1 }, { p: 1, v: 2 }] } } }] }],
  tracks: [{ id: 'standalone-track', keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] } } }],
};

describe('Engine.getTrack', () => {
  it('returns null for an unmounted schema track', async () => { const engine = new Engine(); await engine.loadProject(project); expect(engine.getTrack('standalone-track')).toBeNull(); });
  it('returns null for an unknown id', async () => { const engine = new Engine(); await engine.loadProject(project); expect(engine.getTrack('nonexistent-id')).toBeNull(); });
  it('does not fabricate detached tracks', async () => { const engine = new Engine(); await engine.loadProject(project); expect(engine.getTrack('standalone-track')).toBeNull(); expect(engine.getTrack('standalone-track')).toBeNull(); });
  it('returns the same mounted track object', async () => { const engine = new Engine(); await engine.loadProject(project); const mounted = engine.mountInstance('standalone-track'); expect(engine.getTrack('standalone-track')).toBe(mounted); expect(engine.getTrack('standalone-track')).toBe(mounted); });
});

describe('Engine.getTrackConfig', () => {
  it('returns parsed motion-track config', async () => { const engine = new Engine(); await engine.loadProject(project); const cfg = engine.getTrackConfig('swarm-track'); expect(cfg?.id).toBe('swarm-track'); expect(cfg?.keyframes.scale.stops).toHaveLength(2); });
  it('returns null before load and for unknown ids', async () => { const engine = new Engine(); expect(engine.getTrackConfig('swarm-track')).toBeNull(); await engine.loadProject(project); expect(engine.getTrackConfig('nope')).toBeNull(); });
  it('stamps independent tracks', async () => { const engine = new Engine(); await engine.loadProject(project); const cfg = engine.getTrackConfig('swarm-track'); const a = createTrack({ ...cfg, id: 'swarm-track-1', duration: 0.5 }, engine.templates); const b = createTrack({ ...cfg, id: 'swarm-track-2', duration: 0.5 }, engine.templates); expect(a).not.toBe(b); expect(a.id).toBe('swarm-track-1'); expect(b.id).toBe('swarm-track-2'); });
  it('exposes templates', async () => { const engine = new Engine(); expect(engine.templates).toEqual([]); await engine.loadProject(project); expect(Array.isArray(engine.templates)).toBe(true); });
});

describe('Motion control surface', () => {
  it('keeps concurrent instances independent without exposing delegates', async () => {
    const engine = new Engine(); await engine.loadProject(project);
    const first = engine.mountInstance('swarm-motion'); const second = engine.mountInstance('swarm-motion');
    expect(first).not.toBe(second); expect(first.id).not.toBe(second.id); expect(first.trigger).toBeUndefined(); expect(second.trigger).toBeUndefined();
    expect(() => first.seek(0.5)).not.toThrow(); expect(() => second.seek(0.5)).not.toThrow();
    expect(first.getTrack('swarm-track')).not.toBeNull(); expect(second.getTrack('swarm-track')).not.toBeNull();
  });
  it('keeps pre-built delegates independent behind the same facade', async () => {
    const { TimeTriggerDelegate } = await import('../../lib/TriggerDelegate.js');
    const engine = new Engine(); await engine.loadProject(project);
    const motionA = engine.mountWithDelegate('swarm-motion', new TimeTriggerDelegate({ duration: 1 })); const motionB = engine.mountWithDelegate('swarm-motion', new TimeTriggerDelegate({ duration: 1 }));
    expect(motionA.trigger).toBeUndefined(); expect(motionB.trigger).toBeUndefined(); motionA.seek(0.25); motionB.seek(0.75);
    expect(motionA.getTrack('swarm-track').progress()).toBeCloseTo(0.25, 5); expect(motionB.getTrack('swarm-track').progress()).toBeCloseTo(0.75, 5);
  });
  it('keeps schema motionId as reference only', async () => { const engine = new Engine(); await engine.loadProject(project); const a = engine.mountInstance('swarm-motion'); const b = engine.mountInstance('swarm-motion'); expect(a.motionId).toBe('swarm-motion'); expect(b.motionId).toBe('swarm-motion'); expect(a.id).not.toBe(b.id); });
});
