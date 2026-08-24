import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/contexts/auth-context';
import { SignupPage } from './signup-page';

const { getValidAccessToken, apiRequest } = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const { getApiErrorCode, getApiErrorMessage } = await import(
    '@/test/api-error-mock'
  );
  return {
    authTokenManager: {
      getValidAccessToken,
      hasKnownSession: () => true,
      setAccessToken: vi.fn(),
      resetLogoutState: vi.fn(),
      markLogoutInitiated: vi.fn(),
      clearStaleRefreshSession: vi.fn(),
    },
    apiRequest,
    getApiErrorCode,
    getApiErrorMessage,
  };
});

function renderSignupPage() {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/dashboard" element={<div>dashboard</div>} />
          <Route path="/onboarding" element={<div>onboarding</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/tên tổ chức/i), {
    target: { value: 'Casso Ledger' },
  });
  fireEvent.change(screen.getByLabelText(/mã số thuế/i), {
    target: { value: '0101234567' },
  });
  fireEvent.change(screen.getByLabelText(/họ và tên/i), {
    target: { value: 'New User' },
  });
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'new@casso.vn' },
  });
  fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
    target: { value: 'secret123' },
  });
  fireEvent.click(screen.getByRole('button', { name: /tạo tài khoản/i }));
}

describe('SignupPage', () => {
  beforeEach(() => {
    getValidAccessToken.mockReset();
    apiRequest.mockReset();
    getValidAccessToken.mockResolvedValue(null);
  });

  it('sends the new account to the OTP step inline', async () => {
    apiRequest.mockResolvedValueOnce({
      userId: 'user-1',
      organizationId: 'org-1',
      organizationStatus: 'PENDING_REVIEW',
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route path="/signup" element={<SignupPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );
    expect(
      screen.queryByText(/không thể tạo tài khoản/i),
    ).not.toBeInTheDocument();
  });

  it('renders the logo inside the card on the OTP step, matching every other auth status screen', async () => {
    apiRequest.mockResolvedValueOnce({
      userId: 'user-1',
      organizationId: 'org-1',
      organizationStatus: 'PENDING_REVIEW',
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route path="/signup" element={<SignupPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );

    const card = screen
      .getByRole('heading', { name: /xác thực email/i })
      .closest('.rounded-xl');
    expect(card).toContainElement(
      screen.getByRole('link', { name: /casso ledger/i }),
    );
  });

  it('shows an error when the signup request itself fails', async () => {
    apiRequest.mockRejectedValue(new Error('signup failed'));

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/dashboard" element={<div>dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/không thể tạo tài khoản/i)).toBeVisible(),
    );
  });

  it('shows the backend message when the tax code is already registered', async () => {
    apiRequest.mockRejectedValue({
      response: {
        status: 409,
        data: {
          statusCode: 409,
          errorCode: 'CONFLICT',
          message: 'Mã số thuế này đã được đăng ký.',
          details: { rowErrorCode: 'DUPLICATE_TAX_CODE' },
        },
      },
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route path="/signup" element={<SignupPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/mã số thuế này đã được đăng ký/i)).toBeVisible(),
    );
  });

  it('rejects a malformed tax code before submitting', async () => {
    apiRequest.mockResolvedValue({
      userId: 'u1',
      organizationId: 'o1',
      organizationStatus: 'ACTIVE',
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/verify-email" element={<div>verify email</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    fireEvent.change(screen.getByLabelText(/tên tổ chức/i), {
      target: { value: 'Casso Ledger' },
    });
    fireEvent.change(screen.getByLabelText(/mã số thuế/i), {
      target: { value: '123' },
    });
    fireEvent.change(screen.getByLabelText(/họ và tên/i), {
      target: { value: 'New User' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'new@casso.vn' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /tạo tài khoản/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/mã số thuế phải gồm 10 hoặc 13 chữ số/i),
      ).toBeVisible(),
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });

  // ─── Prefill behavior tests (Task 4 RED) ───────────────────────────────────

  it('prefills the organization name from a valid tax-code blur', async () => {
    // Lookup resolves; signup not yet called
    apiRequest.mockResolvedValueOnce({ name: 'Công ty TNHH CASSO' });

    renderSignupPage();
    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );

    const taxInput = screen.getByLabelText(/mã số thuế/i);
    fireEvent.change(taxInput, { target: { value: '0101234567' } });
    fireEvent.blur(taxInput);

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toHaveValue(
        'Công ty TNHH CASSO',
      ),
    );

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/tax-verification/lookup?taxCode=0101234567',
      method: 'GET',
    });
  });

  it('does not overwrite a name already typed by the user', async () => {
    apiRequest.mockResolvedValueOnce({ name: 'Công ty TNHH CASSO' });

    renderSignupPage();
    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );

    // User types their own name first
    fireEvent.change(screen.getByLabelText(/tên tổ chức/i), {
      target: { value: 'Tên tự nhập' },
    });

    const taxInput = screen.getByLabelText(/mã số thuế/i);
    fireEvent.change(taxInput, { target: { value: '0101234567' } });
    fireEvent.blur(taxInput);

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());

    // Name must remain unchanged
    expect(screen.getByLabelText(/tên tổ chức/i)).toHaveValue('Tên tự nhập');
  });

  it('does not overwrite when user typed a name and then cleared it', async () => {
    apiRequest.mockResolvedValueOnce({ name: 'Công ty TNHH CASSO' });

    renderSignupPage();
    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );

    // User types then clears
    const orgInput = screen.getByLabelText(/tên tổ chức/i);
    fireEvent.change(orgInput, { target: { value: 'Typed' } });
    fireEvent.change(orgInput, { target: { value: '' } });

    const taxInput = screen.getByLabelText(/mã số thuế/i);
    fireEvent.change(taxInput, { target: { value: '0101234567' } });
    fireEvent.blur(taxInput);

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());

    // Must remain empty — user-edited flag prevents auto-fill
    expect(screen.getByLabelText(/tên tổ chức/i)).toHaveValue('');
  });

  it('clears the auto-filled name when the tax code changes', async () => {
    // First lookup resolves
    apiRequest.mockResolvedValueOnce({ name: 'Công ty A' });

    renderSignupPage();
    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );

    const taxInput = screen.getByLabelText(/mã số thuế/i);
    fireEvent.change(taxInput, { target: { value: '0101234567' } });
    fireEvent.blur(taxInput);

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toHaveValue('Công ty A'),
    );

    // Now user changes the tax code
    fireEvent.change(taxInput, { target: { value: '0101234568' } });

    // The auto-filled name should be cleared
    expect(screen.getByLabelText(/tên tổ chức/i)).toHaveValue('');
  });

  it('ignores a stale lookup response when a newer tax code is current', async () => {
    let resolveFirst!: (v: { name: string }) => void;
    const firstLookup = new Promise<{ name: string }>(
      (res) => (resolveFirst = res),
    );

    apiRequest
      .mockReturnValueOnce(firstLookup) // first lookup (for code A) — deferred
      .mockResolvedValueOnce({ name: 'Công ty B' }); // second lookup (for code B)

    renderSignupPage();
    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );

    const taxInput = screen.getByLabelText(/mã số thuế/i);

    // Blur with code A — first lookup fires but not yet resolved
    fireEvent.change(taxInput, { target: { value: '0101234561' } });
    fireEvent.blur(taxInput);

    // Change to code B and blur — second lookup fires and resolves
    fireEvent.change(taxInput, { target: { value: '0101234562' } });
    fireEvent.blur(taxInput);

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toHaveValue('Công ty B'),
    );

    // Now resolve the first (stale) lookup — it must NOT overwrite
    resolveFirst({ name: 'Công ty A (stale)' });

    // Small settle to ensure no async state update occurs
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByLabelText(/tên tổ chức/i)).toHaveValue('Công ty B');
  });

  it('leaves the form usable when the lookup fails', async () => {
    apiRequest.mockRejectedValueOnce(new Error('network error'));
    // Signup request mocked for subsequent submit
    apiRequest.mockResolvedValueOnce({
      userId: 'u1',
      organizationId: 'o1',
      organizationStatus: 'PENDING_REVIEW',
    });

    renderSignupPage();
    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );

    const taxInput = screen.getByLabelText(/mã số thuế/i);
    fireEvent.change(taxInput, { target: { value: '0101234567' } });
    fireEvent.blur(taxInput);

    // Wait for the failed lookup to settle
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));

    // No lookup error message shown
    expect(screen.queryByText(/lỗi|error/i)).not.toBeInTheDocument();

    // User can still type and submit
    fireEvent.change(screen.getByLabelText(/tên tổ chức/i), {
      target: { value: 'Manual Name' },
    });
    fireEvent.change(screen.getByLabelText(/họ và tên/i), {
      target: { value: 'New User' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'new@casso.vn' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /tạo tài khoản/i }));

    await waitFor(() =>
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );
  });

  it('leaves the form usable when the lookup returns null', async () => {
    apiRequest.mockResolvedValueOnce({ name: null });
    apiRequest.mockResolvedValueOnce({
      userId: 'u1',
      organizationId: 'o1',
      organizationStatus: 'PENDING_REVIEW',
    });

    renderSignupPage();
    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );

    const taxInput = screen.getByLabelText(/mã số thuế/i);
    fireEvent.change(taxInput, { target: { value: '0101234567' } });
    fireEvent.blur(taxInput);

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));

    // Organization name stays empty, no error
    expect(screen.getByLabelText(/tên tổ chức/i)).toHaveValue('');
    expect(screen.queryByText(/lỗi|error/i)).not.toBeInTheDocument();
  });
});
