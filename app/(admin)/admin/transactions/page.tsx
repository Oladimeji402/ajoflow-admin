'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Search } from 'lucide-react';
import { Pagination, ADMIN_PAGE_SIZE } from '@/components/admin/Pagination';
import { LastSynced } from '@/components/admin/LastSynced';
import { DateRangeSelector, DateRangeValue } from '@/components/admin/DateRangeSelector';
import { DataTable, DataTableColumn } from '@/components/admin/DataTable';
import { ChartCard } from '@/components/admin/charts/ChartCard';
import { AdminAreaChart } from '@/components/admin/charts/AreaChart';
import { useRealtimeSubscription } from '@/lib/hooks/useRealtimeSubscription';
import { useToast } from '@/components/ui/Toast';
import { notifyError, notifySuccess } from '@/lib/toast';
import { ConfirmPopup } from '@/components/ui/ConfirmPopup';
import { useRefreshOnFocus } from '@/lib/hooks/useRefreshOnFocus';

const TRANSACTIONS_REALTIME_TABLES = ['payment_records'];

type TxRow = {
  id: string;
  type: string;
  status: string;
  amount: number;
  reference: string;
  provider_reference?: string | null;
  pending_reason?: string | null;
  request_id?: string | null;
  last_reconciled_at?: string | null;
  reconcile_attempts?: number | null;
  created_at: string;
  groups?: { id: string; name: string } | null;
  profiles?: { id: string; name: string; email: string; phone?: string | null } | null;
};

type SortKey = 'amount' | 'created_at' | 'status';

type TxSummary = {
  totalCount: number;
  successCount: number;
  grossVolume: number;
  pendingVolume: number;
  volumes: Record<string, number>;
  truncated?: boolean;
  trend: Array<{ date: string; amount: number }>;
};

function buildQuery(filters: {
  status: string;
  type: string;
  pendingBucket: string;
  range: string;
  search: string;
  sortKey: string;
  sortDir: string;
}) {
  const params = new URLSearchParams({ sort: filters.sortKey, dir: filters.sortDir });
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.type !== 'all') params.set('type', filters.type);
  if (filters.pendingBucket !== 'all') params.set('pendingBucket', filters.pendingBucket);
  if (filters.range !== 'all' && Number.isFinite(Number(filters.range))) params.set('days', filters.range);
  if (filters.search) params.set('search', filters.search);
  return params;
}

function toCurrency(value: number) {
  return `NGN ${Number(value).toLocaleString('en-NG')}`;
}

function normalizeStatus(status: string | null | undefined) {
  return String(status ?? '').toLowerCase();
}

function AdminTransactionsSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-52 rounded bg-slate-200" />
          <div className="h-3 w-28 rounded bg-slate-200" />
        </div>
        <div className="h-9 w-28 rounded-xl bg-slate-200" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, idx) => (
          <div key={idx} className="rounded-xl border border-slate-100 bg-white p-4 h-20" />
        ))}
      </div>
      <div className="rounded-xl border border-slate-100 bg-white p-4 h-56" />
      <div className="rounded-xl border border-slate-100 bg-white p-3 h-16" />
      <div className="rounded-xl border border-slate-100 bg-white p-3 h-72" />
    </div>
  );
}

export default function AdminTransactionsPage() {
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [highlightedTxId, setHighlightedTxId] = useState('');
  const [actingReference, setActingReference] = useState<string>('');
  const [confirmAction, setConfirmAction] = useState<{ reference: string; action: 'reconcile_now' | 'open_case' } | null>(null);
  const { refreshTrigger, lastEvent } = useRealtimeSubscription({
    channelName: 'admin-transactions-live',
    tables: TRANSACTIONS_REALTIME_TABLES,
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [pendingBucket, setPendingBucket] = useState('all');
  const [range, setRange] = useState<DateRangeValue>('30');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [total, setTotal] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [summary, setSummary] = useState<TxSummary | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (lastEvent?.timestamp) {
      setLastSyncedAt(lastEvent.timestamp);
    }
  }, [lastEvent]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, typeFilter, pendingBucket, range, sortKey, sortDir]);

  const loadTransactions = useCallback(async (background = false) => {
    if (!background && !initialLoaded) {
      setLoading(true);
    }
    setError('');
    try {
      const params = buildQuery({
        status: statusFilter,
        type: typeFilter,
        pendingBucket,
        range,
        search: debouncedSearch,
        sortKey,
        sortDir,
      });
      params.set('page', String(page));
      params.set('pageSize', String(ADMIN_PAGE_SIZE));
      params.set('summary', '1');
      const res = await fetch(`/api/admin/transactions?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load transactions.');
      const nextRows: TxRow[] = Array.isArray(json.data) ? json.data : [];

      setTransactions((previousRows) => {
        if (refreshTrigger > 0 && page === 1 && nextRows.length > 0 && previousRows.length > 0 && nextRows[0]?.id !== previousRows[0]?.id) {
          const nextId = String(nextRows[0].id);
          setHighlightedTxId(nextId);
          setTimeout(() => setHighlightedTxId(''), 2200);
        }

        return nextRows;
      });
      setTotal(Number(json.pagination?.total ?? 0));
      setSummary(json.summary ?? null);
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load transactions.');
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, page, statusFilter, typeFilter, pendingBucket, range, debouncedSearch, sortKey, sortDir]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  useRefreshOnFocus(() => {
    void loadTransactions(true);
  });

  const runAdminAction = useCallback(async (reference: string, action: 'reconcile_now' | 'open_case') => {
    setActingReference(reference);
    try {
      const res = await fetch('/api/admin/transactions/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Action failed');
      if (action === 'reconcile_now') {
        notifySuccess(showToast, `Reconcile completed for ${reference}.`);
      } else {
        notifySuccess(showToast, `Support case opened for ${reference}.`);
      }
      setLastSyncedAt(new Date().toISOString());
      return json;
    } catch (error) {
      notifyError(showToast, error, `Failed to ${action === 'reconcile_now' ? 'reconcile payment' : 'open case'}.`);
      throw error;
    } finally {
      setActingReference('');
    }
  }, [showToast]);

  const volumes = summary?.volumes ?? {};
  const walletFundingVolume = volumes['wallet_funding'] ?? 0;
  const savingsVolume = (volumes['individual_savings'] ?? 0) + (volumes['bulk_contribution'] ?? 0);
  const passbookVolume = volumes['passbook_activation'] ?? 0;
  const payoutVolume = volumes['payout'] ?? 0;
  const grossVolume = summary?.grossVolume ?? 0;
  // Net inflow = wallet funding - (savings + passbook + payouts)
  const netInflow = walletFundingVolume - (savingsVolume + passbookVolume + payoutVolume);
  const pendingVolume = summary?.pendingVolume ?? 0;
  const successRate = summary && summary.totalCount > 0 ? (summary.successCount / summary.totalCount) * 100 : 0;
  const trendData = (summary?.trend ?? []).map((t) => ({ label: t.date.slice(5), amount: t.amount }));

  const toggleSort = useCallback((next: SortKey) => {
    if (sortKey === next) {
      setSortDir((value) => (value === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(next);
    setSortDir('desc');
  }, [sortKey]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: TxRow[] = [];
      const params = buildQuery({
        status: statusFilter,
        type: typeFilter,
        pendingBucket,
        range,
        search: debouncedSearch,
        sortKey,
        sortDir,
      });
      params.set('pageSize', '100');
      for (let p = 1; p <= 500; p += 1) {
        params.set('page', String(p));
        const res = await fetch(`/api/admin/transactions?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Export failed.');
        const chunk: TxRow[] = Array.isArray(json.data) ? json.data : [];
        all.push(...chunk);
        if (chunk.length < 100) break;
      }
      downloadCsv(all);
    } catch (err) {
      notifyError(showToast, err, 'Unable to export transactions.');
    } finally {
      setExporting(false);
    }
  };

  const downloadCsv = (sorted: TxRow[]) => {
    const header = ['Date', 'User', 'Group', 'Type', 'Status', 'Amount', 'Reference', 'Provider Reference'];
    const rows = sorted.map((tx) => [
      new Date(tx.created_at).toISOString(),
      tx.profiles?.name || tx.profiles?.email || 'User',
      tx.groups?.name || 'Group',
      tx.type,
      tx.status,
      String(tx.amount ?? 0),
      tx.reference,
      tx.provider_reference ?? '',
    ]);

    const csv = [header, ...rows]
      .map((line) => line.map((item) => `"${String(item).replaceAll('"', '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `admin-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns: Array<DataTableColumn<TxRow>> = useMemo(
    () => [
      {
        key: 'userGroup',
        header: 'User / Group',
        render: (tx) => (
          <>
            <p className="font-semibold text-brand-navy">{tx.profiles?.name || tx.profiles?.email || 'User'}</p>
            <p className="text-xs text-slate-500">{tx.groups?.name || 'Group'} . {tx.type}</p>
          </>
        ),
      },
      {
        key: 'reference',
        header: 'Reference',
        render: (tx) => (
          <div className="text-xs text-slate-500">
            <p>{tx.reference} . {tx.provider_reference || '-'}</p>
            <p className="text-[11px]">{tx.request_id || 'request:-'} {tx.pending_reason ? `. ${tx.pending_reason}` : ''}</p>
          </div>
        ),
      },
      {
        key: 'amount',
        header: (
          <button type="button" onClick={() => toggleSort('amount')} className="font-semibold text-brand-navy">
            Amount
          </button>
        ),
        render: (tx) => <span className="font-bold text-brand-navy">{toCurrency(Number(tx.amount ?? 0))}</span>,
      },
      {
        key: 'status',
        header: (
          <button type="button" onClick={() => toggleSort('status')} className="font-semibold text-brand-navy">
            Status
          </button>
        ),
        render: (tx) => <span className="capitalize">{tx.status}</span>,
      },
      {
        key: 'dateActions',
        header: (
          <button type="button" onClick={() => toggleSort('created_at')} className="font-semibold text-brand-navy">
            Date
          </button>
        ),
        render: (tx) => (
          <div className="space-y-1">
            <p className="text-xs text-slate-600">{new Date(tx.created_at).toLocaleString()}</p>
            {tx.status === 'pending' && (
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={actingReference === tx.reference}
                  onClick={() => setConfirmAction({ reference: tx.reference, action: 'reconcile_now' })}
                  className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 disabled:opacity-60"
                >
                  {actingReference === tx.reference ? <span className="inline-flex items-center gap-1"><Loader2 size={10} className="animate-spin" />Working...</span> : 'Reconcile now'}
                </button>
                <button
                  type="button"
                  disabled={actingReference === tx.reference}
                  onClick={() => setConfirmAction({ reference: tx.reference, action: 'open_case' })}
                  className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 disabled:opacity-60"
                >
                  Open case
                </button>
              </div>
            )}
          </div>
        ),
      },
    ],
    [toggleSort, runAdminAction],
  );

  if (loading && !initialLoaded) return <AdminTransactionsSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <LastSynced timestamp={lastSyncedAt} loading={loading} />
        <button onClick={() => void exportCsv()} disabled={exporting} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-navy hover:bg-slate-50 transition-colors">
          <Download size={12} /> {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Transaction Type Breakdown */}
      <div>
        <h2 className="text-sm font-semibold text-brand-navy mb-2">Transaction Type Breakdown</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="text-xs text-brand-gray">Wallet Funding</p>
            <p className="text-xl font-bold text-blue-700">{toCurrency(walletFundingVolume)}</p>
            <p className="text-[10px] text-slate-500 mt-1">Money received from banks</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="text-xs text-brand-gray">Savings Volume</p>
            <p className="text-xl font-bold text-emerald-700">{toCurrency(savingsVolume)}</p>
            <p className="text-[10px] text-slate-500 mt-1">User contributions</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="text-xs text-brand-gray">Passbook Fees</p>
            <p className="text-xl font-bold text-purple-700">{toCurrency(passbookVolume)}</p>
            <p className="text-[10px] text-slate-500 mt-1">Activation fees collected</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="text-xs text-brand-gray">Payouts</p>
            <p className="text-xl font-bold text-red-700">{toCurrency(payoutVolume)}</p>
            <p className="text-[10px] text-slate-500 mt-1">Withdrawals to users</p>
          </div>
        </div>
      </div>

      {/* Summary Metrics */}
      <div>
        <h2 className="text-sm font-semibold text-brand-navy mb-2">Summary Metrics</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="text-xs text-brand-gray">Gross Volume</p>
            <p className="text-lg font-bold text-slate-700">{toCurrency(grossVolume)}</p>
            <p className="text-[10px] text-slate-500 mt-1">All transactions (includes double-counting)</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="text-xs text-brand-gray">Transaction Count</p>
            <p className="text-lg font-bold text-brand-navy">{(summary?.totalCount ?? total).toLocaleString()}</p>
            <p className="text-[10px] text-slate-500 mt-1">{successRate.toFixed(1)}% success rate</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="text-xs text-brand-gray">Pending Volume</p>
            <p className="text-lg font-bold text-amber-700">{toCurrency(pendingVolume)}</p>
            <p className="text-[10px] text-slate-500 mt-1">Awaiting confirmation</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="text-xs text-brand-gray">Net Inflow</p>
            <p className={`text-lg font-bold ${netInflow >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {toCurrency(netInflow)}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">Funding - spending</p>
          </div>
        </div>
      </div>

      <ChartCard title="Transaction Volume Trend" subtitle="Volume for selected filters">
        <AdminAreaChart
          data={trendData}
          xKey="label"
          series={[{ key: 'amount', name: 'Amount', color: '#1B2F6B' }]}
          valueFormatter={toCurrency}
        />
      </ChartCard>

      <div className="rounded-xl border border-slate-100 bg-white p-3">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); }} placeholder="Search by user, group or reference" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="pending">Pending</option>
            <option value="abandoned">Abandoned</option>
            <option value="failed">Failed</option>
          </select>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="all">All Types</option>
            <option value="wallet_funding">Wallet funding</option>
            <option value="individual_savings">Individual savings</option>
            <option value="bulk_contribution">Bulk contribution</option>
            <option value="passbook_activation">Passbook activation</option>
            <option value="payout">Payout</option>
            <option value="contribution">Contribution (legacy)</option>
          </select>
          <select value={pendingBucket} onChange={(e) => { setPendingBucket(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="all">Pending age</option>
            <option value="5m">5m+</option>
            <option value="30m">30m+</option>
            <option value="2h">2h+</option>
            <option value="24h">24h+</option>
          </select>
          <DateRangeSelector
            value={range}
            onChange={(next) => {
              setRange(next);
            }}
            className="justify-self-start md:justify-self-stretch"
          />
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <DataTable
        rows={transactions}
        columns={columns}
        rowKey={(tx) => tx.id}
        rowClassName={(tx) => (tx.id === highlightedTxId ? 'bg-emerald-50 transition-colors' : '')}
        emptyMessage="No transactions found for current filters."
      />

      <Pagination page={page} total={total} onPageChange={setPage} />

      <ConfirmPopup
        open={Boolean(confirmAction)}
        title={confirmAction?.action === 'reconcile_now' ? 'Reconcile payment?' : 'Open support case?'}
        message={confirmAction
          ? `Reference: ${confirmAction.reference}`
          : ''}
        confirmLabel={confirmAction?.action === 'reconcile_now' ? 'Reconcile now' : 'Open case'}
        loading={Boolean(confirmAction && actingReference === confirmAction.reference)}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          void runAdminAction(confirmAction.reference, confirmAction.action).finally(() => setConfirmAction(null));
        }}
      />
    </div>
  );
}
