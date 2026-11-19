'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, Users } from 'lucide-react';
import { Pagination, ADMIN_PAGE_SIZE } from '@/components/admin/Pagination';
import { LastSynced } from '@/components/admin/LastSynced';
import { useRealtimeSubscription } from '@/lib/hooks/useRealtimeSubscription';
import { useToast } from '@/components/ui/Toast';
import { notifyError, notifySuccess } from '@/lib/toast';
import { useRefreshOnFocus } from '@/lib/hooks/useRefreshOnFocus';

const USERS_REALTIME_TABLES = ['profiles'];

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  status: string;
  wallet_balance: number;
  total_contributed: number;
  created_at: string;
  virtual_account_number?: string | null;
};

const PAGE_SIZE = ADMIN_PAGE_SIZE;

function initials(value: string) {
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'U';
}

function money(n: number) {
  return `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ active: 0, suspended: 0, newThisMonth: 0 });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const { showToast } = useToast();
  const { refreshTrigger, lastEvent } = useRealtimeSubscription({
    channelName: 'admin-users-live',
    tables: USERS_REALTIME_TABLES,
  });

  useEffect(() => {
    if (lastEvent?.timestamp) setLastSyncedAt(lastEvent.timestamp);
  }, [lastEvent]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter, statusFilter]);

  const loadAll = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (roleFilter !== 'all') params.set('role', roleFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    const usersRes = await fetch(`/api/admin/users?${params.toString()}`, { cache: 'no-store' });
    const usersJson = await usersRes.json();
    if (!usersRes.ok) throw new Error(usersJson.error || 'Failed to load users.');
    setUsers(Array.isArray(usersJson.data) ? usersJson.data : []);
    setTotal(Number(usersJson.pagination?.total ?? 0));
    if (usersJson.stats) setStats(usersJson.stats);
    setLastSyncedAt(new Date().toISOString());
  }, [page, debouncedSearch, roleFilter, statusFilter]);

  useEffect(() => {
    const run = async () => {
      setError('');
      try {
        await loadAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load users.');
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [refreshTrigger, loadAll]);

  useRefreshOnFocus(() => {
    void loadAll();
  });

  const filteredUsers = users;
  const activeUsers = stats.active;
  const suspendedUsers = stats.suspended;
  const newUsersThisMonth = stats.newThisMonth;

  const allSelected =
    filteredUsers.length > 0 && filteredUsers.every((u) => selectedIds.includes(u.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredUsers.some((u) => u.id === id)));
      return;
    }
    setSelectedIds(Array.from(new Set([...selectedIds, ...filteredUsers.map((u) => u.id)])));
  };

  const runBulkAction = async (updates: Record<string, unknown>) => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    setError('');
    try {
      const results = await Promise.allSettled(
        selectedIds.map(async (id) => {
          const res = await fetch(`/api/admin/users/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Bulk update failed.');
        }),
      );
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failureCount = results.length - successCount;
      setSelectedIds([]);
      if (failureCount > 0) {
        notifyError(
          showToast,
          new Error(`${failureCount} updates failed.`),
          `${successCount} of ${results.length} users updated.`,
        );
      } else {
        notifySuccess(showToast, 'Bulk update done.');
      }
      await loadAll();
    } catch (err) {
      notifyError(showToast, err, 'Unable to apply bulk action.');
    } finally {
      setBulkLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
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
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-brand-primary" />
          <h1 className="text-lg font-bold text-brand-navy">Users</h1>
        </div>
        <LastSynced timestamp={lastSyncedAt} loading={bulkLoading} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Total', value: total, color: 'text-brand-navy' },
          { label: 'Active', value: activeUsers, color: 'text-emerald-700' },
          { label: 'Suspended', value: suspendedUsers, color: 'text-red-600' },
          { label: 'New month', value: newUsersThisMonth, color: 'text-brand-navy' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-gray">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="all">All roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-primary/20 bg-brand-light/60 px-3 py-2">
          <span className="text-xs font-bold text-brand-navy">{selectedIds.length} selected</span>
          <button
            disabled={bulkLoading}
            onClick={() => runBulkAction({ status: 'active' })}
            className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Activate
          </button>
          <button
            disabled={bulkLoading}
            onClick={() => runBulkAction({ status: 'suspended' })}
            className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Suspend
          </button>
          <button
            disabled={bulkLoading}
            onClick={() => runBulkAction({ role: 'admin' })}
            className="rounded-lg bg-brand-navy px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Make admin
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="ml-auto text-xs font-semibold text-brand-gray"
          >
            Clear
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
          <span className="text-[11px] font-semibold text-slate-500">Select all</span>
        </div>

        {filteredUsers.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">No users found.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredUsers.map((user) => {
              const displayName = user.name || user.email;
              return (
                <li key={user.id} className="flex items-center gap-3 px-3 py-3 hover:bg-slate-50/80">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(user.id)}
                    onChange={() => toggleSelect(user.id)}
                  />
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-primary text-[11px] font-bold text-white">
                    {initials(displayName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-brand-navy">{displayName}</p>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          user.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-600'
                        }`}
                      >
                        {user.status}
                      </span>
                      {user.role === 'admin' && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                          admin
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {user.email}
                      {user.phone ? ` · ${user.phone}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-brand-navy">
                      Wallet {money(user.wallet_balance)}
                      {user.virtual_account_number ? (
                        <span className="ml-2 font-normal text-slate-400">· VA ready</span>
                      ) : null}
                    </p>
                  </div>
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-brand-navy hover:bg-brand-light"
                    aria-label={`Open ${displayName}`}
                  >
                    <ChevronRight size={16} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          className="border-t border-slate-100 bg-slate-50/80 px-3 py-2"
        />
      </div>
    </div>
  );
}
