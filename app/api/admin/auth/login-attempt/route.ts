import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  RATE_LIMITS,
  enforceRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/rate-limit";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_WINDOW_MINUTES = 15;

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limited = await enforceRateLimit(
      `admin-login-attempt:${ip}`,
      RATE_LIMITS.adminLoginAttempt,
    );
    if (!limited.ok) return rateLimitResponse(limited.retryAfterSeconds);

    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const succeeded = body.succeeded as boolean | undefined;

    if (!email) {
      return NextResponse.json({ error: "email is required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const userAgent = request.headers.get("user-agent") ?? null;

    // Check mode: return lockout status without mutating attempts
    if (typeof succeeded !== "boolean") {
      const windowStart = new Date(Date.now() - LOCK_WINDOW_MINUTES * 60 * 1000).toISOString();

      const { count, error } = await supabase
        .from("login_attempts")
        .select("id", { head: true, count: "exact" })
        .eq("email", email)
        .eq("ip", ip)
        .eq("succeeded", false)
        .gte("attempted_at", windowStart);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      const failedAttempts = count ?? 0;
      const locked = failedAttempts >= MAX_FAILED_ATTEMPTS;

      return NextResponse.json({
        locked,
        failedAttempts,
        remainingAttempts: Math.max(MAX_FAILED_ATTEMPTS - failedAttempts, 0),
        lockWindowMinutes: LOCK_WINDOW_MINUTES,
      });
    }

    const { error: insertError } = await supabase.from("login_attempts").insert({
      email,
      ip,
      succeeded,
      user_agent: userAgent,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to process login attempt." }, { status: 500 });
  }
}
