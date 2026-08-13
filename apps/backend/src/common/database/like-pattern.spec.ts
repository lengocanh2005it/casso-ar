import { toLikePattern } from './like-pattern';

describe('toLikePattern', () => {
  it('wraps a plain term in % wildcards', () => {
    expect(toLikePattern('acme')).toBe('%acme%');
  });

  it('escapes LIKE metacharacters so they match literally', () => {
    expect(toLikePattern('100%')).toBe('%100\\%%');
    expect(toLikePattern('a_b')).toBe('%a\\_b%');
    expect(toLikePattern('a\\b')).toBe('%a\\\\b%');
  });

  it('escapes backslashes before escaping other metacharacters', () => {
    expect(toLikePattern('a\\%b')).toBe('%a\\\\\\%b%');
  });
});
