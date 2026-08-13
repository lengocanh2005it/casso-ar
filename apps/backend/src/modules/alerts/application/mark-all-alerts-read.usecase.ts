import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  ALERT_REPOSITORY,
  type IAlertRepository,
} from './alert-repository.port';

@Injectable()
export class MarkAllAlertsReadUseCase {
  constructor(
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: IAlertRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(): Promise<void> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    await this.alertRepo.markAllRead(user.userId);
  }
}
