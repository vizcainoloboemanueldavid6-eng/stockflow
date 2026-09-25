import { describe, expect, it } from 'vitest';
import { sqliteUrl } from '@/lib/prisma-client';
import { demoDataIsStale } from '@/lib/sqlite-demo';

describe('demoDataIsStale', () => {
  const zone = 'America/Bogota';
  const at = (iso: string) => new Date(iso);

  it('is fresh within the hour, on the same local day', () => {
    expect(demoDataIsStale(at('2026-09-24T15:00:00Z'), at('2026-09-24T15:40:00Z'), zone)).toBe(
      false,
    );
  });

  it('is stale after an hour, or once the local day has changed', () => {
    expect(demoDataIsStale(at('2026-09-24T15:00:00Z'), at('2026-09-24T16:01:00Z'), zone)).toBe(
      true,
    );
    // 23:50 and 00:10 in Bogota (UTC-5): twenty minutes apart, but "today" moved on.
    expect(demoDataIsStale(at('2026-09-25T04:50:00Z'), at('2026-09-25T05:10:00Z'), zone)).toBe(
      true,
    );
    // A build left alone for a month.
    expect(demoDataIsStale(at('2026-08-24T12:00:00Z'), at('2026-09-24T12:00:00Z'), zone)).toBe(
      true,
    );
  });

  it('is stale when the database has no seed marker at all', () => {
    expect(demoDataIsStale(null, new Date(), zone)).toBe(true);
  });
});

describe('sqliteUrl', () => {
  it('uses one connection, so writers queue in Prisma instead of fighting over the file lock', () => {
    const url = sqliteUrl('C:\\Temp\\stockflow\\copy.db');
    expect(url).toBe('file:C:/Temp/stockflow/copy.db?connection_limit=1&socket_timeout=15');
  });
});
