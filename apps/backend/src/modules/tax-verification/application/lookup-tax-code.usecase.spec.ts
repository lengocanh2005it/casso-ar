import { LookupTaxCodeUseCase } from './lookup-tax-code.usecase';

describe('LookupTaxCodeUseCase', () => {
  it('returns the adapter result for a tax code', async () => {
    const adapter = {
      lookup: jest.fn().mockResolvedValue({ name: 'Công ty TNHH CASSO' }),
    };
    const useCase = new LookupTaxCodeUseCase(adapter);

    await expect(useCase.execute('0101234567')).resolves.toEqual({
      name: 'Công ty TNHH CASSO',
    });
    expect(adapter.lookup).toHaveBeenCalledWith('0101234567');
  });

  it('returns null when the adapter returns null', async () => {
    const adapter = {
      lookup: jest.fn().mockResolvedValue(null),
    };
    const useCase = new LookupTaxCodeUseCase(adapter);

    await expect(useCase.execute('0101234567')).resolves.toBeNull();
    expect(adapter.lookup).toHaveBeenCalledWith('0101234567');
  });
});
