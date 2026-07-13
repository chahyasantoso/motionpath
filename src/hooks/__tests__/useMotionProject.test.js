// @vitest-environment jsdom
import React from 'react';
import { render, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useMotionProject from '../useMotionProject';
import { productionEngine } from '../../engines/ProductionEngine.js';
import DemoPage from '../../components/Demo/DemoPage';

vi.mock('../../engines/ProductionEngine.js', () => {
  const mockInstance = {
    id: 'mock-inst',
    tracksMap: new Map(),
    subscribe: vi.fn(() => vi.fn()),
    compose: vi.fn(() => ({})),
    destroy: vi.fn()
  };
  return {
    productionEngine: {
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

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

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
    productionEngine.loadProject.mockResolvedValue();
    const project = { schemaVersion: 2, projectId: 'p1', motions: [] };

    const { unmount } = renderHook(() => useMotionProject(project));

    expect(productionEngine.loadProject).toHaveBeenCalledTimes(1);
    expect(productionEngine.loadProject).toHaveBeenCalledWith(project, { playStates: {} });

    unmount();
    expect(productionEngine.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys old engine state and loads new project when project reference changes', async () => {
    productionEngine.loadProject.mockResolvedValue();
    const project1 = { schemaVersion: 2, projectId: 'p1', motions: [] };
    const project2 = { schemaVersion: 2, projectId: 'p2', motions: [] };

    const { rerender } = renderHook(({ project }) => useMotionProject(project), {
      initialProps: { project: project1 }
    });

    expect(productionEngine.loadProject).toHaveBeenCalledTimes(1);
    expect(productionEngine.loadProject).toHaveBeenLastCalledWith(project1, { playStates: {} });

    // Rerender with new project
    rerender({ project: project2 });

    // Should call destroy to clear project1, then load project2
    expect(productionEngine.destroy).toHaveBeenCalledTimes(1);
    expect(productionEngine.loadProject).toHaveBeenCalledTimes(2);
    expect(productionEngine.loadProject).toHaveBeenLastCalledWith(project2, { playStates: {} });
  });

  it('logs loadProject failure without throwing synchronously', async () => {
    const error = new Error('load failed');
    productionEngine.loadProject.mockRejectedValue(error);
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
    productionEngine.loadProject.mockResolvedValue();
    render(React.createElement(DemoPage));

    expect(productionEngine.loadProject).toHaveBeenCalledTimes(1);
    const loadedSchema = productionEngine.loadProject.mock.calls[0][0];
    expect(loadedSchema.motions).toHaveLength(4);
    expect(loadedSchema.motions.map(s => s.motionId)).toContain('hero-scrollytelling');
  });

  it('forwards initialPlayStates option to loadProject so paused-on-load works', async () => {
    productionEngine.loadProject.mockResolvedValue();
    const project = { schemaVersion: 2, projectId: 'p1', motions: [] };

    renderHook(() => useMotionProject(project, { initialPlayStates: { 'my-tl': false } }));

    expect(productionEngine.loadProject).toHaveBeenCalledWith(
      project,
      { playStates: { 'my-tl': false } }
    );
  });
});
