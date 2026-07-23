// @vitest-environment jsdom
import React from 'react';
import { render, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useMotionProject from '../useMotionProject';
import { engine } from '../../engines/Engine.js';
import DemoPage from '../../components/Demo/DemoPage';

vi.mock('../../engines/Engine.js', () => {
  const mockInstance = {
    id: 'mock-inst',
    tracksMap: new Map(),
    subscribe: vi.fn(() => vi.fn()),
    compose: vi.fn(() => ({})),
    destroy: vi.fn()
  };
  return {
    engine: {
      loadProject: vi.fn(),
      destroy: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
      compose: vi.fn(() => ({})),
      registerTriggerRef: vi.fn(),
      unregisterTriggerRef: vi.fn(),
      mountInstance: vi.fn(() => mockInstance),
    }
  };
});

global.ResizeObserver = class ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

describe('useMotionProject', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('calls loadProject exactly once with the project schema on mount and destroy on unmount', async () => {
    engine.loadProject.mockResolvedValue();
    const project = { schemaVersion: 2, projectId: 'p1', motions: [] };

    const { unmount } = renderHook(() => useMotionProject(project));

    expect(engine.loadProject).toHaveBeenCalledTimes(1);
    expect(engine.loadProject).toHaveBeenCalledWith(project);

    unmount();
    expect(engine.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys old engine state and loads new project when project reference changes', async () => {
    engine.loadProject.mockResolvedValue();
    const project1 = { schemaVersion: 2, projectId: 'p1', motions: [] };
    const project2 = { schemaVersion: 2, projectId: 'p2', motions: [] };

    const { rerender } = renderHook(({ project }) => useMotionProject(project), {
      initialProps: { project: project1 }
    });

    expect(engine.loadProject).toHaveBeenCalledTimes(1);
    expect(engine.loadProject).toHaveBeenLastCalledWith(project1);

    // Rerender with new project
    rerender({ project: project2 });

    // Should call destroy to clear project1, then load project2
    expect(engine.destroy).toHaveBeenCalledTimes(1);
    expect(engine.loadProject).toHaveBeenCalledTimes(2);
    expect(engine.loadProject).toHaveBeenLastCalledWith(project2);
  });

  it('logs loadProject failure without throwing synchronously', async () => {
    const error = new Error('load failed');
    engine.loadProject.mockRejectedValue(error);
    const project = { schemaVersion: 2, projectId: 'p1', motions: [] };

    // Should not throw synchronously
    expect(() => {
      renderHook(() => useMotionProject(project));
    }).not.toThrow();

    // Wait for the promise rejection microtask to flush
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consoleErrorSpy).toHaveBeenCalledWith('[useMotionProject] loadProject failed:', error);
  });

  it('integration: rendering DemoPage loads the project exactly once', async () => {
    engine.loadProject.mockResolvedValue();
    render(React.createElement(DemoPage));

    expect(engine.loadProject).toHaveBeenCalledTimes(1);
    const loadedSchema = engine.loadProject.mock.calls[0][0];
    expect(loadedSchema.projectId).toBe('demo-page');
  });

  it('should reload project if reference changes, even if projectId is the same', async () => {
    engine.loadProject.mockResolvedValue();
    const project = { schemaVersion: 2, projectId: 'p1', motions: [] };

    const { rerender } = renderHook(({ p }) => useMotionProject(p), {
      initialProps: { p: project }
    });

    rerender({ p: { ...project } });

    expect(engine.loadProject).toHaveBeenCalledWith(project);
    expect(engine.loadProject.mock.calls[0]).toHaveLength(1);
  });
});
