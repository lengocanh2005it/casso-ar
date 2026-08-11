import nodemailer from 'nodemailer';
import type {
  SmtpTransport,
  SmtpTransportConfig,
} from '../application/test-and-save-smtp-config.usecase';

export function createSmtpTransport(
  config: SmtpTransportConfig,
): SmtpTransport {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    auth: { user: config.username, pass: config.password },
    ...(config.serverName ? { tls: { servername: config.serverName } } : {}),
    connectionTimeout: config.connectionTimeout,
    socketTimeout: config.socketTimeout,
    greetingTimeout: config.greetingTimeout,
  });
}
