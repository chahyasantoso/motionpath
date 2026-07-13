import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDeferredCall } from '../deferredCall.js';

describe('deferredCall', () => {
  let mockCore;
  let mockCleanup;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCleanup = vi.fn();
    mockCore = {};
  });

  it('buffers calls before setCore, and flushes on setCore', () => {
    const deferred = createDeferredCall();
    const run1 = vi.fn(() => mockCleanup);
    const run2 = vi.fn();

    const cancel1 = deferred.call(run1);
    const cancel2 = deferred.call(run2);

    expect(run1).not.toHaveBeenCalled();
    expect(run2).not.toHaveBeenCalled();

    deferred.setCore(mockCore);

    expect(run1).toHaveBeenCalledTimes(1);
    expect(run1).toHaveBeenCalledWith(mockCore);
    expect(run2).toHaveBeenCalledTimes(1);
    expect(run2).toHaveBeenCalledWith(mockCore);

    cancel1();
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });

  it('delegates immediately if core is already set', () => {
    const deferred = createDeferredCall();
    deferred.setCore(mockCore);

    const run = vi.fn();
    deferred.call(run);

    expect(run).toHaveBeenCalledWith(mockCore);
  });

  it('skips cancelled entries during flush', () => {
    const deferred = createDeferredCall();
    const run1 = vi.fn();
    const run2 = vi.fn();

    const cancel1 = deferred.call(run1);
    deferred.call(run2);

    cancel1();

    deferred.setCore(mockCore);

    expect(run1).not.toHaveBeenCalled();
    expect(run2).toHaveBeenCalledWith(mockCore);
  });

  it('cancelling after flush calls real cleanup', () => {
    const deferred = createDeferredCall();
    const run = vi.fn(() => mockCleanup);
    const cancel = deferred.call(run);

    deferred.setCore(mockCore);
    cancel();

    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });

  it('clearCore() clears pending — entry does NOT flush after clearCore() → setCore()', () => {
    const deferred = createDeferredCall();
    const run = vi.fn();
    deferred.call(run);

    deferred.clearCore();
    deferred.setCore(mockCore);

    expect(run).not.toHaveBeenCalled();
  });
});
