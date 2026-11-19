import { NextResponse } from "next/server";
import { badRequestResponse, requireAdmin, serverErrorResponse } from "@/lib/api/auth";
import { sanitizeSearch } from "@/lib/api/pagination";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const adminSupabase = createSupabaseAdminClient();

    const url = new URL(request.url);
    const search = sanitizeSearch(url.searchParams.get("search"));
    const status = url.searchParams.get("status");
    const role = url.searchParams.get("role");
    const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? 20), 1), 100);

    let query = adminSupabase
      .from("profiles")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (status) query = query.eq("status", status);
    if (role) query = query.eq("role", role);
    if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) return badRequestResponse(error.message);

    // Counts across all users (ignoring pagination) for the summary tiles
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [activeRes, suspendedRes, newRes, todayRes] = await Promise.all([
      adminSupabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
      adminSupabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "suspended"),
      adminSupabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString()),
      adminSupabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
    ]);

    const rows = Array.isArray(data) ? data : [];
    const userIds = rows.map((row) => row.id).filter(Boolean);
    const savedByUser = new Map<string, number>();

    if (userIds.length > 0) {
      const savingsPaymentsRes = await adminSupabase
        .from("payment_records")
        .select("user_id, amount, status")
        .in("user_id", userIds)
        .in("type", ["individual_savings", "bulk_contribution"])
        .eq("status", "success");

      if (savingsPaymentsRes.error) return badRequestResponse(savingsPaymentsRes.error.message);

      for (const row of savingsPaymentsRes.data ?? []) {
        const current = savedByUser.get(row.user_id) ?? 0;
        savedByUser.set(row.user_id, current + Number(row.amount ?? 0));
      }
    }

    const enrichedRows = rows.map((row) => {
      const totalSaved = savedByUser.get(row.id) ?? 0;
      return {
        ...row,
        total_saved: totalSaved,
        total_contributed: totalSaved,
      };
    });

    return NextResponse.json({
      data: enrichedRows,
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
      },
      stats: {
        active: activeRes.count ?? 0,
        suspended: suspendedRes.count ?? 0,
        newThisMonth: newRes.count ?? 0,
        newToday: todayRes.count ?? 0,
      },
    });
  } catch {
    return serverErrorResponse();
  }
}
