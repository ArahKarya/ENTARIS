/**
 * `lazyPage`: React.lazy with a shared Suspense fallback (reserved height so the shell
 * does not jump), a chunk-load error boundary for stale deploys, and `preload()` for hover/focus.
 */
import { Component, lazy, Suspense, type ComponentProps, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { LoadingState } from '@/components/shared';
import { isChunkLoadError } from './lazyUtils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;
type PageComponent<C extends AnyComponent> = ((props: ComponentProps<C>) => ReactNode) & { preload: () => void };

export function PageFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <LoadingState label="Memuat halaman…" />
    </div>
  );
}

interface BoundaryState { error: Error | null }

class ChunkErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page load error:', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // Anything that is not a failed chunk fetch keeps going to the app-level boundary.
    if (!isChunkLoadError(error)) throw error;
    return (
      <div role="alert" className="min-h-[50vh] flex flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-lg font-semibold text-foreground">Gagal memuat halaman</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Aplikasi baru saja diperbarui atau koneksi terputus. Muat ulang untuk mengambil versi terbaru.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Muat ulang
        </button>
      </div>
    );
  }
}

/** Resets the boundary on navigation so a failed page does not stick. */
function KeyedBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ChunkErrorBoundary key={pathname}>{children}</ChunkErrorBoundary>;
}

// eslint-disable-next-line react-refresh/only-export-components -- factory, not a component
export function lazyPage<C extends AnyComponent>(loader: () => Promise<{ default: C }>): PageComponent<C> {
  let pending: Promise<{ default: C }> | null = null;
  const load = () => (pending ??= loader().catch((err) => { pending = null; throw err; }));
  const Lazy = lazy(load) as AnyComponent;
  const Page = ((props: ComponentProps<C>) => (
    <KeyedBoundary>
      <Suspense fallback={<PageFallback />}>
        <Lazy {...props} />
      </Suspense>
    </KeyedBoundary>
  )) as PageComponent<C>;
  Page.preload = () => { void load().catch(() => undefined); };
  return Page;
}
