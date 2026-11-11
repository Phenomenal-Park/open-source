import { NextResponse, type NextRequest } from "next/server";
import { clearLocalSession, supabaseServer } from "@/lib/server/auth";
import { isLocalMode } from "@/lib/server/env";
import { sameOrigin } from "@/lib/server/http";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (isLocalMode()) await clearLocalSession();
  else await (await supabaseServer()).auth.signOut();
  return NextResponse.json({ ok: true });
}
