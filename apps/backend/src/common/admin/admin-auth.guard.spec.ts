import type { ExecutionContext } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard';

function buildContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AdminAuthGuard', () => {
  it('allows the request and attaches operatorId when the JWT has isOperator=true', async () => {
    const jwtService = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ userId: 'user-1', isOperator: true }),
    };
    const guard = new AdminAuthGuard(jwtService as any);
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer valid-token' },
    };

    const result = await guard.canActivate(buildContext(request));

    expect(result).toBe(true);
    expect(request.user).toEqual({ operatorId: 'user-1' });
  });

  it('rejects when the JWT has no isOperator claim', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({ userId: 'user-1' }),
    };
    const guard = new AdminAuthGuard(jwtService as any);
    const request = { headers: { authorization: 'Bearer valid-token' } };

    await expect(guard.canActivate(buildContext(request))).rejects.toThrow();
  });

  it('rejects when no token is present', async () => {
    const jwtService = { verifyAsync: jest.fn() };
    const guard = new AdminAuthGuard(jwtService as any);
    const request = { headers: {} };

    await expect(guard.canActivate(buildContext(request))).rejects.toThrow();
  });
});
