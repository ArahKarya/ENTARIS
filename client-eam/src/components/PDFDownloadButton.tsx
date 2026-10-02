import React from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { FileDown, Loader2 } from 'lucide-react';

interface Props {
  document: React.ReactElement;
  fileName: string;
  label?: string;
  className?: string;
  variant?: 'icon' | 'button' | 'menu-item';
}

/**
 * Wrapper around PDFDownloadLink that shows a spinner while the PDF is being
 * generated and provides consistent styling across the app.
 */
const PDFDownloadButton: React.FC<Props> = ({
  document: doc,
  fileName,
  label = 'Unduh PDF',
  className,
  variant = 'button',
}) => {
  // Cast to satisfy @react-pdf/renderer's strict DocumentProps type
  const pdfDoc = doc as React.ReactElement<any>;

  if (variant === 'icon') {
    return (
      <PDFDownloadLink document={pdfDoc} fileName={fileName}>
        {({ loading }) => (
          <button
            title={label}
            className={
              className ??
              'p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors'
            }
          >
            {loading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <FileDown size={15} />
            )}
          </button>
        )}
      </PDFDownloadLink>
    );
  }

  if (variant === 'menu-item') {
    return (
      <PDFDownloadLink document={pdfDoc} fileName={fileName}>
        {({ loading }) => (
          <button
            className={
              className ??
              'w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors'
            }
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin text-gray-400" />
            ) : (
              <FileDown size={13} className="text-red-500" />
            )}
            {loading ? 'Membuat PDF...' : label}
          </button>
        )}
      </PDFDownloadLink>
    );
  }

  // default: 'button'
  return (
    <PDFDownloadLink document={pdfDoc} fileName={fileName}>
      {({ loading }) => (
        <button
          className={
            className ??
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors'
          }
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FileDown size={14} />
          )}
          {loading ? 'Membuat...' : label}
        </button>
      )}
    </PDFDownloadLink>
  );
};

export default PDFDownloadButton;
