import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { JwtService } from '@nestjs/jwt';
import type { ITokenSigner } from '../application/token-signer.port';

@Injectable()
export class JwtTokenSigner implements ITokenSigner {
  constructor(private readonly jwtService: JwtService) {}

  sign(payload: Record<string, unknown>): string {
    return this.jwtService.sign(payload);
  }
}
