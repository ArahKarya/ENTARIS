import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmCard } from './ConfirmCard';
import type { ConfirmPart } from './types';

const NOW = new Date('2026-10-14T05:00:00Z');
const card: ConfirmPart = {
  id: '0f8b6c1e-2d3a-4b5c-8d9e-0a1b2c3d4e5f',
  tool: 'po_submit',
  tindakan: 'persetujuan',
  konfirmasi: 'Ajukan PO-1?',
  efek: 'Tidak ada efek GL.',
  rincian: [{ label: 'id', value: '<b>PO-1</b>' }],
  expiresAt: '2026-10-14T05:15:00Z',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('ConfirmCard', () => {
  it('sends ya or batal and says where the request goes', () => {
    const onAnswer = vi.fn();
    render(<ConfirmCard confirm={card} onAnswer={onAnswer} now={NOW} />);
    expect(screen.getByText(/menu Persetujuan/)).toBeInTheDocument();
    expect(screen.getByText('Ajukan PO-1?')).toBeInTheDocument();
    expect(screen.getByText('<b>PO-1</b>')).toBeInTheDocument(); // plain text, never HTML
    expect(screen.getByText(/Tidak ada efek GL/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ya, lanjutkan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(onAnswer.mock.calls).toEqual([['ya'], ['batal']]);
  });

  it('has no buttons once answered, expired or no longer the latest', () => {
    const { rerender } = render(<ConfirmCard confirm={{ ...card, answered: 'ya' }} onAnswer={vi.fn()} now={NOW} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Anda menyetujui aksi ini.')).toBeInTheDocument();
    rerender(<ConfirmCard confirm={card} onAnswer={vi.fn()} now={new Date('2026-10-14T05:20:00Z')} />);
    expect(screen.getByText(/kedaluwarsa/)).toBeInTheDocument();
    rerender(<ConfirmCard confirm={card} now={NOW} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('turns into "expired" on its own when the deadline passes while it is on screen', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T05:14:50Z'));
    render(<ConfirmCard confirm={card} onAnswer={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Ya, lanjutkan' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(11_000); });
    expect(screen.queryByRole('button', { name: 'Ya, lanjutkan' })).toBeNull();
    expect(screen.getByText(/kedaluwarsa/i)).toBeInTheDocument();
  });
});
