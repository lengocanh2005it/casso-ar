import type { AuthenticatedUser } from '../auth/authenticated-user';
import { TenantContextService } from '../tenancy/tenant-context';
import { JsonLogger } from './json-logger.service';
import { RequestIdStore } from './request-id.store';

describe('JsonLogger', () => {
  let requestIdStore: RequestIdStore;
  let tenantContext: TenantContextService;
  let logger: JsonLogger;
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    requestIdStore = new RequestIdStore();
    tenantContext = new TenantContextService();
    logger = new JsonLogger(requestIdStore, tenantContext);
    writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('writes a JSON line with timestamp, level, message, context', () => {
    logger.log('hello world', 'TestContext');

    const written = JSON.parse(writeSpy.mock.calls[0][0] as string);
    expect(written.level).toBe('log');
    expect(written.message).toBe('hello world');
    expect(written.context).toBe('TestContext');
    expect(typeof written.timestamp).toBe('string');
    expect(written.organizationId).toBeUndefined();
    expect(written.userId).toBeUndefined();
  });

  it('includes requestId when inside a RequestIdStore scope', () => {
    requestIdStore.run('req-999', () => {
      logger.log('scoped message', 'TestContext');
    });

    const written = JSON.parse(writeSpy.mock.calls[0][0] as string);
    expect(written.requestId).toBe('req-999');
  });

  it('includes organizationId and userId inside an authenticated scope', () => {
    tenantContext.run(
      {
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER' as AuthenticatedUser['role'],
      },
      () => {
        logger.error('boom', undefined, 'TestContext');
      },
    );

    const written = JSON.parse(writeSpy.mock.calls[0][0] as string);
    expect(written.level).toBe('error');
    expect(written.organizationId).toBe('org-1');
    expect(written.userId).toBe('user-1');
  });
});
