import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), post, put: vi.fn() } }));
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));

import { OpenConsoleButton } from './OpenConsoleButton';

function renderButton() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OpenConsoleButton />
    </QueryClientProvider>,
  );
}

describe('OpenConsoleButton', () => {
  let tab: { opener: unknown; location: { href: string }; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    post.mockReset();
    toastError.mockReset();
    tab = { opener: window, location: { href: 'about:blank' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  });
  afterEach(() => vi.restoreAllMocks());

  it('opens the tab on click and sends it to the console with the ticket in the fragment', async () => {
    post.mockResolvedValue({ data: { consoleUrl: 'http://127.0.0.1:8642/admin', token: 'abc.def', expiresAt: 1 } });
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /konsol engine/i }));
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(tab.opener).toBeNull();
    await waitFor(() => expect(tab.location.href).toBe('http://127.0.0.1:8642/admin/sso#t=abc.def'));
    expect(post).toHaveBeenCalledWith('/ai/mcp/console');
  });

  it('closes the tab and shows the server message when the console is not configured', async () => {
    post.mockRejectedValue({ response: { data: { error: 'Konsol engine belum dikonfigurasi.' } } });
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /konsol engine/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Konsol engine belum dikonfigurasi.'));
    expect(tab.close).toHaveBeenCalled();
  });
});
