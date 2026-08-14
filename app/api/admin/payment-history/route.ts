import { NextResponse } from "next/server";
import { requireAdmin, serverErrorResponse } from "@/lib/api/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/payment-history
 * Completed savings (passbook) payouts to users.
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const adminClient = createSupabaseAdminClient();

    const { data: passbookPayouts, error: payoutsError } = await adminClient
      .from("passbook_payouts")
      .select(
        "id, user_id, scheme_id, amount, period_label, paid_at, created_at, notes, profiles:user_id!inner(id, name, email, phone, bank_account, bank_name), schemes:scheme_id(id, name)",
      )
      .order("created_at", { ascending: false });

    if (payoutsError) {
      return NextResponse.json({ error: payoutsError.message }, { status: 400 });
    }

    type PassbookRow = {
      id: string;
      user_id: string;
      amount: number;
      period_label: string | null;
      paid_at: string | null;
      created_at: string;
      notes: string | null;
      profiles: {
        id: string;
        name: string;
        email: string;
        phone: string | null;
        bank_account: string | null;
        bank_name: string | null;
      } | null;
      schemes: { id: string; name: string } | null;
    };

    const rows = (passbookPayouts ?? []) as unknown as PassbookRow[];
    const payments = rows.map((p) => ({
      id: p.id,
      type: "savings_withdrawal",
      user: p.profiles ?? {
        id: p.user_id,
        name: "Unknown",
        email: "",
        phone: null,
        bank_account: null,
        bank_name: null,
      },
      group_or_scheme: p.schemes?.name ?? "Savings",
      amount: Number(p.amount ?? 0),
      reference: p.id,
      period: p.period_label,
      paid_at: p.paid_at ?? p.created_at,
      notes: p.notes,
    }));

    const uniqueUsers = new Set(payments.map((p) => p.user.id)).size;
    const totalPaidOut = payments.reduce((sum, p) => sum + p.amount, 0);

    return NextResponse.json({
      data: {
        payments,
        summary: {
          totalPaidOut,
          totalPayments: payments.length,
          uniqueUsers,
          savingsPayouts: payments.length,
          groupPayouts: 0,
        },
      },
    });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
