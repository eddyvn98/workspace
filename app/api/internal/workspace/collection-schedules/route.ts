import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runCollectionScheduleBatch } from "@/lib/workspace/collectionScheduleRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.WORKSPACE_AUTOMATION_CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
/** Server-only scheduler ingress. Never accepts a user/board identity from the body. */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { cursor?: unknown; limit?: unknown } = {};
  try { body = await request.json(); } catch { /* An empty body starts at the first board. */ }
  if (body.cursor !== undefined &&
    (typeof body.cursor !== "string" || body.cursor.length > 128)) {
    return NextResponse.json({ error: "Invalid pagination cursor" }, { status: 400 });
  }
  const count = typeof body.limit === "number" && Number.isInteger(body.limit) ? body.limit : 30;
  if (count < 1 || count > 100) return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
  try {
    const result = await runCollectionScheduleBatch(new Date(), (body.cursor as string) ?? "", count);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[workspace schedule] batch failed", error);
    return NextResponse.json({ error: "Schedule worker failed" }, { status: 500 });
  }
}
