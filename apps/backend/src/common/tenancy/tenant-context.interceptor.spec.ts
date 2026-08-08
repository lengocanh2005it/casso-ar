import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { TenantContextService } from './tenant-context';
import { TenantContextInterceptor } from './tenant-context.interceptor';

describe('TenantContextInterceptor', () => {
  const user: AuthenticatedUser = {
    userId: 'user-1',
    organizationId: 'org-1',
    role: 'OWNER' as AuthenticatedUser['role'],
  };

  function makeContext(
    reqUser: AuthenticatedUser | undefined,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user: reqUser,
          header: (name: string) =>
            name === 'X-Request-Id' ? 'request-1' : undefined,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('makes the tenant context available inside the subscribed handler, not just inside run()', (done) => {
    const tenantContext = new TenantContextService();
    const interceptor = new TenantContextInterceptor(tenantContext);
    const seenInsideHandler: (AuthenticatedUser | undefined)[] = [];

    // Simulate what next.handle() really does: return a deferred Observable
    // whose body only executes on subscribe (e.g. asynchronously via a microtask),
    // just like the real route handler pipeline.
    const handler: CallHandler = {
      handle: () =>
        new Observable((subscriber) => {
          Promise.resolve().then(() => {
            seenInsideHandler.push(tenantContext.getCurrentUser());
            subscriber.next('result');
            subscriber.complete();
          });
        }),
    };

    interceptor.intercept(makeContext(user), handler).subscribe({
      next: () => {},
      complete: () => {
        expect(seenInsideHandler).toHaveLength(1);
        expect(seenInsideHandler[0]).toEqual({
          ...user,
          requestId: 'request-1',
        });
        done();
      },
    });
  });

  it('passes through next.handle() untouched when there is no authenticated user', (done) => {
    const tenantContext = new TenantContextService();
    const interceptor = new TenantContextInterceptor(tenantContext);
    const handler: CallHandler = { handle: () => of('unauthenticated-result') };

    interceptor
      .intercept(makeContext(undefined), handler)
      .subscribe((value) => {
        expect(value).toBe('unauthenticated-result');
        done();
      });
  });
});
