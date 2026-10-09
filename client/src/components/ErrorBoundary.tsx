import React from 'react';

interface State {
  hasError: boolean;
  error?: Error;
}

function ErrorFallback({ onReset }: { onReset: () => void }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-muted">
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold text-foreground mb-2">Terjadi kesalahan tak terduga</h2>
        <p className="text-muted-foreground mb-4">Silakan muat ulang halaman atau coba lagi.</p>
        <button
          onClick={onReset}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover text-sm font-medium"
        >
          Coba lagi
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('React render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onReset={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}
