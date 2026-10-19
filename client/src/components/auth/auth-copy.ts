/**
 * Copy for the auth screens (plan §3.2, final copy). EAM is now a module inside
 * the main app, so ERP is the only product; the type is kept so call sites stay
 * explicit. Text lives in `auth:copy.*` and is read at call time so it follows the language.
 */
import i18n from '@/i18n';

export type AuthProduct = 'ERP';

export interface AuthCopy {
  documentTitle: string;
  heading: string;
  subtitle: string;
  panelHeadline: string;
  panelPoints: readonly string[];
}

/** Auth screen copy in the current UI language. */
export function authCopy(_product: AuthProduct = 'ERP'): AuthCopy {
  const t = (key: 'documentTitle' | 'heading' | 'subtitle' | 'panelHeadline' | 'panelPointJournal' | 'panelPointAudit') =>
    i18n.t(`copy.${key}`, { ns: 'auth' });
  return {
    documentTitle: t('documentTitle'),
    heading: t('heading'),
    subtitle: t('subtitle'),
    panelHeadline: t('panelHeadline'),
    panelPoints: [t('panelPointJournal'), t('panelPointAudit')],
  };
}

/** Legal entity shown in the auth footer. */
export const VENDOR_NAME = 'PT Arah Karya Sinergi';
