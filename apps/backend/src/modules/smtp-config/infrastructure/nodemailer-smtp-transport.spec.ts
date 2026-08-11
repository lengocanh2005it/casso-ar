import nodemailer from 'nodemailer';
import { createSmtpTransport } from './nodemailer-smtp-transport';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

describe('createSmtpTransport', () => {
  it('connects to the pinned IP while preserving TLS server name', () => {
    createSmtpTransport({
      host: '93.184.216.34',
      serverName: 'smtp.example.com',
      port: 587,
      username: 'user@example.com',
      password: 'password',
      connectionTimeout: 10_000,
      socketTimeout: 30_000,
      greetingTimeout: 10_000,
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '93.184.216.34',
        tls: { servername: 'smtp.example.com' },
      }),
    );
  });
});
