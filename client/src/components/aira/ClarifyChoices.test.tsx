import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClarifyChoices } from './ClarifyChoices';

const clarify = { question: 'Periode laporan?', choices: ['Oktober 2026', 'Kuartal 3'] };

describe('ClarifyChoices', () => {
  it('sends the tapped choice and marks the first as recommended', () => {
    const onChoose = vi.fn();
    render(<ClarifyChoices clarify={clarify} onChoose={onChoose} />);
    const first = screen.getByRole('button', { name: /oktober 2026/i });
    expect(first).toHaveTextContent('(disarankan)');
    fireEvent.click(screen.getByRole('button', { name: /kuartal 3/i }));
    expect(onChoose).toHaveBeenCalledWith('Kuartal 3');
    expect(screen.getByText('Atau ketik jawaban sendiri.')).toBeInTheDocument();
  });

  it('shows nothing once the question is no longer the latest', () => {
    const { container } = render(<ClarifyChoices clarify={clarify} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('asks to type when there are no choices', () => {
    render(<ClarifyChoices clarify={{ question: 'Nama Customer?', choices: [] }} onChoose={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Ketik jawabannya di kotak pesan.')).toBeInTheDocument();
  });
});
