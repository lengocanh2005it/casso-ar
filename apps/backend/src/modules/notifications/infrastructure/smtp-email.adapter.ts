import nodemailer from 'nodemailer';
import { decryptToken } from '../../bank-connections/application/token-encryption';
import type { OrganizationSmtpConfig } from '../../smtp-config/domain/organization-smtp-config';
import type {
  EmailSendResult,
  IEmailProviderAdapter,
} from '../application/email-provider-adapter.port';

interface SmtpTransportConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

interface SmtpTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
  }): Promise<{ messageId: string }>;
}

type TransportFactory = (config: SmtpTransportConfig) => SmtpTransport;
type DecryptFn = (value: string, key: string) => string;

const defaultTransportFactory: TransportFactory = (config) => {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    auth: { user: config.username, pass: config.password },
  });
  return {
    sendMail: async (options) => {
      const result = await transport.sendMail(options);
      return { messageId: result.messageId };
    },
  };
};

/** Constructed per send because each organization has different credentials. */
export class SmtpEmailAdapter implements IEmailProviderAdapter {
  constructor(
    private readonly config: OrganizationSmtpConfig,
    private readonly encryptionKey: string,
    private readonly transportFactory: TransportFactory = defaultTransportFactory,
    private readonly decryptFn: DecryptFn = decryptToken,
  ) {}

  async send(
    to: string,
    subject: string,
    html: string,
    _metadata: Record<string, string>,
    replyTo?: string,
    _fromName?: string,
  ): Promise<EmailSendResult> {
    const password = this.decryptFn(
      this.config.encryptedPassword,
      this.encryptionKey,
    );
    const transport = this.transportFactory({
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      password,
    });
    const result = await transport.sendMail({
      from: this.config.fromAddress,
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });
    return { providerMessageId: result.messageId };
  }
}
