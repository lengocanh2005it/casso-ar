import { User } from './user';

describe('User domain entity', () => {
  it('is unverified by default until markEmailVerified is called', () => {
    const user = new User({
      id: 'user-1',
      name: 'An',
      email: 'ap@congtyb.vn',
      passwordHash: 'hashed',
      emailVerifiedAt: null,
      createdAt: new Date('2026-08-01'),
    });

    expect(user.isEmailVerified()).toBe(false);

    const verified = user.markEmailVerified();
    expect(verified.isEmailVerified()).toBe(true);
  });
});
