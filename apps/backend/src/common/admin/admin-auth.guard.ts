import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { extractJwtFromRequest } from '../auth/jwt.strategy';
import { ErrorCode } from '../errors/error-code';
import type { AuthenticatedOperator } from './authenticated-operator';

interface OperatorJwtPayload {
  userId: string;
  isOperator?: boolean;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractJwtFromRequest(request);
    if (!token) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
      });
    }

    let payload: OperatorJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<OperatorJwtPayload>(token);
    } catch {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
      });
    }

    if (!payload.isOperator) {
      throw new ForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Bạn không có quyền thực hiện thao tác này.',
      });
    }

    (request as Request & { user: AuthenticatedOperator }).user = {
      operatorId: payload.userId,
    };
    return true;
  }
}
