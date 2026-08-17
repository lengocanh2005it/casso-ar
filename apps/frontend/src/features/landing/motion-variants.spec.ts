import { describe, expect, it } from 'vitest';
import { FADE_UP_ITEM_VARIANTS, HOVER_SCALE } from './motion-variants';

describe('landing motion variants', () => {
  it('uses composable x/y/scale motion values, never a raw transform string', () => {
    expect(FADE_UP_ITEM_VARIANTS.hidden).toMatchObject({ y: 12 });
    expect(FADE_UP_ITEM_VARIANTS.visible).toMatchObject({ y: 0 });
    expect(HOVER_SCALE).toMatchObject({ scale: 1.02 });
    expect(HOVER_SCALE.transition).toBeDefined();

    for (const variant of [
      FADE_UP_ITEM_VARIANTS.hidden,
      FADE_UP_ITEM_VARIANTS.visible,
      HOVER_SCALE,
    ]) {
      expect(variant).not.toHaveProperty('transform');
    }
  });
});
