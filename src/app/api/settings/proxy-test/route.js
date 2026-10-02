import { NextResponse } from "next/server";
import { testProxyUrl } from "@/lib/network/proxyTest";
import { getRequestUser } from "@/lib/auth/requestUser";

export async function POST(request) {
  try {
    // Bridge mode: server-side egress probe — admin only.
    try {
      if ((await getRequestUser())?.id) {
        return NextResponse.json({ error: "Only the instance admin can test proxies" }, { status: 403 });
      }
    } catch {}
    const body = await request.json();
    const result = await testProxyUrl({
      proxyUrl: body?.proxyUrl,
      testUrl: body?.testUrl,
      timeoutMs: body?.timeoutMs,
    });

    if (result?.ok) {
      return NextResponse.json(result);
    }

    const status = typeof result?.status === "number" ? result.status : 500;
    return NextResponse.json({ ok: false, error: result?.error || "Proxy test failed" }, { status });
  } catch (err) {
    const message = err?.name === "AbortError" ? "Proxy test timed out" : (err?.message || String(err));
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
