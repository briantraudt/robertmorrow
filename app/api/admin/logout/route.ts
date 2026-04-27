// =======================================================================
// POST /api/admin/logout — clears admin_session cookie
// =======================================================================

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { forbiddenOriginResponse, isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOriginResponse();
  cookies().delete(ADMIN_COOKIE);
  return NextResponse.json({ ok: true });
}
