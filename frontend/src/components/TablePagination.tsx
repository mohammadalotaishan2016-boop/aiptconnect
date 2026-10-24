'use client';

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  loading?: boolean;
  allowAll?: boolean;
  pageSizeOptions?: number[];
};

export default function TablePagination({ page, pageSize, total, onPageChange, onPageSizeChange, loading = false, allowAll = false, pageSizeOptions = [10, 20, 50, 100] }: Props) {
  const resolvedPageSize = pageSize === 0 ? Math.max(total, 1) : pageSize;
  const pages = Math.max(1, Math.ceil(total / resolvedPageSize));
  const current = Math.min(Math.max(1, page), pages);
  const firstRow = total ? (current - 1) * resolvedPageSize + 1 : 0;
  const lastRow = Math.min(current * resolvedPageSize, total);
  return (
    <footer className="aipt-pagination">
      <span>Showing {firstRow}–{lastRow} of {total}</span>
      <label>Rows per page <select aria-label="Rows per page" value={pageSize} disabled={loading} onChange={event => { onPageSizeChange(Number(event.target.value)); onPageChange(1); }}>
        {pageSizeOptions.map(size => <option key={size} value={size}>{size}</option>)}
        {allowAll && <option value={0}>All</option>}
      </select></label>
      <nav aria-label="Table pagination">
        <button type="button" disabled={loading || current <= 1} onClick={() => onPageChange(1)} aria-label="First page">First</button>
        <button type="button" disabled={loading || current <= 1} onClick={() => onPageChange(current - 1)}>Previous</button>
        <span aria-live="polite">Page {current} of {pages}</span>
        <button type="button" disabled={loading || current >= pages} onClick={() => onPageChange(current + 1)}>Next</button>
        <button type="button" disabled={loading || current >= pages} onClick={() => onPageChange(pages)} aria-label="Last page">Last</button>
      </nav>
    </footer>
  );
}
