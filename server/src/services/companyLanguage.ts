import { prisma } from '../lib/prisma';
import { resolveLanguage, type Language } from '../utils/language';

export async function companyDefaultLanguage(): Promise<Language> {
  const settings = await prisma.companySettings.findFirst({
    where: { slug: 'default' },
    select: { defaultLanguage: true },
  });
  return resolveLanguage(null, settings?.defaultLanguage);
}
