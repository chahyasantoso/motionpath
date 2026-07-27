import { describe, it, expect, vi } from 'vitest';
import { parseV4Project } from '../parseV4Project.js';
import { imageSequencePlugin } from '../../../domain/plugins/imageSequenceProperty.js';

describe('parseV4Project preparation phase', () => {
  it('awaits plugin preparation before returning the parsed project', async () => {
    const prepare = vi.spyOn(imageSequencePlugin, 'prepare').mockResolvedValue(undefined);
    await parseV4Project({
      schemaVersion: 4,
      motions: [{ id: 'm', trigger: { type: 'time' }, tracks: [{ id: 't', keyframes: { imageSequence: { frames: ['a', 'b'], stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }] }],
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    prepare.mockRestore();
  });
});
