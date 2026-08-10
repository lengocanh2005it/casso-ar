import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { RequestIdStore } from '../observability/request-id.store';
import { TenantContextService } from './tenant-context';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly requestIdStore: RequestIdStore,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      return next.handle();
    }

    const requestId = this.requestIdStore.getRequestId();
    const contextualUser = { ...user, requestId };

    return new Observable((subscriber) => {
      this.tenantContext.run(contextualUser, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
