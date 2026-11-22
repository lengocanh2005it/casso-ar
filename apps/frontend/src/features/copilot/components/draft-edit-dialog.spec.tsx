import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CopilotDraft } from '../types';
import { DraftEditDialog } from './draft-edit-dialog';

const DRAFT: CopilotDraft = {
  id: 'draft-1',
  receivableId: 'rec-1',
  recipientEmail: 'ap@abc.vn',
  subject: '',
  bodyHtml: '',
  status: 'DRAFTED',
  pendingActionId: null,
  createdAt: '2026-08-21T10:00:00Z',
};

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DraftEditDialog draft={DRAFT} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('DraftEditDialog', () => {
  it('announces a validation failure as an alert without a second live region', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Vui lòng nhập tiêu đề trước khi lưu.');
    expect(alert).not.toHaveAttribute('aria-live');
  });
});
