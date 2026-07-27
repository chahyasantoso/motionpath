import { describe, it, expect } from 'vitest';
import { Engine } from '../Engine.js';

const project = { schemaVersion: 4, motions: [{ id: 'm', trigger: { type: 'manual' }, tracks: [{ id: 't', keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }] }] };

describe('Engine isolation', () => {
  it('keeps event buses isolated between engines', async () => {
    const a = new Engine(); const b = new Engine();
    await a.loadProject(project); await b.loadProject(project);
    const ma = a.mountInstance('m'); const mb = b.mountInstance('m');
    const eventsA = []; const eventsB = [];
    a.eventBus.on('child:spawned', (payload) => eventsA.push(payload));
    b.eventBus.on('child:spawned', (payload) => eventsB.push(payload));
    const ca = a.createTrackInstance('t', { id: 'child-a' });
    const cb = b.createTrackInstance('t', { id: 'child-b' });
    ma.getTrack('t').addChild(ca);
    mb.getTrack('t').addChild(cb);
    expect(eventsA).toHaveLength(1);
    expect(eventsB).toHaveLength(1);
    a.destroy();
    expect(eventsB).toHaveLength(1);
    b.destroy();
  });
});
