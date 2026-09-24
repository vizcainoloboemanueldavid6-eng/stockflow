import {
  accessSync,
  chmodSync,
  constants,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureWritableSqliteCopy } from '@/lib/prisma-client';

/*
 * SQLite demo mode copies the bundled database to the temp folder, because the
 * deployment filesystem is read-only. The copy must be writable even when the bundled
 * file is not (found by running the production build with a read-only database file).
 */
const cleanup: string[] = [];

afterEach(() => {
  for (const file of cleanup.splice(0)) {
    try {
      chmodSync(file, 0o644);
    } catch {
      // already gone
    }
    rmSync(file, { force: true, recursive: true });
  }
});

describe('ensureWritableSqliteCopy', () => {
  it('returns a writable copy of a read-only bundled database', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'stockflow-test-'));
    const source = path.join(dir, 'bundled.db');
    writeFileSync(source, `database bytes ${Date.now()} ${Math.random()}`);
    chmodSync(source, 0o444);
    cleanup.push(source, dir);

    const copy = ensureWritableSqliteCopy(source);
    cleanup.push(copy);

    expect(copy).not.toBe(source);
    expect(copy.startsWith(path.join(os.tmpdir(), 'stockflow'))).toBe(true);
    expect(readFileSync(copy, 'utf8')).toBe(readFileSync(source, 'utf8'));
    expect(() => accessSync(copy, constants.W_OK)).not.toThrow();
    // The same bundled file maps to the same copy (reused across restarts).
    expect(ensureWritableSqliteCopy(source)).toBe(copy);
  });

  it('explains how to create the database when the bundled file is missing', () => {
    expect(() => ensureWritableSqliteCopy(path.join(os.tmpdir(), 'no-such-stockflow.db'))).toThrow(
      /npm run db:sqlite/,
    );
  });
});
