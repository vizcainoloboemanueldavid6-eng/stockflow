import { describe, expect, it } from 'vitest';
import { HOME_PATH, isPublicPath, safeCallbackPath } from '@/lib/auth.config';
import { stockStatus } from '@/lib/constants';

describe('route protection helpers', () => {
  it('treats only the auth pages as public', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/register')).toBe(true);
    for (const path of [
      '/',
      '/dashboard',
      '/products/abc',
      '/settings',
      '/loginx',
      '/api/search',
    ]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });

  it('only follows same-origin callback paths', () => {
    expect(safeCallbackPath('/products?q=usb')).toBe('/products?q=usb');
    expect(safeCallbackPath(undefined)).toBe(HOME_PATH);
    expect(safeCallbackPath('https://evil.example/phish')).toBe(HOME_PATH);
    expect(safeCallbackPath('//evil.example')).toBe(HOME_PATH);
    expect(safeCallbackPath('/\\evil.example')).toBe(HOME_PATH);
    expect(safeCallbackPath('/login')).toBe(HOME_PATH);
    expect(safeCallbackPath('javascript:alert(1)', 'app.test')).toBe(HOME_PATH);
  });

  it('accepts the absolute callbackUrl Auth.js sends, but only for the same host', () => {
    expect(safeCallbackPath('http://localhost:3100/movements?type=IN', 'localhost:3100')).toBe(
      '/movements?type=IN',
    );
    expect(safeCallbackPath('https://evil.example/movements', 'localhost:3100')).toBe(HOME_PATH);
    expect(safeCallbackPath('http://localhost:3100/login', 'localhost:3100')).toBe(HOME_PATH);
    expect(safeCallbackPath('http://localhost:3100/movements')).toBe(HOME_PATH);
  });
});

describe('stockStatus', () => {
  it('classifies quantity against the reorder level', () => {
    expect(stockStatus(0, 5)).toBe('out_of_stock');
    expect(stockStatus(5, 5)).toBe('low_stock');
    expect(stockStatus(2, 5)).toBe('low_stock');
    expect(stockStatus(6, 5)).toBe('in_stock');
    expect(stockStatus(1, 0)).toBe('in_stock');
  });
});
