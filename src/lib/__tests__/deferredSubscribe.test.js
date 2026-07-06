import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDeferredSubscribe } from '../deferredSubscribe.js';

describe('deferredSubscribe', () => {
  let mockCore;
  let mockUnsubscribe;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUnsubscribe = vi.fn();
    mockCore = {
      subscribe: vi.fn(() => mockUnsubscribe),
    };
  });

  it('buffers subscriptions before setCore, and flushes on setCore', () => {
    const registry = createDeferredSubscribe();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsub1 = registry.subscribe('el-1', cb1);
    const unsub2 = registry.subscribe('el-2', cb2);

    expect(mockCore.subscribe).not.toHaveBeenCalled();

    registry.setCore(mockCore);

    expect(mockCore.subscribe).toHaveBeenCalledTimes(2);
    expect(mockCore.subscribe).toHaveBeenCalledWith('el-1', cb1);
    expect(mockCore.subscribe).toHaveBeenCalledWith('el-2', cb2);

    unsub1();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('delegates immediately if core is already set', () => {
    const registry = createDeferredSubscribe();
    registry.setCore(mockCore);

    const cb = vi.fn();
    registry.subscribe('el-1', cb);

    expect(mockCore.subscribe).toHaveBeenCalledWith('el-1', cb);
  });

  it('skips cancelled entries during flush', () => {
    const registry = createDeferredSubscribe();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsub1 = registry.subscribe('el-1', cb1);
    registry.subscribe('el-2', cb2);

    // Cancel the first subscription before setting core
    unsub1();

    registry.setCore(mockCore);

    // Only el-2 should be subscribed on core
    expect(mockCore.subscribe).toHaveBeenCalledTimes(1);
    expect(mockCore.subscribe).toHaveBeenCalledWith('el-2', cb2);
  });

  it('unsubscribing after flush calls real unsubscribe', () => {
    const registry = createDeferredSubscribe();
    const cb = vi.fn();
    const unsub = registry.subscribe('el-1', cb);

    registry.setCore(mockCore);
    unsub();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('clearCore() clears pending — entry does NOT flush after clearCore() → setCore()', () => {
    // Addendum B: clearCore() must clear pending. A pending subscription that
    // existed before clearCore() is NOT forwarded to a subsequent setCore() call.
    // This is the correct behaviour because clearCore() signals a full reset
    // (stale load discarded or engine destroyed); any pending entries from that
    // dead load must not bleed into the replacement core.
    const registry = createDeferredSubscribe();
    const cb = vi.fn();
    registry.subscribe('el-1', cb);

    registry.clearCore();
    registry.setCore(mockCore);

    // pending was cleared by clearCore(), so nothing should have flushed
    expect(mockCore.subscribe).not.toHaveBeenCalled();
  });
});

