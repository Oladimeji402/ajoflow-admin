import { NextResponse } from "next/server";
import { requireAdmin, serverErrorResponse } from "@/lib/api/auth";

/** Legacy group payouts retired. */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    return NextResponse.json({ data: [] });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
