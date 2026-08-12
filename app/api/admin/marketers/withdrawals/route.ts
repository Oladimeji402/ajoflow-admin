import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequestResponse, requireAdmin, serverErrorResponse } from "@/lib/api/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.enum(["approved", "paid", "rejected"]),
  rejectionReason: z.string().trim().max(500).optional(),
});

/**
 * GET /api/admin/marketers/withdrawals
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error || !auth.user) return auth.error!;

    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "all";

    const admin = createSupabaseAdminClient();
    let query = admin
      .from("marketer_withdrawal_requests")
      .select(
        "id, marketer_id, status, user_count, rate_per_user, amount, bank_name, bank_account_number, bank_account_name, notes, rejection_reason, created_at, reviewed_at, marketers(id, name, email, referral_code)",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) return badRequestResponse(error.message);

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    return serverErrorResponse(error);
  }
}

/**
 * PATCH /api/admin/marketers/withdrawals
 * Body: { id, status, rejectionReason? }
 */
export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error || !auth.user) return auth.error!;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return badRequestResponse("Invalid JSON body.");
    }

    const id = typeof (rawBody as { id?: unknown })?.id === "string"
      ? (rawBody as { id: string }).id
      : "";
    if (!id) return badRequestResponse("Withdrawal id is required.");

    const parsed = updateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message ?? "Validation failed.");
    }

    if (parsed.data.status === "rejected" && !parsed.data.rejectionReason?.trim()) {
      return badRequestResponse("Rejection reason is required.");
    }

    const admin = createSupabaseAdminClient();
    const { data: existing, error: fetchError } = await admin
      .from("marketer_withdrawal_requests")
      .select("id, status, marketer_id, amount, user_count")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) return badRequestResponse(fetchError.message);
    if (!existing) return NextResponse.json({ error: "Withdrawal not found." }, { status: 404 });

    const nextStatus = parsed.data.status;
    const allowedFrom: Record<string, string[]> = {
      pending: ["approved", "rejected"],
      approved: ["paid", "rejected"],
      paid: [],
      rejected: [],
      cancelled: [],
    };

    if (!(allowedFrom[existing.status] ?? []).includes(nextStatus)) {
      return badRequestResponse(`Cannot move withdrawal from ${existing.status} to ${nextStatus}.`);
    }

    const { data: updated, error: updateError } = await admin
      .from("marketer_withdrawal_requests")
      .update({
        status: nextStatus,
        rejection_reason: nextStatus === "rejected" ? parsed.data.rejectionReason?.trim() : null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: auth.user.id,
      })
      .eq("id", id)
      .select(
        "id, marketer_id, status, user_count, rate_per_user, amount, bank_name, bank_account_number, bank_account_name, rejection_reason, created_at, reviewed_at",
      )
      .single();

    if (updateError) return badRequestResponse(updateError.message);

    // Free users for re-claim if rejected
    if (nextStatus === "rejected") {
      await admin.from("marketer_withdrawal_items").delete().eq("withdrawal_id", id);
    }

    await logAdminAction({
      adminId: auth.user.id,
      action: `marketer_withdrawal_${nextStatus}`,
      targetType: "marketer_withdrawal_requests",
      targetId: id,
      before: { status: existing.status },
      after: { status: nextStatus },
      metadata: {
        marketerId: existing.marketer_id,
        amount: existing.amount,
        userCount: existing.user_count,
        rejectionReason: parsed.data.rejectionReason ?? null,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
