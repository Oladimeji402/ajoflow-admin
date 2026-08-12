import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequestResponse, requireAdmin, serverErrorResponse } from "@/lib/api/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  COMMISSION_KEY,
  getMarketerCommissionSettings,
  MIN_AMOUNT_KEY,
} from "@/lib/marketer-commission";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  commissionPerUser: z
    .number()
    .int("Commission must be a whole number")
    .positive("Commission must be greater than zero")
    .max(1_000_000)
    .optional(),
  withdrawalMinAmount: z
    .number()
    .int("Minimum withdrawal must be a whole number")
    .positive("Minimum withdrawal must be greater than zero")
    .max(10_000_000)
    .optional(),
});

/**
 * GET /api/admin/marketers/commission
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.error || !auth.user) return auth.error!;

    const settings = await getMarketerCommissionSettings();
    return NextResponse.json({ data: settings });
  } catch (error) {
    return serverErrorResponse(error);
  }
}

/**
 * PATCH /api/admin/marketers/commission
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

    if (
      parsed.data.commissionPerUser === undefined &&
      parsed.data.withdrawalMinAmount === undefined
    ) {
      return badRequestResponse("Provide commissionPerUser and/or withdrawalMinAmount.");
    }

    const admin = createSupabaseAdminClient();
    const before = await getMarketerCommissionSettings(admin);
    const now = new Date().toISOString();

    if (parsed.data.commissionPerUser !== undefined) {
      const { error } = await admin.from("platform_settings").upsert(
        {
          key: COMMISSION_KEY,
          value: parsed.data.commissionPerUser,
          updated_at: now,
          updated_by: auth.user.id,
        },
        { onConflict: "key" },
      );
      if (error) return badRequestResponse(error.message);
    }

    if (parsed.data.withdrawalMinAmount !== undefined) {
      const { error } = await admin.from("platform_settings").upsert(
        {
          key: MIN_AMOUNT_KEY,
          value: parsed.data.withdrawalMinAmount,
          updated_at: now,
          updated_by: auth.user.id,
        },
        { onConflict: "key" },
      );
      if (error) return badRequestResponse(error.message);
    }

    const after = await getMarketerCommissionSettings(admin);

    await logAdminAction({
      adminId: auth.user.id,
      action: "marketer_commission_settings_update",
      targetType: "platform_settings",
      targetId: "marketer_commission",
      before,
      after,
    });

    return NextResponse.json({ data: after });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
