import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { JsonLogger } from '../../../common/observability/json-logger.service';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { encryptToken } from '../../bank-connections/application/token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from '../../bank-connections/application/token-encryption-key';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../billing/application/subscription-repository.port';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import {
  OrganizationSmtpConfig,
  SmtpConfigStatus,
} from '../domain/organization-smtp-config';
import {
  type ISmtpConfigRepository,
  SMTP_CONFIG_REPOSITORY,
} from './smtp-config-repository.port';
import {
  type ISmtpHostResolver,
  SMTP_HOST_RESOLVER,
} from './smtp-host-resolver.port';
import { validatePublicSmtpHost } from './validate-public-smtp-host';

const GENERIC_SMTP_ERROR = 'Không thể kết nối hoặc gửi email thử.';

export interface TestAndSaveSmtpConfigInput {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
}

export interface SmtpTransportConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  serverName?: string;
  connectionTimeout: number;
  socketTimeout: number;
  greetingTimeout: number;
}

export interface SmtpTransport {
  verify(): Promise<unknown>;
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<unknown>;
}

export type SmtpTransportFactory = (
  config: SmtpTransportConfig,
) => SmtpTransport;

export const SMTP_TRANSPORT_FACTORY = Symbol('SMTP_TRANSPORT_FACTORY');

@Injectable()
export class TestAndSaveSmtpConfigUseCase {
  constructor(
    @Inject(SMTP_CONFIG_REPOSITORY)
    private readonly smtpConfigRepo: ISmtpConfigRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly tenantContext: TenantContextService,
    @Inject(SMTP_TRANSPORT_FACTORY)
    private readonly transportFactory: SmtpTransportFactory,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY) private readonly encryptionKey: string,
    private readonly logger: JsonLogger,
    @Inject(SMTP_HOST_RESOLVER)
    private readonly smtpHostResolver: ISmtpHostResolver,
  ) {}

  private async resolveSmtpHost(
    host: string,
  ): Promise<{ host: string; serverName?: string }> {
    const allowlist = (process.env.SMTP_HOST_ALLOWLIST ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (validatePublicSmtpHost(host, [], allowlist)) return { host };

    const addresses = isIP(host)
      ? [host]
      : await this.smtpHostResolver.resolve(host);
    if (!validatePublicSmtpHost(host, addresses, allowlist)) {
      throw new Error('SMTP host is not public');
    }
    const resolvedHost = addresses[0];
    if (!resolvedHost) {
      throw new Error('SMTP host has no resolved address');
    }
    return isIP(host)
      ? { host: resolvedHost }
      : { host: resolvedHost, serverName: host };
  }

  async execute(
    input: TestAndSaveSmtpConfigInput,
  ): Promise<OrganizationSmtpConfig> {
    const organizationId = this.tenantContext.getOrganizationId();
    const subscription =
      await this.subscriptionRepo.findByOrganizationId(organizationId);
    if (!subscription?.canUseCustomSmtp) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Gói dịch vụ hiện tại không hỗ trợ SMTP riêng.',
      );
    }

    const ownerMembership =
      await this.membershipRepo.findOwnerByOrganization(organizationId);
    const owner = ownerMembership
      ? await this.userRepo.findById(ownerMembership.userId)
      : null;
    if (!owner?.email) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy chủ sở hữu tổ chức để gửi email thử.',
      );
    }

    try {
      const resolvedHost = await this.resolveSmtpHost(input.host);
      const transport = this.transportFactory({
        ...resolvedHost,
        port: input.port,
        username: input.username,
        password: input.password,
        connectionTimeout: 10_000,
        socketTimeout: 30_000,
        greetingTimeout: 10_000,
      });
      await transport.verify();
      await transport.sendMail({
        from: input.fromAddress,
        to: owner.email,
        subject: 'Xác nhận kết nối SMTP thành công',
        html: '<p>Cấu hình SMTP của bạn đã được kết nối thành công với Casso.</p>',
      });
    } catch (error) {
      this.logger.error(
        {
          message: 'SMTP test connection failed',
          organizationId,
          host: input.host,
          error: error instanceof Error ? error.message : String(error),
        },
        TestAndSaveSmtpConfigUseCase.name,
      );
      throw AppError.withCause(
        error,
        ErrorCode.SMTP_CONNECTION_FAILED,
        GENERIC_SMTP_ERROR,
      );
    }

    const now = new Date();
    const config = new OrganizationSmtpConfig({
      id: randomUUID(),
      organizationId,
      host: input.host,
      port: input.port,
      username: input.username,
      encryptedPassword: encryptToken(input.password, this.encryptionKey),
      fromAddress: input.fromAddress,
      status: SmtpConfigStatus.CONNECTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });

    await this.smtpConfigRepo.save(config);
    return config;
  }
}
