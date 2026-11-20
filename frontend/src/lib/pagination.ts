const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Convert URL search params into Supabase range params (from/to) plus page metadata. */
export function paginationParams(searchParams: Record<string, string | string[] | undefined>) {
  const page = Math.max(1, Number(searchParams['page'] ?? 1) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams['pageSize'] ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE),
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { page, pageSize, from, to };
}
