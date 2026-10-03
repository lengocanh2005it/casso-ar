import { render, screen } from '@testing-library/react';
import { Landmark } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { SectionCard } from './section-card';

describe('SectionCard', () => {
  it('keeps the heading and description together beside the action', () => {
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

    const heading = screen
      .getByText('Trạng thái kết nối')
      .closest('[data-slot="card-heading"]');
    const description = screen.getByText(
      'Theo dõi quyền truy cập và lần đồng bộ gần nhất.',
    );
    expect(heading).toContainElement(description);

    const header = heading?.closest('[data-slot="card-header"]');
    expect(header?.className).toContain('min-[521px]:flex-row');
    expect(header).toContainElement(
      screen.getByRole('button', { name: 'Lịch sử' }),
    );

    const action = screen
      .getByRole('button', { name: 'Lịch sử' })
      .closest('[data-slot="card-action"]');
    expect(action?.className).toContain('min-[521px]:ml-auto');
    expect(action?.className).toContain('w-full');
  });

  it('keeps a full-width title when there is no action', () => {
    render(
      <SectionCard title="Khoản phải thu">
        <p>Nội dung</p>
      </SectionCard>,
    );

    expect(document.querySelector('[data-slot="card-action"]')).toBeNull();
    expect(
      screen.getByText('Khoản phải thu').closest('[data-slot="card-heading"]'),
    ).not.toBeNull();
  });
});
