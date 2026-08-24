import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  DUPLICATE_TAX_CODE,
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { matchesTaxCodeName } from '../../organizations/domain/normalize-company-name';
import {
  type ITaxCodeLookupAdapter,
  TAX_CODE_LOOKUP_ADAPTER,
} from '../../tax-verification/application/tax-code-lookup.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { PendingSignup } from '../domain/pending-signup';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';
import { hashPassword } from './password-hasher';
import {
  type IPendingSignupRepository,
  PENDING_SIGNUP_REPOSITORY,
} from './pending-signup-repository.port';
import { generateOtp } from './token-hasher';

export interface SignupInput {
  organizationName: string;
  name: string;
  email: string;
  password: string;
  taxCode: string;
}

export interface SignupResult {
  email: string;
}

const VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class SignupUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(PENDING_SIGNUP_REPOSITORY)
    private readonly pendingSignupRepo: IPendingSignupRepository,
    @Inject(AUTH_EMAIL_SENDER)
    private readonly emailSender: IAuthEmailSender,
    @Inject(TAX_CODE_LOOKUP_ADAPTER)
    private readonly taxCodeLookup: ITaxCodeLookupAdapter,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: SignupInput): Promise<SignupResult> {
    const email = input.email.trim().toLowerCase();
    const organizationName = input.organizationName.trim();

    if (await this.userRepo.findByEmail(email)) {
      throw new AppError(ErrorCode.CONFLICT, 'Email đã được đăng ký.');
    }
    if (await this.organizationRepo.findByTaxCode(input.taxCode)) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Mã số thuế này đã được đăng ký.',
        { rowErrorCode: DUPLICATE_TAX_CODE },
      );
    }

    const lookupResult = await this.taxCodeLookup.lookup(input.taxCode);
    const taxCodeMatched =
      lookupResult !== null &&
      matchesTaxCodeName(organizationName, lookupResult.name);
    const passwordHash = await hashPassword(input.password);
    const { otp, hash: otpHash } = generateOtp();
    const now = new Date();

    await this.dataSource.transaction(async (manager) => {
      const existingByEmail = await this.pendingSignupRepo.findByEmail(
        email,
        manager,
      );
      if (existingByEmail) {
        if (!existingByEmail.isExpired(now)) {
          throw new AppError(
            ErrorCode.CONFLICT,
            'Email này đang có một yêu cầu đăng ký chờ xác thực.',
          );
        }
        await this.pendingSignupRepo.delete(existingByEmail.id, manager);
      }

      const existingByTaxCode = await this.pendingSignupRepo.findByTaxCode(
        input.taxCode,
        manager,
      );
      if (existingByTaxCode) {
        if (!existingByTaxCode.isExpired(now)) {
          throw new AppError(
            ErrorCode.CONFLICT,
            'Mã số thuế này đang có một yêu cầu đăng ký chờ xác thực.',
            { rowErrorCode: DUPLICATE_TAX_CODE },
          );
        }
        await this.pendingSignupRepo.delete(existingByTaxCode.id, manager);
      }

      await this.pendingSignupRepo.save(
        new PendingSignup({
          id: randomUUID(),
          email,
          passwordHash,
          name: input.name.trim(),
          organizationName,
          taxCode: input.taxCode,
          taxCodeMatched,
          taxCodeLookupName: lookupResult?.name ?? null,
          otpHash,
          expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
          createdAt: now,
        }),
        manager,
      );
    });

    await this.emailSender.sendVerificationEmail(email, otp);

    return { email };
  }
}
