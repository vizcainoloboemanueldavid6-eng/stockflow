import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appTimeZone,
  dayKey,
  dayRange,
  isDayKey,
  lastDays,
  shiftDay,
  startOfDay,
} from '@/lib/dates';
import { formatDayKey, formatIsoMinute } from '@/lib/format';

describe('dayKey', () => {
  it('reads the calendar day in the given zone, not UTC', () => {
    const instant = new Date('2026-09-24T03:30:00Z');
    expect(dayKey(instant, 'UTC')).toBe('2026-09-24');
    expect(dayKey(instant, 'America/Bogota')).toBe('2026-09-23'); // UTC-5
    expect(dayKey(instant, 'Asia/Tokyo')).toBe('2026-09-24'); // UTC+9
  });
});

describe('startOfDay', () => {
  it('returns the instant local midnight happens', () => {
    expect(startOfDay('2026-09-24', 'UTC').toISOString()).toBe('2026-09-24T00:00:00.000Z');
    expect(startOfDay('2026-09-24', 'America/Bogota').toISOString()).toBe(
      '2026-09-24T05:00:00.000Z',
    );
    expect(startOfDay('2026-09-24', 'Asia/Kolkata').toISOString()).toBe('2026-09-23T18:30:00.000Z');
  });

  it('handles daylight-saving days', () => {
    // New York: DST starts 2026-03-08 (EST -5 -> EDT -4), ends 2026-11-01.
    expect(startOfDay('2026-03-08', 'America/New_York').toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    expect(startOfDay('2026-03-09', 'America/New_York').toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    );
    expect(startOfDay('2026-11-02', 'America/New_York').toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    );
  });

  it('round-trips with dayKey', () => {
    for (const zone of ['UTC', 'America/Bogota', 'Europe/Madrid', 'Pacific/Auckland']) {
      for (const key of ['2026-01-01', '2026-03-29', '2026-10-25', '2026-12-31']) {
        expect(dayKey(startOfDay(key, zone), zone)).toBe(key);
      }
    }
  });
});

describe('day keys', () => {
  it('shifts across month and year boundaries', () => {
    expect(shiftDay('2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('validates real calendar days only', () => {
    expect(isDayKey('2026-09-24')).toBe(true);
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('2026-9-24')).toBe(false);
    expect(isDayKey('yesterday')).toBe(false);
  });

  it('lists the last N days ending today, oldest first', () => {
    const now = new Date('2026-09-24T02:00:00Z');
    const days = lastDays(now, 30, 'America/Bogota');
    expect(days).toHaveLength(30);
    expect(days[29]).toBe('2026-09-23');
    expect(days[0]).toBe('2026-08-25');
  });
});

describe('dayRange', () => {
  const zone = 'America/Bogota';

  it('makes an inclusive day range half-open', () => {
    expect(dayRange('2026-09-01', '2026-09-24', zone)).toEqual({
      gte: new Date('2026-09-01T05:00:00Z'),
      lt: new Date('2026-09-25T05:00:00Z'),
    });
  });

  it('supports open ends', () => {
    expect(dayRange('2026-09-01', undefined, zone)).toEqual({
      gte: new Date('2026-09-01T05:00:00Z'),
    });
    expect(dayRange(undefined, '2026-09-01', zone)).toEqual({
      lt: new Date('2026-09-02T05:00:00Z'),
    });
    expect(dayRange(undefined, undefined, zone)).toEqual({});
  });

  it('swaps a reversed range and ignores invalid days', () => {
    expect(dayRange('2026-09-24', '2026-09-01', zone)).toEqual(
      dayRange('2026-09-01', '2026-09-24', zone),
    );
    expect(dayRange('2026-02-31', 'nope', zone)).toEqual({});
  });
});

describe('appTimeZone', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses APP_TIME_ZONE when it is a valid zone', () => {
    vi.stubEnv('APP_TIME_ZONE', 'America/Bogota');
    expect(appTimeZone()).toBe('America/Bogota');
  });

  it('falls back to the server zone for an invalid value', () => {
    vi.stubEnv('APP_TIME_ZONE', 'Mars/Olympus');
    expect(appTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('date formatting', () => {
  it('labels chart days without shifting them', () => {
    expect(formatDayKey('2026-09-24')).toBe('Sep 24');
  });

  it('writes sortable CSV timestamps in the zone', () => {
    expect(formatIsoMinute(new Date('2026-09-24T03:05:00Z'), 'America/Bogota')).toBe(
      '2026-09-23 22:05',
    );
  });
});
