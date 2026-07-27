import { describe, it, expect } from 'vitest';
import { Engine } from '../Engine.js';
import { createPluginRegistry } from '../../domain/plugins.js';
import { createAnimationPlugin } from '../../domain/createAnimationPlugin.js';
import { createTriggerDelegateRegistry } from '../../lib/TriggerDelegate.js';

const project = { schemaVersion: 4, motions: [{ id: 'm', trigger: { type: 'manual' }, tracks: [{ id: 't', keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }] }] };

describe('Engine registry isolation', () => {
  it('does not share custom plugins between Engine instances', async () => {
    const plugin = createAnimationPlugin({ keys: ['onlyA'], contribute: () => ({ percentPatch: { '0%': { onlyA: 0 }, '100%': { onlyA: 1 } } }), compose: (raw) => ({ onlyA: raw.onlyA }) });
    const a = new Engine({ plugins: createPluginRegistry([...[]]) });
    const b = new Engine({ plugins: createPluginRegistry([...[]]) });
    a.plugins?.register?.(plugin);
    expect(a).toBeTruthy(); expect(b).toBeTruthy();
    await expect(a.loadProject({ ...project, motions: [{ ...project.motions[0], tracks: [{ id: 't', keyframes: { onlyA: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }] }] })).resolves.toBeUndefined();
    await expect(b.loadProject({ ...project, motions: [{ ...project.motions[0], tracks: [{ id: 't', keyframes: { onlyA: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }] }] })).rejects.toThrow();
  });

  it('accepts an isolated trigger registry', async () => {
    const registry = createTriggerDelegateRegistry();
    const a = new Engine({ triggerDelegates: registry });
    await expect(a.loadProject(project)).resolves.toBeUndefined();
  });
});
