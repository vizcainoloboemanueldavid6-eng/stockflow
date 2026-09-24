import { describe, expect, it } from 'vitest';
import { movementOrderBy, productOrderBy } from '@/lib/list-options';
import { firstValues, nextSearch, paginate, parseSearchParams } from '@/lib/search-params';
import { movementListQuerySchema } from '@/lib/validations/movement';
import { productListQuerySchema } from '@/lib/validations/product';

describe('parseSearchParams', () => {
  it('reads the products table state from the URL', () => {
    const query = parseSearchParams(productListQuerySchema, {
      q: '  cable ',
      category: 'cat_1',
      status: 'low_stock',
      sort: 'quantity',
      dir: 'desc',
      page: '3',
      pageSize: '20',
    });
    expect(query).toMatchObject({
      q: 'cable',
      category: 'cat_1',
      status: 'low_stock',
      sort: 'quantity',
      dir: 'desc',
      page: 3,
      pageSize: 20,
      archived: 'active',
    });
  });

  it('falls back to defaults for garbage instead of throwing', () => {
    const query = parseSearchParams(productListQuerySchema, {
      page: '-4',
      pageSize: '100000',
      status: 'sold_out',
      dir: 'sideways',
      archived: 'maybe',
    });
    expect(query).toMatchObject({ page: 1, pageSize: 10, dir: 'asc', archived: 'active' });
    expect(query.status).toBeUndefined();
  });

  it('keeps the first of repeated keys', () => {
    expect(firstValues({ type: ['IN', 'OUT'], q: undefined })).toEqual({ type: 'IN' });
    const params = new URLSearchParams('type=OUT&type=IN&page=2');
    expect(firstValues(params)).toEqual({ type: 'OUT', page: '2' });
    expect(parseSearchParams(movementListQuerySchema, params)).toMatchObject({
      type: 'OUT',
      page: 2,
      dir: 'desc',
    });
  });

  it('drops malformed dates from the movement filters', () => {
    const query = parseSearchParams(movementListQuerySchema, {
      from: '2026-09-01',
      to: '24/09/2026',
    });
    expect(query.from).toBe('2026-09-01');
    expect(query.to).toBeUndefined();
  });
});

describe('nextSearch', () => {
  it('sets values and returns to the first page when a filter changes', () => {
    expect(nextSearch('q=usb&page=4', { category: 'cat_2' })).toBe('?category=cat_2&q=usb');
  });

  it('keeps the page when only the page changes', () => {
    expect(nextSearch('q=usb', { page: 3 })).toBe('?page=3&q=usb');
    expect(nextSearch('page=3&q=usb', { page: 1 })).toBe('?q=usb');
  });

  it('removes empty values and defaults', () => {
    expect(nextSearch('q=usb&status=low_stock', { q: '', status: null })).toBe('');
    expect(
      nextSearch(
        '',
        { sort: 'name', dir: 'asc', pageSize: 10 },
        { sort: 'name', dir: 'asc', pageSize: 10 },
      ),
    ).toBe('');
    expect(nextSearch('', { sort: 'quantity', dir: 'desc' }, { sort: 'name', dir: 'asc' })).toBe(
      '?dir=desc&sort=quantity',
    );
  });

  it('trims values', () => {
    expect(nextSearch('', { q: '  hub  ' })).toBe('?q=hub');
  });
});

describe('paginate', () => {
  it('computes skip/take and the page count', () => {
    expect(paginate(60, 2, 10)).toEqual({ pageCount: 6, page: 2, skip: 10, take: 10 });
  });

  it('clamps a page past the end to the last page', () => {
    expect(paginate(25, 9, 10)).toEqual({ pageCount: 3, page: 3, skip: 20, take: 10 });
  });

  it('always has at least one page', () => {
    expect(paginate(0, 1, 10)).toEqual({ pageCount: 1, page: 1, skip: 0, take: 10 });
  });
});

describe('orderBy whitelists', () => {
  it('maps product sort keys, including relations', () => {
    expect(productOrderBy('quantity', 'desc')).toEqual([
      { quantity: 'desc' },
      { name: 'asc' },
      { id: 'asc' },
    ]);
    expect(productOrderBy('category', 'asc')[0]).toEqual({ category: { name: 'asc' } });
    expect(productOrderBy('supplier', 'desc')[0]).toEqual({ supplier: { name: 'desc' } });
  });

  it('ignores unknown sort keys', () => {
    expect(productOrderBy('passwordHash', 'desc')).toEqual([{ name: 'desc' }, { id: 'asc' }]);
    expect(productOrderBy(undefined, 'asc')).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    expect(movementOrderBy('user', 'asc')).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('sorts movements by quantity with newest first as tie-break', () => {
    expect(movementOrderBy('quantity', 'desc')).toEqual([
      { quantity: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});
