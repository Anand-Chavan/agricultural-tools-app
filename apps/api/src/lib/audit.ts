import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export async function writeAudit(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.auditLog.create({
    data: {
      userId: input.userId ?? undefined,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? undefined,
      beforeJson: input.before === undefined ? undefined : (input.before as Prisma.InputJsonValue),
      afterJson: input.after === undefined ? undefined : (input.after as Prisma.InputJsonValue),
    },
  });
}
