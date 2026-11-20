import { errorResponse, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { discoverGroups, syncGroupMembers } from "@/lib/server/waGroups";

// POST: find the groups of the org's linked numbers and (re)read the members of the tagged ones.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const db = supabaseAdmin();
    const found = await discoverGroups(db, orgId);
    const result = await syncGroupMembers(db, orgId);
    return Response.json({ discovered: found, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}
