'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  Banknote,
  Landmark,
  Shield,
  UserCog,
  Wallet,
  Copy,
  Check,
  Plus,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { notifyError, notifySuccess } from '@/lib/toast';
import { useRefreshOnFocus } from '@/lib/hooks/useRefreshOnFocus';
import { UserAccountActions } from '@/components/admin/UserAccountActions';
import { UserNotesAndFlagsSection } from '@/components/admin/UserNotesAndFlagsSection';
import { FlagType } from '@/components/admin/UserFlagBadge';
import { AdminActionModal } from '@/components/admin/AdminActionModal';
import { Modal } from '@/components/ui/Modal';

type TabId = 'overview' | 'money' | 'risk';

type UserDetail = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  bank_account_name?: string | null;
  virtual_account_number?: string | null;
  virtual_account_bank?: string | null;
  virtual_account_name?: string | null;
  role: string;
  status: string;
  kyc_level: number;
  wallet_balance: number;
  total_contributed: number;
  total_received: number;
  created_at?: string;
  updated_at?: string;
  account_locked?: boolean;
  suspension_reason?: string | null;
  suspended_at?: string | null;
  marketer_id?: string | null;
  referral_code_used?: string | null;
  marketer?: {
    id: string;
    name: string;
    referral_code: string;
    status: string;
  } | null;
};

type UserActivity = {
  id: string;
  type: string;
  status: string;
  title: string;
  description: string;
  amount: number | null;
  occurredAt: string;
};

type SavingsPlan = {
  id: string;
  planType: 'target' | 'general';
  name: string;
  frequency: string;
  status: string;
  targetAmount?: number;
  minimumAmount?: number;
  totalSaved: number;
  successfulCount: number;
  missedCount: number;
  skippedCount: number;
  pendingCount: number;
};

function money(n: number) {
  return `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'U';
}

function UserDetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 animate-pulse">
      <div className="h-4 w-24 rounded bg-slate-200" />
      <div className="h-28 rounded-2xl bg-slate-100" />
      <div className="h-10 rounded-xl bg-slate-100" />
      <div className="h-64 rounded-2xl bg-slate-100" />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-brand-navy">{value}</span>
    </div>
  );
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<UserDetail | null>(null);
  const [savingsPlans, setSavingsPlans] = useState<SavingsPlan[]>([]);
  const [recentActivity, setRecentActivity] = useState<UserActivity[]>([]);
  const [activeFlags, setActiveFlags] = useState<
    Array<{ id: string; flagType: FlagType; flagLabel?: string }>
  >([]);
  const [currentAdminId, setCurrentAdminId] = useState('');
  const [tab, setTab] = useState<TabId>('overview');
  const [confirmAction, setConfirmAction] = useState<{
    type: 'role' | 'status';
    nextValue: string;
  } | null>(null);
  const [vaModal, setVaModal] = useState<'provision' | 'clear' | null>(null);
  const [vaForm, setVaForm] = useState({ accountNumber: '', bankName: '', accountName: '' });
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  const loadUser = useCallback(async () => {
    const res = await fetch(`/api/admin/users/${id}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load user.');
    setUser(json.data as UserDetail);
    setSavingsPlans(Array.isArray(json.savingsPlans) ? (json.savingsPlans as SavingsPlan[]) : []);
    setRecentActivity(
      Array.isArray(json.recentActivity) ? (json.recentActivity as UserActivity[]) : [],
    );

    try {
      const flagsRes = await fetch(`/api/admin/users/${id}/flags?active=true`, { cache: 'no-store' });
      const flagsJson = await flagsRes.json();
      if (flagsRes.ok && flagsJson.data?.activeFlags) {
        setActiveFlags(flagsJson.data.activeFlags);
      }
    } catch (err) {
      console.error('Failed to load flags:', err);
    }
  }, [id]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        await loadUser();
        const { createBrowserClient } = await import('@supabase/ssr');
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (authUser?.id) setCurrentAdminId(authUser.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load user.');
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [id, loadUser]);

  useRefreshOnFocus(() => {
    void loadUser();
  });

  const patchUser = async (updates: Record<string, unknown>) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update user.');
      notifySuccess(showToast, 'User updated successfully.');
      await loadUser();
    } catch (err) {
      notifyError(showToast, err, 'Unable to update user.');
    } finally {
      setSaving(false);
    }
  };

  const executeConfirmedAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'role') {
      await patchUser({ role: confirmAction.nextValue });
    } else {
      await patchUser({ status: confirmAction.nextValue });
    }
    setConfirmAction(null);
  };

  const provisionVa = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${id}/manual-provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vaForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to provision');
      notifySuccess(showToast, 'Virtual account provisioned.');
      setVaModal(null);
      setVaForm({ accountNumber: '', bankName: '', accountName: '' });
      await loadUser();
    } catch (err) {
      notifyError(showToast, err, 'Failed to provision account');
    } finally {
      setSaving(false);
    }
  };

  const clearVa = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${id}/clear-virtual-account`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to clear virtual account');
      notifySuccess(showToast, 'Virtual account cleared.');
      setVaModal(null);
      await loadUser();
    } catch (err) {
      notifyError(showToast, err, 'Failed to clear virtual account');
    } finally {
      setSaving(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notifyError(showToast, new Error('Copy failed'), 'Could not copy.');
    }
  };

  if (loading) return <UserDetailSkeleton />;
  if (!user) return <div className="text-sm text-red-600">User not found.</div>;

  const displayName = user.name || user.email;
  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'money', label: 'Money' },
    { id: 'risk', label: 'Risk' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-gray hover:text-brand-navy"
      >
        <ArrowLeft size={14} /> Users
      </Link>

      {/* Compact header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-primary text-sm font-bold text-white">
            {initials(displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="truncate text-lg font-bold text-brand-navy">{displayName}</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  user.status === 'active'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                {user.status}
              </span>
              {user.account_locked && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                  Locked
                </span>
              )}
              {user.role === 'admin' && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                  Admin
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {user.email}
              {user.phone ? ` · ${user.phone}` : ''}
            </p>
            {user.status === 'suspended' && user.suspension_reason && (
              <p className="mt-1 text-xs text-red-600">{user.suspension_reason}</p>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: 'Wallet', value: money(user.wallet_balance) },
            { label: 'Saved', value: money(user.total_contributed) },
            { label: 'Received', value: money(user.total_received) },
          ].map((m) => (
            <div key={m.label} className="rounded-xl bg-slate-50 px-2.5 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {m.label}
              </p>
              <p className="truncate text-sm font-bold text-brand-navy">{m.value}</p>
            </div>
          ))}
        </div>

        {/* Icon quick actions */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              setConfirmAction({
                type: 'role',
                nextValue: user.role === 'admin' ? 'user' : 'admin',
              })
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-brand-navy hover:bg-slate-50 disabled:opacity-50"
            title={user.role === 'admin' ? 'Make user' : 'Make admin'}
          >
            <UserCog size={14} />
            {user.role === 'admin' ? 'Make user' : 'Make admin'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              setConfirmAction({
                type: 'status',
                nextValue: user.status === 'active' ? 'suspended' : 'active',
              })
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-brand-navy hover:bg-slate-50 disabled:opacity-50"
          >
            <Shield size={14} />
            {user.status === 'active' ? 'Suspend' : 'Activate'}
          </button>
          <button
            type="button"
            onClick={() => setTab('money')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-brand-navy hover:bg-slate-50"
          >
            <Wallet size={14} /> Wallet tools
          </button>
          <button
            type="button"
            onClick={() => setTab('risk')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-brand-navy hover:bg-slate-50"
          >
            <Shield size={14} /> Security
          </button>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${
              tab === t.id
                ? 'bg-white text-brand-navy shadow-sm'
                : 'text-slate-500 hover:text-brand-navy'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2">
            <InfoRow label="Role" value={<span className="capitalize">{user.role}</span>} />
            <InfoRow label="KYC" value={`Level ${user.kyc_level}`} />
            <InfoRow
              label="Joined"
              value={user.created_at ? new Date(user.created_at).toLocaleDateString('en-NG') : 'N/A'}
            />
            <InfoRow
              label="Updated"
              value={user.updated_at ? new Date(user.updated_at).toLocaleDateString('en-NG') : 'N/A'}
            />
            {user.marketer ? (
              <InfoRow
                label="Marketer"
                value={
                  <Link
                    href={`/admin/marketers/${user.marketer.id}`}
                    className="text-brand-primary hover:underline"
                  >
                    {user.marketer.name} · {user.marketer.referral_code}
                  </Link>
                }
              />
            ) : user.referral_code_used ? (
              <InfoRow
                label="Referral"
                value={
                  <span>
                    {user.referral_code_used}{' '}
                    <span className="font-normal text-amber-600">(pending passbook)</span>
                  </span>
                }
              />
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-navy">
                <Activity size={14} className="text-emerald-600" /> Recent activity
              </h2>
              {recentActivity.length > 3 && (
                <Link
                  href={`/admin/users/${id}/activity`}
                  className="text-xs font-semibold text-brand-primary"
                >
                  All ({recentActivity.length})
                </Link>
              )}
            </div>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-slate-400">No recent activity.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentActivity.slice(0, 4).map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand-navy">{item.title}</p>
                      <p className="text-[11px] text-slate-400">
                        {new Date(item.occurredAt).toLocaleString('en-NG')} · {item.status}
                      </p>
                    </div>
                    {item.amount !== null && (
                      <span className="shrink-0 text-xs font-bold text-emerald-700">
                        {money(item.amount)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'money' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-navy">
                <Banknote size={14} className="text-emerald-600" /> Virtual account
              </h2>
              {!user.virtual_account_number ? (
                <button
                  type="button"
                  onClick={() => setVaModal('provision')}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-navy px-2.5 py-1.5 text-[11px] font-bold text-white"
                >
                  <Plus size={12} /> Provision
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setVaModal('clear')}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-bold text-red-600"
                >
                  <Trash2 size={12} /> Clear
                </button>
              )}
            </div>
            {user.virtual_account_number ? (
              <div>
                <InfoRow label="Bank" value={user.virtual_account_bank || '—'} />
                <InfoRow
                  label="Number"
                  value={
                    <button
                      type="button"
                      onClick={() => void copyText(user.virtual_account_number!)}
                      className="inline-flex items-center gap-1 hover:text-brand-primary"
                    >
                      {user.virtual_account_number}
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  }
                />
                <InfoRow label="Name" value={user.virtual_account_name || '—'} />
              </div>
            ) : (
              <p className="text-sm text-slate-400">Not provisioned yet.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-brand-navy">
              <Landmark size={14} className="text-indigo-600" /> Payout bank
            </h2>
            <InfoRow label="Bank" value={user.bank_name || 'Not set'} />
            <InfoRow label="Account" value={user.bank_account || 'Not set'} />
            <InfoRow label="Name" value={user.bank_account_name || 'Not set'} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-brand-navy">Savings plans</h2>
              <span className="text-xs text-slate-400">{savingsPlans.length}</span>
            </div>
            {savingsPlans.length === 0 ? (
              <p className="text-sm text-slate-400">No plans.</p>
            ) : (
              <ul className="space-y-2">
                {savingsPlans.map((plan) => (
                  <li
                    key={plan.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-brand-navy">{plan.name}</p>
                        <p className="text-[11px] capitalize text-slate-500">
                          {plan.planType} · {plan.frequency} · {plan.status}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-brand-navy">
                        {money(plan.totalSaved)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                      <span className="rounded-md bg-white px-1.5 py-0.5 text-slate-600">
                        Paid {plan.successfulCount}
                      </span>
                      <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-700">
                        Missed {plan.missedCount}
                      </span>
                      <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-blue-700">
                        Pending {plan.pendingCount}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-center text-xs text-slate-400">
            Credit/debit wallet and security tools are under{' '}
            <button
              type="button"
              onClick={() => setTab('risk')}
              className="font-semibold text-brand-primary hover:underline"
            >
              Risk
            </button>
            .
          </p>
        </div>
      )}

      {tab === 'risk' && (
        <div className="space-y-3">
          <UserAccountActions
            userId={user.id}
            userName={user.name}
            userStatus={user.status as 'active' | 'suspended'}
            userEmail={user.email}
            walletBalance={Number(user.wallet_balance)}
            isAccountLocked={user.account_locked || false}
            activeFlags={activeFlags}
            onActionComplete={loadUser}
          />
          {currentAdminId && (
            <UserNotesAndFlagsSection userId={user.id} currentAdminId={currentAdminId} />
          )}
        </div>
      )}

      {/* Role / status confirm */}
      <AdminActionModal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          await executeConfirmedAction();
        }}
        title={
          confirmAction?.type === 'role'
            ? `Change role to ${confirmAction.nextValue}?`
            : `Change status to ${confirmAction?.nextValue}?`
        }
        description="This admin action is recorded in the audit log and applied immediately."
        confirmLabel="Confirm"
        severity={confirmAction?.type === 'status' && confirmAction.nextValue === 'suspended' ? 'danger' : 'warning'}
        icon={confirmAction?.type === 'role' ? UserCog : Shield}
        isLoading={saving}
      />

      {/* VA provision modal */}
      <Modal
        isOpen={vaModal === 'provision'}
        onClose={() => setVaModal(null)}
        title="Provision virtual account"
        subtitle="Enter bank details manually (bypasses Monicredit)."
        size="sm"
      >
        <div className="space-y-3">
          {(
            [
              ['accountNumber', 'Account number'],
              ['bankName', 'Bank name'],
              ['accountName', 'Account name'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
              <input
                value={vaForm[key]}
                onChange={(e) => setVaForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          ))}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setVaModal(null)}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                saving ||
                !vaForm.accountNumber.trim() ||
                !vaForm.bankName.trim() ||
                !vaForm.accountName.trim()
              }
              onClick={() => void provisionVa()}
              className="flex-1 rounded-xl bg-brand-navy py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Provision'}
            </button>
          </div>
        </div>
      </Modal>

      <AdminActionModal
        isOpen={vaModal === 'clear'}
        onClose={() => setVaModal(null)}
        onConfirm={async () => {
          await clearVa();
        }}
        title="Clear virtual account?"
        description="User will need to re-provision before they can fund via transfer again."
        confirmLabel="Clear account"
        severity="danger"
        icon={Trash2}
        isLoading={saving}
      />
    </div>
  );
}
