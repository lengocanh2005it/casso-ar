import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { TenantContextService } from '../tenancy/tenant-context';
import { AuditContextService } from './audit-context';
import { AuditLog } from './audit-log';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from './audit-log-repository.port';
import {
  AUDITED_METADATA_KEY,
  type AuditedMetadata,
} from './audited.decorator';
import { sanitizeAuditPayload } from './sanitize-audit-payload';

interface RequestLike {
  params?: Record<string, string | undefined>;
  ip?: string;
}

function responseId(value: unknown): string | undefined {
  if (
    value !== null &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string'
  ) {
    return value.id;
  }
  return undefined;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditContext: AuditContextService,
    private readonly tenantContext: TenantContextService,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<
      AuditedMetadata | undefined
    >(AUDITED_METADATA_KEY, [context.getHandler(), context.getClass()]);
    if (!metadata) return next.handle();

    const request = context.switchToHttp().getRequest<RequestLike>();
    return new Observable((subscriber) => {
      this.auditContext.run(() => {
        next
          .handle()
          .pipe(
            tap((response) => {
              const user = this.tenantContext.getCurrentUser();
              if (!user) return;

              this.auditContext.setAfter(response);
              const entityId = request.params?.id ?? responseId(response) ?? '';
              const log = new AuditLog({
                organizationId: user.organizationId,
                userId: user.userId,
                actionType: metadata.actionType,
                entityType: metadata.entityType,
                entityId,
                beforeState: sanitizeAuditPayload(
                  this.auditContext.getBefore(),
                ),
                afterState: sanitizeAuditPayload(this.auditContext.getAfter()),
                ipAddress: request.ip ?? null,
                createdAt: new Date(),
              });
              // ponytail: audit is fire-and-forget per the plan; keep a failed
              // audit write from turning a successful business request into 500.
              void this.auditLogRepo.create(log).catch(() => undefined);
            }),
          )
          .subscribe(subscriber);
      });
    });
  }
}
