export function parsePagination(url: URL, defaults = { pageSize: 20, maxPageSize: 100 }) {
  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const rawSize = Number.parseInt(url.searchParams.get("pageSize") ?? String(defaults.pageSize), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Math.min(
    Math.max(Number.isFinite(rawSize) ? rawSize : defaults.pageSize, 1),
    defaults.maxPageSize,
  );
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

/** Strip characters that have meaning inside a PostgREST `.or()` filter string or ilike pattern. */
export function sanitizeSearch(value: string | null | undefined) {
  return (value ?? "").replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}
