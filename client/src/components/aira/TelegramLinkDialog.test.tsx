import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), post, put: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { TelegramLinkDialog } from './TelegramLinkDialog';

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TelegramLinkDialog isOpen onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

describe('TelegramLinkDialog', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('asks for a code on open and shows it with the deep link and the /link command', async () => {
    post.mockResolvedValue({
      data: { linkCode: 'ABCD-EFGH', expiresAt: inMinutes(10), bot: 'airates_bot', deepLink: 'https://t.me/airates_bot?start=link-ABCDEFGH' },
    });
    renderDialog();
    expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/ai/chat/telegram-link');
    expect(screen.getByRole('link', { name: /buka telegram/i })).toHaveAttribute('href', 'https://t.me/airates_bot?start=link-ABCDEFGH');
    expect(screen.getByText(/\/link ABCD-EFGH/)).toBeInTheDocument();
    expect(screen.getByText(/@airates_bot/)).toBeInTheDocument();
  });

  it('marks an expired code and offers a new one', async () => {
    post.mockResolvedValueOnce({ data: { linkCode: 'ABCD-EFGH', expiresAt: inMinutes(-1), bot: null, deepLink: null } });
    post.mockResolvedValueOnce({ data: { linkCode: 'JKMN-PQRS', expiresAt: inMinutes(10), bot: null, deepLink: null } });
    renderDialog();
    expect(await screen.findByText(/kedaluwarsa/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /buka telegram/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /buat kode baru/i }));
    expect(await screen.findByText('JKMN-PQRS')).toBeInTheDocument();
  });

  it('shows the server message when the code cannot be made', async () => {
    post.mockRejectedValue({ response: { data: { error: 'Bot Telegram AIRA belum aktif. Hubungi administrator.' } } });
    renderDialog();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Bot Telegram AIRA belum aktif'));
    expect(screen.getByRole('button', { name: /buat kode baru/i })).toBeInTheDocument();
  });
});
