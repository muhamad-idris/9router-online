import { NextResponse } from "next/server";

// Bridge mode: single sign-on is disabled on this instance.
// Account login (email + password) is the only supported method.
export async function GET() {
  return NextResponse.json({ error: "Single sign-on is disabled on this instance" }, { status: 403 });
}
