import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field } from './field';
import { StatusBadge } from './status-badge';
import { ConfirmDialog } from './confirm-dialog';
import { BrandMark, Wordmark } from './brand-mark';

describe('Field', () => {
  it('links label, hint and error to the control', () => {
    render(
      <Field label="Nama pelanggan" hint="Sesuai NPWP" error="Wajib diisi" required>
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText(/Nama pelanggan/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeRequired();
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    const ids = describedBy.split(' ');
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0])).toHaveTextContent('Sesuai NPWP');
    expect(document.getElementById(ids[1])).toHaveTextContent('Wajib diisi');
  });

  it('omits aria-invalid when there is no error', () => {
    render(
      <Field label="Catatan">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Catatan')).not.toHaveAttribute('aria-invalid');
  });

  it('supports a render function for composite controls', () => {
    render(<Field label="Kode">{(p) => <input {...p} data-testid="custom" />}</Field>);
    expect(screen.getByLabelText('Kode')).toBe(screen.getByTestId('custom'));
  });
});

describe('StatusBadge', () => {
  it('renders the Indonesian label from the registry', () => {
    render(<StatusBadge status="PartiallyPaid" />);
    expect(screen.getByText('Dibayar Sebagian')).toBeInTheDocument();
  });

  it('respects doc type and label override', () => {
    const { rerender } = render(<StatusBadge status="Submitted" docType="journal" />);
    expect(screen.getByText('Diposting')).toBeInTheDocument();
    rerender(<StatusBadge status="Submitted" label="Custom" />);
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });
});

describe('Button', () => {
  it('defaults to type="button" and disables itself while loading', () => {
    render(<Button loading>Simpan</Button>);
    const btn = screen.getByRole('button', { name: 'Simpan' });
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });
});

describe('ConfirmDialog', () => {
  it('requires a reason before confirming and passes it trimmed', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Batalkan invoice?"
        tone="danger"
        confirmLabel="Batalkan"
        requireReason
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Batalkan' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(await screen.findByText(/Alasan wajib diisi/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Alasan/), { target: { value: '  salah harga  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Batalkan' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('salah harga'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('stays open when onConfirm rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('boom'));
    const onOpenChange = vi.fn();
    render(<ConfirmDialog open onOpenChange={onOpenChange} title="Hapus?" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('BrandMark / Wordmark', () => {
  it('exposes an accessible name unless decorative', () => {
    const { container, rerender } = render(<BrandMark />);
    expect(screen.getByRole('img', { name: 'Entaris' })).toBeInTheDocument();
    rerender(<BrandMark title="" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('names the product in the wordmark', () => {
    render(<Wordmark product="EAM" />);
    expect(screen.getByRole('img', { name: 'Entaris EAM' })).toBeInTheDocument();
  });
});
