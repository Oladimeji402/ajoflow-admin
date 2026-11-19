'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { notifyError, notifySuccess } from '@/lib/toast';
import { buildReferralSignupUrl } from '@/lib/referrals/referral-code';
import { AdminActionModal } from '@/components/admin/AdminActionModal';
import { Modal } from '@/components/ui/Modal';
import { Pagination, usePagedSlice } from '@/components/admin/Pagination';

type MarketerStatus = 'pending' | 'active' | 'rejected' | 'inactive';

type Marketer = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  referral_code: string;
  status: MarketerStatus;
  notes?: string | null;
  user_id?: string | null;
  passport_path?: string | null;
  passport_url?: string | null;
  referral_count: number;
  attributed_count?: number;
  pending_count?: number;
  total_users?: number;
  created_at: string;
};

type WithdrawalRow = {
  id: string;
  marketer_id: string;
  status: string;
  user_count: number;
  rate_per_user: number;
  amount: number;
  bank_name: string;
  bank_account_number: string;
  bank_account_name: string;
  notes?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  marketers?: { id: string; name: string; email?: string | null; referral_code: string } | null;
};

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  notes: '',
  referralCode: '',
  status: 'active' as MarketerStatus,
};

function getReferralLink(code: string) {
  const base =
    process.env.NEXT_PUBLIC_USER_APP_URL?.replace(/\/$/, '') ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://ajoflow.com');
  return buildReferralSignupUrl(base, code);
}

function statusClass(status: MarketerStatus) {
  const styles: Record<MarketerStatus, string> = {
    pending: 'bg-amber-50 text-amber-700',
    active: 'bg-emerald-50 text-emerald-700',
    rejected: 'bg-red-50 text-red-600',
    inactive: 'bg-slate-100 text-slate-500',
  };
  return styles[status];
}

function money(n: number) {
  return `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'MK';
}

export default function AdminMarketersPage() {
  const [marketers, setMarketers] = useState<Marketer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MarketerStatus>('all');
  const [commissionPerUser, setCommissionPerUser] = useState(250);
  const [withdrawalMinAmount, setWithdrawalMinAmount] = useState(5000);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [updatingWithdrawalId, setUpdatingWithdrawalId] = useState<string | null>(null);
  const [rejectWithdrawal, setRejectWithdrawal] = useState<WithdrawalRow | null>(null);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [marketersRes, settingsRes, withdrawalsRes] = await Promise.all([
        fetch('/api/admin/marketers', { cache: 'no-store' }),
        fetch('/api/admin/marketers/commission', { cache: 'no-store' }),
        fetch('/api/admin/marketers/withdrawals?status=all', { cache: 'no-store' }),
      ]);
      const [marketersJson, settingsJson, withdrawalsJson] = await Promise.all([
        marketersRes.json(),
        settingsRes.json(),
        withdrawalsRes.json(),
      ]);
      if (!marketersRes.ok) throw new Error(marketersJson.error);
      setMarketers(Array.isArray(marketersJson.data) ? marketersJson.data : []);
      if (settingsRes.ok) {
        setCommissionPerUser(Number(settingsJson.data?.commissionPerUser ?? 250));
        setWithdrawalMinAmount(Number(settingsJson.data?.withdrawalMinAmount ?? 5000));
      }
      if (withdrawalsRes.ok) {
        setWithdrawals(Array.isArray(withdrawalsJson.data) ? withdrawalsJson.data : []);
      }
    } catch (err) {
      notifyError(showToast, err, 'Failed to load marketers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const saveCommissionSettings = async (formData?: Record<string, string | number>) => {
    const nextCommission = Number(formData?.commissionPerUser);
    const nextMinAmount = Number(formData?.withdrawalMinAmount);
    if (!Number.isInteger(nextCommission) || nextCommission <= 0) {
      notifyError(showToast, new Error('Invalid commission'), 'Enter a valid credit amount per user.');
      return;
    }
    if (!Number.isInteger(nextMinAmount) || nextMinAmount <= 0) {
      notifyError(showToast, new Error('Invalid minimum'), 'Enter a valid minimum withdrawal amount.');
      return;
    }

    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin/marketers/commission', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commissionPerUser: nextCommission,
          withdrawalMinAmount: nextMinAmount,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save settings.');
      setCommissionPerUser(Number(json.data?.commissionPerUser ?? nextCommission));
      setWithdrawalMinAmount(Number(json.data?.withdrawalMinAmount ?? nextMinAmount));
      setSettingsModalOpen(false);
      notifySuccess(showToast, 'Commission settings updated.');
    } catch (err) {
      notifyError(showToast, err, 'Unable to update commission settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const updateWithdrawal = async (
    id: string,
    status: 'approved' | 'paid' | 'rejected',
    rejectionReason?: string,
  ) => {
    setUpdatingWithdrawalId(id);
    try {
      const res = await fetch('/api/admin/marketers/withdrawals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, rejectionReason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed.');
      notifySuccess(showToast, `Withdrawal marked as ${status}.`);
      setRejectWithdrawal(null);
      await load();
    } catch (err) {
      notifyError(showToast, err, 'Could not update withdrawal.');
    } finally {
      setUpdatingWithdrawalId(null);
    }
  };

  const openCreate = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (marketer: Marketer) => {
    setForm({
      name: marketer.name,
      email: marketer.email ?? '',
      phone: marketer.phone ?? '',
      notes: marketer.notes ?? '',
      referralCode: marketer.referral_code,
      status: marketer.status,
    });
    setEditingId(marketer.id);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingId ? `/api/admin/marketers/${editingId}` : '/api/admin/marketers';
      const method = editingId ? 'PATCH' : 'POST';
      const payload = editingId
        ? {
            name: form.name,
            email: form.email,
            phone: form.phone,
            notes: form.notes,
            status: form.status,
          }
        : { ...form, referralCode: form.referralCode || null };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      notifySuccess(showToast, editingId ? 'Marketer updated.' : 'Marketer created.');
      setFormOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      await load();
    } catch (err) {
      notifyError(showToast, err, 'Could not save marketer.');
    } finally {
      setSaving(false);
    }
  };

  const copyReferralLink = async (code: string) => {
    try {
      await navigator.clipboard.writeText(getReferralLink(code));
      notifySuccess(showToast, 'Referral link copied.');
    } catch {
      notifyError(showToast, null, 'Could not copy link.');
    }
  };

  const copyReferralCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      notifySuccess(showToast, 'Referral code copied.');
    } catch {
      notifyError(showToast, null, 'Could not copy code.');
    }
  };

  const filtered = useMemo(() => {
    return marketers.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const hay = [m.name, m.email ?? '', m.phone ?? '', m.referral_code].join(' ').toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  }, [marketers, statusFilter, search]);

  const paged = usePagedSlice(filtered, `${statusFilter}|${search}`);
  const pendingApps = marketers.filter((m) => m.status === 'pending').length;
  const activeCount = marketers.filter((m) => m.status === 'active').length;
  const totalReferrals = marketers.reduce(
    (sum, m) => sum + (m.attributed_count ?? m.referral_count ?? 0),
    0,
  );
  const openWithdrawals = withdrawals.filter((w) => w.status === 'pending' || w.status === 'approved');

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 animate-pulse">
        <div className="h-8 w-40 rounded bg-slate-200" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-100" />
          ))}
        </div>
        <div className="h-72 rounded-2xl bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-brand-primary" />
          <h1 className="text-lg font-bold text-brand-navy">Marketers</h1>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-navy px-3 py-2 text-xs font-bold text-white"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Total', value: marketers.length },
          { label: 'Active', value: activeCount },
          { label: 'Pending', value: pendingApps },
          { label: 'Attributed', value: totalReferrals },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-gray">{s.label}</p>
            <p className="text-lg font-bold text-brand-navy">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Commission</p>
          <p className="text-sm font-bold text-brand-navy">
            {money(commissionPerUser)}
            <span className="font-normal text-slate-500"> / user · min {money(withdrawalMinAmount)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-brand-navy hover:bg-slate-50"
        >
          <Pencil size={12} /> Edit
        </button>
      </div>

      {openWithdrawals.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
            <Wallet size={14} className="text-brand-navy" />
            <h2 className="text-sm font-bold text-brand-navy">Payouts needing action</h2>
            <span className="ml-auto text-xs text-slate-400">{openWithdrawals.length}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {openWithdrawals.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand-navy">
                    {w.marketers?.name || '—'} · {money(Number(w.amount))}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {w.bank_name} · {w.bank_account_number} ·{' '}
                    <span className="capitalize">{w.status}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {w.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        disabled={updatingWithdrawalId === w.id}
                        onClick={() => void updateWithdrawal(w.id, 'approved')}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={updatingWithdrawalId === w.id}
                        onClick={() => setRejectWithdrawal(w)}
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-bold text-red-600 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {w.status === 'approved' && (
                    <button
                      type="button"
                      disabled={updatingWithdrawalId === w.id}
                      onClick={() => void updateWithdrawal(w.id, 'paid')}
                      className="rounded-lg bg-brand-navy px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                    >
                      Mark paid
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, code"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | MarketerStatus)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="all">All status</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="rejected">Rejected</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">No marketers found.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {paged.pageItems.map((marketer) => {
              const users = marketer.total_users ?? marketer.referral_count;
              return (
                <li key={marketer.id} className="flex items-center gap-3 px-3 py-3 hover:bg-slate-50/80">
                  <Link href={`/admin/marketers/${marketer.id}`} className="shrink-0">
                    {marketer.passport_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={marketer.passport_url}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover border border-slate-200"
                      />
                    ) : (
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-primary text-[11px] font-bold text-white">
                        {initials(marketer.name)}
                      </span>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/admin/marketers/${marketer.id}`}
                        className="truncate text-sm font-bold text-brand-navy hover:underline"
                      >
                        {marketer.name}
                      </Link>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold capitalize ${statusClass(marketer.status)}`}
                      >
                        {marketer.status}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {[marketer.email, marketer.phone].filter(Boolean).join(' · ') || 'No contact'}
                      {marketer.user_id ? ' · Portal' : ''}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void copyReferralCode(marketer.referral_code)}
                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-brand-navy"
                      >
                        {marketer.referral_code}
                        <Copy size={10} />
                      </button>
                      <span className="text-[11px] text-slate-400">{users} users</span>
                      {marketer.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => void copyReferralLink(marketer.referral_code)}
                          className="text-[11px] font-semibold text-brand-primary"
                        >
                          Copy link
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(marketer)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-brand-navy"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                  <Link
                    href={`/admin/marketers/${marketer.id}`}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-brand-navy hover:bg-brand-light"
                    aria-label={`Open ${marketer.name}`}
                  >
                    <ChevronRight size={16} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination
          page={paged.page}
          total={paged.total}
          onPageChange={paged.setPage}
          className="border-t border-slate-100 bg-slate-50/80 px-3 py-2"
        />
      </div>

      {/* Add / Edit marketer modal */}
      <Modal
        isOpen={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        title={editingId ? 'Edit marketer' : 'Add marketer'}
        subtitle={editingId ? 'Update profile details.' : 'Create an admin-managed marketer account.'}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Name</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Email (optional)</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Phone (optional)</span>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="08012345678"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          {!editingId && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Referral code (optional)
              </span>
              <input
                value={form.referralCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, referralCode: e.target.value.toUpperCase() }))
                }
                placeholder="Auto-generate if blank"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
              />
            </label>
          )}
          {editingId && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Status</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as MarketerStatus }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Notes (internal)</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => setFormOpen(false)}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-navy py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving…
                </>
              ) : editingId ? (
                'Update'
              ) : (
                'Create'
              )}
            </button>
          </div>
        </form>
      </Modal>

      <AdminActionModal
        isOpen={settingsModalOpen}
        onClose={() => !savingSettings && setSettingsModalOpen(false)}
        onConfirm={saveCommissionSettings}
        title="Update commission settings"
        description="Credit is earned only after a referred user activates their passbook. Minimum withdrawal is required before payout requests."
        confirmLabel="Save settings"
        severity="warning"
        isLoading={savingSettings}
        showAuditNote
        requiresInput={[
          {
            name: 'commissionPerUser',
            label: 'Credit per qualified user (NGN)',
            type: 'number',
            required: true,
            defaultValue: commissionPerUser,
            placeholder: '250',
          },
          {
            name: 'withdrawalMinAmount',
            label: 'Minimum withdrawal amount (NGN)',
            type: 'number',
            required: true,
            defaultValue: withdrawalMinAmount,
            placeholder: '5000',
          },
        ]}
      />

      <AdminActionModal
        isOpen={!!rejectWithdrawal}
        onClose={() => setRejectWithdrawal(null)}
        onConfirm={async (formData) => {
          if (!rejectWithdrawal) return;
          const reason = String(formData?.reason || '').trim();
          if (!reason) {
            notifyError(showToast, new Error('Reason required'), 'Enter a rejection reason.');
            return;
          }
          await updateWithdrawal(rejectWithdrawal.id, 'rejected', reason);
        }}
        title="Reject withdrawal?"
        description={`Reject payout for ${rejectWithdrawal?.marketers?.name || 'this marketer'} (${money(Number(rejectWithdrawal?.amount || 0))}).`}
        confirmLabel="Reject"
        severity="danger"
        isLoading={updatingWithdrawalId === rejectWithdrawal?.id}
        requiresInput={[
          {
            name: 'reason',
            label: 'Rejection reason',
            type: 'textarea',
            required: true,
            placeholder: 'Why is this being rejected?',
            rows: 3,
          },
        ]}
      />
    </div>
  );
}
