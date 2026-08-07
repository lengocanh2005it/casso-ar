import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AuditActionType } from './audit.enums';
import { AuditInterceptor } from './audit.interceptor';
import { AuditContextService } from './audit-context';

function buildContext(
  metadata: object | undefined,
  params: Record<string, string> = { id: 'rec-1' },
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params, ip: '127.0.0.1' }) }),
    getHandler: () => 'handler',
    getClass: () => 'controller',
    reflectorMetadata: metadata,
  } as unknown as ExecutionContext;
}

function buildInterceptor(metadata: object | undefined) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(metadata),
  } as unknown as Reflector;
  const auditContext = new AuditContextService();
  const tenantContext = {
    getCurrentUser: () => ({
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'OWNER',
    }),
  };
  const auditLogRepo = { create: jest.fn().mockResolvedValue(undefined) };
  const interceptor = new AuditInterceptor(
    reflector,
    auditContext,
    tenantContext as never,
    auditLogRepo as never,
  );
  return { interceptor, auditContext, auditLogRepo };
}

describe('AuditInterceptor', () => {
  it('writes a sanitized audit log after a decorated handler succeeds', async () => {
    const { interceptor, auditContext, auditLogRepo } = buildInterceptor({
      actionType: AuditActionType.RECEIVABLE_WRITE_OFF,
      entityType: 'Receivable',
    });
    const context = buildContext({
      actionType: AuditActionType.RECEIVABLE_WRITE_OFF,
      entityType: 'Receivable',
    });
    const handler: CallHandler = {
      handle: () => {
        auditContext.setBefore({
          id: 'rec-1',
          status: 'OPEN',
          token: 'secret',
        });
        return of({ id: 'rec-1', status: 'WRITTEN_OFF' });
      },
    };

    await lastValueFrom(interceptor.intercept(context, handler));

    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        actionType: AuditActionType.RECEIVABLE_WRITE_OFF,
        entityType: 'Receivable',
        entityId: 'rec-1',
        beforeState: {
          id: 'rec-1',
          status: 'OPEN',
          token: '[REDACTED]',
        },
        afterState: { id: 'rec-1', status: 'WRITTEN_OFF' },
      }),
    );
  });

  it('does not write an audit log when the handler fails', async () => {
    const { interceptor, auditLogRepo } = buildInterceptor({
      actionType: AuditActionType.RECEIVABLE_WRITE_OFF,
      entityType: 'Receivable',
    });
    const handler: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    await expect(
      lastValueFrom(interceptor.intercept(buildContext(undefined), handler)),
    ).rejects.toThrow('boom');
    expect(auditLogRepo.create).not.toHaveBeenCalled();
  });

  it('logs instead of silently dropping a failed audit write', async () => {
    const { interceptor, auditLogRepo } = buildInterceptor({
      actionType: AuditActionType.RECEIVABLE_WRITE_OFF,
      entityType: 'Receivable',
    });
    auditLogRepo.create.mockRejectedValue(new Error('db unavailable'));
    const handler: CallHandler = {
      handle: () => of({ id: 'rec-1', status: 'WRITTEN_OFF' }),
    };
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await lastValueFrom(
      interceptor.intercept(buildContext(undefined), handler),
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Failed to write audit log' }),
    );
    errorSpy.mockRestore();
  });

  it('passes through undecorated handlers without reading tenant context', async () => {
    const { interceptor, auditLogRepo } = buildInterceptor(undefined);
    const handler: CallHandler = { handle: () => of({ ok: true }) };

    await expect(
      lastValueFrom(interceptor.intercept(buildContext(undefined), handler)),
    ).resolves.toEqual({ ok: true });
    expect(auditLogRepo.create).not.toHaveBeenCalled();
  });
});
