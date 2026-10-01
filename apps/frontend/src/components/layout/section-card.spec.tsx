import { render, screen } from '@testing-library/react';
import { Landmark } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { SectionCard } from './section-card';

describe('SectionCard', () => {
  it('lets the title shrink instead of wrapping when an action is present', () => {
    render(
      <SectionCard
        icon={Landmark}
        title="Trạng thái kết nối"
        description="Theo dõi quyền truy cập và lần đồng bộ gần nhất."
        action={
          <>
            <button type="button">Lịch sử</button>
            <button type="button">Hiện API Key</button>
            <button type="button">Đổi API Key</button>
          </>
        }
      >
        <p>Danh sách kết nối</p>
      </SectionCard>,
    );

    // A multi-button action previously squeezed the title column to ~27px on
    // a 390px viewport, wrapping "Trạng thái kết nối" onto three lines. The
    // title track must be shrinkable and the buttons must drop below it on
    // narrow screens instead of compressing the heading.
    const header = screen
      .getByText('Trạng thái kết nối')
      .closest('[data-slot="card-header"]');
    expect(header).not.toBeNull();
    expect(header?.className).toContain(
      'has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]',
    );

    const action = screen
      .getByRole('button', { name: 'Lịch sử' })
      .closest('[data-slot="card-action"]');
    expect(action?.className).toContain('max-[520px]:col-span-2');
    expect(action?.className).toContain('max-[520px]:row-start-3');
  });

  it('keeps a full-width title when there is no action', () => {
    render(
      <SectionCard title="Khoản phải thu">
        <p>Nội dung</p>
      </SectionCard>,
    );

    // Without an action there is no second grid column, so the title spans
    // both tracks and the header stays a plain single-column stack.
    expect(document.querySelector('[data-slot="card-action"]')).toBeNull();
    expect(
      screen.getByText('Khoản phải thu').closest('.col-span-2'),
    ).not.toBeNull();
  });
});
