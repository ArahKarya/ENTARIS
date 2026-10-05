import React from 'react';
import { PDFDownloadLink, type DocumentProps } from '@react-pdf/renderer';
import { FileDown, Loader2 } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  document: React.ReactElement;
  fileName: string;
  label?: string;
  className?: string;
  variant?: 'icon' | 'button' | 'menu-item';
}

/**
 * Wrapper around PDFDownloadLink that shows a spinner while the PDF is being
 * generated. The link itself is styled as the button (no nested <a><button>),
 * uses design tokens only, and keeps a 44px touch target.
 */
const PDFDownloadButton: React.FC<Props> = ({
  document: doc,
  fileName,
  label = 'Unduh PDF',
  className,
  variant = 'button',
}) => {
  // Cast to satisfy @react-pdf/renderer's strict DocumentProps type
  const pdfDoc = doc as React.ReactElement<DocumentProps>;

  const styles = {
    icon: cn(buttonVariants({ variant: 'ghost', size: 'icon-touch' }), 'text-muted-foreground'),
    'menu-item': cn(
      buttonVariants({ variant: 'ghost' }),
      'min-h-11 w-full justify-start rounded-none px-3 text-sm',
    ),
    button: cn(buttonVariants({ variant: 'outline' }), 'min-h-11 sm:min-h-9'),
  }[variant];

  return (
    <PDFDownloadLink document={pdfDoc} fileName={fileName} className={cn(styles, className)} aria-label={variant === 'icon' ? label : undefined}>
      {({ loading }) => (
        <>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}
          {variant === 'icon' ? (
            <span className="sr-only">{loading ? 'Membuat PDF…' : label}</span>
          ) : (
            <span role={loading ? 'status' : undefined}>{loading ? 'Membuat PDF…' : label}</span>
          )}
        </>
      )}
    </PDFDownloadLink>
  );
};

export default PDFDownloadButton;
