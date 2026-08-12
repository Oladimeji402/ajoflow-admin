import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequestResponse, requireAdmin, serverErrorResponse } from "@/lib/api/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const updateSchema = z.object({
  status: z.enum(["cancelled"]),
});

type Context = { params: Promise<{ taskId: string }> };

/** Admin task updates (currently: cancel). */
export async function PATCH(request: Request, context: Context) {
  try {
    const auth = await requireAdmin();
    if (auth.error || !auth.user) return auth.error;

    const { taskId } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequestResponse("Invalid JSON.");
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message ?? "Validation failed.");
    }

    const adminSupabase = createSupabaseAdminClient();
    const { data: existing, error: lookupError } = await adminSupabase
      .from("marketer_tasks")
      .select("id, marketer_id, title, status, frequency")
      .eq("id", taskId)
      .maybeSingle();

    if (lookupError) return badRequestResponse(lookupError.message);
    if (!existing) return NextResponse.json({ error: "Task not found." }, { status: 404 });

    if (existing.status === "cancelled") {
      return NextResponse.json({ data: existing });
    }

    const { data, error } = await adminSupabase
      .from("marketer_tasks")
      .update({ status: "cancelled" })
      .eq("id", taskId)
      .select()
      .single();

    if (error) return badRequestResponse(error.message);

    await logAdminAction({
      adminId: auth.user.id,
      action: "marketer.task_cancel",
      targetType: "marketer_task",
      targetId: taskId,
      before: existing as Record<string, unknown>,
      after: data as Record<string, unknown>,
      metadata: { marketer_id: existing.marketer_id },
    });

    return NextResponse.json({ data });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
