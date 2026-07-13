import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compileProject } from '../CompileProject.js';
import * as builderModule from '../BuildProject.js';
import * as validatorModule from '../../validators/index.js';
import * as engineCoreModule from '../../engines/editorEngineCore.js';

vi.mock('../BuildProject.js', () => ({
  buildProject: vi.fn()
}));

vi.mock('../../validators/index.js', () => ({
  validateProject: vi.fn()
}));

vi.mock('../../engines/editorEngineCore.js', () => ({
  createEditorEngineCore: vi.fn()
}));

describe('compileProject', () => {
  let mockDeps;
  let mockBuildResult;
  let mockCore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeps = { resolveElement: vi.fn() };
    mockBuildResult = { scenarios: [], timelineGroups: new Map() };
    mockCore = { subscribe: vi.fn(), compose: vi.fn(), destroy: vi.fn() };
    
    builderModule.buildProject.mockResolvedValue(mockBuildResult);
    engineCoreModule.createEditorEngineCore.mockReturnValue(mockCore);
    validatorModule.validateProject.mockReturnValue([]);
  });

  it('compiles successfully when schema has no errors', async () => {
    const schema = { project: 'test' };
    const result = await compileProject(schema, mockDeps, 'TestEngine');

    expect(validatorModule.validateProject).toHaveBeenCalledWith(schema);
    expect(builderModule.buildProject).toHaveBeenCalledWith(expect.any(Object), mockDeps);
    expect(engineCoreModule.createEditorEngineCore).toHaveBeenCalledWith(mockBuildResult);
    expect(result).toEqual({ core: mockCore, buildResult: mockBuildResult, project: expect.any(Object) });
  });

  it('compiles successfully and logs warning when schema has only warnings', async () => {
    const schema = { project: 'test' };
    validatorModule.validateProject.mockReturnValue([
      { severity: 'warning', message: 'Mild warning' }
    ]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await compileProject(schema, mockDeps, 'TestEngine');

    expect(warnSpy).toHaveBeenCalledWith('[TestEngine]', 'Mild warning');
    expect(builderModule.buildProject).toHaveBeenCalledWith(expect.any(Object), mockDeps);
    expect(result.core).toBe(mockCore);
    expect(result.project).toBeDefined();

    warnSpy.mockRestore();
  });

  it('throws and does not build when schema has error severity', async () => {
    const schema = { project: 'test' };
    validatorModule.validateProject.mockReturnValue([
      { severity: 'error', message: 'Hard error' },
      { severity: 'warning', message: 'Mild warning' }
    ]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(compileProject(schema, mockDeps, 'TestEngine')).rejects.toThrow(
      '[TestEngine] Schema validation failed:\n  - Hard error'
    );

    expect(warnSpy).toHaveBeenCalledWith('[TestEngine]', 'Mild warning');
    expect(builderModule.buildProject).not.toHaveBeenCalled();
    expect(engineCoreModule.createEditorEngineCore).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
