import { connect, type Socket } from 'node:net';
import nodemailer from 'nodemailer';
import { decryptToken } from '../../bank-connections/application/token-encryption';
import type { OrganizationSmtpConfig } from '../../smtp-config/domain/organization-smtp-config';
import type {
  EmailSendOptions,
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
    messageId?: string;
    text?: string;
    replyTo?: string;
    attachments?: Array<{
      filename: string;
      content: string;
      encoding: 'base64';
      cid?: string;
      contentType?: string;
    }>;
  }): Promise<{ messageId: string }>;
  close?(): void;
}

type TransportFactory = (config: SmtpTransportConfig) => SmtpTransport;
type DecryptFn = (value: string, key: string) => string;

const defaultTransportFactory: TransportFactory = (config) => {
  const activeSockets = new Set<Socket>();
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    auth: { user: config.username, pass: config.password },
    getSocket: (
      options: { host?: string; port?: number },
      callback: (
        error: Error | null,
        socketOptions?: { connection: Socket },
      ) => void,
    ) => {
      const socket = connect(
        options.port ?? config.port,
        options.host ?? config.host,
      );
      activeSockets.add(socket);
      const onClose = () => activeSockets.delete(socket);
      const onError = (error: Error) => {
        socket.off('connect', onConnect);
        callback(error);
      };
      const onConnect = () => {
        socket.off('error', onError);
        callback(null, { connection: socket });
      };
      socket.once('close', onClose);
      socket.once('error', onError);
      socket.once('connect', onConnect);
    },
  });
  return {
    sendMail: async (options) => {
      const result = await transport.sendMail(options);
      return { messageId: result.messageId };
    },
    close: () => {
      for (const socket of activeSockets) socket.destroy();
      transport.close();
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
    options?: EmailSendOptions,
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
    const attachments = options?.attachments?.map(
      ({ content, filename, contentId, contentType }) => ({
        filename,
        content,
        encoding: 'base64' as const,
        ...(contentId ? { cid: contentId } : {}),
        ...(contentType ? { contentType } : {}),
      }),
    );
    const closeOnAbort = () => transport.close?.();
    if (options?.signal?.aborted) {
      closeOnAbort();
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : new Error('SMTP reminder send aborted');
    }
    options?.signal?.addEventListener('abort', closeOnAbort, { once: true });
    try {
      const result = await transport.sendMail({
        from: this.config.fromAddress,
        to,
        subject,
        html,
        ...(options?.idempotencyKey
          ? { messageId: `<${options.idempotencyKey}@casso-ar.vn>` }
          : {}),
        ...(options?.text !== undefined ? { text: options.text } : {}),
        ...(replyTo ? { replyTo } : {}),
        ...(attachments?.length ? { attachments } : {}),
      });
      if (options?.signal?.aborted) {
        throw options.signal.reason instanceof Error
          ? options.signal.reason
          : new Error('SMTP reminder send aborted');
      }
      return { providerMessageId: result.messageId };
    } finally {
      options?.signal?.removeEventListener('abort', closeOnAbort);
    }
  }
}
