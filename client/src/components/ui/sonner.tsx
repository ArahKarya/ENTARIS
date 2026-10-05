import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toasts use the semantic subtle surfaces (bg-*-subtle + text-*-text), which are
 * tuned for >= 4.5:1 contrast in light and dark, instead of sonner's richColors
 * palette (pale tints with low-contrast text). Variant classes sit on the same
 * element as the base classes, so they use important modifiers. The text colour
 * reads var(--color-*-text) directly: sonner defines its own --success-text /
 * --error-text variables on every toast, which would shadow `text-success-text`.
 * (richColors is intentionally off so sonner's pale tints do not apply.)
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
