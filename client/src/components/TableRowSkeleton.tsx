interface Props {
  /** Number of <td> cells per row to render. */
  columns: number;
  /** How many skeleton rows to render (default 5). */
  rows?: number;
}

/**
 * Skeleton placeholder rows for plain table lists.
 * Render inside `<tbody>` while a useQuery is loading — replaces the empty
 * `<tbody>` + spinner-in-center pattern with a more polished perceived load.
 */
export const TableRowSkeleton: React.FC<Props> = ({ columns, rows = 5 }) => {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="animate-pulse">
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <div className="h-3 bg-muted rounded w-full max-w-[120px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
};

export default TableRowSkeleton;
