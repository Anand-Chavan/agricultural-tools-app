import { prisma } from './prisma.js';

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.businessSetting.findUnique({ where: { key } });
  if (!row) return fallback;
  return row.value as T;
}

export async function setSetting(key: string, value: unknown) {
  return prisma.businessSetting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
}

export async function allowNegativeStock(): Promise<boolean> {
  return getSetting('allowNegativeStock', false);
}
