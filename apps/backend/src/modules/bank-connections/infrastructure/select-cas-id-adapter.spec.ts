import { Logger } from '@nestjs/common';
import { CasIdAdapter } from './cas-id.adapter';
import { MockCasIdAdapter } from './mock-cas-id.adapter';
import { selectCasIdAdapter } from './select-cas-id-adapter';

describe('selectCasIdAdapter', () => {
  it('returns CasIdAdapter when both credentials are set', () => {
    const adapter = selectCasIdAdapter({
      CAS_ID_CLIENT_ID: 'client',
      CAS_ID_CLIENT_SECRET: 'secret',
    } as NodeJS.ProcessEnv);
    expect(adapter).toBeInstanceOf(CasIdAdapter);
  });

  it('returns MockCasIdAdapter when neither credential is set', () => {
    const adapter = selectCasIdAdapter({} as NodeJS.ProcessEnv);
    expect(adapter).toBeInstanceOf(MockCasIdAdapter);
  });

  it('falls back to MockCasIdAdapter and warns when only CAS_ID_CLIENT_ID is set', () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const adapter = selectCasIdAdapter({
      CAS_ID_CLIENT_ID: 'client',
    } as NodeJS.ProcessEnv);
    expect(adapter).toBeInstanceOf(MockCasIdAdapter);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('falls back to MockCasIdAdapter and warns when only CAS_ID_CLIENT_SECRET is set', () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const adapter = selectCasIdAdapter({
      CAS_ID_CLIENT_SECRET: 'secret',
    } as NodeJS.ProcessEnv);
    expect(adapter).toBeInstanceOf(MockCasIdAdapter);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
