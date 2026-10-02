import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/theme-context';
import { apiRequest } from '@/lib/api-client';
import { LandingPage } from './landing-page';

vi.mock('@/lib/api-client', () => ({ apiRequest: vi.fn() }));

describe('LandingPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders every section', () => {
    vi.mocked(apiRequest).mockResolvedValue([]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter>
            <LandingPage />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole('heading', { name: /thu tiền/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ba bước là xong')).toBeInTheDocument();
    expect(screen.getByText('Gói dịch vụ linh hoạt')).toBeInTheDocument();

    const sectionIds = Array.from(
      document.querySelectorAll('main section'),
      (section) => section.id,
    );
    expect(sectionIds.indexOf('gioi-thieu')).toBeLessThan(
      sectionIds.indexOf('san-pham'),
    );
  });

  it('keeps the content sections compact and visually separated', () => {
    vi.mocked(apiRequest).mockResolvedValue([]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter>
            <LandingPage />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(document.getElementById('tinh-nang')).toHaveClass(
      'bg-muted/20',
      'py-16',
      'sm:py-20',
    );
    expect(document.getElementById('cach-hoat-dong')).toHaveClass(
      'bg-background',
      'py-16',
      'sm:py-20',
    );
    expect(document.getElementById('bang-gia')).toHaveClass(
      'bg-muted/20',
      'py-16',
      'sm:py-20',
    );
  });

  it('adds supporting copy below each major section heading', () => {
    vi.mocked(apiRequest).mockResolvedValue([]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter>
            <LandingPage />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(
      screen.getByText(
        'Theo dõi toàn bộ dòng tiền và công nợ trên cùng một luồng làm việc.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Những công cụ giúp bạn thu tiền đúng hạn và giảm thao tác thủ công.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Từ theo dõi đến nhắc nợ, mọi công cụ cần thiết đều ở một nơi.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Kết nối ngân hàng, nhận giao dịch và để hệ thống tự đối chiếu.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Bắt đầu miễn phí và nâng cấp khi nhu cầu quản lý tăng lên.',
      ),
    ).toBeInTheDocument();
  });
});
