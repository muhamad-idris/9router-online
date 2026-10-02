import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/usageDb";
import { getRequestUser } from "@/lib/auth/requestUser";

export async function GET() {
  try {
    // Registered users see only their own usage; admin (user null) sees all.
    const viewer = await getRequestUser();
    const stats = await getUsageStats(undefined, viewer?.id ? { userId: viewer.id } : {});
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching usage stats:", error);
    return NextResponse.json({ error: "Failed to fetch usage stats" }, { status: 500 });
  }
}
