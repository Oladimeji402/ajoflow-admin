'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { notifyError } from '@/lib/toast';

type FrequencyFilter = 'all' | 'daily' | 'weekly' | 'monthly';

type ProgressRow = {
  task_id: string;
  title: string;
  frequency: string;
  period_label: string;
  current_period_key: string | null;
  completed_this_period: boolean;
  pending_this_period: boolean;
  periods_completed: number;
  periods_expected: number;
  completion_rate: number;
  status: string;
  ends_at?: string | null;
  marketer: { id: string; name: string; referral_code: string; status: string } | null;
};

type AssignmentGroup = {
  title: string;
  frequency: string;
  total: number;
  done: number;
  pending: number;
  completion_rate: number;
  period_label: string;
};

type ProgressPayload = {
  summary: {
    recurring_tasks: number;
    completed_this_period: number;
    pending_this_period: number;
    completion_rate: number;
  };
  assignments: AssignmentGroup[];
  rows: ProgressRow[];
};

export default function AdminMarketerTaskProgressPage() {
  const [loading, setLoading] = useState(true);
  const [frequency, setFrequency] = useState<FrequencyFilter>('all');
  const [data, setData] = useState<ProgressPayload | null>(null);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = frequency === 'all' ? '' : `?frequency=${frequency}`;
      const res = await fetch(`/api/admin/marketers/tasks/progress${qs}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load progress.');
      setData(json.data as ProgressPayload);
    } catch (err) {
      notifyError(showToast, err, 'Failed to load task progress.');
    } finally {
      setLoading(false);
    }
  }, [frequency, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingRows = useMemo(
    () => (data?.rows ?? []).filter((r) => r.pending_this_period),
    [data],
  );

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-sm text-brand-gray">
        <Loader2 size={20} className="animate-spin mx-auto mb-2" />
        Loading progress...
      </div>
    );
  }

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">
            Track daily, weekly, and monthly marketer task completions for the current period (Africa/Lagos).
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(['all', 'daily', 'weekly', 'monthly'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold capitalize transition-colors ${
                frequency === f
                  ? 'bg-brand-navy text-white'
                  : 'border border-slate-200 text-brand-gray hover:bg-slate-50'
              }`}
            >
              {f === 'all' ? 'All recurring' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="text-xs text-brand-gray">Recurring assignments</p>
          <p className="text-2xl font-bold text-brand-navy mt-1">{summary?.recurring_tasks ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="text-xs text-brand-gray">Completed this period</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{summary?.completed_this_period ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="text-xs text-brand-gray">Pending this period</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{summary?.pending_this_period ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="text-xs text-brand-gray flex items-center gap-1">
            <BarChart3 size={12} /> Period completion
          </p>
          <p className="text-2xl font-bold text-brand-navy mt-1">{summary?.completion_rate ?? 0}%</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-4 space-y-3">
        <h2 className="font-semibold text-brand-navy">By assignment</h2>
        {(data?.assignments?.length ?? 0) === 0 ? (
          <p className="text-sm text-brand-gray">No recurring tasks match this filter.</p>
        ) : (
          <div className="space-y-2">
            {data!.assignments.map((a) => (
              <div
                key={`${a.title}-${a.frequency}`}
                className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-brand-navy">{a.title}</p>
                    <p className="text-xs text-brand-gray mt-0.5 capitalize">
                      {a.frequency} · {a.done}/{a.total} done {a.period_label}
                      {a.pending > 0 ? ` · ${a.pending} pending` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-brand-navy">{a.completion_rate}%</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(100, a.completion_rate)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-4 space-y-3">
        <h2 className="font-semibold text-brand-navy">Pending this period</h2>
        {pendingRows.length === 0 ? (
          <p className="text-sm text-brand-gray">Everyone is caught up for the current period.</p>
        ) : (
          <div className="space-y-2">
            {pendingRows.map((row) => (
              <div key={row.task_id} className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-brand-navy">{row.title}</p>
                    <p className="text-xs text-brand-gray mt-0.5">
                      {row.marketer ? (
                        <Link
                          href={`/admin/marketers/${row.marketer.id}`}
                          className="font-semibold text-brand-navy hover:underline"
                        >
                          {row.marketer.name}
                        </Link>
                      ) : (
                        'Marketer'
                      )}
                      {row.marketer?.referral_code ? ` · ${row.marketer.referral_code}` : ''}
                      {' · '}
                      <span className="capitalize">{row.frequency}</span>
                      {row.current_period_key ? ` · ${row.current_period_key}` : ''}
                    </p>
                  </div>
                  <span className="rounded-full border border-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                    Pending {row.period_label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-brand-navy">All recurring tasks</h2>
          {loading && <Loader2 size={14} className="animate-spin text-brand-gray" />}
        </div>
        {(data?.rows?.length ?? 0) === 0 ? (
          <p className="text-sm text-brand-gray">
            No recurring tasks yet.{' '}
            <Link href="/admin/marketers/assign-tasks" className="font-semibold text-brand-navy underline">
              Assign tasks
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-brand-gray">
                  <th className="py-2 pr-3 font-semibold">Marketer</th>
                  <th className="py-2 pr-3 font-semibold">Task</th>
                  <th className="py-2 pr-3 font-semibold">Cadence</th>
                  <th className="py-2 pr-3 font-semibold">This period</th>
                  <th className="py-2 pr-3 font-semibold">Overall</th>
                </tr>
              </thead>
              <tbody>
                {data!.rows.map((row) => (
                  <tr key={row.task_id} className="border-b border-slate-50">
                    <td className="py-2.5 pr-3">
                      {row.marketer ? (
                        <Link
                          href={`/admin/marketers/${row.marketer.id}`}
                          className="font-semibold text-brand-navy hover:underline"
                        >
                          {row.marketer.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-brand-navy">{row.title}</td>
                    <td className="py-2.5 pr-3 capitalize text-brand-gray">{row.frequency}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          row.completed_this_period
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                      >
                        {row.completed_this_period ? 'Done' : 'Pending'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-brand-gray">
                      {row.periods_completed}/{row.periods_expected} ({row.completion_rate}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
