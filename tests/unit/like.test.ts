import { describe, expect, it } from 'vitest';
import { escapeLikePattern, hasLikeWildcard } from '@/lib/like';

const BACKSLASH = String.fromCharCode(92);

describe('escapeLikePattern', () => {
  it('escapes the LIKE wildcards and the escape character itself', () => {
    expect(escapeLikePattern('50%')).toBe(`50${BACKSLASH}%`);
    expect(escapeLikePattern('snake_case')).toBe(`snake${BACKSLASH}_case`);
    expect(escapeLikePattern(`C:${BACKSLASH}temp`)).toBe(`C:${BACKSLASH}${BACKSLASH}temp`);
    expect(escapeLikePattern(`%_${BACKSLASH}`)).toBe(
      `${BACKSLASH}%${BACKSLASH}_${BACKSLASH}${BACKSLASH}`,
    );
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLikePattern('USB-C 2 m (100 W)')).toBe('USB-C 2 m (100 W)');
  });
});

describe('hasLikeWildcard', () => {
  it('spots % and _ only', () => {
    expect(hasLikeWildcard('50%')).toBe(true);
    expect(hasLikeWildcard('a_b')).toBe(true);
    expect(hasLikeWildcard(`back${BACKSLASH}slash`)).toBe(false);
    expect(hasLikeWildcard('usb')).toBe(false);
  });
});
