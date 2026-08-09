import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetDashboardSummaryQueryDto } from './get-dashboard-summary-query.dto';

async function validationErrors(input: object) {
  return validate(plainToInstance(GetDashboardSummaryQueryDto, input));
}

describe('GetDashboardSummaryQueryDto', () => {
  it('accepts omitted date range', async () => {
    await expect(validationErrors({})).resolves.toHaveLength(0);
  });

  it('accepts an ordered range of at most 90 days', async () => {
    await expect(
      validationErrors({ from: '2026-01-01', to: '2026-04-01' }),
    ).resolves.toHaveLength(0);
  });

  it('rejects a range whose from date is after its to date', async () => {
    await expect(
      validationErrors({ from: '2026-04-02', to: '2026-04-01' }),
    ).resolves.not.toHaveLength(0);
  });

  it('rejects a range longer than 90 days', async () => {
    await expect(
      validationErrors({ from: '2026-01-01', to: '2026-04-02' }),
    ).resolves.not.toHaveLength(0);
  });

  it('rejects a non-ISO date string', async () => {
    await expect(
      validationErrors({ from: '01/01/2026', to: '2026-01-02' }),
    ).resolves.not.toHaveLength(0);
  });

  it('rejects from supplied without to', async () => {
    await expect(
      validationErrors({ from: '2026-01-01' }),
    ).resolves.not.toHaveLength(0);
  });

  it('rejects to supplied without from', async () => {
    await expect(
      validationErrors({ to: '2026-01-01' }),
    ).resolves.not.toHaveLength(0);
  });
});
