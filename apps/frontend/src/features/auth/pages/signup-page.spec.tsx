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

function submitTaxCode(taxCode = '0101234567') {
  fireEvent.change(screen.getByLabelText(/mã số thuế/i), {
    target: { value: taxCode },
  });
  fireEvent.click(screen.getByRole('button', { name: /tiếp tục/i }));
}

function confirmOrganization() {
  fireEvent.click(
    screen.getByRole('button', { name: /đúng, đây là tổ chức của tôi/i }),
  );
}

function declineOrganization() {
  fireEvent.click(
    screen.getByRole('button', { name: /không phải tổ chức của tôi/i }),
  );
}

function fillFormAndSubmit(values?: {
  organizationName?: string;
  name?: string;
  email?: string;
  password?: string;
}) {
  if (values?.organizationName !== undefined) {
    fireEvent.change(screen.getByLabelText(/tên tổ chức/i), {
      target: { value: values.organizationName },
    });
  }
  fireEvent.change(screen.getByLabelText(/họ và tên/i), {
    target: { value: values?.name ?? 'New User' },
  });
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: values?.email ?? 'new@casso.vn' },
  });
  fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
    target: { value: values?.password ?? 'secret123' },
  });
  fireEvent.click(screen.getByRole('button', { name: /tạo tài khoản/i }));
}

describe('SignupPage', () => {
  beforeEach(() => {
    getValidAccessToken.mockReset();
    apiRequest.mockReset();
    getValidAccessToken.mockResolvedValue(null);
  });

  it('Scenario 1 & 10: happy path: tax code found -> confirming shows resolved name -> confirm -> prefilled form -> submit -> OTP step with card logo', async () => {
    apiRequest.mockResolvedValueOnce({ name: 'Công ty TNHH CASSO' });
    apiRequest.mockResolvedValueOnce({
      userId: 'user-1',
      organizationId: 'org-1',
      organizationStatus: 'PENDING_REVIEW',
    });

    renderSignupPage();

    await waitFor(() =>
      expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
    );

    submitTaxCode('0101234567');

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /xác nhận tổ chức/i }),
      ).toBeVisible(),
    );
    expect(screen.getByText('0101234567')).toBeVisible();
    expect(screen.getByText('Công ty TNHH CASSO')).toBeVisible();

    confirmOrganization();

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    expect(screen.getByLabelText(/tên tổ chức/i)).toHaveValue(
      'Công ty TNHH CASSO',
    );
    expect(
      screen.queryByText(
        /chúng tôi không xác minh được tổ chức tự động — vui lòng nhập tên tổ chức/i,
      ),
    ).not.toBeInTheDocument();

    fillFormAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );
    expect(
      screen.queryByText(/không thể tạo tài khoản/i),
    ).not.toBeInTheDocument();

    expect(apiRequest).toHaveBeenNthCalledWith(1, {
      url: '/api/v1/tax-verification/lookup?taxCode=0101234567',
      method: 'GET',
    });
    expect(apiRequest).toHaveBeenNthCalledWith(2, {
      url: '/api/v1/auth/signup',
      method: 'POST',
      data: {
        organizationName: 'Công ty TNHH CASSO',
        name: 'New User',
        email: 'new@casso.vn',
        password: 'secret123',
        taxCode: '0101234567',
      },
    });

    const card = screen
      .getByRole('heading', { name: /xác thực email/i })
      .closest('.rounded-xl');
    expect(card).toContainElement(
      screen.getByRole('link', { name: /casso ledger/i }),
    );
  });

  it('Scenario 2: tax code found -> decline on confirming -> form step has empty editable name and notice -> submit works', async () => {
    apiRequest.mockResolvedValueOnce({ name: 'Công ty TNHH CASSO' });
    apiRequest.mockResolvedValueOnce({
      userId: 'user-1',
      organizationId: 'org-1',
      organizationStatus: 'PENDING_REVIEW',
    });

    renderSignupPage();

    await waitFor(() =>
      expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
    );

    submitTaxCode('0101234567');

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /xác nhận tổ chức/i }),
      ).toBeVisible(),
    );

    declineOrganization();

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    expect(screen.getByLabelText(/tên tổ chức/i)).toHaveValue('');
    expect(
      screen.getByText(
        /chúng tôi không xác minh được tổ chức tự động — vui lòng nhập tên tổ chức/i,
      ),
    ).toBeVisible();

    fillFormAndSubmit({ organizationName: 'Công ty TNHH Tuỳ Chỉnh' });

    await waitFor(() =>
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );

    expect(apiRequest).toHaveBeenNthCalledWith(2, {
      url: '/api/v1/auth/signup',
      method: 'POST',
      data: {
        organizationName: 'Công ty TNHH Tuỳ Chỉnh',
        name: 'New User',
        email: 'new@casso.vn',
        password: 'secret123',
        taxCode: '0101234567',
      },
    });
  });

  it('Scenario 3: tax code not found ({ name: null }) -> advances directly to form step with empty name and notice', async () => {
    apiRequest.mockResolvedValueOnce({ name: null });

    renderSignupPage();

    await waitFor(() =>
      expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
    );

    submitTaxCode('0101234567');

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    expect(screen.getByLabelText(/tên tổ chức/i)).toHaveValue('');
    expect(
      screen.getByText(
        /chúng tôi không xác minh được tổ chức tự động — vui lòng nhập tên tổ chức/i,
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /đúng, đây là tổ chức của tôi/i }),
    ).not.toBeInTheDocument();
  });

  it('Scenario 4: malformed tax code -> rejected client-side before calling API', async () => {
    renderSignupPage();

    await waitFor(() =>
      expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
    );

    fireEvent.change(screen.getByLabelText(/mã số thuế/i), {
      target: { value: '123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /tiếp tục/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/mã số thuế phải gồm 10 hoặc 13 chữ số/i),
      ).toBeVisible(),
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('Scenario 5: lookup returns RATE_LIMIT_EXCEEDED -> stays on taxCode step and shows error', async () => {
    apiRequest.mockRejectedValueOnce({
      response: {
        status: 429,
        data: {
          statusCode: 429,
          errorCode: 'RATE_LIMIT_EXCEEDED',
          message: 'Bạn đã thực hiện quá nhiều yêu cầu. Vui lòng thử lại sau.',
        },
      },
    });

    renderSignupPage();

    await waitFor(() =>
      expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
    );

    submitTaxCode('0101234567');

    await waitFor(() =>
      expect(
        screen.getByText(/bạn đã thực hiện quá nhiều yêu cầu/i),
      ).toBeVisible(),
    );
    expect(
      screen.getByRole('button', { name: /tiếp tục/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/tên tổ chức/i)).not.toBeInTheDocument();
  });

  it('Scenario 6: lookup fails with non-rate-limit error -> silently proceeds to form step with empty name', async () => {
    apiRequest.mockRejectedValueOnce(new Error('network error'));

    renderSignupPage();

    await waitFor(() =>
      expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
    );

    submitTaxCode('0101234567');

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    expect(screen.getByLabelText(/tên tổ chức/i)).toHaveValue('');
    expect(screen.queryByText(/lỗi|error/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /chúng tôi không xác minh được tổ chức tự động — vui lòng nhập tên tổ chức/i,
      ),
    ).toBeVisible();
  });

  it('Scenario 7: back button from confirming returns to taxCode with tax code preserved', async () => {
    apiRequest.mockResolvedValueOnce({ name: 'Công ty TNHH CASSO' });

    renderSignupPage();

    await waitFor(() =>
      expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
    );

    submitTaxCode('0101234567');

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /xác nhận tổ chức/i }),
      ).toBeVisible(),
    );

    fireEvent.click(screen.getByRole('button', { name: /quay lại/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
    );
    expect(screen.getByLabelText(/mã số thuế/i)).toHaveValue('0101234567');
  });

  describe('Scenario 8: back button from form step', () => {
    it('returns to confirming when arrived via confirm', async () => {
      apiRequest.mockResolvedValueOnce({ name: 'Công ty TNHH CASSO' });

      renderSignupPage();

      await waitFor(() =>
        expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
      );

      submitTaxCode('0101234567');

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /đúng, đây là tổ chức của tôi/i }),
        ).toBeVisible(),
      );

      confirmOrganization();

      await waitFor(() =>
        expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
      );

      fireEvent.click(screen.getByRole('button', { name: /quay lại/i }));

      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /xác nhận tổ chức/i }),
        ).toBeVisible(),
      );
    });

    it('returns to taxCode when arrived via tax-code not-found', async () => {
      apiRequest.mockResolvedValueOnce({ name: null });

      renderSignupPage();

      await waitFor(() =>
        expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
      );

      submitTaxCode('0101234567');

      await waitFor(() =>
        expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
      );

      fireEvent.click(screen.getByRole('button', { name: /quay lại/i }));

      await waitFor(() =>
        expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
      );
      expect(screen.getByLabelText(/mã số thuế/i)).toHaveValue('0101234567');
    });

    it('returns to taxCode when arrived via decline on confirming', async () => {
      apiRequest.mockResolvedValueOnce({ name: 'Công ty TNHH CASSO' });

      renderSignupPage();

      await waitFor(() =>
        expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
      );

      submitTaxCode('0101234567');

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /không phải tổ chức của tôi/i }),
        ).toBeVisible(),
      );

      declineOrganization();

      await waitFor(() =>
        expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
      );

      fireEvent.click(screen.getByRole('button', { name: /quay lại/i }));

      await waitFor(() =>
        expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
      );
      expect(screen.getByLabelText(/mã số thuế/i)).toHaveValue('0101234567');
    });

    it('returns to taxCode when arrived via silent lookup error fallback', async () => {
      apiRequest.mockRejectedValueOnce(new Error('network error'));

      renderSignupPage();

      await waitFor(() =>
        expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
      );

      submitTaxCode('0101234567');

      await waitFor(() =>
        expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
      );

      fireEvent.click(screen.getByRole('button', { name: /quay lại/i }));

      await waitFor(() =>
        expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
      );
      expect(screen.getByLabelText(/mã số thuế/i)).toHaveValue('0101234567');
    });
  });

  it('Scenario 9: shows the backend message when signup fails with duplicate tax code 409 conflict', async () => {
    apiRequest.mockResolvedValueOnce({ name: 'Công ty TNHH CASSO' });
    apiRequest.mockRejectedValueOnce({
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

    renderSignupPage();

    await waitFor(() =>
      expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
    );

    submitTaxCode('0101234567');

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /đúng, đây là tổ chức của tôi/i }),
      ).toBeVisible(),
    );

    confirmOrganization();

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );

    fillFormAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/mã số thuế này đã được đăng ký/i)).toBeVisible(),
    );
  });

  it('shows an error when the signup request itself fails with a generic error', async () => {
    apiRequest.mockResolvedValueOnce({ name: null });
    apiRequest.mockRejectedValueOnce(new Error('signup failed'));

    renderSignupPage();

    await waitFor(() =>
      expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
    );

    submitTaxCode('0101234567');

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );

    fillFormAndSubmit({ organizationName: 'Công ty ABC' });

    await waitFor(() =>
      expect(screen.getByText(/không thể tạo tài khoản/i)).toBeVisible(),
    );
  });
});
