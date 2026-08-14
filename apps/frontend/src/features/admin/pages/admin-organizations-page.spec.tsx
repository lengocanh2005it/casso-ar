import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as adminApi from '../api/admin-api';
import { AdminOrganizationsPage } from './admin-organizations-page';

vi.mock('../api/admin-api');

describe('AdminOrganizationsPage', () => {
  it('lists organizations and locks one via the breaker switch', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'ACTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    });
    vi.mocked(adminApi.lockOrganization).mockResolvedValue({
      status: 'LOCKED',
    });

    render(<AdminOrganizationsPage />);

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: /acme/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(adminApi.lockOrganization).toHaveBeenCalledWith('org-1'),
    );
  });
});
