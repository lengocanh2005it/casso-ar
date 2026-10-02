import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsList, TabsTrigger } from './tabs';

describe('TabsTrigger', () => {
  it('keeps the inactive label readable on a light card', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Đang chọn</TabsTrigger>
          <TabsTrigger value="b">Chưa chọn</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const inactive = screen.getByRole('tab', { name: 'Chưa chọn' });

    // text-foreground/60 measures 4.37 against a white card at 14px — just
    // under the 4.5 WCAG AA floor. /70 clears it at 6.11.
    expect(inactive.className).toMatch(/text-foreground\/70/);
    expect(inactive.className).not.toMatch(/text-foreground\/60/);
  });
});
