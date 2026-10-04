import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AiUsageAggregateItem } from '../api/admin-api';
import {
  AdminUsageCharts,
  MAX_ORGANIZATION_BARS,
  rollUpByOrganization,
  toAxisLabel,
} from './admin-usage-charts';

function usage(
  organizationId: string,
  organizationName: string,
  model: string,
  requestCount: number,
): AiUsageAggregateItem {
  return {
    organizationId,
    organizationName,
    model,
    requestCount,
    totalTokens: requestCount * 100,
    errorCount: 0,
  };
}

describe('AdminUsageCharts', () => {
  it('renders accessible empty states for both charts', () => {
    render(<AdminUsageCharts topOrganizations={[]} trend={[]} />);

    expect(screen.getByText(/tổ chức dùng ai nhiều nhất/i)).toBeInTheDocument();
    expect(screen.getByText(/xu hướng dùng ai theo ngày/i)).toBeInTheDocument();
    expect(screen.getAllByText(/chưa có dữ liệu sử dụng/i)).toHaveLength(2);
    expect(screen.getAllByTestId('empty-state')).toHaveLength(2);
  });

  it('rolls the per-model usage rows up into one bar per organization', () => {
    const rolled = rollUpByOrganization([
      usage('org-a', 'Alpha', 'gemini-flash', 3),
      usage('org-a', 'Alpha', 'gemini-lite', 4),
      usage('org-b', 'Beta', 'gpt-4o-mini', 2),
    ]);

    expect(rolled).toEqual([
      {
        organizationId: 'org-a',
        organizationName: 'Alpha',
        axisLabel: 'Alpha',
        requestCount: 7,
      },
      {
        organizationId: 'org-b',
        organizationName: 'Beta',
        axisLabel: 'Beta',
        requestCount: 2,
      },
    ]);
  });

  it('keeps the busiest organizations when there are more than fit on the axis', () => {
    const rolled = rollUpByOrganization([
      usage('org-a', 'Alpha', 'm', 1),
      usage('org-b', 'Beta', 'm', 5),
      usage('org-c', 'Gamma', 'm', 3),
      usage('org-d', 'Delta', 'm', 4),
      usage('org-e', 'Epsilon', 'm', 9),
      usage('org-f', 'Zeta', 'm', 2),
      usage('org-g', 'Eta', 'm', 7),
      usage('org-h', 'Theta', 'm', 6),
    ]);

    expect(rolled).toHaveLength(MAX_ORGANIZATION_BARS);
    // Sorted by volume, so the heaviest callers survive the cut.
    expect(rolled.map((entry) => entry.organizationName)).toEqual([
      'Epsilon',
      'Eta',
      'Theta',
      'Beta',
      'Delta',
      'Gamma',
    ]);
  });

  it('keeps the full organization name for the horizontal axis', () => {
    const legalName =
      'Công ty Cổ phần Thương mại Dịch vụ Xuất Nhập Khẩu Tổng hợp Perf Test Rất Dài';
    const rolled = rollUpByOrganization([
      usage('org-a', legalName, 'm', 3),
      usage('org-b', 'Cold Start Test', 'm', 2),
    ]);

    // Bars run horizontally so the name sits on the vertical axis, which has
    // room for it. Abbreviating would drop the tail that distinguishes two
    // similarly-named companies.
    expect(rolled[0].organizationName).toBe(legalName);
    expect(rolled[1].organizationName).toBe('Cold Start Test');
  });

  it('trims a very long legal name so it fits the axis without losing the tail', () => {
    const legalName =
      'Công ty Cổ phần Thương mại Dịch vụ Xuất Nhập Khẩu Tổng hợp Perf Test Rất Dài';

    const label = toAxisLabel(legalName);

    expect(label.length).toBeLessThanOrEqual(26);
    expect(label).toContain('…');
    // The distinguishing tail survives, so two similar names stay tellable apart.
    expect(label.endsWith('Test Rất Dài')).toBe(true);
    expect(toAxisLabel('Cold Start Test')).toBe('Cold Start Test');
  });
});
