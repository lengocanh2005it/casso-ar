import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import type { TenantContextService } from './tenant-context';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      return next.handle();
    }

    let result$!: Observable<unknown>;
    this.tenantContext.run(user, () => {
      result$ = next.handle();
    });
    return result$;
  }
}
