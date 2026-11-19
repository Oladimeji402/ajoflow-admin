import { NextResponse } from "next/server";
import { badRequestResponse, requireAdmin, serverErrorResponse } from "@/lib/api/auth";
import { parsePagination, sanitizeSearch } from "@/lib/api/pagination";

export const dynamic = "force-dynamic";

function getPendingBucketMinAgeMinutes(bucket: string | null) {
  if (!bucket) return null;
  if (bucket === "5m") return 5;
  if (bucket === "30m") return 30;
  if (bucket === "2h") return 120;
  if (bucket === "24h") return 1440;
  return null;
}

const SORTABLE = new Set(["created_at", "amount", "status"]);
const SUMMARY_CHUNK = 1000;
const SUMMARY_MAX_ROWS = 50_000;

/**
 * GET /api/admin/transactions
 * Query: page, pageSize, status, type, search, requestId, pendingReason, pendingBucket,
 *        days (limit to last N days), sort (created_at|amount|status), dir (asc|desc),
 *        summary=1 (also return totals/trend for the whole filtered set)
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");
    const search = sanitizeSearch(url.searchParams.get("search"));
    const requestId = url.searchParams.get("requestId");
    const pendingReason = url.searchParams.get("pendingReason");
    const pendingBucket = url.searchParams.get("pendingBucket");
    const days = Number(url.searchParams.get("days"));
    const sortParam = url.searchParams.get("sort") ?? "created_at";
    const sort = SORTABLE.has(sortParam) ? sortParam : "created_at";
    const ascending = url.searchParams.get("dir") === "asc";
    const wantSummary = url.searchParams.get("summary") === "1";
    const { page, pageSize, from, to } = parsePagination(url);

    // Search also matches user name/email, so resolve matching profile ids first.
    let searchClause: string | null = null;
    if (search) {
      const { data: matchedProfiles } = await auth.supabase
        .from("profiles")
        .select("id")
        .or(`name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(200);
      const ids = (matchedProfiles ?? []).map((p) => p.id).filter(Boolean);
      searchClause = `reference.ilike.%${search}%,provider_reference.ilike.%${search}%`;
      if (ids.length > 0) searchClause += `,user_id.in.(${ids.join(",")})`;
    }

    const minAgeMinutes = getPendingBucketMinAgeMinutes(pendingBucket);
    const sinceIso =
      Number.isFinite(days) && days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
    const pendingThresholdIso =
      minAgeMinutes !== null ? new Date(Date.now() - minAgeMinutes * 60_000).toISOString() : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyFilters = <Q extends { eq: any; lte: any; gte: any; or: any }>(q: Q): Q => {
      let next = q;
      if (status) next = next.eq("status", status);
      if (type) next = next.eq("type", type);
      if (requestId) next = next.eq("request_id", requestId);
      if (pendingReason) next = next.eq("pending_reason", pendingReason);
      if (pendingThresholdIso) next = next.eq("status", "pending").lte("created_at", pendingThresholdIso);
      if (sinceIso) next = next.gte("created_at", sinceIso);
      if (searchClause) next = next.or(searchClause);
      return next;
    };

    const { data, error, count } = await applyFilters(
      auth.supabase
        .from("payment_records")
        .select("*, profiles:user_id(id, name, email, phone)", { count: "exact" }),
    )
      .order(sort, { ascending })
      .order("id", { ascending: false })
      .range(from, to);
    if (error) return badRequestResponse(error.message);

    let summary: unknown = undefined;
    if (wantSummary) {
      const volumes: Record<string, number> = {};
      let pendingVolume = 0;
      let successCount = 0;
      let grossVolume = 0;
      let totalCount = 0;
      const trend = new Map<string, number>();

      for (let offset = 0; offset < SUMMARY_MAX_ROWS; offset += SUMMARY_CHUNK) {
        const { data: chunk, error: chunkError } = await applyFilters(
          auth.supabase.from("payment_records").select("id, type, status, amount, created_at"),
        )
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + SUMMARY_CHUNK - 1);
        if (chunkError) return badRequestResponse(chunkError.message);
        const rows = chunk ?? [];

        for (const row of rows) {
          const amount = Number(row.amount ?? 0);
          const st = String(row.status ?? "").toLowerCase();
          totalCount += 1;
          const day = String(row.created_at).slice(0, 10);
          trend.set(day, (trend.get(day) ?? 0) + amount);
          if (st === "success" || st === "successful") {
            successCount += 1;
            grossVolume += amount;
            volumes[row.type] = (volumes[row.type] ?? 0) + amount;
          } else if (st === "pending") {
            pendingVolume += amount;
          }
        }
        if (rows.length < SUMMARY_CHUNK) break;
      }

      summary = {
        totalCount,
        successCount,
        grossVolume,
        pendingVolume,
        volumes,
        truncated: totalCount >= SUMMARY_MAX_ROWS,
        trend: Array.from(trend.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, amount]) => ({ date, amount })),
      };
    }

    return NextResponse.json({
      data,
      pagination: { page, pageSize, total: count ?? 0 },
      ...(summary ? { summary } : {}),
    });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
