import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ITokenSigner } from '../application/token-signer.port';

@Injectable()
export class JwtTokenSigner implements ITokenSigner {
  constructor(private readonly jwtService: JwtService) {}

  sign(payload: Record<string, unknown>): string {
    return this.jwtService.sign(payload);
  }
}
