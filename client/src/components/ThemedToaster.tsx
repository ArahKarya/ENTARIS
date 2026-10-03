import { Toaster } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';

/** Global toast host. Follows the app theme (light/dark/system), not the OS default. */
export function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster position="top-right" richColors theme={resolvedTheme} />;
}
