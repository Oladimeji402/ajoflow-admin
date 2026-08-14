import { NextResponse } from "next/server";
import { requireAdmin, serverErrorResponse } from "@/lib/api/auth";

/** Legacy group payouts table dropped — no backfill needed. */
export async function POST() {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    return NextResponse.json({ data: { backfilled: 0, skipped: true } });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
