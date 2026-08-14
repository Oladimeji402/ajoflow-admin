import { NextResponse } from "next/server";
import { requireAdmin, serverErrorResponse } from "@/lib/api/auth";

/** Legacy group payouts table has been dropped. Use passbook payouts / savings schedule. */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    return NextResponse.json({ data: [] });
  } catch {
    return serverErrorResponse();
  }
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Group payouts are no longer available." },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Group savings payouts are no longer available. Use individual savings payouts." },
    { status: 410 },
  );
}
