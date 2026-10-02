import { NextResponse } from "next/server";
import { pingModelByKind, getUserGatewayKey } from "./ping";
import { getRequestUser } from "@/lib/auth/requestUser";

// POST /api/models/test - Ping a single model via internal completions or embeddings
export async function POST(request) {
  try {
    const { model, kind } = await request.json();
    if (!model) return NextResponse.json({ error: "Model required" }, { status: 400 });
    // Ping as the session user so per-user routing resolves their credentials.
    let ownerKey = null;
    try {
      ownerKey = await getUserGatewayKey((await getRequestUser())?.id || null);
    } catch {}
    const result = await pingModelByKind(model, kind || "llm", undefined, ownerKey);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
