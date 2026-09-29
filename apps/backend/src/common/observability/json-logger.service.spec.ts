import type { AuthenticatedUser } from '../auth/authenticated-user';
import { TenantContextService } from '../tenancy/tenant-context';
import { JsonLogger } from './json-logger.service';
import { RequestIdStore } from './request-id.store';

describe('JsonLogger', () => {
  const originalLogLevel = process.env.LOG_LEVEL;
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
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }
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

  it('keeps a userId passed in the log fields when no user is authenticated', () => {
    logger.warn({ message: 'pre-auth event', userId: 'user-9' }, 'TestContext');

    const written = JSON.parse(writeSpy.mock.calls[0][0] as string);
    expect(written.userId).toBe('user-9');
  });

  it('prefers the authenticated user over a userId in the log fields', () => {
    tenantContext.run(
      {
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER' as AuthenticatedUser['role'],
      },
      () => {
        logger.warn(
          { message: 'event', userId: 'someone-else' },
          'TestContext',
        );
      },
    );

    const written = JSON.parse(writeSpy.mock.calls[0][0] as string);
    expect(written.userId).toBe('user-1');
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

  it('filters entries below the configured log level', () => {
    process.env.LOG_LEVEL = 'warn';
    logger = new JsonLogger(requestIdStore, tenantContext);

    logger.debug('hidden debug');
    logger.log('hidden info');
    logger.warn('visible warning');

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = JSON.parse(writeSpy.mock.calls[0][0] as string);
    expect(written.level).toBe('warn');
    expect(written.message).toBe('visible warning');
  });

  it('falls back to info when the configured log level is invalid', () => {
    process.env.LOG_LEVEL = 'not-a-level';
    logger = new JsonLogger(requestIdStore, tenantContext);

    logger.debug('hidden debug');
    logger.log('visible info');

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = JSON.parse(writeSpy.mock.calls[0][0] as string);
    expect(written.level).toBe('log');
  });
});
