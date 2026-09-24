import { describe, expect, it } from 'vitest';
import { CSV_BOM, csvCell, csvFilename, csvMoney, csvResponse, toCsv } from '@/lib/csv';

describe('csvCell', () => {
  it('leaves plain values alone', () => {
    expect(csvCell('USB-C Cable')).toBe('USB-C Cable');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(true)).toBe('true');
  });

  it('writes null, undefined and non-finite numbers as empty cells', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('quotes fields with commas', () => {
    expect(csvCell('Cables, Adapters')).toBe('"Cables, Adapters"');
  });

  it('doubles inner quotes and wraps the field', () => {
    expect(csvCell('27" Monitor Arm')).toBe('"27"" Monitor Arm"');
    expect(csvCell('"quoted"')).toBe('"""quoted"""');
  });

  it('keeps newlines inside a quoted field', () => {
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
    expect(csvCell('windows\r\nbreak')).toBe('"windows\r\nbreak"');
  });

  it('preserves leading and trailing spaces by quoting', () => {
    expect(csvCell(' padded ')).toBe('" padded "');
  });

  it('neutralises spreadsheet formulas in text but not in numbers', () => {
    expect(csvCell('=HYPERLINK("http://x.test")')).toBe(`"'=HYPERLINK(""http://x.test"")"`);
    expect(csvCell('+1 555-0100')).toBe("'+1 555-0100");
    expect(csvCell('-5% promo')).toBe("'-5% promo");
    expect(csvCell('@sum')).toBe("'@sum");
    expect(csvCell(-2)).toBe('-2');
  });

  it('formats dates as ISO strings', () => {
    expect(csvCell(new Date('2026-09-24T10:00:00.000Z'))).toBe('2026-09-24T10:00:00.000Z');
  });
});

describe('toCsv', () => {
  it('joins header and rows with CRLF and ends with a newline', () => {
    const csv = toCsv(
      ['SKU', 'Name', 'Qty'],
      [
        ['AUD-101', 'Earbuds, wireless', 12],
        ['CBL-202', 'Cable "braided"\nnylon', -1],
      ],
    );
    expect(csv).toBe(
      'SKU,Name,Qty\r\nAUD-101,"Earbuds, wireless",12\r\nCBL-202,"Cable ""braided""\nnylon",-1\r\n',
    );
  });

  it('round-trips through a simple RFC 4180 parser', () => {
    const rows = [['a,b', 'say "hi"', 'multi\nline', '', 'plain']];
    const csv = toCsv(['c1', 'c2', 'c3', 'c4', 'c5'], rows);
    expect(parseCsv(csv)).toEqual([['c1', 'c2', 'c3', 'c4', 'c5'], ...rows]);
  });
});

describe('csv helpers', () => {
  it('writes money with two decimals and no symbols', () => {
    expect(csvMoney(1234.5)).toBe('1234.50');
    expect(csvMoney(0)).toBe('0.00');
  });

  it('builds a dated, safe filename', () => {
    expect(csvFilename('products', '2026-09-24')).toBe('stockflow-products-2026-09-24.csv');
    expect(csvFilename('Stock Movements', '2026-01-02')).toBe(
      'stockflow-stock-movements-2026-01-02.csv',
    );
  });

  it('returns a UTF-8 download that starts with a byte-order mark', async () => {
    const response = csvResponse('Name\r\nCafé\r\n', 'stockflow-products-2026-09-24.csv');
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="stockflow-products-2026-09-24.csv"',
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe(`Name\r\nCafé\r\n`);
    expect(CSV_BOM).toBe('﻿');
  });
});

/** Minimal RFC 4180 reader, only for the round-trip test. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += char;
  }
  return rows;
}
