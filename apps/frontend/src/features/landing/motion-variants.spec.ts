import { describe, expect, it } from 'vitest';
import { FADE_UP_ITEM_VARIANTS, HOVER_SCALE } from './motion-variants';

describe('landing motion variants', () => {
  it('keeps interactive transforms on the hardware-accelerated transform property', () => {
    expect(FADE_UP_ITEM_VARIANTS.hidden).toMatchObject({
      transform: 'translateY(12px)',
    });
    expect(FADE_UP_ITEM_VARIANTS.visible).toMatchObject({
      transform: 'translateY(0px)',
    });
    expect(HOVER_SCALE).toEqual({ transform: 'scale(1.02)' });
  });
});
