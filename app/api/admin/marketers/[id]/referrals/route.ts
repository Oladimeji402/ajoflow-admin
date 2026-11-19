import { NextResponse } from "next/server";
import { badRequestResponse, requireAdmin, serverErrorResponse } from "@/lib/api/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERRAL_CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PROFILE_COLUMNS =
  "id, name, email, phone, status, referral_code_used, marketer_id, passbook_activated, passbook_activated_at, created_at";

export async function GET(request: Request, context: Context) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { id } = await context.params;
    if (!UUID_RE.test(id)) return badRequestResponse("Invalid marketer id.");

    const url = new URL(request.url);
    const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
    const rawSize = Number.parseInt(url.searchParams.get("pageSize") ?? "20", 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawSize) ? rawSize : 20));
    const statusFilter = url.searchParams.get("status") ?? "all"; // all | attributed | pending

    const adminSupabase = createSupabaseAdminClient();

    const { data: marketer, error: marketerError } = await adminSupabase
      .from("marketers")
      .select("id, name, referral_code")
      .eq("id", id)
      .maybeSingle();

    if (marketerError) return badRequestResponse(marketerError.message);
    if (!marketer) return NextResponse.json({ error: "Marketer not found." }, { status: 404 });

    const code = String(marketer.referral_code ?? "");
    const hasCode = REFERRAL_CODE_RE.test(code);

    // Attributed: marketer_id set. Pending: used this code but not yet attributed (awaiting passbook).
    const attributedCount = () =>
      adminSupabase.from("profiles").select("id", { count: "exact", head: true }).eq("marketer_id", id);
    const pendingCount = () =>
      hasCode
        ? adminSupabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("referral_code_used", code)
            .is("marketer_id", null)
        : Promise.resolve({ count: 0, error: null });

    let pageQuery = adminSupabase
      .from("profiles")
      .select(PROFILE_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (statusFilter === "attributed") {
      pageQuery = pageQuery.eq("marketer_id", id);
    } else if (statusFilter === "pending") {
      pageQuery = hasCode
        ? pageQuery.eq("referral_code_used", code).is("marketer_id", null)
        : pageQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      pageQuery = hasCode
        ? pageQuery.or(`marketer_id.eq.${id},and(referral_code_used.eq.${code},marketer_id.is.null)`)
        : pageQuery.eq("marketer_id", id);
    }

    const [pageResult, attributedResult, pendingResult] = await Promise.all([
      pageQuery,
      attributedCount(),
      pendingCount(),
    ]);

    if (pageResult.error) return badRequestResponse(pageResult.error.message);
    if (attributedResult.error) return badRequestResponse(attributedResult.error.message);
    if (pendingResult.error) return badRequestResponse(pendingResult.error.message);

    const data = (pageResult.data ?? []).map((row) => ({
      ...row,
      attribution_status: row.marketer_id ? ("attributed" as const) : ("pending" as const),
    }));

    const attributed = attributedResult.count ?? 0;
    const pending = pendingResult.count ?? 0;
    const total = pageResult.count ?? 0;

    return NextResponse.json({
      data,
      counts: { attributed, pending, total: attributed + pending },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
