'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const ADMIN_PAGE_SIZE = 20;

type PaginationProps = {
  page: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  className?: string;
};

function buildPages(page: number, totalPages: number): Array<number | 'gap'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const sorted = Array.from(pages)
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

export function Pagination({
  page,
  total,
  pageSize = ADMIN_PAGE_SIZE,
  onPageChange,
  disabled = false,
  className = '',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold disabled:opacity-40';

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`.trim()}>
      <p className="text-xs text-slate-500">
        {from}–{to} of {total.toLocaleString()}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={`${btn} border border-slate-200 bg-white text-brand-navy`}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        {buildPages(page, totalPages).map((n, i) =>
          n === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-slate-400">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onPageChange(n)}
              aria-current={n === page ? 'page' : undefined}
              className={`${btn} ${
                n === page ? 'bg-brand-navy text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={`${btn} border border-slate-200 bg-white text-brand-navy`}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * Client-side paging for lists whose API returns the whole set (needed for aggregates).
 * Resets to page 1 when `resetKey` changes (e.g. filters/search) and clamps if the list shrinks.
 */
export function usePagedSlice<T>(items: T[], resetKey: string = '', pageSize: number = ADMIN_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    // Reset to page 1 when filters change (adjusting state during render, no effect needed).
    setPrevKey(resetKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );

  return { page: safePage, setPage, pageItems, total: items.length, pageSize };
}
