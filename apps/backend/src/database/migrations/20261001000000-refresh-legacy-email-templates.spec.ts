import type { QueryRunner } from 'typeorm';
import { RefreshLegacyEmailTemplates20261001000000 } from './20261001000000-refresh-legacy-email-templates';

describe('RefreshLegacyEmailTemplates20261001000000', () => {
  it('updates only exact legacy templates while retaining tenant identity', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const runner = { query } as unknown as QueryRunner;

    await new RefreshLegacyEmailTemplates20261001000000().up(runner);

    expect(query).toHaveBeenCalledTimes(10);
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toContain('t."organizationId" = original."organizationId"');
      expect(sql).toContain('t."bodyHtml" = original."bodyHtml"');
      expect(sql).toContain('"name" = $4');
      expect(sql).toContain('"subject" = $5');
      expect(sql).toContain('"bodyHtml" = $6');
      expect(params).toHaveLength(8);
    }

    const demo = query.mock.calls.find(
      ([, params]) => params[3] === 'Invoice Reminder',
    );
    expect(demo?.[1][0]).toBe('Nhắc thanh toán hóa đơn');
    expect(demo?.[1][2]).toContain('Thông báo công nợ');
  });
});
