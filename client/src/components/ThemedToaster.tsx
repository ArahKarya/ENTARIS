import { Toaster } from '@/components/ui/sonner';

/**
 * Global toast host. The design-system Toaster follows the app theme
 * (light/dark/system) and uses the semantic, contrast-checked toast colours.
 */
export function ThemedToaster() {
  return <Toaster />;
}
