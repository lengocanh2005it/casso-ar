import { ApiProperty } from '@nestjs/swagger';

export class PlanUpgradeOrderResponseDto {
  @ApiProperty({ type: String, example: 'https://pay.payos.vn/web/abc123' })
  checkoutUrl: string;

  @ApiProperty({ type: String, example: '9007199254740993' })
  orderCode: string;
}
