'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, X, Calendar, CreditCard } from 'lucide-react';
import { Pagination, usePagedSlice } from '@/components/admin/Pagination';
import { LastSynced } from '@/components/admin/LastSynced';
import { useRealtimeSubscription } from '@/lib/hooks/useRealtimeSubscription';
import { useToast } from '@/components/ui/Toast';
import { notifyError, notifySuccess } from '@/lib/toast';

function toCurrency(value: number) {
  return `NGN ${Number(value).toLocaleString('en-NG')}`;
}

// ── Payment History ───────────────────────────────────────────────────────────

type PaymentHistoryRow = {
  id: string;
  type: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    bank_account?: string | null;
    bank_name?: string | null;
  };
  group_or_scheme: string;
  amount: number;
  reference: string;
  period?: string | null;
  paid_at: string;
  notes?: string | null;
};

function PaymentHistoryTab() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentHistoryRow[]>([]);
  const [summary, setSummary] = useState({ totalPaidOut: 0, totalPayments: 0, uniqueUsers: 0, savingsPayouts: 0, groupPayouts: 0 });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/payment-history', { cache: 'no-store' });
        const json = await res.json();
        if (res.ok) {
          setPayments(json.data.payments || []);
          setSummary(json.data.summary || {});
        }
      } catch (err) {
        console.error('Failed to load payment history:', err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return payments;
    const term = searchTerm.toLowerCase();
    return payments.filter(p =>
      p.user.name.toLowerCase().includes(term) ||
      p.user.email.toLowerCase().includes(term) ||
      p.group_or_scheme.toLowerCase().includes(term) ||
      p.reference.toLowerCase().includes(term)
    );
  }, [payments, searchTerm]);

  const historyPaged = usePagedSlice(filtered, searchTerm);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-brand-gray">
        <Loader2 size={16} className="animate-spin" /> Loading payment history...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="text-xs text-brand-gray">Total Paid Out</p>
          <p className="text-xl font-bold text-emerald-700">{toCurrency(summary.totalPaidOut)}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="text-xs text-brand-gray">Total Payments</p>
          <p className="text-xl font-bold text-brand-navy">{summary.totalPayments}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="text-xs text-brand-gray">Users Paid</p>
          <p className="text-xl font-bold text-blue-700">{summary.uniqueUsers}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="text-xs text-brand-gray">Savings payouts</p>
          <p className="text-xl font-bold text-slate-600">{summary.savingsPayouts}</p>
        </div>
      </div>

      {/* Search */}
      <div className="rounded-xl border border-slate-100 bg-white p-3">
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search by user name, email, or reference..."
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </div>

      {/* Payment List */}
      <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Date</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">User</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Plan</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Period</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-600">Amount</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Bank Details</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Reference</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    {searchTerm ? 'No payments match your search' : 'No payment history found'}
                  </td>
                </tr>
              )}
              {historyPaged.pageItems.map((payment) => (
                <tr key={payment.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4">
                    <p className="text-xs text-slate-600">{new Date(payment.paid_at).toLocaleDateString()}</p>
                    <p className="text-[10px] text-slate-400">{new Date(payment.paid_at).toLocaleTimeString()}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-brand-navy">{payment.user.name}</p>
                    <p className="text-xs text-slate-500">{payment.user.email}</p>
                    {payment.user.phone && <p className="text-xs text-slate-400">{payment.user.phone}</p>}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-700">{payment.group_or_scheme}</p>
                    <span className="inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700">
                      Savings
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-slate-600">{payment.period || '—'}</p>
                    {payment.notes && <p className="text-xs text-slate-400 mt-0.5">{payment.notes}</p>}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <p className="font-bold text-emerald-700">{toCurrency(payment.amount)}</p>
                  </td>
                  <td className="py-3 px-4">
                    {payment.user.bank_account ? (
                      <>
                        <p className="text-xs font-semibold text-slate-600">{payment.user.bank_name || 'Bank'}</p>
                        <p className="text-xs font-mono text-slate-500">{payment.user.bank_account}</p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400">No bank details</p>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-xs font-mono text-slate-500">{payment.reference}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={historyPaged.page}
          total={historyPaged.total}
          onPageChange={historyPaged.setPage}
          className="border-t border-slate-100 px-4 py-3"
        />
      </div>

      {/* Footer Note */}
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold mb-1">✅ Payment History</p>
        <p className="text-emerald-800">
          This shows all completed payouts to users. Each entry represents money that has been sent to a user&apos;s bank account.
          You can search by user name, email, plan name, or reference number.
        </p>
      </div>
    </div>
  );
}

// ── Savings Schedule ──────────────────────────────────────────────────────────

type ScheduleRow = {
  scheme_id: string;
  scheme_name: string;
  frequency: string;
  minimum_amount: number;
  status: string;
  next_payout: string;
  total_saved: number;
  total_paid_out: number;
  amount_owed: number;
  profile: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    bank_account?: string | null;
    bank_name?: string | null;
    bank_account_name?: string | null;
  } | null;
};

function SavingsScheduleTab() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [freqFilter, setFreqFilter] = useState('all');
  const [showDueOnly, setShowDueOnly] = useState(true);
  const [selected, setSelected] = useState<ScheduleRow | null>(null);
  const [recording, setRecording] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ amount: '', periodLabel: '', notes: '' });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const res = await fetch('/api/admin/savings-schedule', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) setRows(Array.isArray(json.data) ? json.data : []);
      setLoading(false);
    };
    void load();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (freqFilter !== 'all' && r.frequency !== freqFilter) return false;
      if (showDueOnly && r.amount_owed <= 0) return false;
      return true;
    });
  }, [rows, freqFilter, showDueOnly]);

  const handleRecord = async () => {
    if (!selected) return;
    const amount = Number(payoutForm.amount);
    if (!amount || amount <= 0) { notifyError(showToast, new Error('Invalid amount'), 'Enter a valid amount.'); return; }
    if (!payoutForm.periodLabel.trim()) { notifyError(showToast, new Error('Period required'), 'Enter a period label.'); return; }
    setRecording(true);
    try {
      const res = await fetch('/api/admin/passbook-payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schemeId: selected.scheme_id,
          userId: selected.profile?.id,
          amount,
          periodLabel: payoutForm.periodLabel.trim(),
          notes: payoutForm.notes.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to record payout.');
      notifySuccess(showToast, 'Payout recorded.');
      setRows(prev => prev.map(r => r.scheme_id === selected.scheme_id
        ? { ...r, total_paid_out: r.total_paid_out + amount, amount_owed: Math.max(0, r.amount_owed - amount) }
        : r));
      setSelected(null);
      setPayoutForm({ amount: '', periodLabel: '', notes: '' });
    } catch (err) {
      notifyError(showToast, err, 'Could not record payout.');
    } finally {
      setRecording(false);
    }
  };

  const schedulePaged = usePagedSlice(filtered, `${freqFilter}|${showDueOnly}`);

  if (loading) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-brand-gray"><Loader2 size={16} className="animate-spin" /> Loading schedule...</div>;

  const totalOwed = filtered.reduce((s, r) => s + r.amount_owed, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="text-xs text-brand-gray">Total Owed (filtered)</p>
          <p className="text-xl font-bold text-rose-700">{toCurrency(totalOwed)}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="text-xs text-brand-gray">Active Schemes</p>
          <p className="text-xl font-bold text-brand-navy">{filtered.filter(r => r.status === 'active').length}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="text-xs text-brand-gray">Total Saved (filtered)</p>
          <p className="text-xl font-bold text-emerald-700">{toCurrency(filtered.reduce((s, r) => s + r.total_saved, 0))}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <select value={freqFilter} onChange={e => setFreqFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="all">All Frequencies</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={showDueOnly}
              onChange={(e) => setShowDueOnly(e.target.checked)}
            />
            Show only users with amount owed
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
        <div className="hidden sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <span>User / Scheme</span>
          <span>Frequency</span>
          <span>Total Saved</span>
          <span>Amount Owed</span>
          <span>Next Payout</span>
        </div>

        {filtered.length === 0 && <p className="p-8 text-center text-sm text-slate-400">No savings schemes found.</p>}

        {schedulePaged.pageItems.map((row, idx) => (
          <div
            key={row.scheme_id}
            onClick={() => { setSelected(row); setPayoutForm({ amount: String(row.amount_owed), periodLabel: '', notes: '' }); }}
            className={`grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors${idx < schedulePaged.pageItems.length - 1 ? ' border-b border-slate-100' : ''}`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-brand-navy">{row.profile?.name || row.profile?.email || 'User'}</p>
              <p className="text-xs text-slate-400 truncate">{row.scheme_name}</p>
            </div>
            <span className="hidden sm:block shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold capitalize text-slate-600">{row.frequency}</span>
            <p className="hidden sm:block shrink-0 text-sm font-semibold text-brand-navy">{toCurrency(row.total_saved)}</p>
            <p className={`hidden sm:block shrink-0 text-sm font-bold ${row.amount_owed > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{toCurrency(row.amount_owed)}</p>
            <p className="hidden sm:block shrink-0 text-xs text-brand-gray">{row.next_payout}</p>
          </div>
        ))}
        <Pagination
          page={schedulePaged.page}
          total={schedulePaged.total}
          onPageChange={schedulePaged.setPage}
          className="border-t border-slate-100 px-4 py-3"
        />
      </div>

      {/* Record payout drawer */}
      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px]" onClick={() => setSelected(null)} />
          <div className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="font-bold text-brand-navy">Record Payout</p>
                <p className="text-xs text-slate-400">{selected.profile?.name || selected.profile?.email} · {selected.scheme_name}</p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[11px] text-slate-400">Total Saved</p>
                  <p className="text-lg font-bold text-brand-navy">{toCurrency(selected.total_saved)}</p>
                </div>
                <div className="rounded-xl bg-rose-50 p-3">
                  <p className="text-[11px] text-rose-500">Amount Owed</p>
                  <p className="text-lg font-bold text-rose-700">{toCurrency(selected.amount_owed)}</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Bank Details</p>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 space-y-0.5">
                  <p className="text-xs text-brand-gray">{selected.profile?.bank_name || '—'}</p>
                  <p className="text-sm font-bold text-brand-navy font-mono">{selected.profile?.bank_account || '—'}</p>
                  <p className="text-xs text-brand-gray">{selected.profile?.bank_account_name || selected.profile?.name || '—'}</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Payout Details</p>
                <div>
                  <label className="text-xs font-semibold text-brand-navy mb-1 block">Amount (NGN)</label>
                  <input
                    type="number"
                    min={1}
                    value={payoutForm.amount}
                    onChange={e => setPayoutForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-brand-navy mb-1 block">Period Label (e.g. March 2026)</label>
                  <input
                    type="text"
                    value={payoutForm.periodLabel}
                    onChange={e => setPayoutForm(f => ({ ...f, periodLabel: e.target.value }))}
                    placeholder="March 2026"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-brand-navy mb-1 block">Notes (optional)</label>
                  <textarea
                    value={payoutForm.notes}
                    onChange={e => setPayoutForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm resize-none"
                  />
                </div>
              </div>
            </div>
            <div className="border-t border-slate-100 p-5">
              <button
                disabled={recording}
                onClick={handleRecord}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {recording ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                {recording ? 'Recording...' : 'Record Payout'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPayoutsPage() {
  const [activeTab, setActiveTab] = useState<'schedule' | 'history'>('schedule');
  const { lastEvent } = useRealtimeSubscription({
    channelName: 'admin-payouts-live',
    tables: ['passbook_payouts', 'profiles', 'savings_schemes'],
  });

  const lastSyncedAt = lastEvent?.timestamp ?? null;

  return (
    <div className="space-y-5">
      <LastSynced timestamp={lastSyncedAt} loading={false} />

      <div className="flex gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'schedule' ? 'bg-white text-brand-navy' : 'text-slate-400 hover:text-brand-navy'}`}
        >
          <Calendar size={11} /> Pending Withdrawals
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'history' ? 'bg-white text-brand-navy' : 'text-slate-400 hover:text-brand-navy'}`}
        >
          <CheckCircle2 size={11} /> Payment History
        </button>
      </div>

      {activeTab === 'schedule' && <SavingsScheduleTab />}
      {activeTab === 'history' && <PaymentHistoryTab />}
    </div>
  );
}
