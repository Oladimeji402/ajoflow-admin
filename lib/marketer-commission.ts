import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const DEFAULT_COMMISSION_PER_USER = 250;
export const DEFAULT_WITHDRAWAL_MIN_AMOUNT = 5000;

export const COMMISSION_KEY = "marketer_commission_per_user";
export const MIN_AMOUNT_KEY = "marketer_withdrawal_min_amount";

function parsePositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

export type MarketerCommissionSettings = {
  commissionPerUser: number;
  withdrawalMinAmount: number;
};

export async function getMarketerCommissionSettings(
  admin = createSupabaseAdminClient(),
): Promise<MarketerCommissionSettings> {
  const { data, error } = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", [COMMISSION_KEY, MIN_AMOUNT_KEY]);

  if (error) {
    console.error("[marketer-commission] settings lookup failed:", error.message);
    return {
      commissionPerUser: DEFAULT_COMMISSION_PER_USER,
      withdrawalMinAmount: DEFAULT_WITHDRAWAL_MIN_AMOUNT,
    };
  }

  const map = new Map((data ?? []).map((row) => [row.key, row.value]));

  return {
    commissionPerUser: parsePositiveNumber(map.get(COMMISSION_KEY), DEFAULT_COMMISSION_PER_USER),
    withdrawalMinAmount: Math.floor(
      parsePositiveNumber(map.get(MIN_AMOUNT_KEY), DEFAULT_WITHDRAWAL_MIN_AMOUNT),
    ),
  };
}
