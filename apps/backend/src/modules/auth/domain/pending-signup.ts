export interface PendingSignupProps {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  organizationName: string;
  taxCode: string;
  taxCodeMatched: boolean;
  taxCodeLookupName: string | null;
  otpHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export class PendingSignup {
  declare readonly id: string;
  declare readonly email: string;
  declare readonly passwordHash: string;
  declare readonly name: string;
  declare readonly organizationName: string;
  declare readonly taxCode: string;
  declare readonly taxCodeMatched: boolean;
  declare readonly taxCodeLookupName: string | null;
  declare readonly otpHash: string;
  declare readonly expiresAt: Date;
  declare readonly createdAt: Date;

  constructor(props: PendingSignupProps) {
    Object.assign(this, props);
  }

  isExpired(now: Date): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }

  withNewOtp(otpHash: string, expiresAt: Date): PendingSignup {
    return new PendingSignup({ ...this, otpHash, expiresAt });
  }
}
