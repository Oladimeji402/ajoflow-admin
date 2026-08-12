'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Link2, Loader2, Plus, Users, Pencil, Wallet } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { notifyError, notifySuccess } from '@/lib/toast';
import { buildReferralSignupUrl } from '@/lib/referrals/referral-code';
import { AdminActionModal } from '@/components/admin/AdminActionModal';

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

function statusBadge(status: MarketerStatus) {
    const styles: Record<MarketerStatus, string> = {
        pending: 'bg-amber-50 text-amber-700 border-amber-200',
        active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        rejected: 'bg-red-50 text-red-700 border-red-100',
        inactive: 'bg-slate-100 text-slate-500 border-slate-200',
    };
    return styles[status];
}

function fmtNgn(n: number) {
    return `NGN ${Number(n).toLocaleString('en-NG')}`;
}

export default function AdminMarketersPage() {
    const [marketers, setMarketers] = useState<Marketer[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ ...emptyForm });
    const [statusFilter, setStatusFilter] = useState<'all' | MarketerStatus>('all');
    const [commissionPerUser, setCommissionPerUser] = useState(250);
    const [withdrawalMinAmount, setWithdrawalMinAmount] = useState(5000);
    const [settingsModalOpen, setSettingsModalOpen] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
    const [updatingWithdrawalId, setUpdatingWithdrawalId] = useState<string | null>(null);
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

    const updateWithdrawal = async (id: string, status: 'approved' | 'paid' | 'rejected') => {
        let rejectionReason: string | undefined;
        if (status === 'rejected') {
            const reason = window.prompt('Rejection reason');
            if (!reason?.trim()) return;
            rejectionReason = reason.trim();
        }

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
            await load();
        } catch (err) {
            notifyError(showToast, err, 'Could not update withdrawal.');
        } finally {
            setUpdatingWithdrawalId(null);
        }
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const url = editingId ? `/api/admin/marketers/${editingId}` : '/api/admin/marketers';
            const method = editingId ? 'PATCH' : 'POST';
            const payload = editingId
                ? { name: form.name, email: form.email, phone: form.phone, notes: form.notes, status: form.status }
                : { ...form, referralCode: form.referralCode || null };

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);

            notifySuccess(showToast, editingId ? 'Marketer updated.' : 'Marketer created.');
            setShowForm(false);
            setEditingId(null);
            setForm({ ...emptyForm });
            await load();
        } catch (err) {
            notifyError(showToast, err, 'Could not save marketer.');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (marketer: Marketer) => {
        setForm({
            name: marketer.name,
            email: marketer.email ?? '',
            phone: marketer.phone ?? '',
            notes: marketer.notes ?? '',
            referralCode: marketer.referral_code,
            status: marketer.status,
        });
        setEditingId(marketer.id);
        setShowForm(true);
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

    const filtered = statusFilter === 'all'
        ? marketers
        : marketers.filter((m) => m.status === statusFilter);

    const pendingApps = marketers.filter((m) => m.status === 'pending').length;
    const activeCount = marketers.filter((m) => m.status === 'active').length;
    const totalReferrals = marketers.reduce((sum, m) => sum + (m.attributed_count ?? m.referral_count ?? 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs text-slate-400">
                    {marketers.length} marketers · {pendingApps} pending review · {activeCount} active · {totalReferrals} attributed
                </p>
                <button
                    onClick={() => {
                        setForm({ ...emptyForm });
                        setEditingId(null);
                        setShowForm(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy/90 transition-colors"
                >
                    <Plus size={13} /> Add Marketer
                </button>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray">Commission settings</p>
                    <p className="mt-1 text-lg font-bold text-brand-navy">
                        {fmtNgn(commissionPerUser)}
                        <span className="text-sm font-semibold text-brand-gray"> credit / qualified user</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                        Minimum withdrawal {fmtNgn(withdrawalMinAmount)}. Marketers unlock payout once available earnings reach this amount.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setSettingsModalOpen(true)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-brand-navy transition hover:bg-slate-100"
                >
                    <Pencil size={14} /> Update settings
                </button>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <Wallet size={16} className="text-brand-navy" />
                    <h2 className="text-sm font-bold text-brand-navy">Withdrawal requests</h2>
                </div>
                {withdrawals.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-brand-gray">No withdrawal requests yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold text-brand-gray">
                                    <th className="px-4 py-3">Marketer</th>
                                    <th className="px-4 py-3">Amount</th>
                                    <th className="px-4 py-3">Bank</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Requested</th>
                                    <th className="px-4 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {withdrawals.map((w) => (
                                    <tr key={w.id} className="border-b border-slate-50 last:border-0">
                                        <td className="px-4 py-3">
                                            <p className="font-semibold text-brand-navy">{w.marketers?.name || '—'}</p>
                                            <p className="text-xs text-brand-gray font-mono">{w.marketers?.referral_code}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-semibold text-brand-navy">{fmtNgn(Number(w.amount))}</p>
                                            <p className="text-xs text-brand-gray">
                                                {w.user_count} × {fmtNgn(Number(w.rate_per_user))}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            <p className="font-semibold text-brand-navy">{w.bank_name}</p>
                                            <p className="text-brand-gray font-mono">{w.bank_account_number}</p>
                                            <p className="text-brand-gray">{w.bank_account_name}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex rounded-lg bg-slate-50 border border-slate-100 px-2 py-1 text-[11px] font-semibold capitalize text-slate-600">
                                                {w.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-brand-gray">
                                            {new Date(w.created_at).toLocaleString('en-NG')}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1.5">
                                                {w.status === 'pending' && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            disabled={updatingWithdrawalId === w.id}
                                                            onClick={() => void updateWithdrawal(w.id, 'approved')}
                                                            className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={updatingWithdrawalId === w.id}
                                                            onClick={() => void updateWithdrawal(w.id, 'rejected')}
                                                            className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 disabled:opacity-50"
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
                                                        className="rounded-lg bg-brand-navy px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                                                    >
                                                        Mark paid
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {(['all', 'pending', 'active', 'rejected', 'inactive'] as const).map((status) => (
                    <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`rounded-xl border p-4 text-left transition-colors ${statusFilter === status ? 'border-brand-primary bg-brand-primary/5' : 'border-slate-100 bg-white hover:bg-slate-50'}`}
                    >
                        <p className="text-xs text-brand-gray capitalize">{status === 'all' ? 'All' : status}</p>
                        <p className="text-xl font-bold text-brand-navy mt-0.5">
                            {status === 'all' ? marketers.length : marketers.filter((m) => m.status === status).length}
                        </p>
                    </button>
                ))}
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold text-brand-navy flex items-center gap-2">
                            <Link2 size={16} />
                            {editingId ? 'Edit Marketer' : 'New Marketer'}
                        </h2>
                        <button type="button" onClick={() => setShowForm(false)} className="text-xs text-brand-gray hover:text-brand-navy">
                            Cancel
                        </button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        <div>
                            <label className="block text-xs font-semibold text-brand-gray mb-1">Name</label>
                            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" required />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-brand-gray mb-1">Email (optional)</label>
                            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-brand-gray mb-1">Phone (optional)</label>
                            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="08012345678" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                        </div>
                        {!editingId && (
                            <div>
                                <label className="block text-xs font-semibold text-brand-gray mb-1">Referral code (optional)</label>
                                <input
                                    value={form.referralCode}
                                    onChange={(e) => setForm((f) => ({ ...f, referralCode: e.target.value.toUpperCase() }))}
                                    placeholder="Leave blank to auto-generate"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono"
                                />
                            </div>
                        )}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-brand-gray mb-1">Notes (internal)</label>
                            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm resize-none" />
                        </div>
                    </div>

                    <button disabled={saving} className="rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-primary-hover disabled:opacity-60 inline-flex items-center gap-2">
                        {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : editingId ? 'Update Marketer' : 'Create Marketer'}
                    </button>
                </form>
            )}

            {loading ? (
                <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-sm text-brand-gray">
                    <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                    Loading marketers...
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-sm text-brand-gray">
                    No marketers in this filter.
                </div>
            ) : (
                <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold text-brand-gray">
                                    <th className="px-4 py-3">Photo</th>
                                    <th className="px-4 py-3">Marketer</th>
                                    <th className="px-4 py-3">Referral Code</th>
                                    <th className="px-4 py-3">Users</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((marketer) => (
                                    <tr key={marketer.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                        <td className="px-4 py-3">
                                            <Link href={`/admin/marketers/${marketer.id}`} className="block">
                                                {marketer.passport_url ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={marketer.passport_url}
                                                        alt={`${marketer.name} passport`}
                                                        className="h-11 w-11 rounded-lg object-cover border border-slate-200 bg-slate-50"
                                                    />
                                                ) : (
                                                    <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-[11px] font-bold text-slate-400">
                                                        {(marketer.name.trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2) || 'MK').toUpperCase()}
                                                    </div>
                                                )}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link href={`/admin/marketers/${marketer.id}`} className="font-semibold text-brand-navy hover:underline">
                                                {marketer.name}
                                            </Link>
                                            <p className="text-xs text-brand-gray mt-0.5">
                                                {[marketer.email, marketer.phone].filter(Boolean).join(' · ') || 'No contact info'}
                                                {marketer.user_id ? ' · Portal account' : ''}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                type="button"
                                                onClick={() => void copyReferralCode(marketer.referral_code)}
                                                title="Copy referral code"
                                                className="inline-flex items-center gap-1.5 rounded bg-slate-100 px-2 py-1 text-xs font-mono text-brand-navy hover:bg-slate-200 transition-colors"
                                            >
                                                {marketer.referral_code}
                                                <Copy size={11} className="text-brand-gray shrink-0" />
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link href={`/admin/marketers/${marketer.id}`} className="inline-flex flex-col gap-0.5 text-brand-navy font-semibold hover:underline">
                                                <span className="inline-flex items-center gap-1">
                                                    <Users size={13} />
                                                    {marketer.total_users ?? marketer.referral_count}
                                                </span>
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border ${statusBadge(marketer.status)}`}>
                                                {marketer.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Link
                                                    href={`/admin/marketers/${marketer.id}`}
                                                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-brand-navy hover:bg-slate-50"
                                                >
                                                    Review
                                                </Link>
                                                {marketer.status === 'active' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void copyReferralLink(marketer.referral_code)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-brand-navy hover:bg-slate-50"
                                                    >
                                                        <Copy size={12} /> Copy link
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handleEdit(marketer)}
                                                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-brand-gray hover:bg-slate-50"
                                                >
                                                    Edit
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <AdminActionModal
                isOpen={settingsModalOpen}
                onClose={() => !savingSettings && setSettingsModalOpen(false)}
                onConfirm={saveCommissionSettings}
                title="Update marketer commission settings"
                description="Credit is earned only after a referred user activates their passbook. Minimum withdrawal is the available earnings needed before a marketer can request payout."
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
        </div>
    );
}
