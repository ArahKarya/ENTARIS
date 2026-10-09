import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toasts use the semantic subtle surfaces (>= 4.5:1 contrast) with richColors off.
 * Variant classes need important modifiers, and text reads var(--color-*-text)
 * directly because sonner's own --success-text/--error-text would shadow it.
 */
export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme as ToasterProps['theme']}
      className="toaster group"
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            'group toast !border !border-border !bg-card !shadow-lg',
          title: '!text-inherit',
          description: '!text-muted-foreground',
          success: '!border-success !bg-success-subtle !text-(--color-success-text)',
          error: '!border-danger !bg-danger-subtle !text-(--color-danger-text)',
          warning: '!border-warning !bg-warning-subtle !text-(--color-warning-text)',
          info: '!border-info !bg-info-subtle !text-(--color-info-text)',
        },
      }}
      {...props}
    />
  );
}
