import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { TrendMonthsSelect } from './trend-months-select';

describe('TrendMonthsSelect', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders the supported presets and reports the selected range', async () => {
    const onValueChange = vi.fn();

    render(<TrendMonthsSelect value={6} onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Khoảng thời gian' }));
    expect(await screen.findByRole('option', { name: '3 tháng' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '6 tháng' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '12 tháng' })).toBeTruthy();

    fireEvent.click(screen.getByRole('option', { name: '3 tháng' }));
    expect(onValueChange).toHaveBeenCalledWith(3);
  });
});
