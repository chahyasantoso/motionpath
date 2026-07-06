// @vitest-environment jsdom
import React from 'react';
import { render, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useMotionProject from '../useMotionProject';
import { productionEngine } from '../../lib/ProductionEngine';
import BurstPage from '../../components/Burst/BurstPage';

vi.mock('../../lib/ProductionEngine', () => ({
  productionEngine: {
    loadProject: vi.fn(),
    destroy: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    compose: vi.fn(() => ({})),
  }
}));

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
    const project = { schemaVersion: 1, projectId: 'p1', scenarios: [] };

    const { unmount } = renderHook(() => useMotionProject(project));

    expect(productionEngine.loadProject).toHaveBeenCalledTimes(1);
    expect(productionEngine.loadProject).toHaveBeenCalledWith(project);

    unmount();
    expect(productionEngine.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys old engine state and loads new project when project reference changes', async () => {
    productionEngine.loadProject.mockResolvedValue();
    const project1 = { schemaVersion: 1, projectId: 'p1', scenarios: [] };
    const project2 = { schemaVersion: 1, projectId: 'p2', scenarios: [] };

    const { rerender } = renderHook(({ project }) => useMotionProject(project), {
      initialProps: { project: project1 }
    });

    expect(productionEngine.loadProject).toHaveBeenCalledTimes(1);
    expect(productionEngine.loadProject).toHaveBeenLastCalledWith(project1);

    // Rerender with new project
    rerender({ project: project2 });

    // Should call destroy to clear project1, then load project2
    expect(productionEngine.destroy).toHaveBeenCalledTimes(1);
    expect(productionEngine.loadProject).toHaveBeenCalledTimes(2);
    expect(productionEngine.loadProject).toHaveBeenLastCalledWith(project2);
  });

  it('logs loadProject failure without throwing synchronously', async () => {
    const error = new Error('load failed');
    productionEngine.loadProject.mockRejectedValue(error);
    const project = { schemaVersion: 1, projectId: 'p1', scenarios: [] };

    // Should not throw synchronously
    expect(() => {
      renderHook(() => useMotionProject(project));
    }).not.toThrow();

    // Wait for the promise rejection microtask to flush
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consoleErrorSpy).toHaveBeenCalledWith('[useMotionProject] loadProject failed:', error);
  });

  it('integration: rendering BurstPage loads both scenarios in a single project exactly once', async () => {
    productionEngine.loadProject.mockResolvedValue();
    render(React.createElement(BurstPage));

    expect(productionEngine.loadProject).toHaveBeenCalledTimes(1);
    const loadedSchema = productionEngine.loadProject.mock.calls[0][0];
    expect(loadedSchema.scenarios).toHaveLength(2);
    expect(loadedSchema.scenarios.map(s => s.sceneId)).toContain('strawberry-burst-scroll');
    expect(loadedSchema.scenarios.map(s => s.sceneId)).toContain('ice-cream-card-slide');
  });
});
