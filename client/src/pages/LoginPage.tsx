import { useEffect, useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { LoginForm } from '@/components/auth/LoginForm';
import { HelpDialog } from '@/components/auth/HelpDialog';
import { AUTH_COPY, type AuthProduct } from '@/components/auth/auth-copy';
import { safeRedirectTarget, tenantName } from '@/components/auth/login-helpers';

interface PublicBranding {
  companyName: string | null;
  phone: string | null;
  email: string | null;
}

const PRODUCT: AuthProduct = 'ERP';
const EMPTY_BRANDING: PublicBranding = { companyName: null, phone: null, email: null };

function hasStoredUser(): boolean {
  try {
    return Boolean(localStorage.getItem('user'));
  } catch {
    return false;
  }
}

const LoginPage = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [branding, setBranding] = useState<PublicBranding>(EMPTY_BRANDING);
  const [help, setHelp] = useState<'forgot' | 'help' | null>(null);
  const [lastHelp, setLastHelp] = useState<'forgot' | 'help'>('forgot');
  const [alreadyAuthed] = useState(hasStoredUser);

  useEffect(() => {
    const previous = document.title;
    document.title = AUTH_COPY[PRODUCT].documentTitle;
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    if (alreadyAuthed) return undefined;
    let cancelled = false;
    api
      .get<PublicBranding>('/public/branding')
      .then((res) => {
        if (!cancelled) setBranding({ ...EMPTY_BRANDING, ...res.data });
      })
      .catch(() => {
        /* Branding is optional: the page falls back to the plain Entaris wordmark. */
      });
    return () => {
      cancelled = true;
    };
  }, [alreadyAuthed]);

  // Already signed in (session checked again by the protected shell).
  if (alreadyAuthed) {
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={safeRedirectTarget(from)} replace />;
  }

  const openHelp = (reason: 'forgot' | 'help') => {
    setLastHelp(reason);
    setHelp(reason);
  };

  return (
    <AuthLayout product={PRODUCT} onHelp={() => openHelp('help')}>
      <LoginForm
        product={PRODUCT}
        tenant={tenantName(branding.companyName)}
        sessionExpired={searchParams.get('alasan') === 'sesi'}
        onForgotPassword={() => openHelp('forgot')}
      />
      <HelpDialog
        open={help !== null}
        onOpenChange={(open) => setHelp(open ? lastHelp : null)}
        reason={lastHelp}
        email={branding.email}
        phone={branding.phone}
      />
    </AuthLayout>
  );
};

export default LoginPage;
