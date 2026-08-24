import { validate } from 'class-validator';
import { RequestOwnershipTransferDto } from './request-ownership-transfer.dto';

describe('RequestOwnershipTransferDto', () => {
  it('passes valid data', async () => {
    const dto = new RequestOwnershipTransferDto();
    dto.targetUserId = '123e4567-e89b-12d3-a456-426614174000';
    dto.currentPassword = 'password123';
    expect(await validate(dto)).toHaveLength(0);
  });

  it('fails invalid data', async () => {
    const dto = new RequestOwnershipTransferDto();
    dto.targetUserId = 'not-a-uuid';
    dto.currentPassword = 'password123';
    expect(await validate(dto)).toHaveLength(1);

    dto.targetUserId = '123e4567-e89b-12d3-a456-426614174000';
    dto.currentPassword = '';
    expect(await validate(dto)).toHaveLength(1);
  });
});
