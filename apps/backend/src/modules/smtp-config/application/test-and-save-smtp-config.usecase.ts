import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
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
  ) {}

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

    const transport = this.transportFactory({
      host: input.host,
      port: input.port,
      username: input.username,
      password: input.password,
    });

    try {
      await transport.verify();
      await transport.sendMail({
        from: input.fromAddress,
        to: owner.email,
        subject: 'Xác nhận kết nối SMTP thành công',
        html: '<p>Cấu hình SMTP của bạn đã được kết nối thành công với Casso.</p>',
      });
    } catch (error) {
      throw new AppError(
        ErrorCode.SMTP_CONNECTION_FAILED,
        `Không thể kết nối hoặc gửi email thử: ${error instanceof Error ? error.message : String(error)}`,
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
