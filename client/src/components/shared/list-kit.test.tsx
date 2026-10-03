import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './data-table';
import { Pagination } from './pagination';
import { DocumentLink } from './row-actions';

interface Row {
  id: string;
  number: string;
  amount: string;
}

const rows: Row[] = [
  { id: 'a', number: 'SI-001', amount: '1.000' },
  { id: 'b', number: 'SI-002', amount: '2.000' },
];

const columns: ColumnDef<Row>[] = [
  { id: 'number', header: 'Nomor', cell: ({ row }) => row.original.number },
  { id: 'amount', header: 'Total', enableSorting: true, meta: { align: 'right' }, cell: ({ row }) => row.original.amount },
];

const paging = (over: Partial<Parameters<typeof DataTable>[0]['pagination']> = {}) => ({
  page: 1,
  pageSize: 25,
  total: 2,
  onPageChange: vi.fn(),
  ...over,
});

describe('DataTable (server mode)', () => {
  it('opens a row with click, Enter and Space but not from inner buttons', () => {
    const open = vi.fn();
    const inner = vi.fn();
    const cols: ColumnDef<Row>[] = [
      ...columns,
      { id: 'x', header: 'Aksi', cell: () => <button onClick={inner}>Menu</button> },
    ];
    render(<DataTable columns={cols} data={rows} pagination={paging()} label="Daftar" onRowClick={open} />);
    const [first, second] = screen.getAllByRole('row').slice(1);
    expect(first).toHaveAttribute('tabindex', '0');
    fireEvent.click(first);
    fireEvent.keyDown(second, { key: 'Enter' });
    fireEvent.keyDown(second, { key: ' ' });
    expect(open).toHaveBeenCalledTimes(3);
    expect(open).toHaveBeenNthCalledWith(1, rows[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Menu' })[0]);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(3);
  });

  it('labels the scroll region and right-aligns numeric columns', () => {
    render(<DataTable columns={columns} data={rows} pagination={paging()} label="Daftar faktur" />);
    expect(screen.getByRole('region', { name: 'Daftar faktur' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('1.000').closest('td')).toHaveClass('text-right', 'num');
    expect(screen.getByRole('columnheader', { name: /Total/ })).toHaveClass('text-right');
  });

  it('emits server sort changes from sortable headers only', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable columns={columns} data={rows} pagination={paging()} sort={null} onSortChange={onSortChange} />,
    );
    expect(screen.queryByRole('button', { name: /Nomor/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Total/ }));
    expect(onSortChange).toHaveBeenCalledWith({ id: 'amount', desc: false });
    expect(screen.getByRole('columnheader', { name: /Total/ })).toHaveAttribute('aria-sort', 'none');
  });

  it('shows skeleton rows while loading and the three empty states', () => {
    const { rerender } = render(<DataTable columns={columns} data={undefined} pagination={paging({ total: 0 })} loading />);
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.getByText('Memuat…')).toBeInTheDocument();

    rerender(
      <DataTable columns={columns} data={[]} pagination={paging({ total: 0 })} empty={{ title: 'Belum ada faktur' }} />,
    );
    expect(screen.getByText('Belum ada faktur')).toBeInTheDocument();

    const clear = vi.fn();
    rerender(<DataTable columns={columns} data={[]} pagination={paging({ total: 0 })} filtered onClearFilters={clear} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus filter' }));
    expect(clear).toHaveBeenCalled();

    const retry = vi.fn();
    rerender(<DataTable columns={columns} data={rows} pagination={paging()} error={new Error('x')} onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Data gagal dimuat');
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(retry).toHaveBeenCalled();
    expect(screen.queryByText(/Menampilkan/)).toBeNull();
  });
});

describe('Pagination', () => {
  it('shows the Indonesian range and navigates', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={25} total={312} onPageChange={onPageChange} itemLabel="faktur" />);
    expect(screen.getByText('Menampilkan 26–50 dari 312 faktur')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Halaman 2' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
    fireEvent.click(screen.getByRole('button', { name: 'Halaman sebelumnya' }));
    fireEvent.click(screen.getByRole('button', { name: 'Halaman 13' }));
    expect(onPageChange.mock.calls).toEqual([[3], [1], [13]]);
  });

  it('disables prev on the first and next on the last page', () => {
    const { rerender } = render(<Pagination page={1} pageSize={25} total={30} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Halaman sebelumnya' })).toBeDisabled();
    rerender(<Pagination page={2} pageSize={25} total={30} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Halaman berikutnya' })).toBeDisabled();
  });

  it('clamps a page beyond the last one', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={9} pageSize={25} total={30} onPageChange={onPageChange} />);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

describe('DocumentLink', () => {
  it('is out of the tab order inside clickable rows unless focusable', () => {
    const { rerender } = render(<DocumentLink onClick={vi.fn()}>SI-001</DocumentLink>);
    expect(screen.getByRole('button', { name: 'SI-001' })).toHaveAttribute('tabindex', '-1');
    rerender(
      <DocumentLink onClick={vi.fn()} focusable>
        SI-001
      </DocumentLink>,
    );
    expect(screen.getByRole('button', { name: 'SI-001' })).not.toHaveAttribute('tabindex');
  });
});
