// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Engine } from '../../engines/Engine.js';
import { TimeTriggerDelegate, ManualTriggerDelegate } from '../../lib/TriggerDelegate.js';
import { domRenderer } from '../../renderers/domRenderer.js';
import { v4Project } from '../fixtures/v4-project.js';

let engine;

beforeEach(() => { engine = new Engine(); });
afterEach(() => { engine.destroy(); document.body.innerHTML = ''; });

describe('integration: Engine -> Motion -> Track -> compose -> domRenderer', () => {
  it('drives a manual motion all the way to a real DOM write', async () => {
    await engine.loadProject(v4Project);
    const motion = engine.mountInstance('manual-scrubber');
    const needle = motion.getTrack('needle');
    expect(needle).toBeTruthy();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const patches = [];
    const unsubscribe = needle.subscribe((raw) => { const patch = needle.compose(raw); patches.push(patch); domRenderer(el, patch); });
    motion.seek(0);
    expect(patches.at(-1).rotation).toBeCloseTo(-90, 3);
    motion.seek(0.5);
    expect(patches.at(-1).rotation).toBeCloseTo(0, 3);
    motion.seek(1);
    expect(patches.at(-1).rotation).toBeCloseTo(90, 3);
    expect(el.getAttribute('style')).toBeTruthy();
    unsubscribe();
  });
  it('resolves a template into three tracks and staggers them in SECONDS', async () => {
    await engine.loadProject(v4Project);
    const motion = engine.mountInstance('time-loop');
    expect(motion.getTrack('card-1')).toBeTruthy();
    expect(motion.getTrack('card-2')).toBeTruthy();
    expect(motion.getTrack('card-3')).toBeTruthy();
    const card1 = motion.getTrack('card-1');
    const patch = card1.compose(card1.getSnapshot());
    expect(patch).toHaveProperty('opacity');
    expect(patch).toHaveProperty('scale');
    const card3 = motion.getTrack('card-3');
    expect(card3.compose(card3.getSnapshot())).toHaveProperty('--card-size');
    expect(card1.duration).toBeCloseTo(0.6, 3);
    expect(motion.getTrack('card-2').duration).toBeCloseTo(0.9, 3);
  });
  it('mounts an image-sequence track and emits a backgroundImage', async () => {
    await engine.loadProject(v4Project);
    const motion = engine.mountInstance('sequence');
    const strip = motion.getTrack('film-strip');
    motion.seek(1);
    const patch = strip.compose(strip.getSnapshot());
    expect(String(patch.backgroundImage)).toContain('003.webp');
  });
});

describe('integration: lifecycle ownership (R-04)', () => {
  it('unmount() prunes the registry; repeated cycles do not grow it', async () => { await engine.loadProject(v4Project); for (let i = 0; i < 5; i++) { const motion = engine.mountInstance('time-paused'); expect(engine.instanceCount).toBe(1); expect(engine.unmount(motion)).toBe(true); expect(engine.instanceCount).toBe(0); } });
  it('unmount() is idempotent and safe on an already-unmounted instance', async () => { await engine.loadProject(v4Project); const motion = engine.mountInstance('time-paused'); expect(engine.unmount(motion)).toBe(true); expect(engine.unmount(motion)).toBe(false); expect(engine.instanceCount).toBe(0); });
  it('stamped tracks are engine-owned and cleaned up by destroy()', async () => { await engine.loadProject(v4Project); const a = engine.createTrackInstance('ball-exit-track', { id: 'ball-1' }); const b = engine.createTrackInstance('ball-exit-track', { id: 'ball-2' }); expect(a).not.toBe(b); expect(engine.isOwned(a)).toBe(true); expect(engine.isOwned(b)).toBe(true); expect(engine.instanceCount).toBe(2); engine.destroy(); expect(engine.instanceCount).toBe(0); });
  it('adopt() takes ownership of an externally created track exactly once', async () => { await engine.loadProject(v4Project); const track = engine.createTrackInstance('ball-exit-track', { id: 'ball-x' }); const count = engine.instanceCount; engine.adopt(track); expect(engine.instanceCount).toBe(count); });
  it('destroy() is idempotent', async () => { await engine.loadProject(v4Project); engine.mountInstance('time-paused'); engine.destroy(); expect(() => engine.destroy()).not.toThrow(); expect(engine.instanceCount).toBe(0); });
});

describe('integration: TimeTriggerDelegate honors its config (R-03)', () => {
  it('autoplays by default', () => { const d = new TimeTriggerDelegate({}); const tl = d.build(); expect(tl.paused()).toBe(false); d.destroy(); });
  it('autoplay:false produces a PAUSED master timeline', () => { const d = new TimeTriggerDelegate({ autoplay: false }); const tl = d.build(); expect(tl.paused()).toBe(true); d.play(); expect(tl.paused()).toBe(false); d.destroy(); });
  it('forwards delay, repeat, yoyo and repeatDelay', () => { const d = new TimeTriggerDelegate({ delay: 0.4, repeat: 2, yoyo: true, repeatDelay: 0.2 }); const tl = d.build(); expect(tl.delay()).toBeCloseTo(0.4, 5); expect(tl.repeat()).toBe(2); expect(tl.yoyo()).toBe(true); expect(tl.repeatDelay()).toBeCloseTo(0.2, 5); d.destroy(); });
  it('a mounted autoplay:false motion does not advance on its own', async () => { await engine.loadProject(v4Project); const motion = engine.mountInstance('time-paused'); const track = motion.getTrack('paused-track'); expect(track.progress()).toBeCloseTo(0, 5); });
});

describe('integration: ManualTriggerDelegate exposes seek() (R-10 partial)', () => {
  it('seek() is available and progress() remains a compatibility alias', () => { const d = new ManualTriggerDelegate(); expect(() => d.build()).not.toThrow(); expect(() => d.seek(0.25)).not.toThrow(); expect(() => d.progress(0.75)).not.toThrow(); d.destroy(); });
});
