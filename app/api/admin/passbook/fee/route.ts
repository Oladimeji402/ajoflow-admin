import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequestResponse, requireAdmin, serverErrorResponse } from "@/lib/api/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SETTINGS_KEY = "passbook_activation_fee";
const DEFAULT_FEE = 500;

const updateSchema = z.object({
  amount: z
    .number()
    .int("Amount must be a whole number (NGN)")
    .positive("Amount must be greater than zero")
    .max(1_000_000, "Amount is too large"),
});

function parseFeeValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return DEFAULT_FEE;
}

/**
 * GET /api/admin/passbook/fee
 * Current passbook activation fee (NGN)
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.error || !auth.user) return auth.error!;

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("platform_settings")
      .select("key, value, updated_at, updated_by")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    if (error) return badRequestResponse(error.message);

    return NextResponse.json({
      data: {
        amount: data ? parseFeeValue(data.value) : DEFAULT_FEE,
        updatedAt: data?.updated_at ?? null,
        updatedBy: data?.updated_by ?? null,
      },
    });
  } catch (error) {
    console.error("Admin passbook fee fetch error:", error);
    return serverErrorResponse();
  }
}

/**
 * PATCH /api/admin/passbook/fee
 * Update passbook activation fee (NGN)
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

    const parsed = updateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message ?? "Validation failed.");
    }

    const nextAmount = parsed.data.amount;
    const admin = createSupabaseAdminClient();

    const { data: existing, error: fetchError } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    if (fetchError) return badRequestResponse(fetchError.message);

    const previousAmount = existing ? parseFeeValue(existing.value) : DEFAULT_FEE;

    const { data: updated, error: upsertError } = await admin
      .from("platform_settings")
      .upsert(
        {
          key: SETTINGS_KEY,
          value: nextAmount,
          updated_at: new Date().toISOString(),
          updated_by: auth.user.id,
        },
        { onConflict: "key" },
      )
      .select("key, value, updated_at, updated_by")
      .single();

    if (upsertError) return badRequestResponse(upsertError.message);

    await logAdminAction({
      adminId: auth.user.id,
      action: "passbook_fee_update",
      targetType: "platform_settings",
      targetId: SETTINGS_KEY,
      before: { amount: previousAmount },
      after: { amount: nextAmount },
    });

    return NextResponse.json({
      data: {
        amount: parseFeeValue(updated.value),
        updatedAt: updated.updated_at,
        updatedBy: updated.updated_by,
      },
    });
  } catch (error) {
    console.error("Admin passbook fee update error:", error);
    return serverErrorResponse();
  }
}
