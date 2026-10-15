import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Markdown } from './Markdown';
import { parseBlocks, safeHref } from './markdownParse';
import { splitSse } from './sse';
import { groupOf, groupSessions } from './sessionGroups';
import { CardPartView } from './CardParts';
import { ToolChips } from './ToolChips';
import { collapseChips } from './chipUtils';
import { MessageItem } from './MessageItem';
import { formatElapsed } from './formatElapsed';
import { LoadingState } from './LoadingState';
import { Composer } from './Composer';
import { SessionList } from './SessionList';
import { EmptyChat } from './EmptyChat';
import { examplePrompts } from './examples';
import type { ChatSessionDto, ViewMessage } from './types';

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('Markdown (XSS-safe)', () => {
  it('renders raw HTML/script as text, never as elements', () => {
    const { container } = wrap(<Markdown text={'<img src=x onerror=alert(1)> <script>alert(1)</script>\n\n**tebal** dan `kode`'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.querySelector('strong')?.textContent).toBe('tebal');
    expect(container.querySelector('code')?.textContent).toBe('kode');
  });

  it('only links http(s), mailto and internal paths; javascript:/data: stay plain text', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<b>x</b>')).toBeNull();
    expect(safeHref('//evil.example/x')).toBeNull();
    expect(safeHref('/approvals')).toEqual({ href: '/approvals', internal: true });
    expect(safeHref('https://a.test/x')).toEqual({ href: 'https://a.test/x', internal: false });
    const { container } = wrap(<Markdown text="[klik](javascript:alert(1)) dan [aman](https://a.test) dan [dalam](/approvals)" />);
    const links = [...container.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://a.test', '/approvals']);
    expect(links[0].getAttribute('rel')).toContain('noopener');
    expect(container.textContent).toContain('[klik](javascript:alert(1))');
  });

  it('parses lists, headings, fenced code and tables', () => {
    const blocks = parseBlocks('# Judul\n\n- a\n- b\n\n1. satu\n2. dua\n\n```\nkode\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |');
    expect(blocks.map((b) => b.t)).toEqual(['h', 'ul', 'ol', 'code', 'table']);
    const { container } = wrap(<Markdown text={'| A | B |\n|---|---|\n| 1 | 2 |'} />);
    expect(container.querySelectorAll('th')).toHaveLength(2);
    expect(container.querySelector('td')?.textContent).toBe('1');
  });
});

describe('splitSse', () => {
  it('splits complete blocks, keeps the partial rest, ignores keepalive comments and bad JSON', () => {
    const buf = ': ping\n\nevent: delta\ndata: {"text":"Ha"}\n\nevent: delta\ndata: {"te';
    const { events, rest } = splitSse(buf);
    expect(events).toEqual([{ event: 'delta', data: { text: 'Ha' } }]);
    expect(rest).toBe('event: delta\ndata: {"te');
    expect(splitSse('event: x\ndata: {bukan json}\n\n').events).toEqual([]);
  });
});

describe('session grouping', () => {
  const now = new Date(2026, 9, 14, 12);
  const s = (id: string, daysAgo: number): ChatSessionDto => ({
    id, title: id, titleSource: 'auto', status: 'active', messageCount: 2, lastMessageAt: new Date(2026, 9, 14 - daysAgo, 9).toISOString(), lastOpenedAt: null, createdAt: '', busy: false,
  });
  it('buckets today / yesterday / last 7 days / older, in order, omitting empty groups', () => {
    expect(groupOf(s('a', 0).lastMessageAt, now)).toBe('today');
    expect(groupOf(s('a', 1).lastMessageAt, now)).toBe('yesterday');
    expect(groupOf(s('a', 5).lastMessageAt, now)).toBe('last7Days');
    expect(groupOf(s('a', 30).lastMessageAt, now)).toBe('older');
    const g = groupSessions([s('x', 30), s('y', 0), s('z', 1)], now);
    expect(g.map((x) => x.key)).toEqual(['today', 'yesterday', 'older']);
  });
});

describe('CardPartView / ToolChips', () => {
  it('renders title, summary, status and an internal link; refuses external hrefs', () => {
    wrap(<CardPartView card={{ kind: 'cash_book_draft', title: 'Draft Buku Kas DKB-1', summary: '3 baris', href: '/cash-book-drafts/d1', status: 'Draft' }} />);
    expect(screen.getByText('Draft Buku Kas DKB-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tinjau draft/ })).toHaveAttribute('href', '/cash-book-drafts/d1');
  });
  it('does not render a link for non-internal hrefs', () => {
    wrap(<CardPartView card={{ kind: 'link', title: 'X', href: 'https://evil.test' }} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('approval card links to /approvals', () => {
    wrap(<CardPartView card={{ kind: 'approval', title: 'Menunggu persetujuan', href: '/approvals' }} />);
    expect(screen.getByRole('link', { name: /Buka Persetujuan/ })).toHaveAttribute('href', '/approvals');
  });
  it('collapses start+done into one chip and announces state to screen readers', () => {
    const chips = [
      { name: 'a', label: 'Mengambil piutang…', state: 'start' as const },
      { name: 'a', label: 'Mengambil piutang…', state: 'done' as const },
      { name: 'b', label: 'Memeriksa…', state: 'start' as const },
    ];
    expect(collapseChips(chips).map((c) => c.state)).toEqual(['done', 'start']);
    render(<ToolChips chips={chips} />);
    expect(screen.getByText('(selesai)')).toBeInTheDocument();
    expect(screen.getByText('(berjalan)')).toBeInTheDocument();
  });
});

const msg = (over: Partial<ViewMessage>): ViewMessage => ({ id: 'm1', role: 'assistant', content: '', status: 'ok', attachments: [], tools: [], cards: [], ...over });

describe('MessageItem', () => {
  it('shows an error with "Coba lagi" for the last failed answer and keeps partial text', () => {
    const onRetry = vi.fn();
    wrap(<MessageItem message={msg({ status: 'error', error: 'Engine AIRA tidak dapat dihubungi.', content: 'Sebagian' })} canRetry retryTargetId="u1" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Engine AIRA tidak dapat dihubungi.');
    expect(screen.getByText('Sebagian')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Coba lagi/ }));
    expect(onRetry).toHaveBeenCalledWith('u1');
  });
  it('aborted answers show a stopped notice and a retry action', () => {
    wrap(<MessageItem message={msg({ status: 'aborted', content: 'Separuh' })} canRetry retryTargetId="u1" onRetry={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Dihentikan/);
  });
  it('user messages render as plain text (not Markdown/HTML)', () => {
    const { container } = wrap(<MessageItem message={msg({ role: 'user', content: '<b>x</b> **y**' })} canRetry={false} onRetry={vi.fn()} />);
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<b>x</b> **y**');
  });
  it('streaming assistant message is busy and offers no copy button yet', () => {
    wrap(<MessageItem message={msg({ status: 'streaming', content: 'sedang' })} canRetry={false} onRetry={vi.fn()} />);
    expect(screen.getByRole('article', { name: 'Balasan AIRA' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: 'Salin jawaban' })).toBeNull();
  });
});

describe('loading state', () => {
  it('shows a status with the generic label and a timer while AIRA has nothing to show yet', () => {
    wrap(<MessageItem message={msg({ status: 'streaming', content: '' })} canRetry={false} onRetry={vi.fn()} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('AIRA sedang memproses');
    expect(status).toHaveTextContent(/\d+\.\ds/);
  });
  it('uses the label of the tool that is running, and disappears once text arrives', () => {
    const running = msg({ status: 'streaming', content: '', tools: [{ name: 'a', label: 'Mengambil piutang jatuh tempo', state: 'start' }] });
    const { rerender } = wrap(<MessageItem message={running} canRetry={false} onRetry={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Mengambil piutang jatuh tempo');
    rerender(<MemoryRouter><MessageItem message={{ ...running, content: 'Ada 3 invoice.' }} canRetry={false} onRetry={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('formats the timer in seconds then minutes', () => {
    expect(formatElapsed(3200)).toBe('3.2s');
    expect(formatElapsed(75_400)).toBe('1m 15.4s');
    expect(formatElapsed(-5)).toBe('0.0s');
  });
});

describe('loading state timer', () => {
  it('counts up from the given start, keeps counting when the label changes, and stops on unmount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { rerender, unmount } = render(<LoadingState label="Mencari" since={9_000} />);
    expect(screen.getByRole('status')).toHaveTextContent('1.0s');
    act(() => { vi.advanceTimersByTime(1000); });
    rerender(<LoadingState label="Mengambil piutang" since={9_000} />);
    expect(screen.getByRole('status')).toHaveTextContent('Mengambil piutang');
    expect(screen.getByRole('status')).toHaveTextContent('2.0s');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});

describe('Composer keyboard', () => {
  const setup = (over: Partial<React.ComponentProps<typeof Composer>> = {}) => {
    const props = { value: 'halo', onChange: vi.fn(), onSend: vi.fn(), onStop: vi.fn(), busy: false, file: null, onFile: vi.fn(), acceptsPdf: false, ...over };
    render(<Composer {...props} />);
    return props;
  };
  it('Enter sends, Shift+Enter does not', () => {
    const p = setup();
    const box = screen.getByLabelText('Pesan untuk AIRA');
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(p.onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(p.onSend).toHaveBeenCalledTimes(1);
  });
  it('Esc stops while busy and the stop button replaces send', () => {
    const p = setup({ busy: true });
    fireEvent.keyDown(screen.getByLabelText('Pesan untuk AIRA'), { key: 'Escape' });
    expect(p.onStop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Hentikan jawaban' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kirim pesan' })).toBeNull();
  });
  it('empty input disables send; attachment chip can be removed; accept list follows PDF support', () => {
    const f = new File(['x'], 'nota.png', { type: 'image/png' });
    const p = setup({ value: '', file: f });
    expect(screen.getByRole('button', { name: 'Kirim pesan' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Hapus lampiran nota.png' }));
    expect(p.onFile).toHaveBeenCalledWith(null);
    expect(document.querySelector('input[type=file]')?.getAttribute('accept')).not.toContain('pdf');
  });
});

describe('SessionList / EmptyChat', () => {
  const sessions: ChatSessionDto[] = [{ id: 's1', title: 'Piutang minggu ini', titleSource: 'auto', status: 'active', messageCount: 2, lastMessageAt: new Date().toISOString(), lastOpenedAt: null, createdAt: '', busy: false }];
  const base = {
    sessions, loading: false, hasMore: false, loadingMore: false, onLoadMore: vi.fn(), search: '', onSearch: vi.fn(), status: 'active' as const, onStatus: vi.fn(),
    activeId: 's1', onSelect: vi.fn(), onNew: vi.fn(), onRename: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn(), onExport: vi.fn(),
  };
  it('has a visible "Sesi baru", search, group heading and marks the active session', () => {
    const onNew = vi.fn();
    render(<SessionList {...base} onNew={onNew} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sesi baru' }));
    expect(onNew).toHaveBeenCalled();
    expect(screen.getByLabelText('Cari percakapan')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hari ini' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Piutang minggu ini' })).toHaveAttribute('aria-current', 'true');
  });
  it('inline rename commits on Enter; delete asks for confirmation first', () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(<SessionList {...base} onRename={onRename} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /Ubah nama: Piutang/ }));
    const input = screen.getByLabelText('Nama sesi');
    fireEvent.change(input, { target: { value: 'Nama baru' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('s1', 'Nama baru');
    fireEvent.click(screen.getByRole('button', { name: /Hapus sesi: Piutang/ }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hapus' }));
    expect(onDelete).toHaveBeenCalledWith('s1');
  });
  it('archive filter toggles and the archived row offers restore', () => {
    const onStatus = vi.fn();
    const { rerender } = render(<SessionList {...base} onStatus={onStatus} />);
    fireEvent.click(screen.getByRole('button', { name: 'Arsip' }));
    expect(onStatus).toHaveBeenCalledWith('archived');
    rerender(<SessionList {...base} status="archived" />);
    expect(screen.getByRole('button', { name: /Pulihkan sesi: Piutang/ })).toBeInTheDocument();
  });
  it('empty chat offers the three example prompts', () => {
    const onPick = vi.fn();
    render(<EmptyChat onPick={onPick} />);
    expect(examplePrompts()).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Apa saja yang menunggu persetujuan saya?' }));
    expect(onPick).toHaveBeenCalledWith('Apa saja yang menunggu persetujuan saya?');
  });
});
