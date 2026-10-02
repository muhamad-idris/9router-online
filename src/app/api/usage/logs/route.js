import { NextResponse } from "next/server";
import { getRecentLogs } from "@/lib/usageDb";
import { getRequestUser } from "@/lib/auth/requestUser";

export async function GET() {
  try {
    // Registered users see only their own logs; admin (user null) sees all.
    const viewer = await getRequestUser();
    const logs = await getRecentLogs(200, viewer?.id ? { userId: viewer.id } : {});
    return NextResponse.json(logs);
  } catch (error) {
    console.error("Error fetching logs:", error);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
