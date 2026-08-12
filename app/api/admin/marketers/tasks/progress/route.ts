import { NextResponse } from "next/server";
import { badRequestResponse, requireAdmin, serverErrorResponse } from "@/lib/api/auth";
import {
  DEFAULT_TASK_TIMEZONE,
  completionRate,
  getPeriodKey,
  isRecurringFrequency,
  listExpectedPeriodKeys,
  periodLabel,
} from "@/lib/marketer-task-periods";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type TaskRow = {
  id: string;
  marketer_id: string;
  title: string;
  status: string;
  frequency: string;
  timezone: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  marketers: { id: string; name: string; referral_code: string; status: string } | null;
};

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const frequencyFilter = url.searchParams.get("frequency");

    const adminSupabase = createSupabaseAdminClient();
    let query = adminSupabase
      .from("marketer_tasks")
      .select(
        "id, marketer_id, title, status, frequency, timezone, starts_at, ends_at, created_at, marketers(id, name, referral_code, status)",
      )
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(500);

    if (
      frequencyFilter &&
      ["once", "daily", "weekly", "monthly"].includes(frequencyFilter)
    ) {
      query = query.eq("frequency", frequencyFilter);
    } else {
      // Default progress view focuses on recurring assignments.
      query = query.in("frequency", ["daily", "weekly", "monthly"]);
    }

    const { data, error } = await query;
    if (error) return badRequestResponse(error.message);

    const tasks = (data ?? []) as unknown as TaskRow[];
    const now = new Date();
    const taskIds = tasks.map((t) => t.id);

    const completionsByTask = new Map<string, Set<string>>();
    if (taskIds.length > 0) {
      const { data: completions, error: completionsError } = await adminSupabase
        .from("marketer_task_completions")
        .select("task_id, period_key")
        .in("task_id", taskIds);

      if (completionsError) return badRequestResponse(completionsError.message);

      for (const row of completions ?? []) {
        const set = completionsByTask.get(row.task_id) ?? new Set<string>();
        set.add(row.period_key);
        completionsByTask.set(row.task_id, set);
      }
    }

    const rows = tasks.map((task) => {
      const frequency = task.frequency || "once";
      const timezone = task.timezone || DEFAULT_TASK_TIMEZONE;
      const completedSet = completionsByTask.get(task.id) ?? new Set<string>();
      const currentPeriodKey = isRecurringFrequency(frequency)
        ? getPeriodKey(frequency, now, timezone)
        : null;
      const completedThisPeriod = currentPeriodKey
        ? completedSet.has(currentPeriodKey)
        : task.status === "done";
      const expected = isRecurringFrequency(frequency)
        ? listExpectedPeriodKeys(
            frequency,
            task.starts_at || task.created_at,
            task.ends_at,
            timezone,
            now,
          )
        : [];
      const periodsCompleted = [...completedSet].filter((k) => expected.includes(k)).length;
      const ended = Boolean(task.ends_at && new Date(task.ends_at).getTime() < now.getTime());
      const pendingThisPeriod =
        isRecurringFrequency(frequency) && !ended && !completedThisPeriod;

      return {
        task_id: task.id,
        title: task.title,
        frequency,
        period_label: periodLabel(frequency),
        current_period_key: currentPeriodKey,
        completed_this_period: completedThisPeriod,
        pending_this_period: pendingThisPeriod,
        periods_completed: periodsCompleted,
        periods_expected: expected.length,
        completion_rate: completionRate(periodsCompleted, expected.length || 1),
        status: task.status,
        ends_at: task.ends_at,
        marketer: task.marketers
          ? {
              id: task.marketers.id,
              name: task.marketers.name,
              referral_code: task.marketers.referral_code,
              status: task.marketers.status,
            }
          : null,
      };
    });

    // Group by title for assignment-level rates this period.
    const byTitle = new Map<
      string,
      { title: string; frequency: string; total: number; done: number; pending: number }
    >();
    for (const row of rows) {
      const key = `${row.title}::${row.frequency}`;
      const group = byTitle.get(key) ?? {
        title: row.title,
        frequency: row.frequency,
        total: 0,
        done: 0,
        pending: 0,
      };
      group.total += 1;
      if (row.completed_this_period) group.done += 1;
      if (row.pending_this_period) group.pending += 1;
      byTitle.set(key, group);
    }

    const assignments = [...byTitle.values()].map((g) => ({
      ...g,
      completion_rate: completionRate(g.done, g.total),
      period_label: periodLabel(g.frequency),
    }));

    const summary = {
      recurring_tasks: rows.length,
      completed_this_period: rows.filter((r) => r.completed_this_period).length,
      pending_this_period: rows.filter((r) => r.pending_this_period).length,
      completion_rate: completionRate(
        rows.filter((r) => r.completed_this_period).length,
        rows.length,
      ),
    };

    return NextResponse.json({
      data: {
        summary,
        assignments,
        rows,
      },
    });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
