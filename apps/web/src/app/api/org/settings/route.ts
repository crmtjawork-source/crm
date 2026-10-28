import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

// Business-wide settings an admin can change.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const body = (await request.json()) as {
      meetingReminders?: boolean;
      mergeRepeatLeads?: boolean;
      companySignature?: { image?: string; name?: string; title?: string } | null;
      lostReasons?: string[];
    };
    const patch: Record<string, unknown> = {};
    if (typeof body.meetingReminders === "boolean") patch.meeting_reminders = body.meetingReminders;
    if (typeof body.mergeRepeatLeads === "boolean") patch.merge_repeat_leads = body.mergeRepeatLeads;
    if (Array.isArray(body.lostReasons)) {
      patch.lost_reasons = [...new Set(body.lostReasons.filter((r): r is string => typeof r === "string").map((r) => r.trim().slice(0, 120)).filter(Boolean))].slice(0, 30);
    }
    if ("companySignature" in body) {
      const sig = body.companySignature;
      if (sig === null) patch.company_signature = null;
      else if (sig && typeof sig.image === "string" && /^data:image\/(png|jpeg);base64,/.test(sig.image) && sig.image.length < 600_000)
        patch.company_signature = { image: sig.image, name: sig.name?.trim().slice(0, 120) || undefined, title: sig.title?.trim().slice(0, 120) || undefined };
      else throw new HttpError(400, "החתימה לא תקינה — יש לצייר או להעלות תמונה קטנה יותר");
    }
    if (!Object.keys(patch).length) throw new HttpError(400, "אין מה לעדכן");
    const { error } = await supabaseAdmin().from("organizations").update(patch).eq("id", orgId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
