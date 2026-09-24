import type { Prisma } from '@prisma/client';

/**
 * Appends an AuditLog row. Pass the transaction client when the audited change
 * runs in a transaction, so the log commits (or rolls back) with it.
 *
 * Conventions: action = "<entity>.<verb>" in lower case ("product.create",
 * "supplier.delete", "user.role-change"); entity = model name ("Product").
 */
export type AuditEntry = {
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
};

export async function audit(
  db: Pick<Prisma.TransactionClient, 'auditLog'>,
  entry: AuditEntry,
): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
    },
  });
}
