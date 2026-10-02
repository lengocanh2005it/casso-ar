import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OtpInput } from './otp-input';

describe('OtpInput', () => {
  it('gives each digit field an accessible name', () => {
    render(<OtpInput value="" onChange={() => undefined} />);

    for (let index = 1; index <= 6; index += 1) {
      expect(
        screen.getByRole('textbox', {
          name: `Chữ số ${index} trong mã OTP`,
        }),
      ).toBeVisible();
    }
  });
});
