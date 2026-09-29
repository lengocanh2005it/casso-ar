import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './card';
import { Tabs, TabsList, TabsTrigger } from './tabs';

describe('Card', () => {
  it('can shrink inside a grid track', () => {
    // Grid items default to min-width:auto, so a card holding a long
    // truncated name widened its whole track past a 390px phone viewport.
    render(<Card data-testid="card" />);

    expect(screen.getByTestId('card')).toHaveClass('min-w-0');
  });
});

describe('TabsList', () => {
  it('scrolls tabs horizontally without a vertical scrollbar or clipped start', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    // overflow-x:auto forces overflow-y to auto too (1px taller content
    // showed ▲▼ arrows); justify-center clips the first tab once it overflows.
    const list = screen.getByRole('tablist');
    expect(list).toHaveClass('overflow-y-hidden', 'justify-start');
    expect(list).not.toHaveClass('justify-center');
  });
});
