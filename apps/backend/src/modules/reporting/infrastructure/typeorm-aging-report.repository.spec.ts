import type { DataSource } from 'typeorm';
import { TypeOrmAgingReportRepository } from './typeorm-aging-report.repository';

describe('TypeOrmAgingReportRepository', () => {
  it.each(['12345', '9007199254740992'])(
    'preserves aggregate total %s as a decimal string',
    async (totalRemaining) => {
      const dataSource = {
        query: jest
          .fn()
          .mockResolvedValue([
            { bucket: 'NOT_DUE', count: '1', totalRemaining },
          ]),
      } as unknown as DataSource;
      const repository = new TypeOrmAgingReportRepository(dataSource);

      await expect(repository.findBucketCounts('org-1')).resolves.toEqual([
        { bucket: 'NOT_DUE', count: 1, totalRemaining },
      ]);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'SUM("originalAmount" - "paidAmount")::text, \'0\')',
        ),
        ['org-1'],
      );
    },
  );
});
