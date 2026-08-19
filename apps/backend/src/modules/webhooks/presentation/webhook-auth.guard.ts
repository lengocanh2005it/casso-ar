import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  isIpAllowed,
  parseIpAllowlist,
} from '../../../common/webhook/ip-allowlist';

// Cas ID's Balance Hook has no signature header — it identifies itself by
// source IP only. See
// docs/superpowers/specs/2026-08-19-cas-id-real-integration-design.md §3.1.
@Injectable()
export class WebhookAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ ip?: string }>();
    const allowlist = parseIpAllowlist(process.env.CAS_ID_WEBHOOK_IP_ALLOWLIST);
    if (!request.ip || !isIpAllowed(request.ip, allowlist)) {
      throw new UnauthorizedException('Webhook source IP not allowed');
    }
    return true;
  }
}
