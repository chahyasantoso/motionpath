import { describe, it, expect } from 'vitest';
import { createEditorEngineCore } from '../editorEngineCore.js';
import { filterGroupPlugin } from '../../domain/plugins/filterProperty.js';

describe('EditorEngineCore compose integration', () => {
  it('compose() merges blur + brightness into one filter patch using cached trackPlugins', () => {
    const mockTrackBuild = {
      proxy: {
        blur: 10,
        brightness: 1.5
      },
      trackConfig: {}
    };

    const buildResult = {
      tracks: new Map([
        ['filter-track', mockTrackBuild]
      ]),
      trackPlugins: new Map([
        ['filter-track', [filterGroupPlugin]]
      ])
    };

    const core = createEditorEngineCore(buildResult);
    const patch = core.compose('filter-track');

    expect(patch).toEqual({
      filter: {
        blur: 10,
        brightness: 1.5
      }
    });
  });
});
