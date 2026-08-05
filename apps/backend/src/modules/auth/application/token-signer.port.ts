export interface ITokenSigner {
  sign(payload: Record<string, unknown>): string;
}

export const TOKEN_SIGNER = Symbol('TOKEN_SIGNER');
