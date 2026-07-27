import { describe, it, expect, vi, afterEach } from 'vitest';
import { Track } from '../Track.js';

function fakeTimeline(onKill) {
  return { progress: () => 0, duration: () => 1, kill: onKill };
}

describe('Track teardown error reporting (R-25)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('reports a failed timeline kill instead of swallowing it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const track = new Track({ id: 'broken', interpolationTimeline: fakeTimeline(() => { throw new Error('boom'); }), proxyState: {}, plugins: [], resolvedTrack: {} });
    expect(() => track.destroy()).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('broken');
  });

  it('stays quiet on a clean teardown', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const track = new Track({ id: 'fine', interpolationTimeline: fakeTimeline(() => {}), proxyState: {}, plugins: [], resolvedTrack: {} });
    track.destroy();
    expect(warn).not.toHaveBeenCalled();
  });
});
