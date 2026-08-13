import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  ALERT_REPOSITORY,
  type AlertPage,
  type IAlertRepository,
} from './alert-repository.port';

@Injectable()
export class ListAlertsUseCase {
  constructor(
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: IAlertRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    page: number,
    limit: number,
    unreadOnly: boolean,
  ): Promise<AlertPage> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    return this.alertRepo.findPage(user.userId, page, limit, unreadOnly);
  }
}
