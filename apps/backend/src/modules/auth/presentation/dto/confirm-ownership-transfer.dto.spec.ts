import { validate } from 'class-validator';
import { ConfirmOwnershipTransferDto } from './confirm-ownership-transfer.dto';

describe('ConfirmOwnershipTransferDto', () => {
  it('passes valid OTP', async () => {
    const dto = new ConfirmOwnershipTransferDto();
    dto.otp = '123456';
    expect(await validate(dto)).toHaveLength(0);
  });

  it('fails missing or invalid OTP', async () => {
    const dto = new ConfirmOwnershipTransferDto();
    dto.otp = '123';
    expect(await validate(dto)).toHaveLength(1);
    
    dto.otp = '1234567';
    expect(await validate(dto)).toHaveLength(1);
    
    // @ts-expect-error test
    dto.otp = undefined;
    expect(await validate(dto)).toHaveLength(1);
  });
});
