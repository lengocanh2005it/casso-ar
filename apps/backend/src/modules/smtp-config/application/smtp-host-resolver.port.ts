export interface ISmtpHostResolver {
  resolve(host: string): Promise<readonly string[]>;
}

export const SMTP_HOST_RESOLVER = Symbol('SMTP_HOST_RESOLVER');
