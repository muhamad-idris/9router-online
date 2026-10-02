import { NextResponse } from "next/server";
import { testSingleConnection } from "./testUtils.js";
import { getProviderConnectionById } from "@/lib/localDb";
import { getRequestUser } from "@/lib/auth/requestUser";
import { isForeignRow } from "@/lib/auth/connectionOwner";

// POST /api/providers/[id]/test - Test connection
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    // Ownership check: testing burns the owner's live quota/tokens.
    const connection = await getProviderConnectionById(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    try {
      if (isForeignRow(connection, await getRequestUser())) {
        return NextResponse.json({ error: "Connection not found" }, { status: 404 });
      }
    } catch {}
    const result = await testSingleConnection(id);

    if (result.error === "Connection not found") {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    return NextResponse.json({
      valid: result.valid,
      error: result.error,
      refreshed: result.refreshed || false,
    });
  } catch (error) {
    console.log("Error testing connection:", error);
    return NextResponse.json({ error: "Test failed" }, { status: 500 });
  }
}
