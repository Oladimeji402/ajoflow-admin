'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
  Users,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { notifyError, notifySuccess } from '@/lib/toast';
import { buildReferralSignupUrl } from '@/lib/referrals/referral-code';
import { AdminActionModal } from '@/components/admin/AdminActionModal';
import { Pagination, ADMIN_PAGE_SIZE } from '@/components/admin/Pagination';
import { Modal } from '@/components/ui/Modal';

type TabId = 'overview' | 'referrals' | 'tasks';

type MarketerDetail = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  referral_code: string;
  status: 'pending' | 'active' | 'rejected' | 'inactive';
  notes?: string | null;
  passport_path?: string | null;
  rejection_reason?: string | null;
  user_id?: string | null;
  referral_count: number;
  created_at: string;
};

type ReferralRow = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: string;
  referral_code_used?: string | null;
  passbook_activated?: boolean;
  created_at: string;
  attribution_status: 'attributed' | 'pending';
};

type TaskRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  frequency?: string;
  due_at?: string | null;
  ends_at?: string | null;
  created_at: string;
};

type TaskFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

type ReferralCounts = {
  attributed: number;
  pending: number;
  total: number;
};

function getReferralLink(code: string) {
  const base =
    process.env.NEXT_PUBLIC_USER_APP_URL?.replace(/\/$/, '') ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://ajoflow.com');
  return buildReferralSignupUrl(base, code);
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'MK';
}

function statusClass(status: string) {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700';
  if (status === 'pending') return 'bg-amber-50 text-amber-700';
  if (status === 'rejected') return 'bg-red-50 text-red-600';
  return 'bg-slate-100 text-slate-500';
}

export default function AdminMarketerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [loading, setLoading] = useState(true);
  const [marketer, setMarketer] = useState<MarketerDetail | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [counts, setCounts] = useState<ReferralCounts>({ attributed: 0, pending: 0, total: 0 });
  const [statusFilter, setStatusFilter] = useState<'all' | 'attributed' | 'pending'>('all');
  const [referralPage, setReferralPage] = useState(1);
  const [referralTotal, setReferralTotal] = useState(0);
  const [passportUrl, setPassportUrl] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [tab, setTab] = useState<TabId>('overview');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [cancelTaskId, setCancelTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskFrequency, setTaskFrequency] = useState<TaskFrequency>('once');
  const [taskEndsAt, setTaskEndsAt] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [marketerRes, referralsRes, tasksRes] = await Promise.all([
        fetch(`/api/admin/marketers/${id}`, { cache: 'no-store' }),
        fetch(`/api/admin/marketers/${id}/referrals?page=${referralPage}&pageSize=${ADMIN_PAGE_SIZE}&status=${statusFilter}`, {
          cache: 'no-store',
        }),
        fetch(`/api/admin/marketers/${id}/tasks`, { cache: 'no-store' }),
      ]);

      const [marketerJson, referralsJson, tasksJson] = await Promise.all([
        marketerRes.json(),
        referralsRes.json(),
        tasksRes.json(),
      ]);
      if (!marketerRes.ok) throw new Error(marketerJson.error || 'Failed to load marketer.');
      if (!referralsRes.ok) throw new Error(referralsJson.error || 'Failed to load referrals.');
      if (!tasksRes.ok) throw new Error(tasksJson.error || 'Failed to load tasks.');

      const m = marketerJson.data as MarketerDetail;
      setMarketer(m);
      setReferrals(Array.isArray(referralsJson.data) ? referralsJson.data : []);
      setReferralTotal(Number(referralsJson.pagination?.total ?? 0));
      setTasks(Array.isArray(tasksJson.data) ? tasksJson.data : []);
      setCounts({
        attributed: Number(referralsJson.counts?.attributed ?? 0),
        pending: Number(referralsJson.counts?.pending ?? 0),
        total: Number(referralsJson.counts?.total ?? 0),
      });

      if (m.passport_path) {
        const passRes = await fetch(`/api/admin/marketers/${id}/passport-url`, { cache: 'no-store' });
        const passJson = await passRes.json();
        if (passRes.ok) setPassportUrl(passJson.data?.url ?? null);
      } else {
        setPassportUrl(null);
      }
    } catch (err) {
      notifyError(showToast, err, 'Failed to load marketer details.');
    } finally {
      setLoading(false);
    }
  }, [id, showToast, statusFilter, referralPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyReferralLink = async () => {
    if (!marketer) return;
    try {
      await navigator.clipboard.writeText(getReferralLink(marketer.referral_code));
      notifySuccess(showToast, 'Referral link copied.');
    } catch {
      notifyError(showToast, null, 'Could not copy link.');
    }
  };

  const copyReferralCode = async () => {
    if (!marketer) return;
    try {
      await navigator.clipboard.writeText(marketer.referral_code);
      notifySuccess(showToast, 'Referral code copied.');
    } catch {
      notifyError(showToast, null, 'Could not copy code.');
    }
  };

  const review = async (action: 'approve' | 'reject', rejectionReason?: string) => {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/marketers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          rejectionReason: action === 'reject' ? rejectionReason || null : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      notifySuccess(showToast, action === 'approve' ? 'Marketer approved.' : 'Application rejected.');
      setApproveOpen(false);
      setRejectOpen(false);
      await load();
    } catch (err) {
      notifyError(showToast, err, 'Could not update application.');
    } finally {
      setActing(false);
    }
  };

  const cancelTask = async (taskId: string) => {
    setCancellingTaskId(taskId);
    try {
      const res = await fetch(`/api/admin/marketers/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Cancel failed.');
      notifySuccess(showToast, 'Task cancelled.');
      setCancelTaskId(null);
      await load();
    } catch (err) {
      notifyError(showToast, err, 'Could not cancel task.');
    } finally {
      setCancellingTaskId(null);
    }
  };

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTask(true);
    try {
      const res = await fetch(`/api/admin/marketers/${id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle,
          description: taskDescription,
          frequency: taskFrequency,
          endsAt:
            taskFrequency !== 'once' && taskEndsAt ? new Date(taskEndsAt).toISOString() : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      notifySuccess(showToast, 'Task assigned.');
      setTaskTitle('');
      setTaskDescription('');
      setTaskFrequency('once');
      setTaskEndsAt('');
      setTaskModalOpen(false);
      await load();
    } catch (err) {
      notifyError(showToast, err, 'Could not assign task.');
    } finally {
      setSavingTask(false);
    }
  };

  if (loading && !marketer) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 animate-pulse">
        <div className="h-4 w-28 rounded bg-slate-200" />
        <div className="h-28 rounded-2xl bg-slate-100" />
        <div className="h-64 rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (!marketer) {
    return <div className="text-sm text-red-600">Marketer not found.</div>;
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'referrals', label: 'Referrals' },
    { id: 'tasks', label: 'Tasks' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/admin/marketers"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-gray hover:text-brand-navy"
      >
        <ArrowLeft size={14} /> Marketers
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          {passportUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={passportUrl}
              alt=""
              className="h-12 w-12 rounded-full border border-slate-200 object-cover"
            />
          ) : (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-primary text-sm font-bold text-white">
              {initials(marketer.name)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="truncate text-lg font-bold text-brand-navy">{marketer.name}</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass(marketer.status)}`}
              >
                {marketer.status}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {[marketer.email, marketer.phone].filter(Boolean).join(' · ') || 'No contact'}
              {marketer.user_id ? ' · Portal login' : ' · Admin-created'}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: 'Users', value: counts.total },
            { label: 'Attributed', value: counts.attributed },
            { label: 'Pending', value: counts.pending },
          ].map((m) => (
            <div key={m.label} className="rounded-xl bg-slate-50 px-2.5 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {m.label}
              </p>
              <p className="text-sm font-bold text-brand-navy">{m.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyReferralCode()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-brand-navy"
          >
            <Copy size={12} /> {marketer.referral_code}
          </button>
          <button
            type="button"
            onClick={() => void copyReferralLink()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-brand-navy"
          >
            <Copy size={12} /> Copy link
          </button>
          {marketer.status === 'pending' && (
            <>
              <button
                type="button"
                onClick={() => setApproveOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
              >
                <CheckCircle2 size={12} /> Approve
              </button>
              <button
                type="button"
                onClick={() => setRejectOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600"
              >
                <XCircle size={12} /> Reject
              </button>
            </>
          )}
        </div>
      </div>

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
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2.5">
              <span className="text-xs text-slate-500">Joined</span>
              <span className="text-sm font-semibold text-brand-navy">
                {new Date(marketer.created_at).toLocaleDateString('en-NG')}
              </span>
            </div>
            {marketer.notes && (
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
                <span className="shrink-0 text-xs text-slate-500">Notes</span>
                <span className="text-right text-sm font-semibold text-brand-navy">{marketer.notes}</span>
              </div>
            )}
            {marketer.rejection_reason && (
              <div className="flex items-start justify-between gap-3 py-2.5">
                <span className="shrink-0 text-xs text-slate-500">Rejection</span>
                <span className="text-right text-sm font-semibold text-red-600">
                  {marketer.rejection_reason}
                </span>
              </div>
            )}
          </div>

          {passportUrl && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Passport
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={passportUrl}
                alt="Marketer passport"
                className="max-h-56 w-full rounded-xl border border-slate-100 object-contain bg-slate-50"
              />
            </div>
          )}
        </div>
      )}

      {tab === 'referrals' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-navy">
              <Users size={14} /> Users
            </h2>
            <div className="flex gap-1">
              {(['all', 'attributed', 'pending'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => {
                    setStatusFilter(filter);
                    setReferralPage(1);
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold capitalize ${
                    statusFilter === filter
                      ? 'bg-brand-navy text-white'
                      : 'border border-slate-200 text-slate-500'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {referrals.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No users for this filter.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {referrals.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/users/${row.id}`}
                      className="truncate text-sm font-semibold text-brand-navy hover:underline"
                    >
                      {row.name || row.email}
                    </Link>
                    <p className="truncate text-[11px] text-slate-400">
                      {row.email} · {new Date(row.created_at).toLocaleDateString('en-NG')}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      row.attribution_status === 'attributed'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {row.attribution_status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={referralPage}
            total={referralTotal}
            onPageChange={setReferralPage}
            className="mt-3 border-t border-slate-100 pt-3"
          />
        </div>
      )}

      {tab === 'tasks' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-brand-navy">Assigned tasks</h2>
            <button
              type="button"
              onClick={() => setTaskModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-navy px-3 py-2 text-xs font-bold text-white"
            >
              <Plus size={12} /> Assign
            </button>
          </div>

          {tasks.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
              No tasks yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {tasks.map((task) => (
                <li key={task.id} className="px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-brand-navy">{task.title}</p>
                      <p className="text-[11px] capitalize text-slate-400">
                        {(task.frequency ?? 'once')} · {task.status.replace('_', ' ')}
                      </p>
                      {task.description && (
                        <p className="mt-1 text-xs text-slate-500">{task.description}</p>
                      )}
                    </div>
                    {task.status !== 'cancelled' && task.status !== 'done' && (
                      <button
                        type="button"
                        onClick={() => setCancelTaskId(task.id)}
                        className="shrink-0 rounded-lg border border-red-200 px-2 py-1 text-[10px] font-bold uppercase text-red-600"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <AdminActionModal
        isOpen={approveOpen}
        onClose={() => setApproveOpen(false)}
        onConfirm={async () => {
          await review('approve');
        }}
        title="Approve marketer?"
        description={`${marketer.name} will become active and can earn referral credit.`}
        confirmLabel="Approve"
        severity="success"
        icon={CheckCircle2}
        isLoading={acting}
      />

      <AdminActionModal
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={async (formData) => {
          await review('reject', String(formData?.reason || '').trim() || undefined);
        }}
        title="Reject application?"
        description={`Reject ${marketer.name}'s marketer application.`}
        confirmLabel="Reject"
        severity="danger"
        icon={XCircle}
        isLoading={acting}
        requiresInput={[
          {
            name: 'reason',
            label: 'Rejection reason (optional)',
            type: 'textarea',
            required: false,
            placeholder: 'Optional note for the applicant…',
            rows: 3,
          },
        ]}
      />

      <AdminActionModal
        isOpen={!!cancelTaskId}
        onClose={() => setCancelTaskId(null)}
        onConfirm={async () => {
          if (cancelTaskId) await cancelTask(cancelTaskId);
        }}
        title="Cancel this task?"
        description="The marketer will no longer be able to update it."
        confirmLabel="Cancel task"
        severity="danger"
        isLoading={cancellingTaskId === cancelTaskId}
      />

      <Modal
        isOpen={taskModalOpen}
        onClose={() => !savingTask && setTaskModalOpen(false)}
        title="Assign task"
        subtitle="Give this marketer a one-off or recurring task."
        size="sm"
      >
        <form onSubmit={createTask} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Title</span>
            <input
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Description</span>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Frequency</span>
            <select
              value={taskFrequency}
              onChange={(e) => setTaskFrequency(e.target.value as TaskFrequency)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          {taskFrequency !== 'once' && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">End date</span>
              <input
                type="date"
                value={taskEndsAt}
                onChange={(e) => setTaskEndsAt(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={savingTask}
              onClick={() => setTaskModalOpen(false)}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingTask || !taskTitle.trim()}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-navy py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingTask ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving…
                </>
              ) : (
                'Assign'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
