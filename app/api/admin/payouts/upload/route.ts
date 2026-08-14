import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Group payout proofs are no longer available." },
    { status: 410 },
  );
}
